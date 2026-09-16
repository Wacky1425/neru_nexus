// ============================================================
// Neru Nexus R6.12 - PayPay 支出重複修復
// 2026-08-22の NewDays 760円 / アトレ 1,355円について、
// 後発importでmerchant表記揺れにより再登録された行を論理除外する。
// 行削除はしない。今後はbuildDuplicateKey側でも「支払い 」を正規化する。
// ============================================================

function repairR612PayPayDuplicateExpenses() {
  const table = loadTransactions();
  const idx = table.index;
  const sheet = table.sheet;
  const targets = [
    { date: "2026-08-22", amount: 760, merchantNeedle: "NewDays", canonicalId: "8eeeb6fa-3771-4734-9809-e7d11b4ce70c" },
    { date: "2026-08-22", amount: 1355, merchantNeedle: "アトレ", canonicalId: "605939da-88eb-4d10-9b9c-f071c849cb37" },
  ];
  const repaired = [];
  const errors = [];

  targets.forEach((t) => {
    const matches = [];
    for (let i = 0; i < table.rows.length; i++) {
      const row = table.rows[i];
      if (formatApiDate_(row[idx["transaction_date"]]) !== t.date) continue;
      if (getNumber(row, idx, "amount") !== t.amount) continue;
      if (getString(row, idx, "source_type") !== "CSV_PayPay") continue;
      const merchant = getString(row, idx, "merchant");
      if (merchant.indexOf(t.merchantNeedle) < 0) continue;
      matches.push({ i: i, row: row, id: getString(row, idx, "id"), merchant: merchant, ignored: isIgnoredTransactionRow_(row, idx) });
    }
    const canonical = matches.find((x) => x.id === t.canonicalId && !x.ignored);
    const duplicates = matches.filter((x) => x.id !== t.canonicalId && !x.ignored);
    if (!canonical) {
      errors.push({ target: t, reason: "canonical_not_found", matches: matches.map(x => ({rowNumber:x.i+2,id:x.id,merchant:x.merchant,ignored:x.ignored})) });
      return;
    }
    if (duplicates.length !== 1) {
      errors.push({ target: t, reason: "active_duplicate_count_not_1", count: duplicates.length, matches: matches.map(x => ({rowNumber:x.i+2,id:x.id,merchant:x.merchant,ignored:x.ignored})) });
      return;
    }
    const d = duplicates[0];
    if (idx["source_status"] !== undefined) d.row[idx["source_status"]] = "ignored";
    if (idx["settlement_status"] !== undefined) d.row[idx["settlement_status"]] = "matched";
    if (idx["settlement_id"] !== undefined) d.row[idx["settlement_id"]] = canonical.id;
    repaired.push({ duplicateRowNumber: d.i + 2, duplicateId: d.id, canonicalId: canonical.id, amount: t.amount, merchant: d.merchant });
  });

  if (errors.length === 0 && repaired.length > 0) {
    sheet.getRange(2, 1, table.rows.length, table.headers.length).setValues(table.rows);
  }
  const verification = verifyR612PayPayDuplicateExpenses_();
  const result = {
    ready: errors.length === 0 && verification.ready,
    repairedCount: errors.length === 0 ? repaired.length : 0,
    repairedAmountTotal: errors.length === 0 ? repaired.reduce((s,x)=>s+x.amount,0) : 0,
    errors: errors,
    verification: verification,
    note: errors.length ? "安全条件に合わなかったため書き込みしていません。" : "後発の重複2件だけをignored化。既存の確定2件を正本として保持。"
  };
  Logger.log("=== R6.12 PayPay 支出重複修復 ===");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyR612PayPayDuplicateExpenses() {
  const result = verifyR612PayPayDuplicateExpenses_();
  Logger.log("=== R6.12 修復検証 ===");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyR612PayPayDuplicateExpenses_() {
  const table = loadTransactions();
  const idx = table.index;
  const specs = [
    { amount:760, needle:"NewDays" },
    { amount:1355, needle:"アトレ" },
  ];
  const items = specs.map((s) => {
    let active=0, ignored=0;
    for (let i=0;i<table.rows.length;i++) {
      const row=table.rows[i];
      if (formatApiDate_(row[idx["transaction_date"]]) !== "2026-08-22") continue;
      if (getNumber(row,idx,"amount") !== s.amount) continue;
      if (getString(row,idx,"source_type") !== "CSV_PayPay") continue;
      if (getString(row,idx,"merchant").indexOf(s.needle) < 0) continue;
      if (isIgnoredTransactionRow_(row,idx)) ignored++; else active++;
    }
    return { amount:s.amount, merchant:s.needle, activeCount:active, ignoredCount:ignored };
  });
  const balanceData = getAccountBalancesData_();
  const paypayBalance = (balanceData.items || []).find((item) => String(item.accountId || "") === "paypay") || null;
  const calculatedBalance = paypayBalance ? Number(paypayBalance.currentBalance) : NaN;
  return {
    ready: items.every(x => x.activeCount === 1 && x.ignoredCount >= 1) && Number(calculatedBalance) === 1510,
    calculatedBalance: calculatedBalance,
    expectedBalance: 1510,
    difference: 1510 - Number(calculatedBalance),
    items: items,
  };
}
