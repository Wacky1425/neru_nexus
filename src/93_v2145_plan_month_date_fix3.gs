// ============================================================
// Neru Nexus - V2.1-4.5 Fix3
// Sheets date coercion repair for T_InvestmentPlans.year_month.
// ============================================================

function repairV2145PlanMonthDateFix3() {
  const sheet = ensureInvestmentPlanSheet_();
  const table = getInvestmentPlanTable_();
  const targetYm = V2145_BASELINE_PLAN_.yearMonth;
  const targetHoldingId = String(V2145_BASELINE_PLAN_.holdingId || "") ||
    (() => {
      const holdings = getActiveInvestmentHoldingMap_();
      for (const item of holdings.values()) {
        if (String(item.symbol || "") === V2145_BASELINE_PLAN_.holdingSymbol) return String(item.holdingId || "");
      }
      return "";
    })();
  if (!targetHoldingId) throw new Error("S&P500(03311187)の保有銘柄が見つかりません");

  const matchingRows = [];
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    let ym = "";
    try { ym = normalizeInvestmentPlanYearMonth_(row[table.index.year_month]); } catch (_) {}
    const hid = getString(row, table.index, "holding_id");
    if (ym === targetYm && hid === targetHoldingId) matchingRows.push(i + 2);
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Keep the oldest matching row and remove duplicate test rows created by Fix1/Fix2.
    for (let i = matchingRows.length - 1; i >= 1; i--) sheet.deleteRow(matchingRows[i]);
    SpreadsheetApp.flush();

    const refreshed = getInvestmentPlanTable_();
    let keptRow = -1;
    for (let i = 0; i < refreshed.rows.length; i++) {
      const row = refreshed.rows[i];
      let ym = "";
      try { ym = normalizeInvestmentPlanYearMonth_(row[refreshed.index.year_month]); } catch (_) {}
      if (ym === targetYm && getString(row, refreshed.index, "holding_id") === targetHoldingId) {
        keptRow = i + 2;
        break;
      }
    }
    if (keptRow < 0) throw new Error("修復対象の投資プラン行が見つかりません");

    // Store yyyy-MM as literal text to prevent future spreadsheet date coercion.
    const ymCol = refreshed.index.year_month + 1;
    const cell = refreshed.sheet.getRange(keptRow, ymCol);
    cell.setNumberFormat("@");
    cell.setValue(targetYm);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  const result = verifyV2145PlanMonthDateFix3();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyV2145PlanMonthDateFix3() {
  const plans = loadInvestmentPlans_(V2145_BASELINE_PLAN_.yearMonth, false);
  const planner = getInvestmentPlannerData_({ yearMonth: V2145_BASELINE_PLAN_.yearMonth });
  const targetPlans = plans.filter((p) =>
    String(p.holdingId || "") === "c196c73e-dcba-4d91-97ad-db7584bf8c8e" &&
    Number(p.plannedAmount || 0) === 30000
  );
  return {
    ready: targetPlans.length === 1 &&
      Number(planner.scheduledInvestmentTotal || 0) === 30000 &&
      Number(planner.actualTotal || 0) === 30000 &&
      Number(planner.remainingPlanned || 0) === 0,
    yearMonth: V2145_BASELINE_PLAN_.yearMonth,
    loadedPlanCount: plans.length,
    targetPlanCount: targetPlans.length,
    scheduledInvestmentTotal: Number(planner.scheduledInvestmentTotal || 0),
    actualTotal: Number(planner.actualTotal || 0),
    remainingPlanned: Number(planner.remainingPlanned || 0),
    baselineActualCount: Number(planner.baselineActualCount || 0),
    rule: "year_monthはyyyy-MM文字列として保存し、SheetsがDateへ自動変換しても読込時にyyyy-MMへ正規化する"
  };
}
