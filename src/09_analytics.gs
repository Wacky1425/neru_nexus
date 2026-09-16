function getAnalyticsData(yearMonth) {
  /*
   * 対象月
   */

  const targetYearMonth = yearMonth || getLatestBudgetMonth();

  if (!targetYearMonth) {
    throw new Error("分析対象の年月が指定されていません");
  }

  const normalized = normalizeYearMonth_(targetYearMonth);

  if (!normalized) {
    throw new Error("分析対象の年月が正しくありません");
  }

  const now = new Date();
  const currentYearMonth = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "yyyy-MM",
  );
  const isCurrentMonth = normalized === currentYearMonth;

  /*
   * 直近6か月のSummaryを最新化
   */

  const [year, month] = normalized.split("-").map(Number);

  const trendMonths = [];

  for (let difference = 5; difference >= 0; difference--) {
    const targetDate = new Date(year, month - 1 - difference, 1);

    const monthKey = Utilities.formatDate(
      targetDate,
      Session.getScriptTimeZone(),
      "yyyy-MM",
    );

    trendMonths.push(monthKey);

    ensureSummaryFresh_(monthKey);
  }

  /*
   * Analytics用キャッシュをロード
   */

  const monthlyData = loadAnalyticsMonthlySummary_();

  const categoryData = loadAnalyticsCategorySummary_();

  /*
   * 対象月の支出
   */

  const monthly = monthlyData.find((item) => item.yearMonth === normalized);

  const fixedExpense = Number(monthly?.fixedExpense || 0);

  const variableExpense = Number(monthly?.variableExpense || 0);

  const totalExpense = fixedExpense + variableExpense;

  const totalIncome = Number(monthly?.totalIncome || 0);

  const balance = totalIncome - totalExpense;
  /*
   * 前月
   */

  const previousDate = new Date(year, month - 2, 1);

  const previousYearMonth = Utilities.formatDate(
    previousDate,
    Session.getScriptTimeZone(),
    "yyyy-MM",
  );

  const previousMonthly = monthlyData.find(
    (item) => item.yearMonth === previousYearMonth,
  );

  const previousFixedExpense = Number(previousMonthly?.fixedExpense || 0);

  const previousVariableExpense = Number(previousMonthly?.variableExpense || 0);

  let previousTotalExpense = previousFixedExpense + previousVariableExpense;

  let previousTotalIncome = Number(previousMonthly?.totalIncome || 0);

  let previousComparableCategoryAmounts = null;
  let comparisonDay = null;

  // 当月の途中では、完成済みの前月全体と直接比較しない。
  // 同じ日数（例: 9/16 vs 8/16）までの実績をtransactionsから再集計する。
  if (isCurrentMonth) {
    comparisonDay = now.getDate();
    const previousToDate = buildAnalyticsToDateComparison_(
      previousYearMonth,
      comparisonDay,
    );
    previousTotalExpense = previousToDate.totalExpense;
    previousTotalIncome = previousToDate.totalIncome;
    previousComparableCategoryAmounts = previousToDate.categoryAmounts;
  }

  const previousBalance = previousTotalIncome - previousTotalExpense;

  /*
   * 過去3か月平均（対象月を除く）
   */

  const comparisonMonths = [];

  for (let difference = 1; difference <= 3; difference++) {
    const comparisonDate = new Date(year, month - 1 - difference, 1);

    comparisonMonths.push(
      Utilities.formatDate(
        comparisonDate,
        Session.getScriptTimeZone(),
        "yyyy-MM",
      ),
    );
  }

  const comparisonExpenses = comparisonMonths.map((monthKey) => {
    const item = monthlyData.find(
      (monthlyItem) => monthlyItem.yearMonth === monthKey,
    );

    return item
      ? Number(item.fixedExpense || 0) + Number(item.variableExpense || 0)
      : 0;
  });

  const nonZeroComparisonExpenses = comparisonExpenses.filter(
    (value) => value > 0,
  );

  const averageExpense3Months = nonZeroComparisonExpenses.length
    ? Math.round(
        nonZeroComparisonExpenses.reduce((sum, value) => sum + value, 0) /
          nonZeroComparisonExpenses.length,
      )
    : 0;
  /*
   * カテゴリ
   */

  const currentCategoryRows = categoryData.filter(
    (item) => item.yearMonth === normalized,
  );

  const previousCategoryRows = categoryData.filter(
    (item) => item.yearMonth === previousYearMonth,
  );

  const categoryNames = new Set([
    ...currentCategoryRows.map((item) => item.category),
    ...previousCategoryRows.map((item) => item.category),
  ]);

  const categories = Array.from(categoryNames)
    .map((category) => {
      const current = currentCategoryRows.find(
        (item) => item.category === category,
      );
      const previous = previousCategoryRows.find(
        (item) => item.category === category,
      );

      const amount = Number(current?.amount || 0);
      const previousAmount = previousComparableCategoryAmounts
        ? Number(previousComparableCategoryAmounts[category] || 0)
        : Number(previous?.amount || 0);

      return {
        category,
        amount,
        previousAmount,
        difference: amount - previousAmount,
        share: totalExpense > 0 ? amount / totalExpense : 0,
      };
    })
    .filter((item) => item.amount !== 0 || item.previousAmount !== 0)
    .sort((a, b) => b.amount - a.amount);

  const categoryChanges = categories
    .filter((item) => item.difference !== 0)
    .slice()
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
    .slice(0, 5);

  /*
   * 予算進捗
   */

  const effectiveBudget = getEffectiveBudgetsForMonth_(normalized);
  const budgetValues = effectiveBudget.budgets || {};
  const fixedExpenseBudget = Number(budgetValues["固定費予算"] || 0);
  const variableExpenseBudget = Number(budgetValues["変動費予算"] || 0);
  const expenseBudget = fixedExpenseBudget + variableExpenseBudget;
  const budgetRemaining = expenseBudget > 0 ? expenseBudget - totalExpense : 0;
  const budgetUsageRate = expenseBudget > 0 ? totalExpense / expenseBudget : 0;

  /*
   * 当月なら月末着地見込みを算出。過去月は実績=着地。
   */

  const daysInMonth = new Date(year, month, 0).getDate();
  const elapsedDays = isCurrentMonth ? now.getDate() : daysInMonth;
  const projectedExpense =
    isCurrentMonth && elapsedDays > 0
      ? Math.round((totalExpense / elapsedDays) * daysInMonth)
      : totalExpense;

  /*
   * 直近6か月
   */

  const monthlyTrend = trendMonths.map((monthKey) => {
    const item = monthlyData.find(
      (monthlyItem) => monthlyItem.yearMonth === monthKey,
    );

    const expense = item
      ? Number(item.fixedExpense || 0) + Number(item.variableExpense || 0)
      : 0;

    const income = Number(item?.totalIncome || 0);

    const balance = income - expense;

    return {
      yearMonth: monthKey,
      expense,
      income,
      balance,
    };
  });

  return {
    yearMonth: normalized,

    totalExpense,

    totalIncome,

    balance,

    fixedExpense,

    variableExpense,

    previousYearMonth,

    previousTotalExpense,

    previousTotalIncome,

    previousBalance,

    comparisonDay,

    comparisonMode: isCurrentMonth ? "same_day" : "full_month",

    averageExpense3Months,

    expenseBudget,

    fixedExpenseBudget,

    variableExpenseBudget,

    budgetRemaining,

    budgetUsageRate,

    budgetInherited: effectiveBudget.inherited,

    budgetInheritedFrom: effectiveBudget.inheritedFrom,

    elapsedDays,

    daysInMonth,

    projectedExpense,

    categories,

    categoryChanges,

    monthlyTrend,

    generatedAt: new Date().toISOString(),
  };
}

