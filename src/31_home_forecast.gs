// ============================================================
// Neru Nexus - V1.4 Home Forecast / Recommendations
// ============================================================

function calculateHomeForecast_(
  yearMonth,
  projectedIncome,
  fixedExpenseActual,
  fixedExpenseBudget,
  recurringRemaining,
  variableExpenseActual,
  variableExpenseBudget,
  protectedCash,
  emergencyFund,
  moneyAllocation,
  recurringItems,
) {
  const parts = String(yearMonth || "").split("-");
  const year = Number(parts[0] || 0);
  const month = Number(parts[1] || 0);
  const now = new Date();
  const daysInMonth =
    year > 0 && month > 0 ? new Date(year, month, 0).getDate() : 30;

  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;
  const elapsedDays = isCurrentMonth
    ? Math.max(1, Math.min(daysInMonth, now.getDate()))
    : daysInMonth;
  const remainingDays = Math.max(0, daysInMonth - elapsedDays);

  const variableActual = Math.max(0, Number(variableExpenseActual || 0));
  const variableBudget = Math.max(0, Number(variableExpenseBudget || 0));
  const variableDailyPace = variableActual / elapsedDays;
  const variableProjected = Math.round(variableDailyPace * daysInMonth);

  const fixedActualAndRemaining =
    Math.max(0, Number(fixedExpenseActual || 0)) +
    Math.max(0, Number(recurringRemaining || 0));
  const fixedBudget = Math.max(0, Number(fixedExpenseBudget || 0));
  const fixedProjected = Math.max(fixedActualAndRemaining, fixedBudget);

  const projectedExpense =
    fixedProjected + Math.max(variableActual, variableProjected);
  const projectedBalance =
    Number(projectedIncome || 0) - projectedExpense;

  const remainingVariableBudget = Math.max(0, variableBudget - variableActual);

  const rawLiquidCash = Math.max(
    0,
    Number(emergencyFund?.rawLiquidCash || 0),
  );
  const reservedGoalCash = Math.max(
    0,
    Number(emergencyFund?.reservedGoalCash || 0),
  );
  const upcomingCardPayments = Math.max(
    0,
    Number(emergencyFund?.upcomingCardPayments || 0),
  );
  const cashNeededUntilPayday = Math.max(
    0,
    Number(emergencyFund?.cashNeededUntilPayday || 0),
  );

  // Card cash check must use cash *before* the card reserve is subtracted.
  // protectedCash already excludes card payments, so comparing it against
  // card payments again would double-count the liability.
  const cashBeforeCardReserve = Math.max(
    0,
    rawLiquidCash - reservedGoalCash - cashNeededUntilPayday,
  );
  const cardCashShortage = Math.max(
    0,
    upcomingCardPayments - cashBeforeCardReserve,
  );

  // The daily guide remains budget-first, but is capped by cash that remains
  // after goal/card reserves. This prevents a budget-only recommendation when
  // the actual liquid cash cannot support it.
  const flexibleCashCapacity = Math.max(
    0,
    rawLiquidCash - reservedGoalCash - upcomingCardPayments,
  );
  const safeRemainingSpend = Math.min(
    remainingVariableBudget,
    flexibleCashCapacity,
  );
  const safeDailySpend =
    remainingDays > 0
      ? Math.floor(safeRemainingSpend / remainingDays)
      : safeRemainingSpend;

  const variableOverrun =
    variableBudget > 0
      ? Math.max(0, variableProjected - variableBudget)
      : 0;
  const variableUsageRate =
    variableBudget > 0 ? variableActual / variableBudget : 0;
  const paceRatio =
    variableBudget > 0 ? variableProjected / variableBudget : 0;

  const monthlyEssentialCost = Math.max(
    0,
    Number(emergencyFund?.monthlyEssentialCost || 0),
  );
  const cashCoverage =
    monthlyEssentialCost > 0
      ? Number(protectedCash || 0) / monthlyEssentialCost
      : 0;

  const alerts = [];
  if (variableOverrun > 0 && elapsedDays >= 5) {
    alerts.push({
      type: "overspend",
      severity: paceRatio >= 1.2 ? "high" : "medium",
      title: "変動費が予算超過ペース",
      message:
        `このペースでは月末に約${variableProjected.toLocaleString()}円。` +
        `予算を約${variableOverrun.toLocaleString()}円超える見込みです。`,
    });
  }
  if (cardCashShortage > 0) {
    alerts.push({
      type: "card_cash",
      severity: "high",
      title: "カード支払い用の現金が不足見込み",
      message:
        `カード支払見込${upcomingCardPayments.toLocaleString()}円に対して、` +
        `目的資金・給料日までの生活費を確保すると` +
        `約${cardCashShortage.toLocaleString()}円不足する見込みです。`,
    });
  }
  const increasedRecurring = (Array.isArray(recurringItems) ? recurringItems : [])
    .filter((item) => item && item.increased === true)
    .sort((a, b) => Number(b.increaseAmount || 0) - Number(a.increaseAmount || 0));

  for (const item of increasedRecurring.slice(0, 3)) {
    alerts.push({
      type: "recurring_increase",
      severity: Number(item.increaseRate || 0) >= 0.3 ? "high" : "medium",
      title: "定期支払いが増えています",
      message:
        `${String(item.merchant || "定期支払い")}が通常約` +
        `${Number(item.amount || 0).toLocaleString()}円から` +
        `${Number(item.actualAmount || 0).toLocaleString()}円になっています。`,
    });
  }

  if (monthlyEssentialCost > 0 && cashCoverage < 1) {
    alerts.push({
      type: "cash_buffer",
      severity: "high",
      title: "生活防衛資金が1か月未満",
      message: "追加投資より現金確保を優先する状態です。",
    });
  }

  const recommendations = [];
  const additionalNisa = Math.max(
    0,
    Number(moneyAllocation?.additionalNisa || 0),
  );
  const baseNisa = Math.max(0, Number(moneyAllocation?.baseNisa || 0));

  if (additionalNisa > 0 && variableOverrun === 0 && cashCoverage >= 1) {
    recommendations.push({
      type: "nisa",
      priority: "medium",
      title: "追加NISAの余地あり",
      amount: additionalNisa,
      message:
        `必要資金を確保したうえで、追加で` +
        `${additionalNisa.toLocaleString()}円を投資に回せる見込みです。`,
    });
  } else if (baseNisa > 0) {
    recommendations.push({
      type: "nisa_base",
      priority: "low",
      title: "基本NISAを維持",
      amount: baseNisa,
      message: `今月は基本積立${baseNisa.toLocaleString()}円を優先します。`,
    });
  }

  if (variableOverrun > 0) {
    recommendations.unshift({
      type: "spend_control",
      priority: "high",
      title: "残りの変動費を抑える",
      amount: safeDailySpend,
      message:
        remainingDays > 0
          ? `残り${remainingDays}日は1日約${safeDailySpend.toLocaleString()}円を目安にすると予算内です。`
          : "今月の変動費予算を超えています。",
    });
  }

  return {
    daysInMonth,
    elapsedDays,
    remainingDays,
    variableDailyPace: Math.round(variableDailyPace),
    variableProjected,
    variableBudget,
    variableUsageRate,
    paceRatio,
    variableOverrun,
    fixedProjected,
    fixedBudget,
    fixedActualAndRemaining,
    projectedExpense,
    projectedBalance,
    remainingVariableBudget,
    flexibleCashCapacity,
    safeRemainingSpend,
    safeDailySpend,
    upcomingCardPayments,
    cardCashShortage,
    cashCoverageMonths: Math.round(cashCoverage * 10) / 10,
    alerts,
    recommendations,
  };
}

