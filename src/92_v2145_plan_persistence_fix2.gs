// ============================================================
// Neru Nexus - V2.1-4.5 Fix2
// Deterministic T_InvestmentPlans persistence + raw verification.
// ============================================================

function repairV2145PlanPersistenceFix2() {
  const holdings = getActiveInvestmentHoldingMap_();
  let holding = null;
  for (const item of holdings.values()) {
    if (String(item.symbol || "") === V2145_BASELINE_PLAN_.holdingSymbol) {
      holding = item;
      break;
    }
  }
  if (!holding) throw new Error("S&P500(03311187)の保有銘柄が見つかりません");

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = ensureInvestmentPlanSheet_();
    const lastColumn = Math.max(sheet.getLastColumn(), INVESTMENT_PLAN_HEADERS_.length);
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
      .map((v) => String(v || "").trim());
    const index = createHeaderIndex(headers);
    assertRequiredColumns(index, INVESTMENT_PLAN_HEADERS_, SHEETS.INVESTMENT_PLANS);

    const lastRow = sheet.getLastRow();
    const rows = lastRow >= 2
      ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
      : [];

    let targetRow = -1;
    let existingPlanId = "";
    let existingCreatedAt = null;
    for (let i = 0; i < rows.length; i++) {
      const item = investmentPlanRowToObject_(rows[i], index);
      if (
        item.yearMonth === V2145_BASELINE_PLAN_.yearMonth &&
        String(item.holdingId || "") === String(holding.holdingId || "")
      ) {
        targetRow = i + 2;
        existingPlanId = item.planId;
        existingCreatedAt = item.createdAt ? new Date(item.createdAt) : null;
        break;
      }
    }

    const now = new Date();
    const object = {
      plan_id: existingPlanId || `iplan_${Utilities.getUuid()}`,
      year_month: V2145_BASELINE_PLAN_.yearMonth,
      holding_id: String(holding.holdingId || ""),
      planned_amount: V2145_BASELINE_PLAN_.plannedAmount,
      nisa_type: V2145_BASELINE_PLAN_.nisaType,
      note: V2145_BASELINE_PLAN_.note,
      is_active: true,
      created_at: existingCreatedAt || now,
      updated_at: now,
    };
    const row = headers.map((header) =>
      Object.prototype.hasOwnProperty.call(object, header) ? object[header] : ""
    );

    if (targetRow < 0) targetRow = Math.max(2, sheet.getLastRow() + 1);
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([row]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  const result = verifyV2145PlanPersistenceFix2();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyV2145PlanPersistenceFix2() {
  const sheet = ensureInvestmentPlanSheet_();
  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(sheet.getLastColumn(), INVESTMENT_PLAN_HEADERS_.length);
  const values = sheet.getRange(1, 1, Math.max(1, lastRow), lastColumn).getValues();
  const headers = values[0].map((v) => String(v || "").trim());
  const index = createHeaderIndex(headers);
  const rawRows = values.slice(1).map((row, i) => ({
    rowNumber: i + 2,
    planId: getString(row, index, "plan_id"),
    yearMonth: getString(row, index, "year_month"),
    holdingId: getString(row, index, "holding_id"),
    plannedAmount: getNumber(row, index, "planned_amount"),
    nisaType: getString(row, index, "nisa_type"),
    isActiveRaw: row[index.is_active],
  })).filter((r) => r.planId || r.yearMonth || r.holdingId || r.plannedAmount);

  const plans = loadInvestmentPlans_(V2145_BASELINE_PLAN_.yearMonth, false);
  const planner = getInvestmentPlannerData_({ yearMonth: V2145_BASELINE_PLAN_.yearMonth });
  const targetPlan = plans.find((p) => Number(p.plannedAmount || 0) === 30000) || null;
  const targetItem = (planner.items || []).find((p) => Number(p.plannedAmount || 0) === 30000) || null;

  return {
    ready: !!targetPlan && !!targetItem && Number(planner.scheduledInvestmentTotal || 0) === 30000 && Number(planner.actualTotal || 0) === 30000,
    sheetName: sheet.getName(),
    sheetLastRow: lastRow,
    sheetLastColumn: lastColumn,
    headers,
    rawRows,
    loadedPlanCount: plans.length,
    loadedPlans: plans,
    planner: {
      planCount: (planner.items || []).length,
      scheduledInvestmentTotal: Number(planner.scheduledInvestmentTotal || 0),
      actualTotal: Number(planner.actualTotal || 0),
      remainingPlanned: Number(planner.remainingPlanned || 0),
      baselineActualCount: Number(planner.baselineActualCount || 0),
      target: targetItem ? {
        holdingName: targetItem.holdingName,
        plannedAmount: targetItem.plannedAmount,
        actualAmount: targetItem.actualAmount,
        remainingAmount: targetItem.remainingAmount,
        progressRate: targetItem.progressRate,
        nisaType: targetItem.nisaType,
      } : null,
    },
  };
}
