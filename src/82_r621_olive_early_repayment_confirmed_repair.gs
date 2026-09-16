// ============================================================
// R6.21 Olive 2026-07-31 confirmed early repayment repair
// User-confirmed one-off historical repair.
// ============================================================

function repairR621OliveConfirmedEarlyRepayment() {
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error("取引データがありません");

  const index = createHeaderIndex(values[0]);
  assertRequiredColumns(index, [
    "id", "transaction_date", "amount", "type", "source_type",
    "account_name", "note", "sub_category", "to_account",
    "settlement_status", "settlement_id"
  ], SHEETS.TRANSACTIONS);

  const cardAccount = "三井住友カードOlive";
  const repaymentDate = "2026-07-31";
  const expectedEarlyTotal = 115035;
  const expectedBankAmount = 61131;
  const early = [];
  let bank = null;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const date = normalizeSettlementDate_(row[index["transaction_date"]]);
    const amount = Number(row[index["amount"]] || 0);
    const sourceType = String(row[index["source_type"]] || "").trim();
    const account = resolveCanonicalAccountName_(row[index["account_name"]]);
    const toAccount = resolveCanonicalAccountName_(row[index["to_account"]]);
    const type = String(row[index["type"]] || "").trim();
    const sub = String(row[index["sub_category"]] || "").trim();
    const note = String(row[index["note"]] || "").normalize("NFKC").trim();

    if (type === "移動" && sub === "クレカ引落" && toAccount === cardAccount && date === "2026-08-26" && amount === expectedBankAmount) {
      bank = { sheetIndex: i, id: String(row[index["id"]] || "").trim() };
    }

    if (sourceType !== "CSV_クレカ" || account !== cardAccount || amount <= 0) continue;
    const m = note.match(/(\d{1,2})月(\d{1,2})日全額繰上返済/);
    if (!m) continue;
    const resolved = resolveEarlyRepaymentDate_(date, Number(m[1]), Number(m[2]));
    if (resolved !== repaymentDate) continue;
    early.push({
      sheetIndex: i,
      id: String(row[index["id"]] || "").trim(),
      amount: amount,
      status: String(row[index["settlement_status"]] || "").trim(),
      settlementId: String(row[index["settlement_id"]] || "").trim()
    });
  }

  const earlyTotal = early.reduce(function(s, x) { return s + x.amount; }, 0);
  if (earlyTotal !== expectedEarlyTotal || early.length !== 56) {
    throw new Error("R6.21安全停止: 繰上返済グループが想定と不一致 total=" + earlyTotal + " count=" + early.length);
  }
  if (!bank) throw new Error("R6.21安全停止: 2026-08-26 Olive 61,131円引落が見つかりません");

  const repairSettlementId = "manual_early_olive_20260731";
  let newlyMarked = 0;
  let alreadyMatched = 0;

  early.forEach(function(x) {
    if (x.status === "matched" || x.status === "manual_matched" || x.settlementId) {
      alreadyMatched++;
      return;
    }
    values[x.sheetIndex][index["settlement_status"]] = "manual_matched";
    values[x.sheetIndex][index["settlement_id"]] = repairSettlementId;
    newlyMarked++;
  });

  if (newlyMarked > 0) writeSettlementTransactionValues_(sheet, values);

  // 115,035円の繰上返済済み明細を候補から除外した状態で、
  // 8/26通常引落61,131円を再照合する。
  const normal = reconcilePendingCardSettlements_(cardAccount);
  const verification = verifyR621OliveConfirmedEarlyRepayment();

  const result = {
    earlyRepaymentDate: repaymentDate,
    earlyRepaymentTotal: earlyTotal,
    earlyDetailCount: early.length,
    newlyMarkedCount: newlyMarked,
    alreadyMatchedCount: alreadyMatched,
    normalSettlementMatchedCount: Number(normal && normal.matchedCount || 0),
    normalSettlementReviewCount: Number(normal && normal.reviewCount || 0),
    verification: verification
  };
  Logger.log("=== R6.21 Olive繰上返済確定修復 ===");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyR621OliveConfirmedEarlyRepayment() {
  const cardAccount = "三井住友カードOlive";
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const values = sheet.getDataRange().getValues();
  const index = createHeaderIndex(values[0]);
  assertRequiredColumns(index, [
    "transaction_date", "amount", "type", "source_type", "account_name",
    "note", "sub_category", "to_account", "settlement_status", "settlement_id"
  ], SHEETS.TRANSACTIONS);

  let earlyTotal = 0;
  let earlyCount = 0;
  let earlyUnmatchedCount = 0;
  let bankStatus = "";
  let bankSettlementId = "";

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const date = normalizeSettlementDate_(row[index["transaction_date"]]);
    const amount = Number(row[index["amount"]] || 0);
    const account = resolveCanonicalAccountName_(row[index["account_name"]]);
    const toAccount = resolveCanonicalAccountName_(row[index["to_account"]]);
    const sourceType = String(row[index["source_type"]] || "").trim();
    const type = String(row[index["type"]] || "").trim();
    const sub = String(row[index["sub_category"]] || "").trim();
    const status = String(row[index["settlement_status"]] || "").trim();
    const sid = String(row[index["settlement_id"]] || "").trim();
    const note = String(row[index["note"]] || "").normalize("NFKC").trim();

    if (type === "移動" && sub === "クレカ引落" && toAccount === cardAccount && date === "2026-08-26" && amount === 61131) {
      bankStatus = status;
      bankSettlementId = sid;
    }

    if (sourceType !== "CSV_クレカ" || account !== cardAccount || amount <= 0) continue;
    const m = note.match(/(\d{1,2})月(\d{1,2})日全額繰上返済/);
    if (!m) continue;
    if (resolveEarlyRepaymentDate_(date, Number(m[1]), Number(m[2])) !== "2026-07-31") continue;
    earlyTotal += amount;
    earlyCount++;
    if (!(status === "matched" || status === "manual_matched" || sid)) earlyUnmatchedCount++;
  }

  const r6 = typeof verifyR6FullDataReconciliation === "function" ? verifyR6FullDataReconciliation() : null;
  const result = {
    ready: earlyTotal === 115035 && earlyCount === 56 && earlyUnmatchedCount === 0 && (bankStatus === "matched" || bankStatus === "manual_matched") && Boolean(bankSettlementId),
    earlyRepaymentTotal: earlyTotal,
    earlyDetailCount: earlyCount,
    earlyUnmatchedCount: earlyUnmatchedCount,
    oliveBankStatus: bankStatus,
    oliveBankSettlementId: bankSettlementId,
    r6ReadyForDailyUse: r6 ? Boolean(r6.readyForDailyUse) : null,
    r6Score: r6 ? Number(r6.score || 0) : null,
    r6Warnings: r6 ? (r6.warnings || []) : null
  };
  Logger.log("=== R6.21 修復検証 ===");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
