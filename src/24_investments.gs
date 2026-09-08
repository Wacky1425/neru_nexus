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
  "previous_close",
  "price_change",
  "price_change_rate",
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

function normalizeInvestmentSymbol_(value, securityType) {
  let text = String(value == null ? "" : value).trim();

  // Google Sheets can coerce an all-numeric fund code to a number and remove
  // its leading zero (e.g. 03311187 -> 3311187). Japanese mutual-fund quote
  // codes are handled as identifiers, never as numeric values.
  if (
    normalizeInvestmentSecurityType_(securityType) === "fund" &&
    /^\d{7}$/.test(text)
  ) {
    text = text.padStart(8, "0");
  }

  return text;
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
    const previousClose =
      table.index["previous_close"] === undefined
        ? 0
        : Number(row[table.index["previous_close"]] || 0);
    const priceChange =
      table.index["price_change"] === undefined
        ? currentPrice > 0 && previousClose > 0
          ? currentPrice - previousClose
          : 0
        : Number(row[table.index["price_change"]] || 0);
    const priceChangeRate =
      table.index["price_change_rate"] === undefined
        ? previousClose > 0
          ? priceChange / previousClose * 100
          : 0
        : Number(row[table.index["price_change_rate"]] || 0);
    const marketValue = investmentMarketValue_(quantity, currentPrice, priceUnit);
    const previousMarketValue = investmentMarketValue_(
      quantity,
      previousClose,
      priceUnit,
    );
    const dailyChangeValue =
      previousClose > 0 ? marketValue - previousMarketValue : 0;
    const costValue = investmentCostValue_(quantity, averageCost, priceUnit);
    const profitLoss = marketValue - costValue;
    const profitLossRate = costValue > 0 ? profitLoss / costValue * 100 : 0;

    items.push({
      holdingId,
      accountId,
      accountName: account ? account.accountName : "",
      securityType,
      name: String(row[table.index["name"]] || "").trim(),
      symbol: normalizeInvestmentSymbol_(
        row[table.index["symbol"]],
        securityType,
      ),
      priceProvider: normalizeInvestmentProvider_(
        row[table.index["price_provider"]],
        securityType,
      ),
      quantity,
      priceUnit,
      averageCost,
      currentPrice,
      previousClose,
      priceChange,
      priceChangeRate,
      dailyChangeValue: Math.round(dailyChangeValue),
      marketValue: Math.round(marketValue),
      costValue: Math.round(costValue),
      profitLoss: Math.round(profitLoss),
      profitLossRate,
      portfolioWeight: 0,
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

  const totalMarketValue = items.reduce(
    (sum, item) => sum + item.marketValue,
    0,
  );
  const totalCostValue = items.reduce(
    (sum, item) => sum + item.costValue,
    0,
  );
  const totalProfitLoss = totalMarketValue - totalCostValue;
  const totalDailyChange = items.reduce(
    (sum, item) => sum + item.dailyChangeValue,
    0,
  );
  const previousPortfolioValue = totalMarketValue - totalDailyChange;
  const totalDailyChangeRate =
    previousPortfolioValue > 0
      ? totalDailyChange / previousPortfolioValue * 100
      : 0;

  for (const item of items) {
    item.portfolioWeight =
      totalMarketValue > 0 ? item.marketValue / totalMarketValue * 100 : 0;
  }

  const pricedItems = items.filter(
    (item) => item.securityType !== "cash" && item.currentPrice > 0,
  );
  const previousCloseItems = pricedItems.filter(
    (item) => item.previousClose > 0,
  );
  const latestPriceUpdatedAt = items
    .map((item) => item.priceUpdatedAt)
    .filter(Boolean)
    .sort()
    .pop() || "";

  return {
    items,
    totalMarketValue,
    totalCostValue,
    totalProfitLoss,
    totalProfitLossRate:
      totalCostValue > 0 ? totalProfitLoss / totalCostValue * 100 : 0,
    totalDailyChange: Math.round(totalDailyChange),
    totalDailyChangeRate,
    pricedHoldingCount: pricedItems.length,
    dailyChangeAvailableCount: previousCloseItems.length,
    latestPriceUpdatedAt,
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
  const securityType = normalizeInvestmentSecurityType_(data.securityType);
  const symbol = normalizeInvestmentSymbol_(data.symbol, securityType);
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

  // Symbol is an identifier. Force plain-text cell format so Sheets does not
  // strip leading zeroes from fund codes such as 03311187.
  const symbolRange = table.sheet.getRange(
    sheetRow,
    table.index["symbol"] + 1,
  );
  // setNumberFormat("@") alone is not enough: setValue("03311187") can still
  // be parsed by Sheets as a number. A leading apostrophe forces text storage;
  // getValue()/API reads return the identifier without the apostrophe.
  symbolRange.setNumberFormat("@");
  symbolRange.setValue(symbol ? "'" + symbol : "");

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

function stripYahooJapanHtml_(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&minus;|&#8722;/gi, "-")
    .replace(/&yen;|&#165;/gi, "")
    .replace(/&amp;/gi, "&")
    .replace(/&#44;/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function parseYahooJapanFundHistoryQuote_(html, symbol) {
  const source = String(html || "");
  const rows = source.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];

  for (const rowHtml of rows) {
    const text = stripYahooJapanHtml_(rowHtml);
    if (!/\d{4}[\/年.-]\d{1,2}[\/月.-]\d{1,2}日?/.test(text)) continue;

    const dateMatch = text.match(
      /(\d{4})[\/年.-](\d{1,2})[\/月.-](\d{1,2})日?/,
    );
    if (!dateMatch) continue;

    const afterDate = text.slice((dateMatch.index || 0) + dateMatch[0].length);
    const numbers = afterDate.match(/[+\-−]?\d[\d,]*(?:\.\d+)?/g) || [];
    if (numbers.length < 2) continue;

    const parseNumber = (value) =>
      Number(String(value || "").replace(/,/g, "").replace(/−/g, "-"));

    const currentPrice = parseNumber(numbers[0]);
    const priceChange = parseNumber(numbers[1]);
    if (!(currentPrice > 0) || !Number.isFinite(priceChange)) continue;

    const previousClose = currentPrice - priceChange;
    const priceChangeRate =
      previousClose > 0 ? priceChange / previousClose * 100 : 0;

    return {
      currentPrice,
      previousClose: previousClose > 0 ? previousClose : 0,
      priceChange,
      priceChangeRate,
      currency: "JPY",
      exchangeName: "Yahoo!ファイナンス 投資信託",
      source: "yahoo_japan_fund_history",
      symbol: String(symbol || "").trim(),
      priceDate:
        `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}` +
        `-${String(dateMatch[3]).padStart(2, "0")}`,
    };
  }

  throw new Error(
    `Yahoo!ファイナンス投信時系列から基準価額を解析できませんでした: ${symbol}`,
  );
}

function parseKabumapFundQuote_(html, symbol) {
  const text = stripYahooJapanHtml_(html);
  const code = String(symbol || "").trim();

  // 株マップの実ページは「コード」「適用日」「基準価額」が別セルなので、
  // 1本の連結正規表現ではなく各項目を独立して拾う。
  const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const codePattern = new RegExp(
    "コード\\s*[|｜:]?\\s*" + escapedCode + "(?:\\s|$)",
    "i",
  );
  if (!codePattern.test(text)) {
    throw new Error(`株マップで投信コードを確認できませんでした: ${code}`);
  }

  const dateMatch = text.match(
    /適用日\s*[|｜:]?\s*(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/,
  );
  if (!dateMatch) {
    throw new Error(`株マップで適用日を解析できませんでした: ${code}`);
  }

  const priceMatch = text.match(
    /基準価額\s*[|｜:]?\s*([0-9,]+(?:\.\d+)?)\s*円/,
  );
  if (!priceMatch) {
    throw new Error(`株マップで基準価額を解析できませんでした: ${code}`);
  }

  const currentPrice = Number(String(priceMatch[1]).replace(/,/g, ""));
  if (!(currentPrice > 0)) {
    throw new Error(`株マップの基準価額が不正です: ${code}`);
  }

  return {
    currentPrice,
    previousClose: 0,
    priceChange: 0,
    priceChangeRate: 0,
    currency: "JPY",
    exchangeName: "投信株マップ",
    source: "kabumap_fund",
    symbol: code,
    priceDate:
      `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}` +
      `-${String(dateMatch[3]).padStart(2, "0")}`,
  };
}

function fetchKabumapFundQuote_(symbol) {
  const normalized = normalizeInvestmentSymbol_(symbol, "fund");
  if (!normalized) throw new Error("投信symbolが空です");

  const url =
    "https://fund.kabumap.com/servlets/fund/Action" +
    "?SRC=basic/perf&codetext=" +
    encodeURIComponent(normalized);
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept-Language": "ja-JP,ja;q=0.9",
    },
  });

  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error(`投信株マップ HTTP ${code}`);
  }

  const html = response.getBlob().getDataAsString("Shift_JIS");
  try {
    return parseKabumapFundQuote_(html, normalized);
  } catch (error) {
    const plain = stripYahooJapanHtml_(html);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch
      ? stripYahooJapanHtml_(titleMatch[1]).slice(0, 120)
      : "";
    const preview = plain.slice(0, 240);
    throw new Error(
      `${error && error.message ? error.message : error}` +
      ` [url=${url}, bytes=${html.length}, title=${title || "-"}, ` +
      `preview=${preview || "-"}]`,
    );
  }
}

function fetchYahooJapanFundQuote_(symbol) {
  const normalized = normalizeInvestmentSymbol_(symbol, "fund");
  if (!normalized) throw new Error("投信symbolが空です");

  const url =
    `https://finance.yahoo.co.jp/quote/${encodeURIComponent(normalized)}/history`;
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept-Language": "ja-JP,ja;q=0.9",
    },
  });

  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error(`Yahoo!ファイナンス投信 HTTP ${code}`);
  }

  return parseYahooJapanFundHistoryQuote_(
    response.getContentText("UTF-8"),
    normalized,
  );
}

