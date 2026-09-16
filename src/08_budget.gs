/**
 * budgetsシートのデータを読み込む。
 *
 * @return {{
 *   rows: Array<Array<*>>,
 *   index: Object<string, number>
 * }}
 */
function loadBudgetTable_() {
  const sheet = getRequiredSheet(SHEETS.BUDGETS);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return {
      rows: [],
      index: {},
    };
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(index, ["year_month", "item", "value"], SHEETS.BUDGETS);

  return {
    rows: values.slice(1),
    index,
  };
}

/**
 * 年月をyyyy-MM形式へ統一する。
 *
 * @param {*} value
 * @return {string}
 */
function normalizeBudgetYearMonth(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Asia/Tokyo", "yyyy-MM");
  }

  const text = String(value).trim();
  const yearMonthMatch = text.match(/^(\d{4})[-/](\d{1,2})$/);

  if (yearMonthMatch) {
    return yearMonthMatch[1] + "-" + String(yearMonthMatch[2]).padStart(2, "0");
  }

  const parsedDate = new Date(text.replace(/\./g, "/"));

  if (!isNaN(parsedDate.getTime())) {
    return Utilities.formatDate(parsedDate, "Asia/Tokyo", "yyyy-MM");
  }

  return "";
}

/**
 * 対象月の予算を項目名→金額のオブジェクトで取得する。
 *
 * @param {*} yearMonth
 * @return {Object<string, number>}
 */
function getBudgetsForMonth(yearMonth) {
  const targetMonth = normalizeBudgetYearMonth(yearMonth);

  if (!targetMonth) {
    return {};
  }

  const cache = CacheService.getScriptCache();

  const cacheKey = HOME_BUDGET_CACHE_PREFIX + targetMonth;

  const cached = cache.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  const { rows, index } = loadBudgetTable_();

  const budgets = {};

  for (const row of rows) {
    const month = normalizeBudgetYearMonth(row[index["year_month"]]);

    if (month !== targetMonth) {
      continue;
    }

    const item = String(row[index["item"]] || "").trim();

    if (!item) {
      continue;
    }

    budgets[item] = Number(
      String(row[index["value"]] || "0").replace(/,/g, ""),
    );
  }

  cache.put(cacheKey, JSON.stringify(budgets), 21600);

  return budgets;
}

function getEffectiveBudgetsForMonth_(yearMonth) {
  const targetMonth = normalizeBudgetYearMonth(yearMonth);

  if (!targetMonth) {
    throw new Error("対象年月が正しくありません");
  }

  const directBudgets = getBudgetsForMonth(targetMonth);

  if (Object.keys(directBudgets).length > 0) {
    return {
      yearMonth: targetMonth,
      budgets: directBudgets,
      inherited: false,
      inheritedFrom: "",
    };
  }

  const { rows, index } = loadBudgetTable_();

  let latestMonth = "";

  for (const row of rows) {
    const rowMonth = normalizeBudgetYearMonth(row[index["year_month"]]);

    if (!rowMonth || rowMonth >= targetMonth) {
      continue;
    }

    if (!latestMonth || rowMonth > latestMonth) {
      latestMonth = rowMonth;
    }
  }

  return {
    yearMonth: targetMonth,
    budgets: latestMonth ? getBudgetsForMonth(latestMonth) : {},
    inherited: latestMonth !== "",
    inheritedFrom: latestMonth,
  };
}

