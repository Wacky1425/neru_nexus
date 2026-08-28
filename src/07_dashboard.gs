function rebuildAllViews() {
  const startedAt = Date.now();

  // アプリで使用する集計データだけ再構築する
  const summariesStartedAt = Date.now();

  rebuildSummaries();

  const summariesMs = Date.now() - summariesStartedAt;

  return {
    totalMs: Date.now() - startedAt,
    summariesMs,
    monthlyCheckMs: 0,
    latestMonthMs: 0,
    dashboardMs: 0,
  };
}


function isFixedExpenseCategory(majorCategory, subCategory) {
  const major = String(majorCategory || "").trim();
  const sub = String(subCategory || "").trim();

  if (major === "住居" || major === "通信") {
    return true;
  }

  if (major === "金融" && ["税金", "保険"].includes(sub)) {
    return true;
  }

  return false;
}

const ACCOUNT_BALANCE_CACHE_KEY = "account_balances_v1";


function calculateAvailableMoney_(budgets, expenses, projectedIncome) {
  const variableBudget = Math.max(0, Number(budgets["変動費予算"] || 0));

  const fixedExpenseForecast = Math.max(
    Number(expenses.fixedExpense || 0),
    Number(budgets["固定費予算"] || 0),
  );

  // 収入から固定費を払ったあと、
  // 生活費として使える最大額
  const affordableVariableBudget = Math.max(
    0,
    Number(projectedIncome || 0) - fixedExpenseForecast,
  );

  // 基本は設定した変動費予算。
  // ただし収入的に払えない場合は、
  // 実際に払える額を上限にする。
  const usableVariableBudget = Math.min(
    variableBudget,
    affordableVariableBudget,
  );

  // 「今月あと使える」は純粋に
  // 生活費予算の残額として扱う。
  return usableVariableBudget - Number(expenses.variableExpense || 0);
}

function calculateDailyBudget_(yearMonth, availableMoney) {
  const parts = String(yearMonth).split("-");

  const year = Number(parts[0]);
  const month = Number(parts[1]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return 0;
  }

  const today = new Date();

  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const lastDayOfMonth = new Date(year, month, 0).getDate();

  let remainingDays;

  if (year === currentYear && month === currentMonth) {
    remainingDays = lastDayOfMonth - today.getDate() + 1;
  } else {
    remainingDays = lastDayOfMonth;
  }

  if (remainingDays <= 0) {
    return 0;
  }

  return Math.floor(Number(availableMoney || 0) / remainingDays);
}

function calculateMoneyHealth_(availableMoney, moneyAllocation) {
  let level = "🟢";
  let title = "順調です";

  const comments = [];

  const monthlySurplus = Number(moneyAllocation.monthlySurplus || 0);

  const goalShortage = Number(moneyAllocation.goalShortage || 0);

  const emergencyFund = moneyAllocation.emergencyFund || {};

  const emergencyStage = String(emergencyFund.stage || "");

  // ============================================================
  // 生活費
  // ============================================================

  if (availableMoney < 0) {
    level = "🔴";
    title = "予算オーバー";

    comments.push(
      `生活費予算を${Math.abs(
        availableMoney,
      ).toLocaleString()}円超えています。`,
    );
  } else if (availableMoney < 10000) {
    if (level !== "🔴") {
      level = "🟡";
      title = "少し注意";
    }

    comments.push("今月の生活費予算の残りが1万円未満です。");
  } else {
    comments.push("今月の生活費は予算内で推移しています。");
  }

  // ============================================================
  // Goal
  // ============================================================

  if (goalShortage > 0) {
    level = "🔴";
    title = "資金計画を確認";

    comments.push(
      `目的資金の必要ペースに対して${goalShortage.toLocaleString()}円不足しています。`,
    );
  }

  // ============================================================
  // 生活防衛資金
  // ============================================================

  if (emergencyStage === "critical") {
    level = "🔴";
    title = "現金確保を優先";

    comments.push("生活防衛資金が少ないため、現金確保を優先します。");
  } else if (emergencyStage === "cash_heavy") {
    if (level === "🟢") {
      level = "🟡";
      title = "現金を厚めに";
    }

    comments.push("生活防衛資金を増やしている段階です。");
  } else if (emergencyStage === "balanced") {
    comments.push("生活防衛資金は順調に積み上がっています。");
  } else if (emergencyStage === "secured") {
    comments.push("生活防衛資金の目標額を確保できています。");
  }

  // ============================================================
  // 余剰資金
  // ============================================================

  if (monthlySurplus > 0) {
    comments.push(
      `今月は${monthlySurplus.toLocaleString()}円を資産形成に回せる見込みです。`,
    );
  } else if (monthlySurplus === 0) {
    comments.push("今月は生活費までで収支がほぼ埋まる見込みです。");
  }

  return {
    level,
    title,
    message: comments.join("\n"),
  };
}

