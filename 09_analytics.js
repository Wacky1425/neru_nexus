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

function getAnalyticsData(yearMonth) {
  const targetYearMonth =
    yearMonth || getLatestBudgetMonth();

  if (!targetYearMonth) {
    throw new Error(
      "分析対象の年月が指定されていません"
    );
  }

  const expenseBreakdown =
    getMonthlyLivingExpenseBreakdown(
      targetYearMonth
    );

  const categories =
    getExpenseCategoryBreakdown(
      targetYearMonth
    );

  return {
    yearMonth: targetYearMonth,

    totalExpense:
      expenseBreakdown.totalExpense,

    fixedExpense:
      expenseBreakdown.fixedExpense,

    variableExpense:
      expenseBreakdown.variableExpense,

    categories,

    monthlyTrend: getMonthlyTrend(yearMonth),

    generatedAt:
      new Date().toISOString()
  };
}


function getMonthlyTrend(currentYearMonth) {
  const normalizedCurrentMonth =
    normalizeYearMonth_(currentYearMonth);

  if (!normalizedCurrentMonth) {
    return [];
  }

  const parts =
    normalizedCurrentMonth.split("-");

  const year = Number(parts[0]);
  const month = Number(parts[1]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month)
  ) {
    return [];
  }

  const result = [];

  // 選択月を含む直近4か月
  for (let difference = 3; difference >= 0; difference--) {
    const targetDate = new Date(
      year,
      month - 1 - difference,
      1
    );

    const yearMonth =
      Utilities.formatDate(
        targetDate,
        Session.getScriptTimeZone(),
        "yyyy-MM"
      );

    const breakdown =
      getMonthlyLivingExpenseBreakdown(
        yearMonth
      );

    result.push({
      yearMonth,
      expense:
        Number(breakdown.totalExpense || 0),
    });
  }

  return result;
}

function normalizeYearMonth_(value) {
  if (!value) {
    return "";
  }

  if (
    Object.prototype.toString.call(value) ===
    "[object Date]"
  ) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM"
    );
  }

  const text = String(value).trim();

  const match = text.match(
    /^(\d{4})[-\/](\d{1,2})/
  );

  if (match) {
    const year = match[1];
    const month = String(
      Number(match[2])
    ).padStart(2, "0");

    return `${year}-${month}`;
  }

  return "";
}