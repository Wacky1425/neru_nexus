// ============================================================
// V2.1-4.3 Investment management baseline / forward-only events
// Snapshot date 2026-09-16 is authoritative. Historical SBI mails on or
// before the snapshot date must never mutate the snapshot holdings.
// ============================================================

const V2143_INVESTMENT_BASELINE_PROPERTY_ = "NERU_INVESTMENT_BASELINE_DATE";
const V2143_DEFAULT_BASELINE_DATE_ = "2026-09-16";

function getInvestmentManagementBaselineDate_() {
  const props = PropertiesService.getScriptProperties();
  const value = String(props.getProperty(V2143_INVESTMENT_BASELINE_PROPERTY_) || V2143_DEFAULT_BASELINE_DATE_).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : V2143_DEFAULT_BASELINE_DATE_;
}

function setInvestmentManagementBaselineDate(dateText) {
  const value = String(dateText || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("基準日はyyyy-MM-dd形式で指定してください");
  PropertiesService.getScriptProperties().setProperty(V2143_INVESTMENT_BASELINE_PROPERTY_, value);
  const result = verifyV2143InvestmentEventBoundary_();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function isPostInvestmentBaselineTradeDate_(tradeDate) {
  const date = String(tradeDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  // The baseline snapshot already contains all holdings through this date.
  // Start event accumulation on the following day to prevent double count.
  return date > getInvestmentManagementBaselineDate_();
}

function normalizeSbiEventSymbolForHolding_(eventSymbol, holdingSymbol) {
  const event = String(eventSymbol || "").trim().toUpperCase();
  const holding = String(holdingSymbol || "").trim().toUpperCase();
  if (!event || !holding) return false;
  if (event === holding) return true;
  if (/^\d{4}$/.test(event) && holding === `${event}.T`) return true;
  if (/^\d{4}\.T$/.test(event) && holding === event.replace(/\.T$/, "")) return true;
  return false;
}

function verifyV2143InvestmentEventBoundary_() {
  const baselineDate = getInvestmentManagementBaselineDate_();
  const events = getAllSbiInvestmentEventsForPlanner_();
  const preOrBaseline = events.filter((e) => String(e.tradeDate || "") <= baselineDate);
  const appliedHistorical = preOrBaseline.filter((e) => String(e.status || "") === "applied");
  const holdings = getInvestmentHoldingsData_().items || [];
  const expectedSymbols = ["8306.T", "9434.T", "03311187", "SPYM"];
  const missingHoldings = expectedSymbols.filter((symbol) => !holdings.some((h) => String(h.symbol || "").toUpperCase() === symbol));
  return {
    ready: appliedHistorical.length === 0 && missingHoldings.length === 0,
    baselineDate,
    firstEventDate: Utilities.formatDate(new Date(new Date(`${baselineDate}T00:00:00+09:00`).getTime() + 86400000), "Asia/Tokyo", "yyyy-MM-dd"),
    holdingCount: holdings.length,
    missingHoldings,
    eventCount: events.length,
    preOrBaselineEventCount: preOrBaseline.length,
    appliedHistoricalCount: appliedHistorical.length,
    rule: "基準日以前・当日のメールは初期スナップショットに含まれるためイベント反映しない"
  };
}

function verifyV2143InvestmentEventBoundary() {
  const result = verifyV2143InvestmentEventBoundary_();
  console.log(JSON.stringify(result, null, 2));
  return result;
}