const HOME_BUDGET_CACHE_PREFIX = "home_budget_v1_";

const HOME_RECENT_TRANSACTIONS_CACHE_KEY = "home_recent_transactions_v1";

function getHomeRecentTransactions_() {
  const cache = CacheService.getScriptCache();

  const cached = cache.get(HOME_RECENT_TRANSACTIONS_CACHE_KEY);

  if (cached) {
    return JSON.parse(cached);
  }

  const items = getTransactionsData({
    limit: 3,
  }).items;

  cache.put(HOME_RECENT_TRANSACTIONS_CACHE_KEY, JSON.stringify(items), 21600);

  return items;
}

function clearHomeRecentTransactionsCache_() {
  CacheService.getScriptCache().remove(HOME_RECENT_TRANSACTIONS_CACHE_KEY);
}


function getFinancialSettings_() {
  const rows = loadObjects(SHEETS.FINANCIAL_SETTINGS);

  const settings = {};

  for (const row of rows) {
    const key = String(row.setting_key || "").trim();

    if (!key) {
      continue;
    }

    settings[key] = Number(row.setting_value || 0);
  }

  return {
    emergencyFundMonths: settings.emergency_fund_months || 6,

    baseNisaMonthly: settings.base_nisa_monthly || 0,

    minCashMonths: settings.min_cash_months || 1,

    cashHeavyUntilMonths: settings.cash_heavy_until_months || 3,

    balancedUntilMonths: settings.balanced_until_months || 6,

    goalSafetyMonths: settings.goal_safety_months || 6,

    forecastMonths: settings.forecast_months || 36,

    paydayDay: settings.payday_day || 25,
  };
}

function calculateBaselineEssentialLivingCost_() {
  const transactionTable = loadTransactions();

  if (transactionTable.rows.length === 0) {
    return {
      monthlyEssentialCost: 0,
      monthsUsed: 0,
      source: "no_transactions",
    };
  }

  assertRequiredColumns(
    transactionTable.index,
    [
      "transaction_date",
      "type",
      "amount",
      "major_category",
      "sub_category",
      "source_status",
    ],
    SHEETS.TRANSACTIONS,
  );

  const categoryData = getCategoriesData();

  const essentialKeys = new Set();

  for (const item of categoryData.items || []) {
    if (item.type !== "支出" || item.essential !== true) {
      continue;
    }

    const key = [
      String(item.majorCategory || "").trim(),
      String(item.subCategory || "").trim(),
    ].join("|");

    essentialKeys.add(key);
  }

  const currentMonth = Utilities.formatDate(
    new Date(),
    "Asia/Tokyo",
    "yyyy-MM",
  );

  const monthlyTotals = new Map();

  for (const row of transactionTable.rows) {
    if (isIgnoredTransactionRow_(row, transactionTable.index)) {
      continue;
    }

    const type = getString(row, transactionTable.index, "type");

    if (type !== "支出") {
      continue;
    }

    const transactionDate = row[transactionTable.index["transaction_date"]];

    const yearMonth = normalizeYearMonth(transactionDate);

    // 今月は月途中なので平均対象から除外
    if (!yearMonth || yearMonth >= currentMonth) {
      continue;
    }

    const majorCategory = getString(
      row,
      transactionTable.index,
      "major_category",
    );

    const subCategory = getString(row, transactionTable.index, "sub_category");

    const key = [majorCategory, subCategory].join("|");

    if (!essentialKeys.has(key)) {
      continue;
    }

    const amount = Math.abs(getNumber(row, transactionTable.index, "amount"));

    monthlyTotals.set(
      yearMonth,
      Number(monthlyTotals.get(yearMonth) || 0) + amount,
    );
  }

  const months = Array.from(monthlyTotals.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 3);

  if (months.length === 0) {
    return {
      monthlyEssentialCost: 0,
      monthsUsed: 0,
      source: "no_completed_month",
    };
  }

  const total = months.reduce(
    (sum, [, amount]) => sum + Number(amount || 0),
    0,
  );

  return {
    monthlyEssentialCost: Math.round(total / months.length),

    monthsUsed: months.length,

    source: "essential_actual_average",

    months: months.map(([yearMonth, amount]) => ({
      yearMonth,
      amount,
    })),
  };
}

