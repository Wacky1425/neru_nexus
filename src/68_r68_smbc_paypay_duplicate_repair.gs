// ============================================================
// Neru Nexus R6.8 - SMBC <-> PayPay 二重資金移動修復
// CSV_PayPay 側の重複 transfer を論理除外し、SMBC側の正式取引を正本にする。
// 行削除はしない。再実行しても source_status=ignored は対象外なので冪等。
// ============================================================

function repairR68SmbcPayPayDuplicateTransfers() {
  const targetAccountId = "smbc_bank";
  const paypayAccountId = "paypay";
  const identityLookup = buildAccountIdentityLookup_();
  const table = loadTransactions();
  const idx = table.index;
  const sheet = table.sheet;
  const paypaySide = [];
  const bankSide = [];

  function ref_(row, nameKey, idKey) {
    return getTransactionAccountReference_(row, idx, nameKey, idKey, identityLookup);
  }
  function date_(row) { return formatApiDate_(row[idx["transaction_date"]]); }
  function amount_(row) { return getNumber(row, idx, "amount"); }
  function source_(row) { return idx["source_type"] === undefined ? "" : String(row[idx["source_type"]] || "").trim(); }
  function dayDiff_(a, b) {
    if (!a || !b) return 9999;
    return Math.round(Math.abs(new Date(a + "T00:00:00Z").getTime() - new Date(b + "T00:00:00Z").getTime()) / 86400000);
  }

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    if (isIgnoredTransactionRow_(row, idx)) continue;
    const type = getString(row, idx, "type");
    if (type !== "移動" && type !== "振替") continue;
    const account = ref_(row, "account_name", "account_id");
    const from = ref_(row, "from_account", "from_account_id");
    const to = ref_(row, "to_account", "to_account_id");
    const relatesSmbc = account.accountId === targetAccountId || from.accountId === targetAccountId || to.accountId === targetAccountId;
    const relatesPaypay = account.accountId === paypayAccountId || from.accountId === paypayAccountId || to.accountId === paypayAccountId;
    const item = { i: i, row: row, date: date_(row), amount: amount_(row), account: account, from: from, to: to, sourceType: source_(row) };
    if (item.sourceType === "CSV_PayPay" && relatesSmbc && relatesPaypay) paypaySide.push(item);
    if ((item.sourceType === "CSV_銀行" || item.sourceType === "Gmail_SMBC") && relatesSmbc && relatesPaypay) bankSide.push(item);
  }

  const usedBank = new Set();
  const repaired = [];
  const unresolved = [];

  paypaySide.forEach((p) => {
    const candidates = bankSide
      .filter((b) => !usedBank.has(b.i) && Number(b.amount) === Number(p.amount) && dayDiff_(b.date, p.date) <= 3)
      .sort((a, b) => dayDiff_(a.date, p.date) - dayDiff_(b.date, p.date));
    const best = candidates.length ? candidates[0] : null;
    if (!best) {
      unresolved.push({ rowNumber: p.i + 2, date: p.date, amount: p.amount });
      return;
    }
    usedBank.add(best.i);
    if (idx["source_status"] !== undefined) p.row[idx["source_status"]] = "ignored";
    if (idx["settlement_status"] !== undefined) p.row[idx["settlement_status"]] = "matched";
    if (idx["settlement_id"] !== undefined) {
      const bankId = idx["id"] === undefined ? "" : String(best.row[idx["id"]] || "").trim();
      p.row[idx["settlement_id"]] = bankId;
    }
    repaired.push({
      paypayRowNumber: p.i + 2,
      smbcRowNumber: best.i + 2,
      date: p.date,
      amount: p.amount,
      dayDifference: dayDiff_(p.date, best.date),
    });
  });

  if (repaired.length > 0) {
    sheet.getRange(2, 1, table.rows.length, table.headers.length).setValues(table.rows);
  }

  const verification = verifyR68SmbcPayPayDuplicateRepair_();
  const result = {
    ready: unresolved.length === 0 && verification.remainingActiveDuplicateCount === 0,
    repairedCount: repaired.length,
    repairedAmountTotal: repaired.reduce((s, x) => s + Number(x.amount || 0), 0),
    unresolvedCount: unresolved.length,
    unresolved: unresolved,
    verification: verification,
    note: "CSV_PayPay側だけを論理除外。SMBC側の正式transferを正本として残しています。行削除はしていません。",
  };
  Logger.log("=== R6.8 SMBC <-> PayPay 二重資金移動修復 ===");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyR68SmbcPayPayDuplicateRepair() {
  const result = verifyR68SmbcPayPayDuplicateRepair_();
  Logger.log("=== R6.8 修復検証 ===");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyR68SmbcPayPayDuplicateRepair_() {
  const identityLookup = buildAccountIdentityLookup_();
  const table = loadTransactions();
  const idx = table.index;
  let activeCount = 0;
  let activeAmount = 0;
  let ignoredCount = 0;
  let ignoredAmount = 0;
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const sourceType = idx["source_type"] === undefined ? "" : String(row[idx["source_type"]] || "").trim();
    if (sourceType !== "CSV_PayPay") continue;
    const type = getString(row, idx, "type");
    if (type !== "移動" && type !== "振替") continue;
    const from = getTransactionAccountReference_(row, idx, "from_account", "from_account_id", identityLookup);
    const to = getTransactionAccountReference_(row, idx, "to_account", "to_account_id", identityLookup);
    const isTarget = from.accountId === "smbc_bank" && to.accountId === "paypay";
    if (!isTarget) continue;
    const amount = getNumber(row, idx, "amount");
    if (isIgnoredTransactionRow_(row, idx)) { ignoredCount++; ignoredAmount += amount; }
    else { activeCount++; activeAmount += amount; }
  }
  return {
    remainingActiveDuplicateCount: activeCount,
    remainingActiveDuplicateAmount: activeAmount,
    ignoredDuplicateCount: ignoredCount,
    ignoredDuplicateAmount: ignoredAmount,
  };
}
