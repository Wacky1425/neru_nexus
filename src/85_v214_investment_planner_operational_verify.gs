// ============================================================
// Neru Nexus - V2.1-4 Investment Planner operational verification
// ============================================================

function diagnoseV214InvestmentPlannerCurrent() {
  const nowYearMonth = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM");
  const data = getInvestmentPlannerData_({ yearMonth: nowYearMonth });
  const result = {
    yearMonth: data.yearMonth,
    holdingCount: Array.isArray(data.holdings) ? data.holdings.length : 0,
    holdings: (data.holdings || []).map((item) => ({
      holdingId: item.holdingId,
      name: item.name,
      accountName: item.accountName,
      securityType: item.securityType,
      symbol: item.symbol,
    })),
    planCount: Array.isArray(data.items) ? data.items.length : 0,
    recommendedAmount: Number(data.recommendedAmount || 0),
    plannedTotal: Number(data.plannedTotal || 0),
    actualTotal: Number(data.actualTotal || 0),
    remainingPlanned: Number(data.remainingPlanned || 0),
    remainingCapacity: Number(data.remainingCapacity || 0),
    actualEventCount: Number(data.actualEventCount || 0),
    baseNisa: Number(data.baseNisa || 0),
    additionalNisa: Number(data.additionalNisa || 0),
    allocationStatus: String(data.allocationStatus || ""),
    allocationMessage: String(data.allocationMessage || ""),
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyV214InvestmentPlannerOperational() {
  const structural = verifyV214InvestmentPlanner();
  const helpers = testInvestmentPlannerHelpers_();
  const current = diagnoseV214InvestmentPlannerCurrent();

  const issues = [];
  if (!structural.ready) issues.push("sheet_structure");
  if (!helpers || helpers.assertions !== "PASS") issues.push("helper_regression");
  if (current.holdingCount <= 0) issues.push("no_holdings");

  // planCount=0 is not a data error. It means the user has not entered a plan yet.
  const needsFirstPlan = current.planCount === 0;
  const result = {
    ready: issues.length === 0,
    needsFirstPlan,
    issues,
    structural,
    current,
    checkedAt: new Date().toISOString(),
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