function calculateEmergencyFundStatus_() {
  const settings = getFinancialSettings_();

  const baseline = calculateBaselineEssentialLivingCost_();

  const monthlyEssentialCost = Number(baseline.monthlyEssentialCost || 0);

  const targetMonths = Number(settings.emergencyFundMonths || 6);

  const protectedCashData = calculateProtectedCash_();

  const liquidCash = Number(protectedCashData.protectedCash || 0);

  // 最低生活費をまだ計算できない場合
  if (monthlyEssentialCost <= 0) {
    return {
      monthlyEssentialCost: 0,

      targetMonths,

      targetAmount: 0,

      liquidCash,

      rawLiquidCash: Number(protectedCashData.liquidCash || 0),

      reservedGoalCash: Number(protectedCashData.reservedGoalCash || 0),

      upcomingCardPayments: Number(protectedCashData.upcomingCardPayments || 0),

      cashNeededUntilPayday: Number(
        protectedCashData.cashNeededUntilPayday || 0,
      ),

      nextPayday: protectedCashData.nextPayday || "",

      daysUntilPayday: Number(protectedCashData.daysUntilPayday || 0),

      coveredMonths: 0,

      stage: "unknown",

      cashRatio: 1.0,

      nisaRatio: 0.0,

      shortage: 0,

      monthsUsed: baseline.monthsUsed || 0,
    };
  }

  const targetAmount = Math.round(monthlyEssentialCost * targetMonths);

  const coveredMonths = liquidCash / monthlyEssentialCost;

  const shortage = Math.max(0, targetAmount - liquidCash);

  let stage = "";
  let cashRatio = 0;
  let nisaRatio = 0;

  const minCashMonths = Number(settings.minCashMonths || 1);

  const cashHeavyUntilMonths = Number(settings.cashHeavyUntilMonths || 3);

  const balancedUntilMonths = Number(settings.balancedUntilMonths || 6);

  if (coveredMonths < minCashMonths) {
    stage = "critical";

    cashRatio = 1.0;
    nisaRatio = 0.0;
  } else if (coveredMonths < cashHeavyUntilMonths) {
    stage = "cash_heavy";

    cashRatio = 0.8;
    nisaRatio = 0.2;
  } else if (coveredMonths < balancedUntilMonths) {
    stage = "balanced";

    cashRatio = 0.5;
    nisaRatio = 0.5;
  } else {
    stage = "secured";

    cashRatio = 0.0;
    nisaRatio = 1.0;
  }

  return {
    monthlyEssentialCost,

    targetMonths,

    targetAmount,

    liquidCash,

    rawLiquidCash: Number(protectedCashData.liquidCash || 0),

    reservedGoalCash: Number(protectedCashData.reservedGoalCash || 0),

    upcomingCardPayments: Number(protectedCashData.upcomingCardPayments || 0),

    cashNeededUntilPayday: Number(protectedCashData.cashNeededUntilPayday || 0),

    nextPayday: protectedCashData.nextPayday || "",

    daysUntilPayday: Number(protectedCashData.daysUntilPayday || 0),

    coveredMonths: Math.round(coveredMonths * 10) / 10,

    stage,

    cashRatio,

    nisaRatio,

    shortage,

    monthsUsed: baseline.monthsUsed || 0,
  };
}

