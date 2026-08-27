function createMonthlySummary_() {
  return {
    total_expense: 0,
    total_income: 0,
    total_discount: 0,
    total_transfer: 0,
    total_business_expense: 0,
    count_transactions: 0,
    fixed_expense: 0,
    variable_expense: 0,

    business_income: 0,
    business_expense: 0,
  };
}

function aggregateTransactionSummaries_(transactionTable) {
  assertRequiredColumns(
    transactionTable.index,
    [
      "transaction_date",
      "type",
      "major_category",
      "sub_category",
      "wallet",
      "amount",
      "expense_amount",
    ],
    SHEETS.TRANSACTIONS,
  );

  const monthlyMap = new Map();
  const categoryMap = new Map();

  for (const row of transactionTable.rows) {
    const type = getString(row, transactionTable.index, "type");

    if (type === "メモ") {
      continue;
    }

    const yearMonth = normalizeYearMonth(
      row[transactionTable.index["transaction_date"]],
    );

    if (!yearMonth) {
      continue;
    }

    const majorCategory = getString(
      row,
      transactionTable.index,
      "major_category",
    );

    const amount = getNumber(row, transactionTable.index, "amount");

    const expenseAmount = getNumber(
      row,
      transactionTable.index,
      "expense_amount",
    );

    if (!monthlyMap.has(yearMonth)) {
      monthlyMap.set(yearMonth, createMonthlySummary_());
    }

    const monthly = monthlyMap.get(yearMonth);

    monthly.count_transactions += 1;
    monthly.total_business_expense += expenseAmount;

    const wallet = getString(row, transactionTable.index, "wallet");

    if (type === "支出") {
      monthly.total_expense += amount;

      if (wallet === "生活") {
        const subCategory = getString(
          row,
          transactionTable.index,
          "sub_category",
        );

        if (isFixedExpenseCategory(majorCategory, subCategory)) {
          monthly.fixed_expense += amount;
        } else {
          monthly.variable_expense += amount;
        }
      }

      if (wallet === "事業") {
        monthly.business_expense += amount;
      }
    } else if (type === "収入") {
      monthly.total_income += amount;

      if (wallet === "事業") {
        monthly.business_income += amount;
      }
    } else if (type === "値引き" || type === "調整") {
      monthly.total_discount += amount;
    } else if (type === "振替" || type === "移動") {
      monthly.total_transfer += amount;
    }
    const isCategoryTarget =
      type === "支出" || type === "値引き" || type === "調整";

    if (isCategoryTarget) {
      const categoryKey = `${yearMonth}|${majorCategory}`;

      if (!categoryMap.has(categoryKey)) {
        categoryMap.set(categoryKey, {
          year_month: yearMonth,
          major_category: majorCategory,
          total_amount: 0,
          count_transactions: 0,
        });
      }

      const category = categoryMap.get(categoryKey);

      if (type === "支出") {
        category.total_amount += amount;
      } else {
        category.total_amount -= amount;
      }

      category.count_transactions += 1;
    }
  }

  return {
    monthlyMap,
    categoryMap,
  };
}

function buildMonthlySummaryRows_(monthlyMap) {
  return Array.from(monthlyMap.entries())
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([yearMonth, summary]) => [
      String(yearMonth),

      summary.total_expense,
      summary.total_income,
      summary.total_discount,
      summary.total_transfer,
      summary.total_business_expense,

      summary.total_expense - summary.total_discount,

      summary.count_transactions,

      summary.fixed_expense,
      summary.variable_expense,

      summary.business_income,
      summary.business_expense,

      summary.business_income - summary.business_expense,
    ]);
}

function buildCategorySummaryRows_(categoryMap) {
  return Array.from(categoryMap.values())
    .sort((a, b) => {
      const monthCompare = String(a.year_month).localeCompare(
        String(b.year_month),
      );

      if (monthCompare !== 0) {
        return monthCompare;
      }

      return String(a.major_category).localeCompare(String(b.major_category));
    })
    .map((category) => [
      String(category.year_month),
      category.major_category,
      category.total_amount,
      category.count_transactions,
    ]);
}

function rebuildSummaries() {
  const transactionTable = loadTransactions();

  if (transactionTable.rows.length === 0) {
    return;
  }

  assertRequiredColumns(
    transactionTable.index,
    ["source_status"],
    SHEETS.TRANSACTIONS,
  );

  // ============================================================
  // ignoredを集計対象から除外
  // ============================================================

  const activeTransactionTable = {
    ...transactionTable,

    rows: transactionTable.rows.filter(
      (row) => !isIgnoredTransactionRow_(row, transactionTable.index),
    ),
  };

  const { monthlyMap, categoryMap } = aggregateTransactionSummaries_(
    activeTransactionTable,
  );

  const monthlyRows = buildMonthlySummaryRows_(monthlyMap);

  const categoryRows = buildCategorySummaryRows_(categoryMap);

  const monthlySheet = getRequiredSheet(SHEETS.MONTHLY_SUMMARY);

  const categorySheet = getRequiredSheet(SHEETS.CATEGORY_SUMMARY);

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
      "count_transactions",
      "fixed_expense",
      "variable_expense",
      "business_income",
      "business_expense",
      "business_profit",
    ],
    monthlyRows,
    Math.max(monthlySheet.getLastRow(), monthlyRows.length + 1, 1),
  );

  writeTable(
    categorySheet,
    1,
    1,
    ["year_month", "major_category", "total_amount", "count_transactions"],
    categoryRows,
    Math.max(categorySheet.getLastRow(), categoryRows.length + 1, 1),
  );

  monthlySheet.getRange("A:A").setNumberFormat("@");

  categorySheet.getRange("A:A").setNumberFormat("@");

  Logger.log(
    `月別集計: ${monthlyRows.length}件 / ` +
      `カテゴリ集計: ${categoryRows.length}件`,
  );

  clearAnalyticsSummaryCache_();
}