function getBudgetSettings(yearMonth) {
  const effective = getEffectiveBudgetsForMonth_(yearMonth);
  const budgets = effective.budgets;

  const salaryPlanned = Number(budgets["給与予定"] || 0);
  const sideIncomePlanned = Number(budgets["副業予定"] || 0);
  const nisaTarget = Number(budgets["NISA積立"] || 0);
  const fixedExpenseBudget = Number(budgets["固定費予算"] || 0);
  const variableExpenseBudget = Number(budgets["変動費予算"] || 0);
  const freeSpendingTarget = Number(budgets["自由費上限"] || 0);
  const savingsTarget = Number(budgets["追加貯金目標"] || 0);

  // V2.2-3: 設定値だけでなく、今月の消化ペースも同じ画面で判断できるようにする。
  let actualExpense = 0;
  let projectedExpense = 0;
  let elapsedDays = 0;
  let daysInMonth = 0;

  try {
    const analytics = getAnalyticsData(effective.yearMonth);
    actualExpense = Number(analytics.totalExpense || 0);
    projectedExpense = Number(analytics.projectedMonthEndExpense || actualExpense);
    elapsedDays = Number(analytics.elapsedDays || 0);
    daysInMonth = Number(analytics.daysInMonth || 0);
  } catch (error) {
    console.warn(`budget pace unavailable: ${error}`);
  }

  const totalIncomePlanned = salaryPlanned + sideIncomePlanned;
  const livingBudget = fixedExpenseBudget + variableExpenseBudget;
  const plannedFreeCash = totalIncomePlanned - livingBudget - nisaTarget;
  const budgetRemaining = livingBudget - actualExpense;

  // V2.2-3.2: 月次予算を、目的資金・生活防衛資金・投資・自由費まで
  // ひとつの計画として読めるようにする。Home と同じ資金配分ロジックを再利用し、
  // 現在月以外では「現在残高」に依存する配分を無理に推測しない。
  let goalRequired = 0;
  let goalAllocation = 0;
  let goalShortage = 0;
  let emergencyCashAllocation = 0;
  let emergencyTargetAmount = 0;
  let emergencyProtectedCash = 0;
  let emergencyShortage = 0;
  let emergencyCoveredMonths = 0;
  let emergencyTargetMonths = 0;
  let emergencyStage = "";
  let goalFundingDetails = [];

  try {
    const now = new Date();
    const currentYearMonth = Utilities.formatDate(
      now,
      Session.getScriptTimeZone(),
      "yyyy-MM",
    );

    if (effective.yearMonth === currentYearMonth) {
      const home = getHomeData();
      const emergency = home.emergencyFund || {};

      goalRequired = Number(home.goalRequired || 0);
      goalAllocation = Number(home.goalAllocation || 0);
      goalShortage = Number(home.goalShortage || 0);
      emergencyCashAllocation = Number(home.emergencyCashAllocation || 0);
      emergencyTargetAmount = Number(emergency.targetAmount || 0);
      emergencyProtectedCash = Number(home.protectedCash || 0);
      emergencyShortage = Number(emergency.shortage || 0);
      emergencyCoveredMonths = Number(emergency.coveredMonths || 0);
      emergencyTargetMonths = Number(emergency.targetMonths || 0);
      emergencyStage = String(emergency.stage || "");
      goalFundingDetails = home.goalFundingDetails || [];
    }
  } catch (error) {
    console.warn(`integrated budget plan unavailable: ${error}`);
  }

  // 予定収入から生活費・NISA・今月必要なGoal・防衛資金積増しを引いた残り。
  // 「追加投資余力」とは別物で、趣味・経験などに残せる計画上の自由費目安。
  const discretionaryCapacity = Math.max(
    0,
    plannedFreeCash - goalRequired - emergencyCashAllocation - savingsTarget,
  );
  const discretionaryBudget = freeSpendingTarget > 0
    ? Math.min(freeSpendingTarget, discretionaryCapacity)
    : discretionaryCapacity;
  const unassignedCash = Math.max(0, discretionaryCapacity - discretionaryBudget);
  const committedPlan =
    livingBudget + nisaTarget + goalRequired + emergencyCashAllocation +
    savingsTarget + freeSpendingTarget;
  const planShortage = Math.max(0, committedPlan - totalIncomePlanned);

  return {
    yearMonth: effective.yearMonth,
    inherited: effective.inherited,
    inheritedFrom: effective.inheritedFrom,
    salaryPlanned,
    sideIncomePlanned,
    nisaTarget,
    fixedExpenseBudget,
    variableExpenseBudget,
    freeSpendingTarget,
    savingsTarget,
    totalIncomePlanned,
    livingBudget,
    plannedFreeCash,
    actualExpense,
    projectedExpense,
    budgetRemaining,
    budgetUsageRate: livingBudget > 0 ? actualExpense / livingBudget : 0,
    projectedUsageRate: livingBudget > 0 ? projectedExpense / livingBudget : 0,
    elapsedDays,
    daysInMonth,
    goalRequired,
    goalAllocation,
    goalShortage,
    goalFundingDetails,
    emergencyCashAllocation,
    emergencyTargetAmount,
    emergencyProtectedCash,
    emergencyShortage,
    emergencyCoveredMonths,
    emergencyTargetMonths,
    emergencyStage,
    discretionaryBudget,
    discretionaryCapacity,
    unassignedCash,
    committedPlan,
    planShortage,
  };
}