function calculateProtectedCash_() {
  const liquidCash = getLiquidCashBalance_();

  const goalsData = getGoalsData();
  const goals = goalsData.items || [];

  const reservedGoalCash = goals.reduce(
    (sum, goal) => sum + Number(goal.reservedCash || 0),
    0,
  );

  const upcomingCardPayments = calculateUpcomingCardPayments_();

  const paydayCash = calculateCashNeededUntilNextPayday_();

  const protectedCash = Math.max(
    0,
    liquidCash -
      reservedGoalCash -
      upcomingCardPayments.totalAmount -
      paydayCash.amount,
  );

  return {
    liquidCash,
    reservedGoalCash,

    upcomingCardPayments: upcomingCardPayments.totalAmount,

    cashNeededUntilPayday: paydayCash.amount,

    nextPayday: paydayCash.nextPayday,

    daysUntilPayday: paydayCash.daysUntilPayday,

    protectedCash,
  };
}

function calculateUpcomingCardPayments_() {
  const balanceData = getAccountBalancesData();

  const items = balanceData.items || [];

  let totalAmount = 0;

  const details = [];

  for (const account of items) {
    if (account.isLiability !== true) {
      continue;
    }

    const paymentMethod = String(account.paymentMethod || "").trim();

    if (paymentMethod !== "クレジットカード" && paymentMethod !== "クレカ") {
      continue;
    }

    const balance = Math.max(0, Number(account.currentBalance || 0));

    if (balance <= 0) {
      continue;
    }

    totalAmount += balance;

    details.push({
      accountId: account.accountId,
      accountName: account.accountName,
      amount: balance,
    });
  }

  return {
    totalAmount,
    details,
  };
}