function rebuildSummariesForMonth_(yearMonth) {
  const targetMonth = normalizeBudgetYearMonth(yearMonth);

  if (!targetMonth) {
    return;
  }

  const transactionTable = loadTransactions();

  if (transactionTable.rows.length === 0) {
    return;
  }

  assertRequiredColumns(
    transactionTable.index,
    [
      "transaction_date",
      "type",
      "major_category",
      "amount",
      "expense_amount",
      "source_status",
    ],
    SHEETS.TRANSACTIONS,
  );

  const targetRows = transactionTable.rows.filter((row) => {
    // ======================================================
    // ignoredは集計対象外
    // ======================================================

    if (isIgnoredTransactionRow_(row, transactionTable.index)) {
      return false;
    }

    const rowMonth = normalizeYearMonth(
      row[transactionTable.index["transaction_date"]],
    );

    return rowMonth === targetMonth;
  });

  const targetTable = {
    ...transactionTable,

    rows: targetRows,
  };

  const { monthlyMap, categoryMap } =
    aggregateTransactionSummaries_(targetTable);

  const monthlyRows = buildMonthlySummaryRows_(monthlyMap);

  const categoryRows = buildCategorySummaryRows_(categoryMap);

  replaceSummaryMonth_(SHEETS.MONTHLY_SUMMARY, targetMonth, monthlyRows);

  replaceSummaryMonth_(SHEETS.CATEGORY_SUMMARY, targetMonth, categoryRows);

  clearTableCache(SHEETS.MONTHLY_SUMMARY);

  clearTableCache(SHEETS.CATEGORY_SUMMARY);

  clearAnalyticsSummaryCache_();
}

function replaceSummaryMonth_(sheetName, yearMonth, newRows) {
  const sheet = getRequiredSheet(sheetName);

  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    return;
  }

  const headers = values[0];

  const yearMonthIndex = headers.indexOf("year_month");

  if (yearMonthIndex === -1) {
    throw new Error(`${sheetName}にyear_month列がありません`);
  }

  const remainingRows = values.slice(1).filter((row) => {
    return String(row[yearMonthIndex] || "").trim() !== yearMonth;
  });

  const outputRows = [...remainingRows, ...newRows];

  sheet.clearContents();

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (outputRows.length > 0) {
    sheet
      .getRange(2, 1, outputRows.length, headers.length)
      .setValues(outputRows);
  }
}

function getCategorySummary(yearMonth) {
  const sheet = SS.getSheetByName(SHEETS.CATEGORY_SUMMARY);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0];
  const idx = {};

  headers.forEach((h, i) => (idx[h] = i));

  const result = [];

  for (const row of values.slice(1)) {
    if (String(row[idx["year_month"]]) !== yearMonth) {
      continue;
    }

    result.push({
      category: row[idx["major_category"]],
      amount: Number(row[idx["total_amount"]] || 0),
    });
  }

  result.sort((a, b) => b.amount - a.amount);

  return result;
}

function rebuildReviewSummaryFromRows_(reviewRows) {
  const summarySheet = getRequiredSheet(SHEETS.REVIEW_SUMMARY);

  if (!Array.isArray(reviewRows) || reviewRows.length === 0) {
    writeTable(
      summarySheet,
      1,
      1,
      ["merchant", "count", "total_amount", "sample_category"],
      [],
    );

    return;
  }

  const index = createHeaderIndex(REVIEW_QUEUE_HEADERS);

  const requiredColumns = [
    "merchant",
    "amount",
    "major_category",
    "sub_category",
  ];

  for (const column of requiredColumns) {
    if (index[column] === undefined) {
      throw new Error(`Review Queueに${column}列がありません`);
    }
  }

  const summaryMap = new Map();

  for (const row of reviewRows) {
    const merchant = String(row[index["merchant"]] || "").trim();

    if (!merchant) {
      continue;
    }

    const amount = Number(row[index["amount"]] || 0);

    const major = String(row[index["major_category"]] || "").trim();

    const sub = String(row[index["sub_category"]] || "").trim();

    if (!summaryMap.has(merchant)) {
      summaryMap.set(merchant, {
        merchant,
        count: 0,
        totalAmount: 0,
        sampleCategory: `${major} / ${sub}`,
      });
    }

    const summary = summaryMap.get(merchant);

    summary.count += 1;
    summary.totalAmount += amount;
  }

  const rows = Array.from(summaryMap.values())
    .sort((a, b) => b.count - a.count)
    .map((summary) => [
      summary.merchant,
      summary.count,
      summary.totalAmount,
      summary.sampleCategory,
    ]);

  writeTable(
    summarySheet,
    1,
    1,
    ["merchant", "count", "total_amount", "sample_category"],
    rows,
  );
}

