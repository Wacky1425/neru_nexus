// ============================================================
// Neru Nexus R6.6 - SMBC <-> PayPay 二重資金移動診断
// Read-only diagnostic. No data is modified.
// ============================================================

function diagnoseR66SmbcPayPayDuplicateTransfers() {
  const targetAccountId = "smbc_bank";
  const paypayAccountId = "paypay";
  const identityLookup = buildAccountIdentityLookup_();
  const table = loadTransactions();
  const idx = table.index;
  const paypaySide = [];
  const bankSide = [];

  function txBase_(row, i) {
    const rowRef = getTransactionAccountReference_(row, idx, "account_name", "account_id", identityLookup);
    const fromRef = getTransactionAccountReference_(row, idx, "from_account", "from_account_id", identityLookup);
    const toRef = getTransactionAccountReference_(row, idx, "to_account", "to_account_id", identityLookup);
    return {
      rowNumber: i + 2,
      id: idx["id"] === undefined ? "" : String(row[idx["id"]] || "").trim(),
      transactionDate: formatApiDate_(row[idx["transaction_date"]]),
      type: getString(row, idx, "type"),
      amount: getNumber(row, idx, "amount"),
      merchant: idx["merchant"] === undefined ? "" : String(row[idx["merchant"]] || "").trim(),
      accountId: rowRef.accountId || "",
      accountName: rowRef.accountName || "",
      fromAccountId: fromRef.accountId || "",
      fromAccount: fromRef.accountName || "",
      toAccountId: toRef.accountId || "",
      toAccount: toRef.accountName || "",
      sourceType: idx["source_type"] === undefined ? "" : String(row[idx["source_type"]] || "").trim(),
      sourceStatus: idx["source_status"] === undefined ? "" : String(row[idx["source_status"]] || "").trim(),
      status: idx["status"] === undefined ? "" : String(row[idx["status"]] || "").trim(),
      duplicateKey: idx["duplicate_key"] === undefined ? "" : String(row[idx["duplicate_key"]] || "").trim(),
      importBatch: idx["import_batch"] === undefined ? "" : String(row[idx["import_batch"]] || "").trim(),
      ignored: isIgnoredTransactionRow_(row, idx),
    };
  }

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const tx = txBase_(row, i);
    if (tx.ignored) continue;
    if (tx.type !== "移動" && tx.type !== "振替") continue;

    const relatesSmbc = tx.accountId === targetAccountId || tx.fromAccountId === targetAccountId || tx.toAccountId === targetAccountId;
    const relatesPaypay = tx.accountId === paypayAccountId || tx.fromAccountId === paypayAccountId || tx.toAccountId === paypayAccountId;

    // The suspicious rows are PayPay CSV rows that nevertheless affect SMBC.
    if (tx.sourceType === "CSV_PayPay" && relatesSmbc) paypaySide.push(tx);

    // Formal/notification rows originating on the SMBC side. Keep only rows related to PayPay.
    if ((tx.sourceType === "CSV_銀行" || tx.sourceType === "Gmail_SMBC") && relatesSmbc && relatesPaypay) bankSide.push(tx);
  }

  function dayDiff_(a, b) {
    if (!a || !b) return 9999;
    const da = new Date(a + "T00:00:00Z");
    const db = new Date(b + "T00:00:00Z");
    return Math.round(Math.abs(da.getTime() - db.getTime()) / 86400000);
  }

  const matchedBankIds = new Set();
  const rows = paypaySide.map((p) => {
    const candidates = bankSide
      .filter((b) => Number(b.amount || 0) === Number(p.amount || 0) && dayDiff_(b.transactionDate, p.transactionDate) <= 3)
      .sort((a, b) => dayDiff_(a.transactionDate, p.transactionDate) - dayDiff_(b.transactionDate, p.transactionDate));
    const best = candidates.length ? candidates[0] : null;
    if (best) matchedBankIds.add(best.id || ("row:" + best.rowNumber));
    return {
      paypayRow: {
        rowNumber: p.rowNumber,
        id: p.id,
        date: p.transactionDate,
        amount: p.amount,
        merchant: p.merchant,
        from: p.fromAccount,
        to: p.toAccount,
        duplicateKey: p.duplicateKey,
      },
      bestSmbcCandidate: best ? {
        rowNumber: best.rowNumber,
        id: best.id,
        date: best.transactionDate,
        amount: best.amount,
        merchant: best.merchant,
        sourceType: best.sourceType,
        sourceStatus: best.sourceStatus,
        from: best.fromAccount,
        to: best.toAccount,
        duplicateKey: best.duplicateKey,
        dayDifference: dayDiff_(best.transactionDate, p.transactionDate),
      } : null,
      candidateCount: candidates.length,
      duplicateLikely: !!best,
    };
  });

  const duplicateLikely = rows.filter((x) => x.duplicateLikely);
  const unmatched = rows.filter((x) => !x.duplicateLikely);
  const duplicateAmount = duplicateLikely.reduce((s, x) => s + Number(x.paypayRow.amount || 0), 0);
  const unmatchedAmount = unmatched.reduce((s, x) => s + Number(x.paypayRow.amount || 0), 0);
  const paypaySideTotal = paypaySide.reduce((s, x) => s + Number(x.amount || 0), 0);

  const result = {
    ready: true,
    purpose: "CSV_PayPay由来なのにSMBC残高へ寄与する資金移動を、SMBC側CSV/Gmail取引と日付±3日・同額で突合する読み取り専用診断",
    summary: {
      suspiciousPaypayRowCount: paypaySide.length,
      suspiciousPaypayAmountTotal: paypaySideTotal,
      likelyDuplicateCount: duplicateLikely.length,
      likelyDuplicateAmountTotal: duplicateAmount,
      unmatchedCount: unmatched.length,
      unmatchedAmountTotal: unmatchedAmount,
      targetBalanceDifference: 63000,
      duplicateAmountMatchesTargetDifference: duplicateAmount === 63000,
    },
    matches: rows,
    unmatchedSmbcPaypayRows: bankSide.filter((b) => !matchedBankIds.has(b.id || ("row:" + b.rowNumber))).map((b) => ({
      rowNumber: b.rowNumber,
      id: b.id,
      date: b.transactionDate,
      amount: b.amount,
      merchant: b.merchant,
      sourceType: b.sourceType,
      sourceStatus: b.sourceStatus,
      from: b.fromAccount,
      to: b.toAccount,
      duplicateKey: b.duplicateKey,
    })),
    conclusionHint: duplicateAmount === 63000
      ? "63,000円が一致。CSV_PayPay側の重複資金移動をSMBC残高計算から二重寄与させない修正候補です。まだ自動修正はしていません。"
      : "63,000円とは一致していません。matches/unmatchedを確認してから修正方針を決めます。",
  };

  Logger.log("=== R6.6 SMBC <-> PayPay 二重資金移動診断 ===");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