function updateBudgetSettingsFromApp_(data) {
  const yearMonth = normalizeBudgetYearMonth(data.yearMonth);

  if (!yearMonth) {
    return createJsonErrorResponse_("対象年月が正しくありません");
  }

  const values = {
    給与予定: Number(data.salaryPlanned || 0),
    副業予定: Number(data.sideIncomePlanned || 0),
    NISA積立: Number(data.nisaTarget || 0),
    固定費予算: Number(data.fixedExpenseBudget || 0),
    変動費予算: Number(data.variableExpenseBudget || 0),
    自由費上限: Number(data.freeSpendingTarget || 0),
    追加貯金目標: Number(data.savingsTarget || 0),
  };

  const table = loadBudgetTable_();
  const sheet = getRequiredSheet(SHEETS.BUDGETS);

  assertRequiredColumns(
    table.index,
    ["year_month", "item", "value"],
    SHEETS.BUDGETS,
  );

  const existingRows = new Map();

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];

    const rowMonth = normalizeBudgetYearMonth(row[table.index["year_month"]]);

    if (rowMonth !== yearMonth) {
      continue;
    }

    const item = String(row[table.index["item"]] || "").trim();

    if (!item) {
      continue;
    }

    existingRows.set(item, i + 2);
  }

  for (const [item, value] of Object.entries(values)) {
    const rowNumber = existingRows.get(item);

    if (rowNumber) {
      sheet.getRange(rowNumber, table.index["value"] + 1).setValue(value);

      continue;
    }

    sheet.appendRow([yearMonth, item, value]);
  }

  const cache = CacheService.getScriptCache();

  cache.remove(HOME_BUDGET_CACHE_PREFIX + yearMonth);
  cache.remove(LATEST_BUDGET_MONTH_CACHE_KEY);

  clearAnalyticsSummaryCache_();

  return createJsonResponse_(getBudgetSettings(yearMonth), "ok");
}

/**
 * budgetsに登録された最新月を取得する。
 *
 * @return {string}
 */
const LATEST_BUDGET_MONTH_CACHE_KEY = "latest_budget_month_v1";

function getLatestBudgetMonth() {
  const cache = CacheService.getScriptCache();

  const cached = cache.get(LATEST_BUDGET_MONTH_CACHE_KEY);

  if (cached) {
    return cached;
  }

  const { rows, index } = loadBudgetTable_();

  let latestMonth = "";

  for (const row of rows) {
    const month = normalizeBudgetYearMonth(row[index["year_month"]]);

    if (month && month > latestMonth) {
      latestMonth = month;
    }
  }

  if (latestMonth) {
    cache.put(LATEST_BUDGET_MONTH_CACHE_KEY, latestMonth, 21600);
  }

  return latestMonth;
}

/**
 * 最新月の指定予算を取得する。
 *
 * @param {*} itemName
 * @return {number}
 */

