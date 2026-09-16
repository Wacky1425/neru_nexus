// ============================================================
// Neru Nexus - V2.1-4 Investment Planner
// ============================================================

const INVESTMENT_PLAN_HEADERS_ = Object.freeze([
  "plan_id",
  "year_month",
  "holding_id",
  "planned_amount",
  "nisa_type",
  "note",
  "is_active",
  "created_at",
  "updated_at",
]);

function ensureInvestmentPlanSheet_() {
  let sheet = SS.getSheetByName(SHEETS.INVESTMENT_PLANS);
  if (!sheet) {
    sheet = SS.insertSheet(SHEETS.INVESTMENT_PLANS);
    sheet
      .getRange(1, 1, 1, INVESTMENT_PLAN_HEADERS_.length)
      .setValues([INVESTMENT_PLAN_HEADERS_]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const existing =
    sheet.getLastRow() > 0
      ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
      : [];
  const headers = existing.map((value) => String(value || "").trim());

  let changed = false;
  for (const header of INVESTMENT_PLAN_HEADERS_) {
    if (!headers.includes(header)) {
      headers.push(header);
      changed = true;
    }
  }

  if (changed || sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function getInvestmentPlanTable_() {
  const sheet = ensureInvestmentPlanSheet_();
  const values = sheet.getDataRange().getValues();
  const headers =
    values.length > 0
      ? values[0].map((value) => String(value || "").trim())
      : INVESTMENT_PLAN_HEADERS_.slice();
  return {
    sheet,
    headers,
    index: createHeaderIndex(headers),
    rows: values.slice(1),
  };
}

function normalizeInvestmentPlanYearMonth_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Asia/Tokyo", "yyyy-MM");
  }
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}$/.test(text)) return text;
  // Sheets may auto-convert a yyyy-MM value into the first day of that month.
  // Accept date-like values here so plan loading remains stable regardless of cell formatting.
  if (text) {
    const parsed = new Date(text);
    if (!isNaN(parsed.getTime())) {
      return Utilities.formatDate(parsed, "Asia/Tokyo", "yyyy-MM");
    }
  }
  throw new Error("yearMonthはyyyy-MM形式で指定してください");
}

function normalizeInvestmentPlanNisaType_(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || text === "none" || text === "taxable") return "taxable";
  if (text === "nisa") return "nisa";
  throw new Error(`未対応のNISA区分です: ${value}`);
}

function investmentPlanIsActive_(value) {
  if (value === true) return true;
  const text = String(value == null ? "" : value).trim().toLowerCase();
  return !["false", "0", "no", "off"].includes(text);
}

function investmentPlanRowToObject_(row, index) {
  const created = row[index.created_at];
  const updated = row[index.updated_at];
  return {
    planId: getString(row, index, "plan_id"),
    yearMonth: normalizeInvestmentPlanYearMonth_(row[index.year_month]),
    holdingId: getString(row, index, "holding_id"),
    plannedAmount: Math.max(0, Math.round(getNumber(row, index, "planned_amount"))),
    nisaType: getString(row, index, "nisa_type") || "taxable",
    note: getString(row, index, "note"),
    isActive: investmentPlanIsActive_(row[index.is_active]),
    createdAt:
      created instanceof Date ? created.toISOString() : String(created || ""),
    updatedAt:
      updated instanceof Date ? updated.toISOString() : String(updated || ""),
  };
}

function loadInvestmentPlans_(yearMonth, includeInactive) {
  const table = getInvestmentPlanTable_();
  assertRequiredColumns(
    table.index,
    INVESTMENT_PLAN_HEADERS_,
    SHEETS.INVESTMENT_PLANS,
  );
  const target = normalizeInvestmentPlanYearMonth_(yearMonth);

  return table.rows
    .map((row) => investmentPlanRowToObject_(row, table.index))
    .filter((item) => item.planId && item.yearMonth === target)
    .filter((item) => includeInactive === true || item.isActive);
}

function getActiveInvestmentHoldingMap_() {
  const holdings = getInvestmentHoldingsData_().items || [];
  const map = new Map();
  for (const holding of holdings) {
    if (holding && holding.holdingId) {
      map.set(String(holding.holdingId), holding);
    }
  }
  return map;
}

