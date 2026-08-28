// ============================================================
// Neru Nexus - Investment Holdings
//
// 証券口座の保有銘柄・数量・取得単価・現在値を管理する。
// 現在値は price_provider=yahoo の場合、Yahoo Finance Chart APIから
// 6時間キャッシュで更新する。未対応銘柄はmanualへ切り替えて手動更新可能。
// ============================================================

const INVESTMENT_HOLDING_HEADERS_ = Object.freeze([
  "holding_id",
  "account_id",
  "security_type",
  "name",
  "symbol",
  "price_provider",
  "quantity",
  "price_unit",
  "average_cost",
  "current_price",
  "price_updated_at",
  "note",
  "is_active",
  "created_at",
  "updated_at",
]);

const INVESTMENT_PRICE_CACHE_HOURS_ = 6;

function getInvestmentHoldingsSheet_() {
  let sheet = SS.getSheetByName(SHEETS.INVESTMENT_HOLDINGS);
  if (!sheet) {
    sheet = SS.insertSheet(SHEETS.INVESTMENT_HOLDINGS);
    sheet.getRange(1, 1, 1, INVESTMENT_HOLDING_HEADERS_.length)
      .setValues([INVESTMENT_HOLDING_HEADERS_]);
  }

  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map((value) => String(value || "").trim());

  for (const header of INVESTMENT_HOLDING_HEADERS_) {
    if (!headers.includes(header)) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  }

  return sheet;
}

function loadInvestmentHoldings_() {
  const sheet = getInvestmentHoldingsSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map((value) => String(value || "").trim());
  const index = {};
  headers.forEach((header, i) => { index[header] = i; });
  return { sheet, headers, index, rows: values.slice(1) };
}

function normalizeInvestmentSecurityType_(value) {
  const text = String(value || "").trim().toLowerCase();
  return ["stock", "fund", "cash", "other"].includes(text) ? text : "other";
}

function normalizeInvestmentProvider_(value, securityType) {
  const text = String(value || "").trim().toLowerCase();
  if (securityType === "cash") return "manual";
  return text === "yahoo" ? "yahoo" : "manual";
}

function investmentMarketValue_(quantity, currentPrice, priceUnit) {
  const q = Math.max(0, Number(quantity || 0));
  const price = Math.max(0, Number(currentPrice || 0));
  const unit = Math.max(1, Number(priceUnit || 1));
  return q / unit * price;
}

function investmentCostValue_(quantity, averageCost, priceUnit) {
  const q = Math.max(0, Number(quantity || 0));
  const cost = Math.max(0, Number(averageCost || 0));
  const unit = Math.max(1, Number(priceUnit || 1));
  return q / unit * cost;
}

function getInvestmentHoldingsData_() {
  const table = loadInvestmentHoldings_();
  const accounts = getAccountsData_().items || [];
  const accountMap = new Map(accounts.map((item) => [item.accountId, item]));
  const items = [];

  for (const row of table.rows) {
    const active = Number(row[table.index["is_active"]] || 0) !== 0;
    if (!active) continue;

    const holdingId = String(row[table.index["holding_id"]] || "").trim();
    if (!holdingId) continue;

    const accountId = String(row[table.index["account_id"]] || "").trim();
    const account = accountMap.get(accountId);
    const securityType = normalizeInvestmentSecurityType_(
      row[table.index["security_type"]],
    );
    const quantity = Number(row[table.index["quantity"]] || 0);
    const priceUnit = Math.max(1, Number(row[table.index["price_unit"]] || 1));
    const averageCost = Number(row[table.index["average_cost"]] || 0);
    const currentPrice = Number(row[table.index["current_price"]] || 0);
    const marketValue = investmentMarketValue_(quantity, currentPrice, priceUnit);
    const costValue = investmentCostValue_(quantity, averageCost, priceUnit);
    const profitLoss = marketValue - costValue;
    const profitLossRate = costValue > 0 ? profitLoss / costValue * 100 : 0;

    items.push({
      holdingId,
      accountId,
      accountName: account ? account.accountName : "",
      securityType,
      name: String(row[table.index["name"]] || "").trim(),
      symbol: String(row[table.index["symbol"]] || "").trim(),
      priceProvider: normalizeInvestmentProvider_(
        row[table.index["price_provider"]],
        securityType,
      ),
      quantity,
      priceUnit,
      averageCost,
      currentPrice,
      marketValue: Math.round(marketValue),
      costValue: Math.round(costValue),
      profitLoss: Math.round(profitLoss),
      profitLossRate,
      priceUpdatedAt: row[table.index["price_updated_at"]]
        ? new Date(row[table.index["price_updated_at"]]).toISOString()
        : "",
      note: String(row[table.index["note"]] || "").trim(),
    });
  }

  items.sort((a, b) => {
    if (a.accountName !== b.accountName) {
      return a.accountName.localeCompare(b.accountName, "ja");
    }
    return a.name.localeCompare(b.name, "ja");
  });

  const totalMarketValue = items.reduce((sum, item) => sum + item.marketValue, 0);
  const totalCostValue = items.reduce((sum, item) => sum + item.costValue, 0);
  const totalProfitLoss = totalMarketValue - totalCostValue;

  return {
    items,
    totalMarketValue,
    totalCostValue,
    totalProfitLoss,
    totalProfitLossRate:
      totalCostValue > 0 ? totalProfitLoss / totalCostValue * 100 : 0,
  };
}

