
/**
 * V1.3-1 SBI Securities Gmail event intake.
 *
 * Real SBI mail wording can vary, so this layer separates:
 *   Gmail scan -> parsed candidate -> holding match -> explicit apply.
 * Holdings are never mutated merely because an email was received.
 */

const SBI_INVESTMENT_EVENT_HEADERS_ = [
  "event_id", "message_id", "received_at", "trade_date", "side",
  "security_name", "symbol", "quantity", "price", "amount",
  "subject", "gmail_url", "holding_id", "holding_name",
  "match_score", "status", "raw_excerpt", "created_at", "updated_at",
];

function ensureSbiInvestmentEventSheet_() {
  let sheet = SS.getSheetByName(SHEETS.SBI_INVESTMENT_EVENTS);
  if (!sheet) {
    sheet = SS.insertSheet(SHEETS.SBI_INVESTMENT_EVENTS);
    sheet.getRange(1, 1, 1, SBI_INVESTMENT_EVENT_HEADERS_.length)
      .setValues([SBI_INVESTMENT_EVENT_HEADERS_]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0]
    .map((value) => String(value || "").trim());
  const missing = SBI_INVESTMENT_EVENT_HEADERS_
    .filter((header) => !headers.includes(header));
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length)
      .setValues([missing]);
  }
  return sheet;
}

function getSbiInvestmentEventTable_() {
  ensureSbiInvestmentEventSheet_();
  return loadTable(SHEETS.SBI_INVESTMENT_EVENTS);
}

function parseSbiInvestmentMailText_(subject, body, fallbackDate) {
  const text = `${subject || ""}\n${body || ""}`.normalize("NFKC");
  const lower = text.toLowerCase();

  let side = "";
  if (/(買付|買い|購入|buy)/i.test(text)) side = "buy";
  if (/(売却|売り|sell)/i.test(text)) side = "sell";
  if (!side || !/(約定|取引成立|買付|売却|purchase|trade)/i.test(text)) {
    return null;
  }

  const dateMatch = text.match(
    /(?:約定日|取引日|買付日|売却日)?[：:\s]*(20\d{2})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?/,
  );
  const fallback = fallbackDate instanceof Date ? fallbackDate : new Date(fallbackDate);
  const tradeDate = dateMatch
    ? `${dateMatch[1]}-${String(Number(dateMatch[2])).padStart(2, "0")}-${String(Number(dateMatch[3])).padStart(2, "0")}`
    : !isNaN(fallback.getTime())
      ? Utilities.formatDate(fallback, "Asia/Tokyo", "yyyy-MM-dd")
      : "";

  const quantityMatch = text.match(
    /(?:数量|株数|口数|約定数量|買付数量|売却数量)[：:\s]*([0-9][0-9,.]*)\s*(?:株|口)?/i,
  );
  const priceMatch = text.match(
    /(?:約定単価|単価|価格|基準価額)[：:\s]*(?:¥|￥)?\s*([0-9][0-9,.]*)/i,
  );
  const amountMatch = text.match(
    /(?:受渡金額|約定金額|買付金額|売却金額|金額)[：:\s]*(?:¥|￥)?\s*([0-9][0-9,]*)\s*円?/i,
  );
  const symbolMatch = text.match(
    /(?:銘柄コード|コード|symbol)[：:\s]*([0-9A-Z.]{3,16})/i,
  );
  const nameMatch = text.match(
    /(?:銘柄名|ファンド名|商品名)[：:\s]*([^\n\r]{2,100})/i,
  );

  const quantity = quantityMatch
    ? Number(quantityMatch[1].replace(/,/g, ""))
    : 0;
  const price = priceMatch
    ? Number(priceMatch[1].replace(/,/g, ""))
    : 0;
  const amount = amountMatch
    ? Number(amountMatch[1].replace(/,/g, ""))
    : 0;
  const securityName = nameMatch ? nameMatch[1].trim() : "";

  if (!(quantity > 0) || (!securityName && !symbolMatch)) {
    // Keep parser conservative until actual SBI templates are validated.
    return null;
  }

  return {
    tradeDate,
    side,
    securityName,
    symbol: symbolMatch ? symbolMatch[1].trim() : "",
    quantity,
    price: Number.isFinite(price) ? price : 0,
    amount: Number.isFinite(amount) ? amount : 0,
    rawExcerpt: text.replace(/\s+/g, " ").slice(0, 500),
  };
}