const SUMMARY_DIRTY_KEY = "summary_dirty_months_v1";

function getDirtySummaryMonths_() {
  const properties = PropertiesService.getScriptProperties();

  const raw = properties.getProperty(SUMMARY_DIRTY_KEY);

  if (!raw) {
    return [];
  }

  try {
    const values = JSON.parse(raw);

    return Array.isArray(values) ? values : [];
  } catch (_) {
    return [];
  }
}

function markSummaryDirty_(yearMonth) {
  const month = normalizeBudgetYearMonth(yearMonth);

  if (!month) {
    return;
  }

  const properties = PropertiesService.getScriptProperties();

  const months = getDirtySummaryMonths_();

  if (!months.includes(month)) {
    months.push(month);

    properties.setProperty(SUMMARY_DIRTY_KEY, JSON.stringify(months));
  }
}

function clearSummaryDirty_(yearMonth) {
  const month = normalizeBudgetYearMonth(yearMonth);

  if (!month) {
    return;
  }

  const properties = PropertiesService.getScriptProperties();

  const months = getDirtySummaryMonths_().filter((value) => value !== month);

  if (months.length === 0) {
    properties.deleteProperty(SUMMARY_DIRTY_KEY);

    return;
  }

  properties.setProperty(SUMMARY_DIRTY_KEY, JSON.stringify(months));
}

function ensureSummaryFresh_(yearMonth) {
  const month = normalizeBudgetYearMonth(yearMonth);

  if (!month) {
    return;
  }

  const dirtyMonths = getDirtySummaryMonths_();

  if (!dirtyMonths.includes(month)) {
    return;
  }

  rebuildSummariesForMonth_(month);

  clearSummaryDirty_(month);
}

const ANALYTICS_MONTHLY_CACHE_KEY = "analytics_monthly_summary_v1";

const ANALYTICS_CATEGORY_CACHE_KEY = "analytics_category_summary_v1";

function loadAnalyticsMonthlySummary_() {
  const cache = CacheService.getScriptCache();

  const cached = cache.get(ANALYTICS_MONTHLY_CACHE_KEY);

  if (cached) {
    return JSON.parse(cached);
  }

  const table = loadTable(SHEETS.MONTHLY_SUMMARY);

  if (table.rows.length === 0) {
    return [];
  }

  assertRequiredColumns(
    table.index,
    [
      "year_month",
      "fixed_expense",
      "variable_expense",
      "total_income",
      "business_income",
      "business_expense",
      "business_profit",
    ],
    SHEETS.MONTHLY_SUMMARY,
  );

  const result = table.rows
    .map((row) => ({
      yearMonth: normalizeYearMonth(row[table.index["year_month"]]),

      fixedExpense: getNumber(row, table.index, "fixed_expense"),

      variableExpense: getNumber(row, table.index, "variable_expense"),

      totalIncome: getNumber(row, table.index, "total_income"),

      businessIncome: getNumber(row, table.index, "business_income"),

      businessExpense: getNumber(row, table.index, "business_expense"),

      businessProfit: getNumber(row, table.index, "business_profit"),
    }))
    .filter((item) => item.yearMonth);

  cache.put(ANALYTICS_MONTHLY_CACHE_KEY, JSON.stringify(result), 21600);

  return result;
}

function loadAnalyticsCategorySummary_() {
  const cache = CacheService.getScriptCache();

  const cached = cache.get(ANALYTICS_CATEGORY_CACHE_KEY);

  if (cached) {
    return JSON.parse(cached);
  }

  const table = loadTable(SHEETS.CATEGORY_SUMMARY);

  if (table.rows.length === 0) {
    return [];
  }

  assertRequiredColumns(
    table.index,
    ["year_month", "major_category", "total_amount"],
    SHEETS.CATEGORY_SUMMARY,
  );

  const result = table.rows
    .map((row) => ({
      yearMonth: normalizeYearMonth(row[table.index["year_month"]]),

      category: getString(row, table.index, "major_category"),

      amount: getNumber(row, table.index, "total_amount"),
    }))
    .filter((item) => item.yearMonth);

  cache.put(ANALYTICS_CATEGORY_CACHE_KEY, JSON.stringify(result), 21600);

  return result;
}

function clearAnalyticsSummaryCache_() {
  const cache = CacheService.getScriptCache();

  cache.remove(ANALYTICS_MONTHLY_CACHE_KEY);

  cache.remove(ANALYTICS_CATEGORY_CACHE_KEY);
}