function createInvestmentHoldingFromApp_(data) {
  return saveInvestmentHoldingFromApp_(data, false);
}

function updateInvestmentHoldingFromApp_(data) {
  return saveInvestmentHoldingFromApp_(data, true);
}

function saveInvestmentHoldingFromApp_(data, isUpdate) {
  const table = loadInvestmentHoldings_();
  const accountId = String(data.accountId || "").trim();
  const name = String(data.name || "").trim();
  const symbol = String(data.symbol || "").trim();
  const securityType = normalizeInvestmentSecurityType_(data.securityType);
  const priceProvider = normalizeInvestmentProvider_(data.priceProvider, securityType);
  const quantity = Number(data.quantity || 0);
  const priceUnit = Math.max(1, Number(data.priceUnit || (securityType === "fund" ? 10000 : 1)));
  const averageCost = Math.max(0, Number(data.averageCost || 0));
  const currentPrice = Math.max(0, Number(data.currentPrice || 0));
  const note = String(data.note || "").trim();

  if (!accountId) throw new Error("証券口座を選択してください");
  if (!name) throw new Error("銘柄名は必須です");
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error("保有数量が不正です");
  if (!Number.isFinite(priceUnit) || priceUnit <= 0) throw new Error("価格単位が不正です");
  if (priceProvider === "yahoo" && !symbol) {
    throw new Error("自動価格更新には価格シンボルが必要です");
  }

  const account = (getAccountsData_().items || []).find((item) => item.accountId === accountId);
  if (!account || !account.isAsset || account.assetType !== "investment") {
    throw new Error("投資資産口座を選択してください");
  }

  const now = new Date();
  let sheetRow = 0;
  let holdingId = String(data.holdingId || "").trim();

  if (isUpdate) {
    if (!holdingId) throw new Error("holdingIdは必須です");
    for (let i = 0; i < table.rows.length; i++) {
      if (String(table.rows[i][table.index["holding_id"]] || "").trim() === holdingId) {
        sheetRow = i + 2;
        break;
      }
    }
    if (!sheetRow) throw new Error("保有銘柄が見つかりません");
  } else {
    holdingId = Utilities.getUuid();
    sheetRow = table.sheet.getLastRow() + 1;
  }

  const write = (header, value) => {
    table.sheet.getRange(sheetRow, table.index[header] + 1).setValue(value);
  };

  write("holding_id", holdingId);
  write("account_id", accountId);
  write("security_type", securityType);
  write("name", name);
  write("symbol", symbol);
  write("price_provider", priceProvider);
  write("quantity", quantity);
  write("price_unit", priceUnit);
  write("average_cost", averageCost);
  write("current_price", securityType === "cash" ? 1 : currentPrice);
  write("note", note);
  write("is_active", 1);
  write("updated_at", now);

  if (!isUpdate) write("created_at", now);
  if (securityType === "cash") write("price_updated_at", now);

  // Yahoo対象なら保存直後に価格取得を試す。失敗しても入力内容は保存する。
  if (priceProvider === "yahoo") {
    try {
      ensureInvestmentPriceDailyTrigger_();
      refreshSingleInvestmentPrice_(holdingId, true);
    } catch (error) {
      console.warn(`価格更新失敗(${holdingId}): ${error}`);
    }
  }

  return createJsonResponse_(
    { saved: true, holdingId },
    "ok",
  );
}