function normalizeHoldingMatchText_(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　・･()（）\-ー_]/g, "")
    .trim();
}

function findHoldingForSbiEvent_(event) {
  const table = loadInvestmentHoldings_();
  const eventSymbol = String(event.symbol || "").trim().toUpperCase();
  const eventName = normalizeHoldingMatchText_(event.securityName);
  const candidates = [];

  for (const row of table.rows) {
    if (Number(row[table.index["is_active"]] || 0) === 0) continue;
    const holdingId = String(row[table.index["holding_id"]] || "").trim();
    if (!holdingId) continue;

    const symbol = String(row[table.index["symbol"]] || "").trim().toUpperCase();
    const name = String(row[table.index["name"]] || "").trim();
    const normalizedName = normalizeHoldingMatchText_(name);

    let score = 0;
    if (eventSymbol && symbol && eventSymbol === symbol) score = 1;
    else if (eventName && normalizedName && eventName === normalizedName) score = 0.95;
    else if (
      eventName &&
      normalizedName &&
      (eventName.includes(normalizedName) || normalizedName.includes(eventName))
    ) score = 0.8;

    if (score > 0) candidates.push({ holdingId, name, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) return null;
  if (candidates[1] && candidates[0].score === candidates[1].score) {
    return { ...candidates[0], ambiguous: true };
  }
  return { ...candidates[0], ambiguous: false };
}

function buildSbiInvestmentEventFromMessage_(message, thread) {
  const parsed = parseSbiInvestmentMailText_(
    message.getSubject(),
    message.getPlainBody(),
    message.getDate(),
  );
  if (!parsed) return null;

  const match = findHoldingForSbiEvent_(parsed);
  return {
    event_id: Utilities.getUuid(),
    message_id: String(message.getId() || "").trim(),
    received_at: Utilities.formatDate(
      message.getDate(),
      Session.getScriptTimeZone(),
      "yyyy/MM/dd HH:mm:ss",
    ),
    trade_date: parsed.tradeDate,
    side: parsed.side,
    security_name: parsed.securityName,
    symbol: parsed.symbol,
    quantity: parsed.quantity,
    price: parsed.price,
    amount: parsed.amount,
    subject: String(message.getSubject() || "").trim(),
    gmail_url: thread && typeof thread.getPermalink === "function"
      ? String(thread.getPermalink() || "")
      : "",
    holding_id: match && !match.ambiguous ? match.holdingId : "",
    holding_name: match ? match.name : "",
    match_score: match && !match.ambiguous ? match.score : match ? 0.5 : 0,
    status: match && !match.ambiguous ? "matched" : "unmatched",
    raw_excerpt: parsed.rawExcerpt,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function scanSbiInvestmentGmail_(options = {}) {
  const days = Math.min(Math.max(Number(options.days || 90), 1), 365);
  const limit = Math.min(Math.max(Number(options.limit || 200), 1), 500);
  const query =
    `newer_than:${days}d {subject:SBI証券 subject:約定 subject:買付 subject:売却}`;

  const table = getSbiInvestmentEventTable_();
  const existingIds = new Set(
    table.rows
      .map((row) => getString(row, table.index, "message_id"))
      .filter(Boolean),
  );

  const rows = [];
  let inspectedCount = 0;
  for (const thread of GmailApp.search(query, 0, limit)) {
    for (const message of thread.getMessages()) {
      inspectedCount++;
      const messageId = String(message.getId() || "").trim();
      if (!messageId || existingIds.has(messageId)) continue;

      const event = buildSbiInvestmentEventFromMessage_(message, thread);
      if (event) rows.push(event);
    }
  }

  if (rows.length) {
    const sheet = getRequiredSheet(SHEETS.SBI_INVESTMENT_EVENTS);
    const current = getSbiInvestmentEventTable_();
    const values = rows.map((event) =>
      current.headers.map((header) =>
        event[String(header || "").trim()] !== undefined
          ? event[String(header || "").trim()]
          : "",
      ),
    );
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, current.headers.length)
      .setValues(values);
    clearTableCache(SHEETS.SBI_INVESTMENT_EVENTS);
  }

  return {
    query,
    inspectedCount,
    addedCount: rows.length,
    matchedCount: rows.filter((row) => row.status === "matched").length,
    unmatchedCount: rows.filter((row) => row.status === "unmatched").length,
  };
}

function getSbiInvestmentEventsData_(options = {}) {
  const table = getSbiInvestmentEventTable_();
  const includeDone = toBoolean_(options.includeDone, false);

  const items = table.rows.map((row) => ({
    eventId: getString(row, table.index, "event_id"),
    messageId: getString(row, table.index, "message_id"),
    receivedAt: formatApiDateTime_(row[table.index["received_at"]]),
    tradeDate: formatApiDate_(row[table.index["trade_date"]]),
    side: getString(row, table.index, "side"),
    securityName: getString(row, table.index, "security_name"),
    symbol: getString(row, table.index, "symbol"),
    quantity: getNumber(row, table.index, "quantity"),
    price: getNumber(row, table.index, "price"),
    amount: getNumber(row, table.index, "amount"),
    subject: getString(row, table.index, "subject"),
    gmailUrl: getString(row, table.index, "gmail_url"),
    holdingId: getString(row, table.index, "holding_id"),
    holdingName: getString(row, table.index, "holding_name"),
    matchScore: getNumber(row, table.index, "match_score"),
    status: getString(row, table.index, "status"),
  }))
    .filter((item) => item.eventId)
    .filter((item) => includeDone || !["applied", "ignored"].includes(item.status));

  items.sort((a, b) =>
    String(b.tradeDate || b.receivedAt).localeCompare(String(a.tradeDate || a.receivedAt)),
  );
  return { items };
}

function findSbiInvestmentEvent_(eventId) {
  const table = getSbiInvestmentEventTable_();
  const id = String(eventId || "").trim();
  for (let i = 0; i < table.rows.length; i++) {
    if (getString(table.rows[i], table.index, "event_id") === id) {
      return { table, row: table.rows[i], rowNumber: i + 2 };
    }
  }
  throw new Error("SBI証券イベントが見つかりません");
}

function updateSbiInvestmentEventStatus_(found, status) {
  const row = found.row.slice();
  row[found.table.index["status"]] = status;
  row[found.table.index["updated_at"]] = new Date();
  getRequiredSheet(SHEETS.SBI_INVESTMENT_EVENTS)
    .getRange(found.rowNumber, 1, 1, row.length)
    .setValues([row]);
  clearTableCache(SHEETS.SBI_INVESTMENT_EVENTS);
}

function applySbiInvestmentEventFromApp_(data) {
  const found = findSbiInvestmentEvent_(data.eventId);
  const holdingId =
    String(data.holdingId || "").trim() ||
    getString(found.row, found.table.index, "holding_id");
  if (!holdingId) throw new Error("保有銘柄を特定できません");

  const side = getString(found.row, found.table.index, "side");
  const eventQuantity = getNumber(found.row, found.table.index, "quantity");
  const eventPrice = getNumber(found.row, found.table.index, "price");
  if (!["buy", "sell"].includes(side) || !(eventQuantity > 0)) {
    throw new Error("売買イベントの内容が不正です");
  }

  const holdings = loadInvestmentHoldings_();
  let targetIndex = -1;
  for (let i = 0; i < holdings.rows.length; i++) {
    if (
      String(holdings.rows[i][holdings.index["holding_id"]] || "").trim() ===
      holdingId
    ) {
      targetIndex = i;
      break;
    }
  }
  if (targetIndex < 0) throw new Error("保有銘柄が見つかりません");

  const row = holdings.rows[targetIndex].slice();
  if (Number(row[holdings.index["is_active"]] || 0) === 0) {
    throw new Error("無効な保有銘柄には適用できません");
  }

  const oldQuantity = Number(row[holdings.index["quantity"]] || 0);
  const priceUnit = Math.max(1, Number(row[holdings.index["price_unit"]] || 1));
  const oldAverageCost = Number(row[holdings.index["average_cost"]] || 0);

  let newQuantity = oldQuantity;
  let newAverageCost = oldAverageCost;

  if (side === "buy") {
    newQuantity = oldQuantity + eventQuantity;
    if (eventPrice > 0 && newQuantity > 0) {
      const oldCost = investmentCostValue_(oldQuantity, oldAverageCost, priceUnit);
      const addedCost = investmentCostValue_(eventQuantity, eventPrice, priceUnit);
      newAverageCost = (oldCost + addedCost) / (newQuantity / priceUnit);
    }
  } else {
    if (eventQuantity > oldQuantity + 1e-9) {
      throw new Error("売却数量が現在の保有数量を超えています");
    }
    newQuantity = Math.max(0, oldQuantity - eventQuantity);
  }

  const sheetRow = targetIndex + 2;
  holdings.sheet.getRange(sheetRow, holdings.index["quantity"] + 1)
    .setValue(newQuantity);
  holdings.sheet.getRange(sheetRow, holdings.index["average_cost"] + 1)
    .setValue(newQuantity > 0 ? newAverageCost : 0);
  holdings.sheet.getRange(sheetRow, holdings.index["updated_at"] + 1)
    .setValue(new Date());

  updateSbiInvestmentEventStatus_(found, "applied");
  clearAccountBalanceCache_();

  return createJsonResponse_({
    applied: true,
    holdingId,
    oldQuantity,
    newQuantity,
    oldAverageCost,
    newAverageCost: newQuantity > 0 ? newAverageCost : 0,
  }, "ok");
}

function ignoreSbiInvestmentEventFromApp_(data) {
  const found = findSbiInvestmentEvent_(data.eventId);
  updateSbiInvestmentEventStatus_(found, "ignored");
  return createJsonResponse_({ ignored: true }, "ok");
}

function scanSbiInvestmentGmailFromApp_(data) {
  return createJsonResponse_(
    scanSbiInvestmentGmail_({ days: data.days, limit: data.limit }),
    "ok",
  );
}

function installDailySbiInvestmentTrigger_() {
  const handler = "runDailySbiInvestmentScan_";
  const exists = ScriptApp.getProjectTriggers().some(
    (trigger) => trigger.getHandlerFunction() === handler,
  );
  if (!exists) {
    ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(6).create();
  }
  return { installed: true };
}

function runDailySbiInvestmentScan_() {
  return scanSbiInvestmentGmail_({ days: 7, limit: 200 });
}

function testSbiInvestmentMailParser_() {
  const parsed = parseSbiInvestmentMailText_(
    "SBI証券 約定のお知らせ",
    [
      "約定日：2026/08/28",
      "銘柄名：テスト投資信託",
      "買付数量：12,345口",
      "約定単価：10,500",
      "買付金額：12,961円",
    ].join("\n"),
    new Date("2026-08-28T00:00:00+09:00"),
  );
  if (!parsed) throw new Error("SBI証券メール解析失敗");
  if (parsed.side !== "buy") throw new Error(`side解析失敗: ${parsed.side}`);
  if (parsed.quantity !== 12345) throw new Error(`quantity解析失敗: ${parsed.quantity}`);
  if (parsed.price !== 10500) throw new Error(`price解析失敗: ${parsed.price}`);
  if (parsed.tradeDate !== "2026-08-28") throw new Error(`date解析失敗: ${parsed.tradeDate}`);

  const sell = parseSbiInvestmentMailText_(
    "SBI証券 売却約定",
    "銘柄コード：1234\n銘柄名：テスト株\n売却数量：100株\n約定単価：1,250円",
    new Date("2026-08-28T00:00:00+09:00"),
  );
  if (!sell || sell.side !== "sell" || sell.quantity !== 100) {
    throw new Error("売却メール解析失敗");
  }
  return { assertions: "PASS", buy: parsed, sell };
}
