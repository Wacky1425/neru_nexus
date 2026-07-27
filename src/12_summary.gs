function createMonthlySummary_() {
  return {
    total_expense: 0,
    total_income: 0,
    total_discount: 0,
    total_transfer: 0,
    total_business_expense: 0,
    count_transactions: 0
  };
}

function aggregateTransactionSummaries_(transactionTable) {
  assertRequiredColumns(
    transactionTable.index,
    [
      "transaction_date",
      "type",
      "major_category",
      "amount",
      "expense_amount"
    ],
    "transactions"
  );

  const monthlyMap = new Map();
  const categoryMap = new Map();

  for (const row of transactionTable.rows) {
    const type = getString(
      row,
      transactionTable.index,
      "type"
    );

    if (type === "メモ") {
      continue;
    }

    const yearMonth = normalizeYearMonth(
      row[transactionTable.index["transaction_date"]]
    );

    if (!yearMonth) {
      continue;
    }

    const majorCategory = getString(
      row,
      transactionTable.index,
      "major_category"
    );

    const amount = getNumber(
      row,
      transactionTable.index,
      "amount"
    );

    const expenseAmount = getNumber(
      row,
      transactionTable.index,
      "expense_amount"
    );

    if (!monthlyMap.has(yearMonth)) {
      monthlyMap.set(
        yearMonth,
        createMonthlySummary_()
      );
    }

    const monthly = monthlyMap.get(yearMonth);

    monthly.count_transactions += 1;
    monthly.total_business_expense += expenseAmount;

    if (type === "支出") {
      monthly.total_expense += amount;
    } else if (type === "収入") {
      monthly.total_income += amount;
    } else if (
      type === "値引き" ||
      type === "調整"
    ) {
      monthly.total_discount += amount;
    } else if (
      type === "振替" ||
      type === "移動"
    ) {
      monthly.total_transfer += amount;
    }

    const categoryKey =
      `${yearMonth}|${majorCategory}`;

    if (!categoryMap.has(categoryKey)) {
      categoryMap.set(categoryKey, {
        year_month: yearMonth,
        major_category: majorCategory,
        total_amount: 0,
        count_transactions: 0
      });
    }

    const category = categoryMap.get(categoryKey);

    if (type === "支出") {
      category.total_amount += amount;
    } else if (
      type === "値引き" ||
      type === "調整"
    ) {
      category.total_amount -= amount;
    }

    category.count_transactions += 1;
  }

  return {
    monthlyMap,
    categoryMap
  };
}

function buildMonthlySummaryRows_(monthlyMap) {
  return Array.from(monthlyMap.entries())
    .sort((a, b) =>
      String(a[0]).localeCompare(String(b[0]))
    )
    .map(([yearMonth, summary]) => [
      String(yearMonth),
      summary.total_expense,
      summary.total_income,
      summary.total_discount,
      summary.total_transfer,
      summary.total_business_expense,
      summary.total_expense -
        summary.total_discount,
      summary.count_transactions
    ]);
}

function buildCategorySummaryRows_(categoryMap) {
  return Array.from(categoryMap.values())
    .sort((a, b) => {
      const monthCompare =
        String(a.year_month).localeCompare(
          String(b.year_month)
        );

      if (monthCompare !== 0) {
        return monthCompare;
      }

      return String(a.major_category)
        .localeCompare(
          String(b.major_category)
        );
    })
    .map(category => [
      String(category.year_month),
      category.major_category,
      category.total_amount,
      category.count_transactions
    ]);
}

function rebuildSummaries() {
  const transactionTable = loadTransactions();

  if (transactionTable.rows.length === 0) {
    return;
  }

  const {
    monthlyMap,
    categoryMap
  } = aggregateTransactionSummaries_(
    transactionTable
  );

  const monthlyRows =
    buildMonthlySummaryRows_(monthlyMap);

  const categoryRows =
    buildCategorySummaryRows_(categoryMap);

  const monthlySheet =
    getRequiredSheet("monthly_summary");

  const categorySheet =
    getRequiredSheet("category_summary");

  writeTable(
    monthlySheet,
    1,
    1,
    [
      "year_month",
      "total_expense",
      "total_income",
      "total_discount",
      "total_transfer",
      "total_business_expense",
      "net_expense",
      "count_transactions"
    ],
    monthlyRows,
    Math.max(
      monthlySheet.getLastRow(),
      monthlyRows.length + 1,
      1
    )
  );

  writeTable(
    categorySheet,
    1,
    1,
    [
      "year_month",
      "major_category",
      "total_amount",
      "count_transactions"
    ],
    categoryRows,
    Math.max(
      categorySheet.getLastRow(),
      categoryRows.length + 1,
      1
    )
  );

  monthlySheet
    .getRange("A:A")
    .setNumberFormat("@");

  categorySheet
    .getRange("A:A")
    .setNumberFormat("@");

  Logger.log(
    `月別集計: ${monthlyRows.length}件 / ` +
    `カテゴリ集計: ${categoryRows.length}件`
  );
}

function getCategorySummary(yearMonth){

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("category_summary");

  const values = sheet.getDataRange().getValues();

  if(values.length < 2){
    return [];
  }

  const headers = values[0];
  const idx = {};

  headers.forEach((h,i)=>idx[h]=i);

  const result = [];

  for(const row of values.slice(1)){

    if(String(row[idx["year_month"]]) !== yearMonth){
      continue;
    }

    result.push({

      category: row[idx["major_category"]],
      amount: Number(row[idx["total_amount"]]||0)

    });

  }

  result.sort((a,b)=>b.amount-a.amount);

  return result;

}