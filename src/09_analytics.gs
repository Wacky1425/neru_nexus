function rebuildAnalytics() {

  rebuildCategoryTable();

  rebuildMonthlyTable();

  rebuildWalletTable();

  rebuildIntentTable();

}

function rebuildWalletTable() {
  const analytics = getRequiredSheet(SHEETS.ANALYTICS);

  const rows = summarizeTransactionsByField(
    getLatestBudgetMonth(),
    "wallet",
    {
      type: "支出",
      skipBlank: true
    }
  );

  writeTable(
    analytics,
    3,
    7,
    ["Wallet", "金額"],
    rows
  );
}

function rebuildIntentTable() {
  const analytics = getRequiredSheet(SHEETS.ANALYTICS);

  const rows = summarizeTransactionsByField(
    getLatestBudgetMonth(),
    "intent",
    {
      type: "支出",
      skipBlank: false
    }
  );

  writeTable(
    analytics,
    3,
    10,
    ["Intent", "金額"],
    rows
  );
}

function rebuildCategoryTable() {
  const analytics = getRequiredSheet(SHEETS.ANALYTICS);
  const yearMonth = getLatestBudgetMonth();

  const rows = getCategorySummary(yearMonth)
    .map(item => [
      item.category,
      item.amount
    ]);

  writeTable(
    analytics,
    3,
    1,
    ["カテゴリ", "金額"],
    rows
  );
}

function rebuildMonthlyTable() {
  const analytics = getRequiredSheet(SHEETS.ANALYTICS);
  const table = loadTable(SHEETS.MONTHLY_SUMMARY);

  if (table.rows.length === 0) {
    writeTable(
      analytics,
      3,
      4,
      ["年月", "支出"],
      []
    );

    return;
  }

  assertRequiredColumns(
    table.index,
    [
      "year_month",
      "net_expense"
    ],
    SHEETS.MONTHLY_SUMMARY
  );

  const rows = table.rows.map(row => [
    row[table.index["year_month"]],
    getNumber(
      row,
      table.index,
      "net_expense"
    )
  ]);

  writeTable(
    analytics,
    3,
    4,
    ["年月", "支出"],
    rows
  );
}