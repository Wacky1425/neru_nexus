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

  const previousTotalExpense = previousFixedExpense + previousVariableExpense;

  const previousTotalIncome = Number(previousMonthly?.totalIncome || 0);

  const previousBalance = previousTotalIncome - previousTotalExpense;
  /*
   * カテゴリ
   */

  const categories = categoryData
    .filter((item) => item.yearMonth === normalized)
    .map((item) => ({
      category: item.category,
      amount: Number(item.amount || 0),
    }))
    .sort((a, b) => b.amount - a.amount);

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

    categories,

    monthlyTrend,

    generatedAt: new Date().toISOString(),
  };
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