function buildAnalyticsToDateComparison_(yearMonth, throughDay) {
  const table = loadTransactions();

  if (table.rows.length === 0) {
    return { totalExpense: 0, totalIncome: 0, categoryAmounts: {} };
  }

  assertRequiredColumns(
    table.index,
    ["transaction_date", "type", "major_category", "sub_category", "wallet", "amount"],
    SHEETS.TRANSACTIONS,
  );

  let fixedExpense = 0;
  let variableExpense = 0;
  let totalIncome = 0;
  const categoryAmounts = {};

  for (const row of table.rows) {
    const rawDate = row[table.index["transaction_date"]];
    if (normalizeYearMonth(rawDate) !== yearMonth) {
      continue;
    }

    const day = getAnalyticsTransactionDay_(rawDate);
    if (!day || day > throughDay) {
      continue;
    }

    const type = getString(row, table.index, "type");
    if (type === "メモ") {
      continue;
    }

    const amount = getNumber(row, table.index, "amount");
    const category = getString(row, table.index, "major_category");
    const wallet = getString(row, table.index, "wallet");

    if (type === "支出") {
      if (wallet === "生活") {
        const subCategory = getString(row, table.index, "sub_category");
        if (isFixedExpenseCategory(category, subCategory)) {
          fixedExpense += amount;
        } else {
          variableExpense += amount;
        }
      }
      categoryAmounts[category] = Number(categoryAmounts[category] || 0) + amount;
    } else if (type === "収入") {
      totalIncome += amount;
    } else if (type === "値引き" || type === "調整") {
      categoryAmounts[category] = Number(categoryAmounts[category] || 0) - amount;
    }
  }

  return {
    totalExpense: fixedExpense + variableExpense,
    totalIncome,
    categoryAmounts,
  };
}

function getAnalyticsTransactionDay_(value) {
  if (!value) {
    return 0;
  }

  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Number(Utilities.formatDate(value, Session.getScriptTimeZone(), "d"));
  }

  const text = String(value).trim();
  const match = text.match(/^\d{4}[-\/]\d{1,2}[-\/](\d{1,2})/);
  return match ? Number(match[1]) : 0;
}

function normalizeYearMonth_(value) {
  if (!value) {
    return "";
  }

  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM");
  }

  const text = String(value).trim();

  const match = text.match(/^(\d{4})[-\/](\d{1,2})/);

  if (match) {
    const year = match[1];
    const month = String(Number(match[2])).padStart(2, "0");

    return `${year}-${month}`;
  }

  return "";
}