function fetchInvestmentQuote_(symbol, securityType) {
  const type = normalizeInvestmentSecurityType_(securityType);
  if (type === "fund") {
    const errors = [];

    // Yahoo!ファイナンスはApps ScriptのUrlFetchAppからHTTP 500になる
    // ケースがあるため、投信コードを直接指定できる株マップを主経路にする。
    try {
      return fetchKabumapFundQuote_(symbol);
    } catch (error) {
      errors.push(`kabumap: ${error && error.message ? error.message : error}`);
    }

    // ブラウザ側では取得可能なYahoo!ファイナンスを予備経路として残す。
    try {
      return fetchYahooJapanFundQuote_(symbol);
    } catch (error) {
      errors.push(`yahoo_jp: ${error && error.message ? error.message : error}`);
    }

    throw new Error(
      `投資信託の基準価額取得に失敗しました (${errors.join(" / ")})`,
    );
  }
  return fetchYahooFinanceQuote_(symbol);
}

function fetchYahooFinanceQuote_(symbol) {
  const encoded = encodeURIComponent(String(symbol || "").trim());
  if (!encoded) throw new Error("symbolが空です");

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}` +
    "?range=5d&interval=1d";
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(`Yahoo Finance HTTP ${response.getResponseCode()}`);
  }

  const parsed = JSON.parse(response.getContentText());
  const result =
    parsed &&
    parsed.chart &&
    parsed.chart.result &&
    parsed.chart.result[0];

  if (!result) {
    throw new Error("Yahoo Financeから価格を取得できませんでした");
  }

  const meta = result.meta || {};
  const closes =
    result.indicators &&
    result.indicators.quote &&
    result.indicators.quote[0]
      ? result.indicators.quote[0].close || []
      : [];

  const validCloses = closes
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  const metaPrice = Number(meta.regularMarketPrice);
  const currentPrice =
    Number.isFinite(metaPrice) && metaPrice > 0
      ? metaPrice
      : validCloses.length
        ? validCloses[validCloses.length - 1]
        : 0;

  if (!(currentPrice > 0)) {
    throw new Error("有効な市場価格がありません");
  }

  const metaPreviousClose = Number(
    meta.regularMarketPreviousClose || meta.chartPreviousClose,
  );

  let previousClose =
    Number.isFinite(metaPreviousClose) && metaPreviousClose > 0
      ? metaPreviousClose
      : 0;

  if (!(previousClose > 0) && validCloses.length >= 2) {
    const last = validCloses[validCloses.length - 1];
    previousClose =
      Math.abs(last - currentPrice) < 1e-9
        ? validCloses[validCloses.length - 2]
        : last;
  }

  const priceChange =
    previousClose > 0 ? currentPrice - previousClose : 0;
  const priceChangeRate =
    previousClose > 0 ? priceChange / previousClose * 100 : 0;

  return {
    currentPrice,
    previousClose,
    priceChange,
    priceChangeRate,
    currency: String(meta.currency || "").trim(),
    exchangeName: String(
      meta.fullExchangeName || meta.exchangeName || "",
    ).trim(),
  };
}

function fetchYahooFinancePrice_(symbol) {
  return fetchYahooFinanceQuote_(symbol).currentPrice;
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

    const securityType = normalizeInvestmentSecurityType_(
      row[table.index["security_type"]],
    );
    const symbol = normalizeInvestmentSymbol_(
      row[table.index["symbol"]],
      securityType,
    );
    const quote = fetchInvestmentQuote_(symbol, securityType);
    const sheetRow = i + 2;
    table.sheet
      .getRange(sheetRow, table.index["current_price"] + 1)
      .setValue(quote.currentPrice);
    table.sheet
      .getRange(sheetRow, table.index["previous_close"] + 1)
      .setValue(quote.previousClose);
    table.sheet
      .getRange(sheetRow, table.index["price_change"] + 1)
      .setValue(quote.priceChange);
    table.sheet
      .getRange(sheetRow, table.index["price_change_rate"] + 1)
      .setValue(quote.priceChangeRate);
    table.sheet
      .getRange(sheetRow, table.index["price_updated_at"] + 1)
      .setValue(now);
    table.sheet
      .getRange(sheetRow, table.index["updated_at"] + 1)
      .setValue(now);
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

function calculateInvestmentDashboardMetrics_(items) {
  const source = Array.isArray(items) ? items : [];
  const totalMarketValue = source.reduce(
    (sum, item) => sum + Number(item.marketValue || 0),
    0,
  );
  const totalDailyChange = source.reduce(
    (sum, item) => sum + Number(item.dailyChangeValue || 0),
    0,
  );
  const previousValue = totalMarketValue - totalDailyChange;

  return {
    totalMarketValue,
    totalDailyChange,
    totalDailyChangeRate:
      previousValue > 0
        ? totalDailyChange / previousValue * 100
        : 0,
    weights: source.map((item) => ({
      holdingId: String(item.holdingId || ""),
      weight:
        totalMarketValue > 0
          ? Number(item.marketValue || 0) / totalMarketValue * 100
          : 0,
    })),
  };
}

function repairV213InvestmentSymbols() {
  const table = loadInvestmentHoldings_();
  let repaired = 0;

  table.rows.forEach((row, index) => {
    const securityType = normalizeInvestmentSecurityType_(
      row[table.index["security_type"]],
    );
    const raw = String(row[table.index["symbol"]] || "").trim();
    const normalized = normalizeInvestmentSymbol_(raw, securityType);
    if (!normalized || normalized === raw) return;

    const range = table.sheet.getRange(
      index + 2,
      table.index["symbol"] + 1,
    );
    range.setNumberFormat("@");
    range.setValue("'" + normalized);
    repaired += 1;
  });

  const result = { ready: true, repaired };
  console.log(JSON.stringify(result));
  return result;
}

function diagnoseV213FundSource() {
  const symbol = "03311187";
  const url =
    "https://fund.kabumap.com/servlets/fund/Action" +
    "?SRC=basic/perf&codetext=" +
    encodeURIComponent(symbol);
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept-Language": "ja-JP,ja;q=0.9",
    },
  });
  const html = response.getBlob().getDataAsString("Shift_JIS");
  const plain = stripYahooJapanHtml_(html);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const result = {
    ready:
      response.getResponseCode() === 200 &&
      plain.indexOf(symbol) >= 0 &&
      plain.indexOf("基準価額") >= 0,
    responseCode: response.getResponseCode(),
    charset: "Shift_JIS",
    bytes: html.length,
    hasSymbol: plain.indexOf(symbol) >= 0,
    hasPriceLabel: plain.indexOf("基準価額") >= 0,
    title: titleMatch
      ? stripYahooJapanHtml_(titleMatch[1]).slice(0, 120)
      : "",
    preview: plain.slice(0, 300),
    url,
  };
  console.log(JSON.stringify(result));
  return result;
}

function testV213FundQuote() {
  const symbol = "03311187";
  const quote = fetchInvestmentQuote_(symbol, "fund");
  const result = {
    ready: Number(quote.currentPrice) > 0,
    symbol,
    currentPrice: quote.currentPrice,
    previousClose: quote.previousClose,
    priceChange: quote.priceChange,
    priceChangeRate: quote.priceChangeRate,
    priceDate: quote.priceDate || "",
    source: quote.source || "",
  };
  console.log(JSON.stringify(result));
  if (!result.ready) {
    throw new Error("投資信託の基準価額取得に失敗しました");
  }
  return result;
}

function verifyV213InvestmentDashboard() {
  const table = loadInvestmentHoldings_();
  const requiredColumns = [
    "current_price",
    "previous_close",
    "price_change",
    "price_change_rate",
    "price_updated_at",
  ];
  const missingColumns = requiredColumns.filter(
    (column) => table.index[column] === undefined,
  );

  const recoveredLeadingZeroSymbols = table.rows.filter((row) => {
    const securityType = normalizeInvestmentSecurityType_(
      row[table.index["security_type"]],
    );
    const raw = String(row[table.index["symbol"]] || "").trim();
    return securityType === "fund" && /^\d{7}$/.test(raw);
  }).length;

  const result = {
    ready: missingColumns.length === 0,
    holdingCount: table.rows.length,
    missingColumns,
    recoveredLeadingZeroSymbols,
    priceCacheHours: INVESTMENT_PRICE_CACHE_HOURS_,
    issues:
      missingColumns.length > 0
        ? [`missing columns: ${missingColumns.join(",")}`]
        : [],
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testInvestmentDashboardMetrics_() {
  const metrics = calculateInvestmentDashboardMetrics_([
    {
      holdingId: "a",
      marketValue: 60000,
      dailyChangeValue: 600,
    },
    {
      holdingId: "b",
      marketValue: 40000,
      dailyChangeValue: -200,
    },
  ]);

  if (metrics.totalMarketValue !== 100000) {
    throw new Error("投資Dashboard評価額集計失敗");
  }

  if (metrics.totalDailyChange !== 400) {
    throw new Error("投資Dashboard前日比集計失敗");
  }

  const weightA = metrics.weights.find(
    (item) => item.holdingId === "a",
  );
  if (!weightA || Math.abs(weightA.weight - 60) > 1e-9) {
    throw new Error("投資Dashboard構成比計算失敗");
  }

  const expectedRate = 400 / 99600 * 100;
  if (
    Math.abs(metrics.totalDailyChangeRate - expectedRate) > 1e-9
  ) {
    throw new Error("投資Dashboard前日比率計算失敗");
  }

  if (
    normalizeInvestmentSymbol_("3311187", "fund") !== "03311187"
  ) {
    throw new Error("投信価格シンボルの先頭0復元失敗");
  }

  if (
    normalizeInvestmentSymbol_("7203.T", "stock") !== "7203.T"
  ) {
    throw new Error("株式価格シンボルの正規化失敗");
  }

  const fundQuote = parseYahooJapanFundHistoryQuote_(
    "<table><tr><td>2026年9月7日</td><td>44,308</td>" +
      "<td>-84</td><td>12,715,941</td></tr></table>",
    "03311187",
  );
  if (
    fundQuote.currentPrice !== 44308 ||
    fundQuote.previousClose !== 44392 ||
    fundQuote.priceChange !== -84
  ) {
    throw new Error("Yahoo!投信時系列パーサー失敗");
  }

  const kabumapQuote = parseKabumapFundQuote_(
    "<table>" +
      "<tr><th>コード</th><td>03311187</td></tr>" +
      "<tr><th>適用日</th><td>2026/09/04</td></tr>" +
      "<tr><th>基準価額</th><td>44,392円</td></tr>" +
    "</table>",
    "03311187",
  );
  if (
    kabumapQuote.currentPrice !== 44392 ||
    kabumapQuote.priceDate !== "2026-09-04"
  ) {
    throw new Error("株マップ投信パーサー失敗");
  }

  return {
    assertions: "PASS",
    metrics,
  };
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
