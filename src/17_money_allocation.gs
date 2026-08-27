// ============================================================
// Neru Nexus - Money Allocation
//
// 流動資金、Goal必要現金、月次余剰資金、資金配分計算を担当。
// ============================================================

function getLiquidCashBalance_() {
  const balanceData = getAccountBalancesData();

  const items = balanceData.items || [];

  let total = 0;

  for (const account of items) {
    const isAsset = account.isAsset === true;

    const isLiability = account.isLiability === true;

    const assetType = String(account.assetType || "").trim();

    if (!isAsset || isLiability || assetType !== "cash") {
      continue;
    }

    total += Number(account.currentBalance || 0);
  }

  return total;
}

function calculateMonthlyFreeCash_(budgets, expenses, projectedIncome) {
  const fixedExpenseForecast = Math.max(
    Number(expenses.fixedExpense || 0),
    Number(budgets["固定費予算"] || 0),
  );

  const variableExpenseBudget = Number(budgets["変動費予算"] || 0);

  return Math.max(
    0,
    Number(projectedIncome || 0) - fixedExpenseForecast - variableExpenseBudget,
  );
}

function calculateGoalMonthlyAllocation_(goals, availableAmount, settings) {
  const now = new Date();

  const safetyMonths = Number(settings.goalSafetyMonths || 6);

  const sortedGoals = [...goals].sort((a, b) => {
    const dateA = new Date(a.targetDate);
    const dateB = new Date(b.targetDate);

    const timeA = isNaN(dateA.getTime())
      ? Number.MAX_SAFE_INTEGER
      : dateA.getTime();

    const timeB = isNaN(dateB.getTime())
      ? Number.MAX_SAFE_INTEGER
      : dateB.getTime();

    if (timeA !== timeB) {
      return timeA - timeB;
    }

    return Number(b.priority || 0) - Number(a.priority || 0);
  });

  let remainingCapacity = Math.max(0, Number(availableAmount || 0));

  let totalAllocated = 0;
  let totalRequired = 0;

  const details = [];

  for (const goal of sortedGoals) {
    // 先に全部定義する
    const targetAmount = Number(goal.targetAmount || 0);

    const reservedCash = Number(goal.reservedCash || 0);

    const remainingAmount = Math.max(0, targetAmount - reservedCash);

    if (remainingAmount <= 0) {
      continue;
    }

    const targetDate = new Date(goal.targetDate);

    if (isNaN(targetDate.getTime())) {
      continue;
    }

    const remainingMonths = Math.max(
      0,
      (targetDate.getFullYear() - now.getFullYear()) * 12 +
        (targetDate.getMonth() - now.getMonth()),
    );

    const savingMonths = Math.max(1, remainingMonths - safetyMonths);

    const requiredThisMonth =
      remainingMonths <= safetyMonths
        ? remainingAmount
        : Math.ceil(remainingAmount / savingMonths);

    totalRequired += requiredThisMonth;

    const allocatedThisMonth = Math.min(requiredThisMonth, remainingCapacity);

    remainingCapacity -= allocatedThisMonth;

    totalAllocated += allocatedThisMonth;

    const shortageThisMonth = Math.max(
      0,
      requiredThisMonth - allocatedThisMonth,
    );

    const onTrack = shortageThisMonth === 0;

    details.push({
      goalId: goal.goalId || "",

      goalName: goal.goalName || "",

      targetDate: goal.targetDate || "",

      targetAmount,

      reservedCash,

      remainingAmount,

      remainingMonths,

      requiredThisMonth,

      allocatedThisMonth,

      shortageThisMonth,

      onTrack,
    });
  }

  return {
    requiredAmount: totalRequired,

    allocatedAmount: totalAllocated,

    shortageAmount: Math.max(0, totalRequired - totalAllocated),

    remainingCapacity,

    details,
  };
}

function calculateMonthlyMoneyAllocation_(
  yearMonth,
  budgets,
  expenses,
  projectedIncome,
) {
  const settings = getFinancialSettings_();

  const goalsData = getGoalsData();

  const goals = goalsData.items || [];

  // NISAやGoalへ振り分ける前の
  // 今月の余剰見込み
  const monthlySurplus = calculateMonthlyFreeCash_(
    budgets,
    expenses,
    projectedIncome,
  );

  // --------------------------------
  // ① 期限付きGoal
  // --------------------------------

  const goalAllocation = calculateGoalMonthlyAllocation_(
    goals,
    monthlySurplus,
    settings,
  );

  let remaining = goalAllocation.remainingCapacity;

  // --------------------------------
  // ② 生活防衛資金の状態
  // --------------------------------

  const emergency = calculateEmergencyFundStatus_();

  const cashRatio = Number(emergency.cashRatio || 0);

  const nisaRatio = Number(emergency.nisaRatio || 0);

  // Goalを確保した残りを、
  // 防衛資金の状態に応じて分割
  let emergencyCashAllocation = Math.round(remaining * cashRatio);

  let investmentCapacity = Math.max(0, remaining - emergencyCashAllocation);

  // 生活防衛資金が既に満額なら
  // 現金追加は不要
  if (emergency.stage === "secured") {
    emergencyCashAllocation = 0;
    investmentCapacity = remaining;
  }

  // 防衛資金の不足額以上は
  // 現金に積まない
  if (emergencyCashAllocation > Number(emergency.shortage || 0)) {
    const excess = emergencyCashAllocation - Number(emergency.shortage || 0);

    emergencyCashAllocation = Number(emergency.shortage || 0);

    investmentCapacity += excess;
  }

  // --------------------------------
  // ③ 基本NISA
  // --------------------------------

  const configuredBaseNisa = Number(settings.baseNisaMonthly || 0);

  const budgetBaseNisa = Number(budgets["NISA積立"] || 0);

  // 予算設定があればそちらを優先
  const baseNisaTarget =
    budgetBaseNisa > 0 ? budgetBaseNisa : configuredBaseNisa;

  const baseNisa = Math.min(baseNisaTarget, investmentCapacity);

  investmentCapacity -= baseNisa;

  // --------------------------------
  // ④ 追加NISA
  // --------------------------------

  const additionalNisa = Math.max(0, investmentCapacity);

  const totalNisa = baseNisa + additionalNisa;

  // --------------------------------
  // 状態判定
  // --------------------------------

  let status = "balanced";
  let message = "今月の資金配分は順調です。";

  if (goalAllocation.shortageAmount > 0) {
    status = "goal_shortage";
    message = "目的資金の必要ペースに対して余剰資金が不足しています。";
  } else if (emergency.stage === "critical") {
    status = "cash_priority";
    message = "生活防衛資金を優先して確保します。";
  } else if (additionalNisa > 0) {
    status = "extra_investment";
    message = "必要資金を確保したうえで追加投資できる余裕があります。";
  }

  return {
    yearMonth,

    monthlySurplus,

    // Goal
    goalAllocation: goalAllocation.allocatedAmount,

    goalRequired: goalAllocation.requiredAmount,

    goalShortage: goalAllocation.shortageAmount,

    goalDetails: goalAllocation.details,

    // 防衛資金
    emergencyCashAllocation,

    emergencyFund: emergency,

    // NISA
    baseNisa,
    additionalNisa,
    totalNisa,

    // 最終的に未配分
    unallocatedCash: Math.max(
      0,
      monthlySurplus -
        goalAllocation.allocatedAmount -
        emergencyCashAllocation -
        totalNisa,
    ),

    status,
    message,
  };
}