function calculateAppliedInvestmentActuals_(
  yearMonth,
  events,
  holdingMap,
) {
  const target = normalizeInvestmentPlanYearMonth_(yearMonth);
  const seen = new Set();
  const byHolding = {};
  let totalActual = 0;

  for (const event of Array.isArray(events) ? events : []) {
    if (!event || String(event.status || "") !== "applied") continue;
    if (String(event.side || "").toLowerCase() !== "buy") continue;

    const eventId = String(event.eventId || "").trim();
    if (!eventId || seen.has(eventId)) continue;

    const tradeDate = String(event.tradeDate || "").trim();
    if (!tradeDate.startsWith(`${target}-`)) continue;

    const holdingId = String(
      event.appliedHoldingId || event.holdingId || "",
    ).trim();
    if (!holdingId) continue;

    seen.add(eventId);

    let amount = Math.max(0, Number(event.amount || 0));
    if (!(amount > 0)) {
      const quantity = Math.max(0, Number(event.quantity || 0));
      const price = Math.max(0, Number(event.price || 0));
      const holding = holdingMap && holdingMap.get
        ? holdingMap.get(holdingId)
        : null;
      const priceUnit = Math.max(1, Number(holding?.priceUnit || 1));
      if (quantity > 0 && price > 0) {
        amount = quantity / priceUnit * price;
      }
    }

    const roundedAmount = Math.max(0, Math.round(amount));
    if (!(roundedAmount > 0)) continue;

    byHolding[holdingId] =
      Math.max(0, Number(byHolding[holdingId] || 0)) + roundedAmount;
    totalActual += roundedAmount;
  }

  return {
    byHolding,
    totalActual: Math.round(totalActual),
    eventCount: seen.size,
  };
}

function buildInvestmentPlannerSummary_(
  recommendedAmount,
  plans,
  actuals,
) {
  const safeRecommended = Math.max(0, Math.round(Number(recommendedAmount || 0)));
  const activePlans = (Array.isArray(plans) ? plans : [])
    .filter((item) => item && item.isActive !== false);

  const plannedTotal = activePlans.reduce(
    (sum, item) => sum + Math.max(0, Number(item.plannedAmount || 0)),
    0,
  );
  const actualTotal = Math.max(0, Number(actuals?.totalActual || 0));

  return {
    // recommendedAmount is discretionary capacity calculated from household cash flow.
    // A user-saved investment plan is a commitment/schedule and must not disappear
    // merely because discretionary capacity is currently zero.
    recommendedAmount: safeRecommended,
    discretionaryCapacity: safeRecommended,
    scheduledInvestmentTotal: Math.round(plannedTotal),
    plannedTotal: Math.round(plannedTotal),
    actualTotal: Math.round(actualTotal),
    remainingPlanned: Math.max(0, Math.round(plannedTotal - actualTotal)),
    remainingCapacity: Math.max(
      0,
      Math.round(safeRecommended - actualTotal),
    ),
    plannedOverRecommended: Math.max(
      0,
      Math.round(plannedTotal - safeRecommended),
    ),
    // Informational only: a scheduled plan may exceed discretionary capacity.
    // This is not treated as an integrity error.
    scheduledAboveDiscretionary: Math.max(
      0,
      Math.round(plannedTotal - safeRecommended),
    ),
  };
}

function getAllSbiInvestmentEventsForPlanner_() {
  const table = getSbiInvestmentEventTable_();
  return table.rows
    .map((row) => ({
      eventId: getString(row, table.index, "event_id"),
      tradeDate: formatApiDate_(row[table.index["trade_date"]]),
      side: getString(row, table.index, "side"),
      quantity: getNumber(row, table.index, "quantity"),
      price: getNumber(row, table.index, "price"),
      amount: getNumber(row, table.index, "amount"),
      holdingId: getString(row, table.index, "holding_id"),
      status: getString(row, table.index, "status"),
      appliedHoldingId:
        table.index["applied_holding_id"] === undefined
          ? ""
          : getString(row, table.index, "applied_holding_id"),
    }))
    .filter((item) => item.eventId);
}

