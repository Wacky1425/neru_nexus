// ============================================================
// Neru Nexus - Master Data
//
// Flutterへ返すマスターデータの組み立てを担当。
// ============================================================

function getMasterData() {
  const categories = getCategoriesData();
  const accounts = getAccountsData_();

  const transactionTypes = buildTransactionTypes_(categories.items);

  const transactionStatuses = ["要確認", "確定"];

  return {
    categories,
    accounts: accounts.items,
    transactionTypes,
    transactionStatuses,
    settings: {},
    generatedAt: new Date().toISOString(),
  };
}

function buildTransactionTypes_(categoryItems) {
  const types = [];

  for (const item of categoryItems) {
    const value = String(item.type || "").trim();

    if (value && !types.includes(value)) {
      types.push(value);
    }
  }

  return types;
}
