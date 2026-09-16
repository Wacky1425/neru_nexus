// ============================================================
// Neru Nexus - V2.1-4.4 Planner capacity / schedule semantics
// ============================================================
function verifyV2144InvestmentPlannerSemantics() {
  const data = getInvestmentPlannerData_({});
  const result = {
    ready:
      Number(data.discretionaryCapacity || 0) === Number(data.recommendedAmount || 0) &&
      Number(data.scheduledInvestmentTotal || 0) === Number(data.plannedTotal || 0),
    yearMonth: data.yearMonth,
    holdingCount: Array.isArray(data.holdings) ? data.holdings.length : 0,
    planCount: Array.isArray(data.items) ? data.items.length : 0,
    discretionaryCapacity: Number(data.discretionaryCapacity || 0),
    scheduledInvestmentTotal: Number(data.scheduledInvestmentTotal || 0),
    actualTotal: Number(data.actualTotal || 0),
    remainingPlanned: Number(data.remainingPlanned || 0),
    scheduledAboveDiscretionary: Number(data.scheduledAboveDiscretionary || 0),
    allocationStatus: String(data.allocationStatus || ""),
    note: "追加投資余力と登録済み投資予定は独立して管理します。余力0円でも予定は保存・表示できます。",
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