function getInvestmentPlannerData_(options = {}) {
  const nowYearMonth = Utilities.formatDate(
    new Date(),
    "Asia/Tokyo",
    "yyyy-MM",
  );
  const yearMonth = normalizeInvestmentPlanYearMonth_(
    options.yearMonth || nowYearMonth,
  );

  const holdingMap = getActiveInvestmentHoldingMap_();
  const plans = loadInvestmentPlans_(yearMonth, false);
  const events = getAllSbiInvestmentEventsForPlanner_();
  const eventActuals = calculateAppliedInvestmentActuals_(
    yearMonth,
    events,
    holdingMap,
  );
  const baselineActuals = typeof getV2145BaselinePlannerActuals_ === "function"
    ? getV2145BaselinePlannerActuals_(yearMonth, holdingMap)
    : { byHolding: {}, totalActual: 0, eventCount: 0, baselineActualCount: 0 };
  const actuals = typeof mergeV2145PlannerActuals_ === "function"
    ? mergeV2145PlannerActuals_(eventActuals, baselineActuals)
    : eventActuals;

  let recommendedAmount = 0;
  let baseNisa = 0;
  let additionalNisa = 0;
  let allocationStatus = "";
  let allocationMessage = "";

  if (yearMonth === nowYearMonth) {
    const home = getHomeData();
    baseNisa = Math.max(0, Math.round(Number(home.baseNisa || 0)));
    additionalNisa = Math.max(
      0,
      Math.round(Number(home.additionalNisa || 0)),
    );
    recommendedAmount = Math.max(
      0,
      Math.round(Number(home.totalNisa || 0)),
    );
    allocationStatus = String(home.allocationStatus || "");
    allocationMessage = String(home.allocationMessage || "");
  }

  const summary = buildInvestmentPlannerSummary_(
    recommendedAmount,
    plans,
    actuals,
  );

  const items = plans.map((plan) => {
    const holding = holdingMap.get(plan.holdingId) || null;
    const actualAmount = Math.max(
      0,
      Math.round(Number(actuals.byHolding[plan.holdingId] || 0)),
    );
    return {
      ...plan,
      holdingName: holding ? String(holding.name || "") : "",
      accountName: holding ? String(holding.accountName || "") : "",
      actualAmount,
      remainingAmount: Math.max(0, plan.plannedAmount - actualAmount),
      progressRate:
        plan.plannedAmount > 0
          ? Math.min(1, actualAmount / plan.plannedAmount)
          : 0,
    };
  });

  return {
    yearMonth,
    items,
    holdings: Array.from(holdingMap.values()).map((holding) => ({
      holdingId: holding.holdingId,
      name: holding.name,
      accountName: holding.accountName,
      securityType: holding.securityType,
      symbol: holding.symbol,
    })),
    baseNisa,
    additionalNisa,
    allocationStatus,
    allocationMessage,
    ...summary,
    actualEventCount: actuals.eventCount,
    baselineActualCount: Math.max(0, Number(actuals.baselineActualCount || 0)),
  };
}

function saveInvestmentPlanFromApp_(data) {
  const yearMonth = normalizeInvestmentPlanYearMonth_(data.yearMonth);
  const holdingId = String(data.holdingId || "").trim();
  const plannedAmount = Math.max(
    0,
    Math.round(Number(data.plannedAmount || 0)),
  );
  const nisaType = normalizeInvestmentPlanNisaType_(data.nisaType);
  const note = String(data.note || "").trim();
  const planId = String(data.planId || "").trim();

  if (!holdingId) throw new Error("holdingIdがありません");
  if (!(plannedAmount > 0)) throw new Error("予定額は1円以上で指定してください");

  const holdings = getActiveInvestmentHoldingMap_();
  if (!holdings.has(holdingId)) {
    throw new Error("指定された保有銘柄が見つかりません");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const table = getInvestmentPlanTable_();
    const now = new Date();

    let targetRowNumber = -1;
    let existingPlan = null;

    for (let i = 0; i < table.rows.length; i++) {
      const item = investmentPlanRowToObject_(table.rows[i], table.index);
      if (planId && item.planId === planId) {
        targetRowNumber = i + 2;
        existingPlan = item;
        break;
      }
    }

    if (planId && targetRowNumber < 0) {
      throw new Error("投資プランが見つかりません");
    }

    for (let i = 0; i < table.rows.length; i++) {
      const item = investmentPlanRowToObject_(table.rows[i], table.index);
      if (
        item.isActive &&
        item.yearMonth === yearMonth &&
        item.holdingId === holdingId &&
        item.planId !== planId
      ) {
        throw new Error("この月・銘柄の投資プランは既にあります");
      }
    }

    const savedId = planId || `iplan_${Utilities.getUuid()}`;
    const createdAt =
      existingPlan && existingPlan.createdAt
        ? new Date(existingPlan.createdAt)
        : now;

    const object = {
      plan_id: savedId,
      year_month: yearMonth,
      holding_id: holdingId,
      planned_amount: plannedAmount,
      nisa_type: nisaType,
      note,
      is_active: true,
      created_at: createdAt,
      updated_at: now,
    };
    const row = table.headers.map((header) =>
      object[header] !== undefined ? object[header] : "",
    );

    if (targetRowNumber > 0) {
      table.sheet
        .getRange(targetRowNumber, 1, 1, table.headers.length)
        .setValues([row]);
    } else {
      table.sheet.appendRow(row);
    }

    return createJsonResponse_(
      getInvestmentPlannerData_({ yearMonth }),
      "ok",
    );
  } finally {
    lock.releaseLock();
  }
}