function testHomeForecastHelpers_() {
  const baseEmergencyFund = {
    rawLiquidCash: 250000,
    reservedGoalCash: 20000,
    upcomingCardPayments: 50000,
    cashNeededUntilPayday: 60000,
    monthlyEssentialCost: 100000,
  };

  const result = calculateHomeForecast_(
    "2026-08",
    250000,
    60000,
    90000,
    10000,
    80000,
    100000,
    120000,
    baseEmergencyFund,
    {
      baseNisa: 30000,
      additionalNisa: 10000,
    },
    [],
  );

  if (result.fixedProjected !== 90000) {
    throw new Error(
      `固定費予算の下限が反映されていません: ${result.fixedProjected}`,
    );
  }

  if (result.cardCashShortage !== 0) {
    throw new Error(
      `カード現金判定が二重控除されています: ${result.cardCashShortage}`,
    );
  }

  if (result.safeRemainingSpend > result.remainingVariableBudget) {
    throw new Error("安全支出額が変動費予算残額を超えています");
  }

  const shortage = calculateHomeForecast_(
    "2026-08",
    250000,
    60000,
    90000,
    10000,
    80000,
    100000,
    20000,
    {
      rawLiquidCash: 90000,
      reservedGoalCash: 20000,
      upcomingCardPayments: 50000,
      cashNeededUntilPayday: 30000,
      monthlyEssentialCost: 100000,
    },
    {
      baseNisa: 30000,
      additionalNisa: 0,
    },
    [],
  );

  if (shortage.cardCashShortage !== 10000) {
    throw new Error(
      `カード現金不足額が不正です: ${shortage.cardCashShortage}`,
    );
  }

  if (
    !shortage.alerts.some((alert) => alert.type === "card_cash")
  ) {
    throw new Error("カード現金不足アラートが生成されていません");
  }

  if (!Array.isArray(result.alerts) || !Array.isArray(result.recommendations)) {
    throw new Error("Home insight配列が不正です");
  }

  return {
    assertions: "PASS",
    result,
    shortage,
  };
}