function deactivateInvestmentHoldingFromApp_(data) {
  const holdingId = String(data.holdingId || "").trim();
  if (!holdingId) throw new Error("holdingIdは必須です");

  const table = loadInvestmentHoldings_();
  for (let i = 0; i < table.rows.length; i++) {
    if (String(table.rows[i][table.index["holding_id"]] || "").trim() === holdingId) {
      const row = i + 2;
      table.sheet.getRange(row, table.index["is_active"] + 1).setValue(0);
      table.sheet.getRange(row, table.index["updated_at"] + 1).setValue(new Date());
      return createJsonResponse_({ deactivated: true, holdingId }, "ok");
    }
  }

  throw new Error("保有銘柄が見つかりません");
}

function fetchYahooFinancePrice_(symbol) {
  const encoded = encodeURIComponent(String(symbol || "").trim());
  if (!encoded) throw new Error("symbolが空です");

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=5d&interval=1d`;
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(`Yahoo Finance HTTP ${response.getResponseCode()}`);
  }

  const parsed = JSON.parse(response.getContentText());
  const result = parsed && parsed.chart && parsed.chart.result && parsed.chart.result[0];
  if (!result) throw new Error("Yahoo Financeから価格を取得できませんでした");

  const metaPrice = Number(result.meta && result.meta.regularMarketPrice);
  if (Number.isFinite(metaPrice) && metaPrice > 0) return metaPrice;

  const closes = result.indicators && result.indicators.quote && result.indicators.quote[0]
    ? result.indicators.quote[0].close || []
    : [];
  for (let i = closes.length - 1; i >= 0; i--) {
    const value = Number(closes[i]);
    if (Number.isFinite(value) && value > 0) return value;
  }

  throw new Error("有効な市場価格がありません");
}

function refreshSingleInvestmentPrice_(holdingId, force) {
  const table = loadInvestmentHoldings_();
  const now = new Date();

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    if (String(row[table.index["holding_id"]] || "").trim() !== holdingId) continue;
    if (Number(row[table.index["is_active"]] || 0) === 0) return false;

    const provider = String(row[table.index["price_provider"]] || "").trim();
    if (provider !== "yahoo") return false;

    const updatedRaw = row[table.index["price_updated_at"]];
    if (!force && updatedRaw) {
      const age = now.getTime() - new Date(updatedRaw).getTime();
      if (age < INVESTMENT_PRICE_CACHE_HOURS_ * 60 * 60 * 1000) return false;
    }

    const symbol = String(row[table.index["symbol"]] || "").trim();
    const price = fetchYahooFinancePrice_(symbol);
    const sheetRow = i + 2;
    table.sheet.getRange(sheetRow, table.index["current_price"] + 1).setValue(price);
    table.sheet.getRange(sheetRow, table.index["price_updated_at"] + 1).setValue(now);
    table.sheet.getRange(sheetRow, table.index["updated_at"] + 1).setValue(now);
    return true;
  }

  return false;
}

function refreshInvestmentPrices_(force) {
  const table = loadInvestmentHoldings_();
  let refreshedCount = 0;
  let failedCount = 0;
  const errors = [];

  for (const row of table.rows) {
    if (Number(row[table.index["is_active"]] || 0) === 0) continue;
    if (String(row[table.index["price_provider"]] || "").trim() !== "yahoo") continue;

    const holdingId = String(row[table.index["holding_id"]] || "").trim();
    if (!holdingId) continue;

    try {
      if (refreshSingleInvestmentPrice_(holdingId, force === true)) {
        refreshedCount++;
      }
    } catch (error) {
      failedCount++;
      errors.push(`${holdingId}: ${error && error.message ? error.message : error}`);
    }
  }

  return { refreshedCount, failedCount, errors };
}

function refreshInvestmentPricesFromApp_() {
  return createJsonResponse_(refreshInvestmentPrices_(false), "ok");
}

function getInvestmentAccountValuesMap_() {
  const data = getInvestmentHoldingsData_();
  const map = new Map();
  for (const item of data.items) {
    map.set(item.accountId, (map.get(item.accountId) || 0) + item.marketValue);
  }
  return map;
}

function ensureInvestmentPriceDailyTrigger_() {
  const handler = "refreshInvestmentPricesDaily_";
  const exists = ScriptApp.getProjectTriggers().some(
    (trigger) => trigger.getHandlerFunction() === handler,
  );

  if (!exists) {
    ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(7).create();
  }
}

function installInvestmentPriceDailyTrigger() {
  const handler = "refreshInvestmentPricesDaily_";
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === handler)
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(7).create();
  return { installed: true, handler };
}

function refreshInvestmentPricesDaily_() {
  return refreshInvestmentPrices_(true);
}