function deactivateInvestmentPlanFromApp_(data) {
  const planId = String(data.planId || "").trim();
  if (!planId) throw new Error("planIdがありません");

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const table = getInvestmentPlanTable_();
    for (let i = 0; i < table.rows.length; i++) {
      const item = investmentPlanRowToObject_(table.rows[i], table.index);
      if (item.planId !== planId) continue;

      const row = table.rows[i].slice();
      row[table.index["is_active"]] = false;
      row[table.index["updated_at"]] = new Date();
      table.sheet
        .getRange(i + 2, 1, 1, table.headers.length)
        .setValues([row]);

      return createJsonResponse_(
        getInvestmentPlannerData_({ yearMonth: item.yearMonth }),
        "ok",
      );
    }
    throw new Error("投資プランが見つかりません");
  } finally {
    lock.releaseLock();
  }
}

function testInvestmentPlannerHelpers_() {
  const holdingMap = new Map([
    ["h1", { holdingId: "h1", priceUnit: 1 }],
    ["h2", { holdingId: "h2", priceUnit: 10000 }],
  ]);
  const events = [
    {
      eventId: "e1",
      tradeDate: "2026-09-01",
      side: "buy",
      status: "applied",
      appliedHoldingId: "h1",
      amount: 10000,
    },
    {
      eventId: "e1",
      tradeDate: "2026-09-01",
      side: "buy",
      status: "applied",
      appliedHoldingId: "h1",
      amount: 10000,
    },
    {
      eventId: "e2",
      tradeDate: "2026-09-02",
      side: "sell",
      status: "applied",
      appliedHoldingId: "h1",
      amount: 5000,
    },
    {
      eventId: "e3",
      tradeDate: "2026-09-03",
      side: "buy",
      status: "matched",
      appliedHoldingId: "h1",
      amount: 8000,
    },
    {
      eventId: "e4",
      tradeDate: "2026-09-04",
      side: "buy",
      status: "applied",
      appliedHoldingId: "h2",
      quantity: 12345,
      price: 10498.987444309438,
      amount: 0,
    },
    {
      eventId: "e5",
      tradeDate: "2026-08-31",
      side: "buy",
      status: "applied",
      appliedHoldingId: "h1",
      amount: 99999,
    },
  ];

  const actuals = calculateAppliedInvestmentActuals_(
    "2026-09",
    events,
    holdingMap,
  );
  if (actuals.totalActual !== 22961) {
    throw new Error(`投資実績集計不一致: ${JSON.stringify(actuals)}`);
  }
  if (actuals.byHolding.h1 !== 10000 || actuals.byHolding.h2 !== 12961) {
    throw new Error(`銘柄別投資実績不一致: ${JSON.stringify(actuals.byHolding)}`);
  }

  const summary = buildInvestmentPlannerSummary_(
    30000,
    [
      { plannedAmount: 20000, isActive: true },
      { plannedAmount: 15000, isActive: true },
      { plannedAmount: 99999, isActive: false },
    ],
    actuals,
  );
  if (
    summary.plannedTotal !== 35000 ||
    summary.actualTotal !== 22961 ||
    summary.remainingPlanned !== 12039 ||
    summary.remainingCapacity !== 7039 ||
    summary.plannedOverRecommended !== 5000
  ) {
    throw new Error(`Investment Planner summary不一致: ${JSON.stringify(summary)}`);
  }

  return {
    assertions: "PASS",
    actuals,
    summary,
  };
}

function verifyV214InvestmentPlanner() {
  const sheet = ensureInvestmentPlanSheet_();
  const headers = sheet
    .getRange(1, 1, 1, Math.max(1, sheet.getLastColumn()))
    .getValues()[0]
    .map((value) => String(value || "").trim());

  const missingHeaders = INVESTMENT_PLAN_HEADERS_.filter(
    (header) => !headers.includes(header),
  );

  const duplicateKeys = [];
  const table = getInvestmentPlanTable_();
  const seen = new Set();

  for (const row of table.rows) {
    const item = investmentPlanRowToObject_(row, table.index);
    if (!item.isActive || !item.planId) continue;
    const key = `${item.yearMonth}|${item.holdingId}`;
    if (seen.has(key)) duplicateKeys.push(key);
    seen.add(key);
  }

  const result = {
    ready: missingHeaders.length === 0 && duplicateKeys.length === 0,
    sheetName: SHEETS.INVESTMENT_PLANS,
    rowCount: table.rows.length,
    missingHeaders,
    duplicateKeys,
    checkedAt: new Date().toISOString(),
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
