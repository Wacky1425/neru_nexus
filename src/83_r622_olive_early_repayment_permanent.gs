// ============================================================
// R6.22 Olive early repayment permanent reconciliation verification
// ============================================================

function verifyR622OliveEarlyRepaymentPermanent() {
  const cardAccount = "三井住友カードOlive";

  // 恒久ロジックを再実行しても冪等であることを確認し、その後通常引落も再照合。
  const early = reconcileOliveEarlyRepayments_(cardAccount);
  const normal = reconcilePendingCardSettlements_(cardAccount);

  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const values = sheet.getDataRange().getValues();
  const index = createHeaderIndex(values[0]);
  assertRequiredColumns(index, [
    "transaction_date", "source_type", "account_name", "amount", "note",
    "type", "sub_category", "to_account", "settlement_status", "settlement_id"
  ], SHEETS.TRANSACTIONS);

  let earlyDetailCount = 0;
  let earlyTotal = 0;
  let earlyUnmatchedCount = 0;
  const repaymentDates = new Set();
  let olivePendingCount = 0;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const account = resolveCanonicalAccountName_(row[index["account_name"]]);
    const toAccount = resolveCanonicalAccountName_(row[index["to_account"]]);
    const status = String(row[index["settlement_status"]] || "").trim();
    const sid = String(row[index["settlement_id"]] || "").trim();

    if (String(row[index["source_type"]] || "").trim() === "CSV_クレカ" && account === cardAccount) {
      const note = String(row[index["note"]] || "").normalize("NFKC").trim();
      const m = note.match(/(\d{1,2})月(\d{1,2})日全額繰上返済/);
      if (m) {
        const date = normalizeSettlementDate_(row[index["transaction_date"]]);
        const repaymentDate = resolveEarlyRepaymentDate_(date, Number(m[1]), Number(m[2]));
        if (repaymentDate) repaymentDates.add(repaymentDate);
        earlyDetailCount++;
        earlyTotal += Number(row[index["amount"]] || 0);
        if (!(status === "matched" || status === "manual_matched") || !sid) earlyUnmatchedCount++;
      }
    }

    if (String(row[index["type"]] || "").trim() === "移動" &&
        String(row[index["sub_category"]] || "").trim() === "クレカ引落" &&
        toAccount === cardAccount &&
        status !== "matched" && status !== "manual_matched") {
      olivePendingCount++;
    }
  }

  const r6 = typeof verifyR6FullReconciliation === "function"
    ? verifyR6FullReconciliation()
    : null;

  const result = {
    ready: earlyUnmatchedCount === 0 && olivePendingCount === 0,
    repaymentGroupCount: repaymentDates.size,
    repaymentDates: Array.from(repaymentDates).sort(),
    earlyDetailCount,
    earlyTotal,
    earlyUnmatchedCount,
    olivePendingCount,
    idempotentNewMatchCount: Number(early && early.matchedCount || 0),
    normalMatchedCount: Number(normal && normal.matchedCount || 0),
    normalReviewCount: Number(normal && normal.reviewCount || 0),
    r6ReadyForDailyUse: r6 ? Boolean(r6.readyForDailyUse) : null,
    r6Score: r6 ? Number(r6.score || 0) : null,
    r6Warnings: r6 ? (r6.warnings || []) : null,
    r6Blockers: r6 ? (r6.blockers || []) : null,
    r6Summary: r6 ? (r6.summary || null) : null
  };

  Logger.log("=== R6.22 Olive繰上返済 恒久対応検証 ===");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
