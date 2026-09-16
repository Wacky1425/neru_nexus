// ============================================================
// Neru Nexus R6 - YouTube収益用ゆうちょ 残高差額診断
// Read-only diagnostic. No data is modified.
// ============================================================

function diagnoseR6YoutubeRevenueBalanceMismatch() {
  const targetName = "ゆうちょ銀行YouTube収益用";
  const accounts = getAccountsData_().items || [];
  const account = accounts.find((item) => String(item.accountName || "").trim() === targetName);
  if (!account) throw new Error(targetName + " がaccountsに見つかりません");

  const accountId = String(account.accountId || "").trim();
  const openingDate = String(account.openingBalanceDate || "").trim();
  const openingBalance = Number(account.openingBalance || 0);
  const identityLookup = buildAccountIdentityLookup_();
  const table = loadTransactions();
  const idx = table.index;
  const contributions = [];
  const ignoredRelated = [];
  let calculated = openingBalance;

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const txDate = formatApiDate_(row[idx["transaction_date"]]);
    const type = getString(row, idx, "type");
    const amount = getNumber(row, idx, "amount");
    const rowRef = getTransactionAccountReference_(row, idx, "account_name", "account_id", identityLookup);
    const fromRef = getTransactionAccountReference_(row, idx, "from_account", "from_account_id", identityLookup);
    const toRef = getTransactionAccountReference_(row, idx, "to_account", "to_account_id", identityLookup);
    const related = rowRef.accountId === accountId || fromRef.accountId === accountId || toRef.accountId === accountId;
    if (!related) continue;

    const base = {
      rowNumber: i + 2,
      id: idx["id"] === undefined ? "" : String(row[idx["id"]] || "").trim(),
      transactionDate: txDate,
      type,
      amount,
      merchant: idx["merchant"] === undefined ? "" : String(row[idx["merchant"]] || "").trim(),
      accountName: rowRef.accountName || "",
      fromAccount: fromRef.accountName || "",
      toAccount: toRef.accountName || "",
      sourceType: idx["source_type"] === undefined ? "" : String(row[idx["source_type"]] || "").trim(),
      sourceStatus: idx["source_status"] === undefined ? "" : String(row[idx["source_status"]] || "").trim(),
      status: idx["status"] === undefined ? "" : String(row[idx["status"]] || "").trim(),
    };

    if (isIgnoredTransactionRow_(row, idx)) {
      ignoredRelated.push(Object.assign({}, base, { reason: "source_status=ignored" }));
      continue;
    }
    if (openingDate && txDate && txDate <= openingDate) continue;

    let delta = 0;
    if (type === "収入" && rowRef.accountId === accountId) delta += amount;
    if (type === "支出" && rowRef.accountId === accountId) delta -= amount;
    if (type === "移動" || type === "振替") {
      if (fromRef.accountId === accountId) delta -= amount;
      if (toRef.accountId === accountId) delta += amount;
    }
    if (delta === 0) continue;
    calculated += delta;
    contributions.push(Object.assign({}, base, { delta, runningBalance: calculated }));
  }

  const latest = getLatestR2ReconciliationByAccount_().get(accountId) || null;
  const official = (getAccountBalancesData_().items || []).find((item) => String(item.accountId || "") === accountId) || null;
  const result = {
    target: {
      accountId,
      accountName: account.accountName,
      openingBalance,
      openingBalanceDate: openingDate,
      calculatedFromTrace: calculated,
      calculatedFromApp: official ? Number(official.currentBalance || 0) : null,
    },
    latestReconciliation: latest,
    contributionCount: contributions.length,
    contributionTotal: contributions.reduce((sum, item) => sum + Number(item.delta || 0), 0),
    contributions,
    ignoredRelatedCount: ignoredRelated.length,
    ignoredRelated,
    hints: [
      "differenceは actualBalance - calculatedBalance です。",
      "基準日当日の取引は現行残高計算では基準残高に含まれる前提で除外されます。",
      "この診断は読み取り専用で、シートを変更しません。"
    ]
  };
  Logger.log("=== R6 YouTube収益用口座 残高差額診断 ===");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
