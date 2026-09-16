// ============================================================
// R6.20 Saison exact settlement + Olive early repayment diagnostic
// ============================================================

function runR620SaisonConfirmAndOliveEarlyRepaymentDiagnostic() {
  Logger.log("=== R6.20 セゾン確定 + Olive繰上返済診断 ===");

  const saisonResult = reconcilePendingCardSettlements_("セゾンカード");
  const olive = diagnoseR620OliveEarlyRepaymentGap_();
  const r6 = typeof verifyR6FullDataReconciliation === "function"
    ? verifyR6FullDataReconciliation()
    : null;

  const result = {
    saison: {
      matchedCount: Number(saisonResult && saisonResult.matchedCount || 0),
      reviewCount: Number(saisonResult && saisonResult.reviewCount || 0),
      matches: (saisonResult && saisonResult.matches || []).map(function(x) {
        return {
          date: x.settlementDate || "",
          amount: Number(x.settlementAmount || 0),
          detailTotal: Number(x.detailTotal || 0),
          detailCount: Number(x.detailCount || 0)
        };
      })
    },
    olive: olive,
    r6: r6 ? {
      readyForDailyUse: Boolean(r6.readyForDailyUse),
      score: Number(r6.score || 0),
      warnings: r6.warnings || []
    } : null
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function diagnoseR620OliveEarlyRepaymentGap_() {
  const cardAccount = "三井住友カードOlive";
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { error: "no_transactions" };

  const index = createHeaderIndex(values[0]);
  assertRequiredColumns(index, [
    "id", "transaction_date", "amount", "type", "source_type",
    "account_name", "merchant", "item_name", "note", "sub_category",
    "to_account", "settlement_status", "settlement_id"
  ], SHEETS.TRANSACTIONS);

  let targetBank = null;
  const earlyDetails = [];
  const matchedEarlyDetails = [];
  const unmatchedEarlyDetails = [];
  const settlementGroups = {};

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const date = normalizeSettlementDate_(row[index["transaction_date"]]);
    const amount = Number(row[index["amount"]] || 0);
    const sourceType = String(row[index["source_type"]] || "").trim();
    const type = String(row[index["type"]] || "").trim();
    const sub = String(row[index["sub_category"]] || "").trim();
    const status = String(row[index["settlement_status"]] || "").trim();
    const settlementId = String(row[index["settlement_id"]] || "").trim();
    const account = resolveCanonicalAccountName_(row[index["account_name"]]);
    const toAccount = resolveCanonicalAccountName_(row[index["to_account"]]);
    const note = String(row[index["note"]] || "").normalize("NFKC").trim();

    if (type === "移動" && sub === "クレカ引落" && toAccount === cardAccount && date === "2026-08-26" && amount === 61131) {
      targetBank = {
        row: i + 1,
        id: String(row[index["id"]] || "").trim(),
        date: date,
        amount: amount,
        status: status,
        settlementId: settlementId
      };
    }

    if (sourceType !== "CSV_クレカ" || account !== cardAccount) continue;
    const m = note.match(/(\d{1,2})月(\d{1,2})日全額繰上返済/);
    if (!m || amount <= 0) continue;

    const repaymentDate = resolveEarlyRepaymentDate_(date, Number(m[1]), Number(m[2]));
    const item = {
      row: i + 1,
      id: String(row[index["id"]] || "").trim(),
      useDate: date,
      repaymentDate: repaymentDate,
      amount: amount,
      merchant: String(row[index["merchant"]] || row[index["item_name"]] || "").trim(),
      status: status,
      settlementId: settlementId
    };
    earlyDetails.push(item);
    if (status === "matched" || status === "manual_matched" || settlementId) matchedEarlyDetails.push(item);
    else unmatchedEarlyDetails.push(item);

    const key = repaymentDate || "unknown";
    if (!settlementGroups[key]) settlementGroups[key] = { repaymentDate: key, total: 0, count: 0, matchedTotal: 0, unmatchedTotal: 0 };
    settlementGroups[key].total += amount;
    settlementGroups[key].count += 1;
    if (status === "matched" || status === "manual_matched" || settlementId) settlementGroups[key].matchedTotal += amount;
    else settlementGroups[key].unmatchedTotal += amount;
  }

  const groups = Object.keys(settlementGroups).sort().map(function(k) { return settlementGroups[k]; });
  const totalEarly = earlyDetails.reduce(function(s, x) { return s + x.amount; }, 0);
  const matchedEarly = matchedEarlyDetails.reduce(function(s, x) { return s + x.amount; }, 0);
  const unmatchedEarly = unmatchedEarlyDetails.reduce(function(s, x) { return s + x.amount; }, 0);

  // 8月通常請求診断で観測済みの差額。固定値は診断比較だけに使用し、修復には使わない。
  const observedGap = 115035;
  const matchingGroups = groups.filter(function(g) { return g.total === observedGap || g.matchedTotal === observedGap || g.unmatchedTotal === observedGap; });

  Logger.log("Olive target bank=" + JSON.stringify(targetBank));
  groups.forEach(function(g) {
    Logger.log("EARLY date=" + g.repaymentDate + " total=" + g.total + " count=" + g.count + " matched=" + g.matchedTotal + " unmatched=" + g.unmatchedTotal);
  });
  Logger.log("Olive early total=" + totalEarly + " matched=" + matchedEarly + " unmatched=" + unmatchedEarly + " observedGap=" + observedGap);

  return {
    targetBank: targetBank,
    observedGap: observedGap,
    totalEarlyRepaymentDetails: totalEarly,
    matchedEarlyRepaymentDetails: matchedEarly,
    unmatchedEarlyRepaymentDetails: unmatchedEarly,
    exactGapGroupFound: matchingGroups.length > 0,
    exactGapGroups: matchingGroups,
    groups: groups,
    unmatchedSamples: unmatchedEarlyDetails.slice(0, 12)
  };
}