function calculateCashNeededUntilNextPayday_() {
  const settings = getFinancialSettings_();

  const baseline = calculateBaselineEssentialLivingCost_();

  const monthlyEssentialCost = Number(baseline.monthlyEssentialCost || 0);

  if (monthlyEssentialCost <= 0) {
    return {
      amount: 0,
      daysUntilPayday: 0,
      nextPayday: "",
      dailyEssentialCost: 0,
    };
  }

  const paydayDay = Math.max(1, Math.min(31, Number(settings.paydayDay || 25)));

  const now = new Date();

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let paydayYear = today.getFullYear();

  let paydayMonth = today.getMonth();

  let paydayDate = createSafeMonthlyDate_(paydayYear, paydayMonth, paydayDay);

  // 今月の給料日を過ぎていたら翌月
  if (today >= paydayDate) {
    paydayMonth++;

    paydayDate = createSafeMonthlyDate_(paydayYear, paydayMonth, paydayDay);
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  const daysUntilPayday = Math.max(
    0,
    Math.ceil((paydayDate.getTime() - today.getTime()) / millisecondsPerDay),
  );

  // 1か月 = 平均30.4375日
  const dailyEssentialCost = monthlyEssentialCost / 30.4375;

  const amount = Math.ceil(dailyEssentialCost * daysUntilPayday);

  return {
    amount,

    daysUntilPayday,

    nextPayday: Utilities.formatDate(paydayDate, "Asia/Tokyo", "yyyy-MM-dd"),

    dailyEssentialCost: Math.round(dailyEssentialCost),
  };
}

function createSafeMonthlyDate_(year, zeroBasedMonth, requestedDay) {
  const lastDay = new Date(year, zeroBasedMonth + 1, 0).getDate();

  return new Date(year, zeroBasedMonth, Math.min(requestedDay, lastDay));
}

/**
 * Homeで使う個人収入を集計する。
 *
 * - 事業Walletの収入は個人の資金配分へ直接混ぜない。
 * - 給与実績（収入/給与）が1件でもあれば給与予定は置換済みとみなす。
 * - 給与以外の生活Wallet等の実収入は、そのまま個人実収入として加算する。
 */
function calculateHomeIncomeBreakdown_(yearMonth, salaryPlanned) {
  const table = loadTransactions();

  if (table.rows.length === 0) {
    return {
      salaryActual: 0,
      salaryReceived: false,
      personalIncomeActual: 0,
      projectedPersonalIncome: Math.max(0, Number(salaryPlanned || 0)),
    };
  }

  assertRequiredColumns(
    table.index,
    ["transaction_date", "type", "amount", "sub_category", "wallet"],
    SHEETS.TRANSACTIONS,
  );

  let salaryActual = 0;
  let personalOtherIncome = 0;
  let salaryReceived = false;

  for (const row of table.rows) {
    if (isIgnoredTransactionRow_(row, table.index)) {
      continue;
    }

    if (normalizeYearMonth(row[table.index["transaction_date"]]) !== yearMonth) {
      continue;
    }

    if (getString(row, table.index, "type") !== "収入") {
      continue;
    }

    // 事業のお金はHomeの個人資金配分に直接混ぜない。
    if (getString(row, table.index, "wallet") === "事業") {
      continue;
    }

    const amount = Math.max(0, getNumber(row, table.index, "amount"));
    const subCategory = getString(row, table.index, "sub_category");

    if (subCategory === "給与") {
      salaryActual += amount;
      salaryReceived = true;
    } else {
      personalOtherIncome += amount;
    }
  }

  const personalIncomeActual = salaryActual + personalOtherIncome;
  const salaryComponent = salaryReceived
    ? salaryActual
    : Math.max(0, Number(salaryPlanned || 0));

  return {
    salaryActual,
    salaryReceived,
    personalIncomeActual,
    projectedPersonalIncome: salaryComponent + personalOtherIncome,
  };
}

// ============================================================
// Home API Data
// ============================================================

function getHomeData() {
  const currentYearMonth = Utilities.formatDate(
    new Date(),
    "Asia/Tokyo",
    "yyyy-MM",
  );

  const yearMonth = currentYearMonth;

  ensureSummaryFresh_(yearMonth);

  // Budget画面と同じ継承ルールをHomeでも使う。
  // 当月設定がない場合は直近の過去月設定を引き継ぐ。
  const effectiveBudget = getEffectiveBudgetsForMonth_(yearMonth);
  const budgets = effectiveBudget.budgets;

  const monthlyData = loadAnalyticsMonthlySummary_();

  const monthly = monthlyData.find((item) => item.yearMonth === yearMonth);

  const fixedExpense = Number(monthly?.fixedExpense || 0);

  const variableExpense = Number(monthly?.variableExpense || 0);

  const totalIncome = Number(monthly?.totalIncome || 0);

  const salaryPlanned = Number(budgets["給与予定"] || 0);
  const sideIncomePlanned = Number(budgets["副業予定"] || 0);

  // 個人のHome資金配分には事業Walletの収入を直接混ぜない。
  // 給与は、入金前だけ予定額を使い、給与実績が入ったら実績へ置換する。
  const incomeBreakdown = calculateHomeIncomeBreakdown_(yearMonth, salaryPlanned);
  const plannedIncome = incomeBreakdown.salaryReceived ? 0 : salaryPlanned;
  const projectedIncome = incomeBreakdown.projectedPersonalIncome;

  // 承認済みの定期支払いで、今月まだ発生していない分を固定費見込へ加える。
  // 固定費予算とは max 比較されるため、予算との二重計上はしない。
  const recurringForecast = getApprovedRecurringForecast_(yearMonth);
  const fixedExpenseForecastWithRecurring =
    fixedExpense + Number(recurringForecast.remainingTotal || 0);

  const expenses = {
    fixedExpense: fixedExpenseForecastWithRecurring,
    fixedExpenseActual: fixedExpense,
    recurringRemaining: Number(recurringForecast.remainingTotal || 0),
    variableExpense,
    totalExpense: fixedExpenseForecastWithRecurring + variableExpense,
  };

  // ============================================================
  // 今月使える生活費
  // ============================================================

  const availableMoney = calculateAvailableMoney_(
    budgets,
    expenses,
    projectedIncome,
  );

  const dailyBudget = calculateDailyBudget_(yearMonth, availableMoney);

  // ============================================================
  // 今月の資金配分
  //
  // 期限付きGoal
  //   ↓
  // 生活防衛資金
  //   ↓
  // 基本NISA
  //   ↓
  // 追加NISA
  // ============================================================

  const moneyAllocation = calculateMonthlyMoneyAllocation_(
    yearMonth,
    budgets,
    expenses,
    projectedIncome,
  );

  // ============================================================
  // 現金・安全資金
  // ============================================================

  const emergencyFund = moneyAllocation.emergencyFund || {};

  // 全流動現金
  const liquidCash = Number(emergencyFund.rawLiquidCash || 0);

  // Goal予約・カード支払・給料日までの生活費を
  // 差し引いた後の、防衛資金として使える現金
  const protectedCash = Number(emergencyFund.liquidCash || 0);

  // ============================================================
  // 資産
  // ============================================================

  const accountBalances = getAccountBalancesData();

  const totalAssets = Number(accountBalances.totalAssets || 0);

  const totalLiabilities = Number(accountBalances.totalLiabilities || 0);

  const netAssets = Number(accountBalances.netAssets || 0);

  // ============================================================
  // Money Health
  // ============================================================

  const moneyHealth = calculateMoneyHealth_(availableMoney, moneyAllocation);

  // ============================================================
  // その他
  // ============================================================

  const sideBusinessIncome = Number(monthly?.businessIncome || 0);
  const sideBusinessExpense = Number(monthly?.businessExpense || 0);
  const sideBusinessProfit = Number(monthly?.businessProfit || 0);
  const recentTransactions = getHomeRecentTransactions_();

  return {
    yearMonth,

    // ==========================================================
    // 今月の生活費
    // ==========================================================

    availableMoney,
    dailyBudget,

    // Homeの金額を説明できるよう、計算に使った入力値も返す。
    plannedIncome,
    salaryPlanned,
    salaryActual: incomeBreakdown.salaryActual,
    salaryReceived: incomeBreakdown.salaryReceived,
    sideIncomePlanned,
    actualIncome: incomeBreakdown.personalIncomeActual,
    projectedIncome,
    fixedExpenseActual: fixedExpense,
    recurringExpectedTotal: Number(recurringForecast.expectedTotal || 0),
    recurringRemaining: Number(recurringForecast.remainingTotal || 0),
    recurringForecastItems: recurringForecast.items || [],
    variableExpenseActual: variableExpense,
    fixedExpenseBudget: Number(budgets["固定費予算"] || 0),
    variableExpenseBudget: Number(budgets["変動費予算"] || 0),
    budgetInherited: effectiveBudget.inherited === true,
    budgetInheritedFrom: effectiveBudget.inheritedFrom || "",

    // ==========================================================
    // 今月のおすすめ資金配分
    // ==========================================================

    monthlySurplus: moneyAllocation.monthlySurplus,

    goalAllocation: moneyAllocation.goalAllocation,

    goalRequired: moneyAllocation.goalRequired,

    goalShortage: moneyAllocation.goalShortage,

    emergencyCashAllocation: moneyAllocation.emergencyCashAllocation,

    baseNisa: moneyAllocation.baseNisa,

    additionalNisa: moneyAllocation.additionalNisa,

    totalNisa: moneyAllocation.totalNisa,

    unallocatedCash: moneyAllocation.unallocatedCash,

    allocationStatus: moneyAllocation.status,

    allocationMessage: moneyAllocation.message,

    goalFundingDetails: moneyAllocation.goalDetails,

    // ==========================================================
    // 現金・生活防衛資金
    // ==========================================================

    liquidCash,
    protectedCash,

    emergencyFund: {
      monthlyEssentialCost: Number(emergencyFund.monthlyEssentialCost || 0),

      targetMonths: Number(emergencyFund.targetMonths || 0),

      targetAmount: Number(emergencyFund.targetAmount || 0),

      coveredMonths: Number(emergencyFund.coveredMonths || 0),

      shortage: Number(emergencyFund.shortage || 0),

      stage: String(emergencyFund.stage || ""),

      cashRatio: Number(emergencyFund.cashRatio || 0),

      nisaRatio: Number(emergencyFund.nisaRatio || 0),

      reservedGoalCash: Number(emergencyFund.reservedGoalCash || 0),

      upcomingCardPayments: Number(emergencyFund.upcomingCardPayments || 0),

      cashNeededUntilPayday: Number(emergencyFund.cashNeededUntilPayday || 0),

      nextPayday: String(emergencyFund.nextPayday || ""),

      daysUntilPayday: Number(emergencyFund.daysUntilPayday || 0),
    },

    // ==========================================================
    // 資産
    // ==========================================================

    totalAssets,
    totalLiabilities,
    netAssets,

    // ==========================================================
    // その他
    // ==========================================================

    sideBusinessIncome,
    sideBusinessExpense,
    sideBusinessProfit,
    moneyHealth,
    recentTransactions,

    generatedAt: new Date().toISOString(),
  };
}

