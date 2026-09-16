// ============================================================
// Neru Nexus - V2.1-4.1 SBI -> Investment Planner data-flow diagnostic
// Read-only manual diagnostics. No mutation.
// ============================================================

function diagnoseV2141SbiPlannerDataFlow() {
  const holdingTable = loadInvestmentHoldings_();
  const eventTable = getSbiInvestmentEventTable_();
  const currentYm = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM");

  const holdings = holdingTable.rows.map((row, i) => ({
    row: i + 2,
    holdingId: getString(row, holdingTable.index, "holding_id"),
    name: getString(row, holdingTable.index, "name"),
    accountName: getString(row, holdingTable.index, "account_name"),
    securityType: getString(row, holdingTable.index, "security_type"),
    symbol: getString(row, holdingTable.index, "symbol"),
    quantity: getNumber(row, holdingTable.index, "quantity"),
    averageCost: getNumber(row, holdingTable.index, "average_cost"),
    isActiveRaw: holdingTable.index["is_active"] === undefined ? "" : row[holdingTable.index["is_active"]],
    isActive: holdingTable.index["is_active"] === undefined ? true : Number(row[holdingTable.index["is_active"]] || 0) !== 0,
  })).filter(x => x.holdingId || x.name || x.symbol);

  const events = eventTable.rows.map((row, i) => ({
    row: i + 2,
    eventId: getString(row, eventTable.index, "event_id"),
    tradeDate: formatApiDate_(row[eventTable.index["trade_date"]]),
    side: getString(row, eventTable.index, "side"),
    securityName: getString(row, eventTable.index, "security_name"),
    symbol: getString(row, eventTable.index, "symbol"),
    quantity: getNumber(row, eventTable.index, "quantity"),
    price: getNumber(row, eventTable.index, "price"),
    amount: getNumber(row, eventTable.index, "amount"),
    holdingId: getString(row, eventTable.index, "holding_id"),
    status: getString(row, eventTable.index, "status"),
    appliedHoldingId: eventTable.index["applied_holding_id"] === undefined ? "" : getString(row, eventTable.index, "applied_holding_id"),
  })).filter(x => x.eventId);

  const statusCounts = {};
  const monthCounts = {};
  for (const e of events) {
    const status = e.status || "(blank)";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    const ym = /^\d{4}-\d{2}/.test(e.tradeDate) ? e.tradeDate.slice(0, 7) : "(no_date)";
    monthCounts[ym] = (monthCounts[ym] || 0) + 1;
  }

  const currentMonthEvents = events.filter(e => String(e.tradeDate || "").startsWith(currentYm + "-"));
  const appliedBuys = currentMonthEvents.filter(e => e.status === "applied" && String(e.side).toLowerCase() === "buy");
  const planner = getInvestmentPlannerData_({ yearMonth: currentYm });

  console.log("=== V2.1-4.1 SBI -> Planner データ経路診断 ===");
  console.log("currentYm=" + currentYm);
  console.log("HOLDINGS total=" + holdings.length + " active=" + holdings.filter(h => h.isActive).length + " inactive=" + holdings.filter(h => !h.isActive).length);
  holdings.forEach((h, i) => console.log(`H#${i+1} row=${h.row} active=${h.isActive} raw=${h.isActiveRaw} name=${h.name} symbol=${h.symbol} type=${h.securityType} qty=${h.quantity} avg=${h.averageCost} acct=${h.accountName} id=${h.holdingId}`));
  console.log("EVENTS total=" + events.length + " status=" + JSON.stringify(statusCounts) + " months=" + JSON.stringify(monthCounts));
  currentMonthEvents.forEach((e, i) => console.log(`E#${i+1} row=${e.row} date=${e.tradeDate} side=${e.side} status=${e.status} amount=${e.amount} qty=${e.quantity} price=${e.price} name=${e.securityName} symbol=${e.symbol} holding=${e.holdingId} applied=${e.appliedHoldingId} id=${e.eventId}`));
  console.log("PLANNER holdings=" + (planner.holdings || []).length + " actualEventCount=" + planner.actualEventCount + " actualTotal=" + planner.actualTotal + " planCount=" + (planner.items || []).length);
  console.log("=== END V2.1-4.1 ===");

  return {
    ready: true,
    currentYm,
    holdingRowCount: holdings.length,
    activeHoldingCount: holdings.filter(h => h.isActive).length,
    inactiveHoldingCount: holdings.filter(h => !h.isActive).length,
    eventCount: events.length,
    eventStatusCounts: statusCounts,
    eventMonthCounts: monthCounts,
    currentMonthEventCount: currentMonthEvents.length,
    currentMonthAppliedBuyCount: appliedBuys.length,
    plannerHoldingCount: (planner.holdings || []).length,
    plannerActualEventCount: planner.actualEventCount,
    plannerActualTotal: planner.actualTotal,
  };
}
