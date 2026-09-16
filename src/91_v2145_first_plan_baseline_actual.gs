// ============================================================
// Neru Nexus - V2.1-4.5 First real plan + baseline actual
// 2026-09-16 initial snapshot already contains the Sep S&P500 purchase.
// Do not create a Gmail event for it; expose it to Planner as baseline actual.
// ============================================================

const V2145_BASELINE_PLAN_ = Object.freeze({
  yearMonth: "2026-09",
  holdingSymbol: "03311187",
  plannedAmount: 30000,
  actualAmount: 30000,
  nisaType: "nisa",
  note: "2026-09-16初期スナップショット時点で購入済み。Gmailイベントには再計上しない。",
});

function getV2145BaselinePlannerActuals_(yearMonth, holdingMap) {
  const result = { byHolding: {}, totalActual: 0, eventCount: 0, baselineActualCount: 0 };
  if (String(yearMonth || "") !== V2145_BASELINE_PLAN_.yearMonth) return result;

  for (const holding of holdingMap.values()) {
    if (String(holding.symbol || "") !== V2145_BASELINE_PLAN_.holdingSymbol) continue;
    const id = String(holding.holdingId || "");
    if (!id) continue;
    result.byHolding[id] = V2145_BASELINE_PLAN_.actualAmount;
    result.totalActual = V2145_BASELINE_PLAN_.actualAmount;
    result.baselineActualCount = 1;
    break;
  }
  return result;
}

function mergeV2145PlannerActuals_(eventActuals, baselineActuals) {
  const byHolding = {};
  const sources = [eventActuals || {}, baselineActuals || {}];
  for (const source of sources) {
    const map = source.byHolding || {};
    Object.keys(map).forEach((id) => {
      byHolding[id] = Math.max(0, Number(byHolding[id] || 0)) + Math.max(0, Number(map[id] || 0));
    });
  }
  return {
    byHolding,
    totalActual: Math.round(Math.max(0, Number(eventActuals?.totalActual || 0)) + Math.max(0, Number(baselineActuals?.totalActual || 0))),
    eventCount: Math.max(0, Number(eventActuals?.eventCount || 0)),
    baselineActualCount: Math.max(0, Number(baselineActuals?.baselineActualCount || 0)),
  };
}

function applyV2145FirstRealInvestmentPlan() {
  const holdings = getActiveInvestmentHoldingMap_();
  let holding = null;
  for (const item of holdings.values()) {
    if (String(item.symbol || "") === V2145_BASELINE_PLAN_.holdingSymbol) {
      holding = item;
      break;
    }
  }
  if (!holding) throw new Error("S&P500(03311187)の保有銘柄が見つかりません");

  // Manual migration must persist the row itself. Do not depend on the
  // app-facing save wrapper/HTTP response shape for this one-time baseline.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const table = getInvestmentPlanTable_();
    const now = new Date();
    let targetRowNumber = -1;
    let existing = null;

    for (let i = 0; i < table.rows.length; i++) {
      const item = investmentPlanRowToObject_(table.rows[i], table.index);
      if (
        item.yearMonth === V2145_BASELINE_PLAN_.yearMonth &&
        String(item.holdingId || "") === String(holding.holdingId || "")
      ) {
        targetRowNumber = i + 2;
        existing = item;
        break;
      }
    }

    const object = {
      plan_id: existing && existing.planId ? existing.planId : `iplan_${Utilities.getUuid()}`,
      year_month: V2145_BASELINE_PLAN_.yearMonth,
      holding_id: holding.holdingId,
      planned_amount: V2145_BASELINE_PLAN_.plannedAmount,
      nisa_type: V2145_BASELINE_PLAN_.nisaType,
      note: V2145_BASELINE_PLAN_.note,
      is_active: true,
      created_at: existing && existing.createdAt ? new Date(existing.createdAt) : now,
      updated_at: now,
    };
    const row = table.headers.map((header) =>
      object[header] !== undefined ? object[header] : "",
    );

    if (targetRowNumber > 0) {
      table.sheet.getRange(targetRowNumber, 1, 1, table.headers.length).setValues([row]);
    } else {
      table.sheet.appendRow(row);
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  const result = verifyV2145FirstRealInvestmentPlan();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyV2145FirstRealInvestmentPlan() {
  const data = getInvestmentPlannerData_({ yearMonth: V2145_BASELINE_PLAN_.yearMonth });
  const target = (data.items || []).find((item) => String(item.holdingId || "") === String((data.holdings || []).find((h) => String(h.symbol || "") === V2145_BASELINE_PLAN_.holdingSymbol)?.holdingId || ""));
  const result = {
    ready: !!target && Number(target.plannedAmount || 0) === 30000 && Number(target.actualAmount || 0) === 30000 && Number(target.remainingAmount || 0) === 0 && Number(data.actualTotal || 0) >= 30000,
    yearMonth: data.yearMonth,
    planCount: (data.items || []).length,
    scheduledInvestmentTotal: Number(data.scheduledInvestmentTotal || 0),
    actualTotal: Number(data.actualTotal || 0),
    remainingPlanned: Number(data.remainingPlanned || 0),
    actualEventCount: Number(data.actualEventCount || 0),
    baselineActualCount: Number(data.baselineActualCount || 0),
    target: target ? {
      holdingName: target.holdingName,
      plannedAmount: target.plannedAmount,
      actualAmount: target.actualAmount,
      remainingAmount: target.remainingAmount,
      progressRate: target.progressRate,
      nisaType: target.nisaType,
    } : null,
    rule: "9/16以前・当日の購入済み分は初期スナップショット実績としてPlannerにのみ反映し、Gmailイベントへ再計上しない",
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
