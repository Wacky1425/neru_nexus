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

function getBudgetSettings(yearMonth) {
  const targetMonth = normalizeBudgetYearMonth(yearMonth);

  if (!targetMonth) {
    throw new Error("対象年月が正しくありません");
  }

  const directBudgets = getBudgetsForMonth(targetMonth);

  let budgets = directBudgets;
  let inheritedFrom = "";

  if (Object.keys(directBudgets).length === 0) {
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

    if (latestMonth) {
      budgets = getBudgetsForMonth(latestMonth);
      inheritedFrom = latestMonth;
    }
  }

  return {
    yearMonth: targetMonth,
    inherited: inheritedFrom !== "",
    inheritedFrom,

    salaryPlanned: Number(budgets["給与予定"] || 0),
    sideIncomePlanned: Number(budgets["副業予定"] || 0),
    savingTarget: Number(budgets["貯金目標"] || 0),
    nisaTarget: Number(budgets["NISA積立"] || 0),
    fixedExpenseBudget: Number(budgets["固定費予算"] || 0),
    variableExpenseBudget: Number(budgets["変動費予算"] || 0),
    dreamTarget: Number(budgets["夢積立"] || 0),
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
    貯金目標: Number(data.savingTarget || 0),
    NISA積立: Number(data.nisaTarget || 0),
    固定費予算: Number(data.fixedExpenseBudget || 0),
    変動費予算: Number(data.variableExpenseBudget || 0),
    夢積立: Number(data.dreamTarget || 0),
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

  clearAnalyticsSummaryCache_();

  return createJsonResponse_(getBudgetSettings(yearMonth), "ok");
}

/**
 * 対象月・対象項目の予算を取得する。
 *
 * @param {*} yearMonth
 * @param {*} itemName
 * @return {number}
 */
function getBudget(yearMonth, itemName) {
  const budgets = getBudgetsForMonth(yearMonth);
  const item = String(itemName || "").trim();

  return Number(budgets[item] || 0);
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
function getLatestBudget(itemName) {
  const latestMonth = getLatestBudgetMonth();

  if (!latestMonth) {
    return 0;
  }

  return getBudget(latestMonth, itemName);
}

function testGetBudget() {
  Logger.log(`貯金目標: ${getBudget("2026-08", "貯金目標")}`);
}

function testGetLatestBudget() {
  Logger.log(`最新月の貯金目標: ${getLatestBudget("貯金目標")}`);
}

function getLatestYearMonth() {
  const sheet = SS.getSheetByName(SHEETS.MONTHLY_SUMMARY);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("monthly_summary にデータがありません");
  }

  const rows = values.slice(1).filter((r) => r[0]);
  const latestRaw = rows[rows.length - 1][0];
  const latest = normalizeYearMonth(latestRaw);

  if (!latest) {
    throw new Error("最新の year_month を正規化できません");
  }

  return latest;
}
