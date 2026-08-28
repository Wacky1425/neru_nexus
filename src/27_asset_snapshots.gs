// ============================================================
// V1.1 - Asset snapshots / trend
// ============================================================

const ASSET_SNAPSHOT_HEADERS_ = Object.freeze([
  "snapshot_date",
  "year_month",
  "total_assets",
  "total_liabilities",
  "net_assets",
  "liquid_assets",
  "investment_assets",
  "other_assets",
  "created_at",
]);

function ensureAssetSnapshotSheet_() {
  let sheet = SS.getSheetByName(SHEETS.ASSET_SNAPSHOTS);
  if (!sheet) {
    sheet = SS.insertSheet(SHEETS.ASSET_SNAPSHOTS);
  }

  const lastColumn = Math.max(sheet.getLastColumn(), ASSET_SNAPSHOT_HEADERS_.length);
  const existing =
    sheet.getLastRow() > 0
      ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
      : [];
  const index = createHeaderIndex(existing);

  const needsHeader = ASSET_SNAPSHOT_HEADERS_.some(
    (header) => index[header] === undefined,
  );

  if (needsHeader) {
    const existingObjects =
      existing.length > 0 && existing.some((value) => String(value || "").trim())
        ? tableValuesToObjects(sheet.getDataRange().getValues())
        : [];

    sheet.clearContents();
    sheet
      .getRange(1, 1, 1, ASSET_SNAPSHOT_HEADERS_.length)
      .setValues([ASSET_SNAPSHOT_HEADERS_]);

    if (existingObjects.length > 0) {
      const rows = existingObjects.map((item) =>
        ASSET_SNAPSHOT_HEADERS_.map((header) => item[header] ?? ""),
      );
      sheet
        .getRange(2, 1, rows.length, ASSET_SNAPSHOT_HEADERS_.length)
        .setValues(rows);
    }
  }

  clearTableCache(SHEETS.ASSET_SNAPSHOTS);
  return sheet;
}

function formatAssetSnapshotDate_(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (!match) return text;
  return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
}

function assetSnapshotNumber_(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function buildAssetSnapshotObject_(balance, snapshotDate, createdAt) {
  const dateText = formatAssetSnapshotDate_(snapshotDate || new Date());
  return {
    snapshotDate: dateText,
    yearMonth: dateText.slice(0, 7),
    totalAssets: assetSnapshotNumber_(balance.totalAssets),
    totalLiabilities: assetSnapshotNumber_(balance.totalLiabilities),
    netAssets: assetSnapshotNumber_(balance.netAssets),
    liquidAssets: assetSnapshotNumber_(balance.liquidAssets),
    investmentAssets: assetSnapshotNumber_(balance.investmentAssets),
    otherAssets: assetSnapshotNumber_(balance.otherAssets),
    createdAt:
      createdAt instanceof Date
        ? createdAt.toISOString()
        : String(createdAt || new Date().toISOString()),
  };
}

function upsertAssetSnapshot_(snapshot) {
  const sheet = ensureAssetSnapshotSheet_();
  const table = loadTable(SHEETS.ASSET_SNAPSHOTS);
  const dateColumn = table.index.snapshot_date;
  let rowNumber = -1;

  for (let i = table.rows.length - 1; i >= 0; i -= 1) {
    if (formatAssetSnapshotDate_(table.rows[i][dateColumn]) === snapshot.snapshotDate) {
      rowNumber = i + 2;
      break;
    }
  }

  const row = [
    snapshot.snapshotDate,
    snapshot.yearMonth,
    snapshot.totalAssets,
    snapshot.totalLiabilities,
    snapshot.netAssets,
    snapshot.liquidAssets,
    snapshot.investmentAssets,
    snapshot.otherAssets,
    snapshot.createdAt,
  ];

  if (rowNumber > 0) {
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  clearTableCache(SHEETS.ASSET_SNAPSHOTS);
  return snapshot;
}

function captureAssetSnapshot_() {
  // 投資価格は取得できる範囲で最新化する。
  // 一部銘柄の価格取得失敗でSnapshot全体を止めない。
  try {
    refreshInvestmentPrices_();
  } catch (error) {
    console.warn(`投資価格更新をスキップしてSnapshotを保存します: ${error}`);
  }

  clearAccountBalanceCache_();
  const balance = getAccountBalancesData();
  return upsertAssetSnapshot_(buildAssetSnapshotObject_(balance, new Date()));
}

function captureAssetSnapshotFromApp_() {
  return createJsonResponse_(captureAssetSnapshot_(), "ok");
}

function assetSnapshotRowToObject_(row, index) {
  return {
    snapshotDate: formatAssetSnapshotDate_(row[index.snapshot_date]),
    yearMonth: String(row[index.year_month] || "").trim(),
    totalAssets: assetSnapshotNumber_(row[index.total_assets]),
    totalLiabilities: assetSnapshotNumber_(row[index.total_liabilities]),
    netAssets: assetSnapshotNumber_(row[index.net_assets]),
    liquidAssets: assetSnapshotNumber_(row[index.liquid_assets]),
    investmentAssets: assetSnapshotNumber_(row[index.investment_assets]),
    otherAssets: assetSnapshotNumber_(row[index.other_assets]),
    createdAt:
      row[index.created_at] instanceof Date
        ? row[index.created_at].toISOString()
        : String(row[index.created_at] || ""),
  };
}

function getAssetTrendData_(options) {
  ensureAssetSnapshotSheet_();
  const table = loadTable(SHEETS.ASSET_SNAPSHOTS);
  assertRequiredColumns(
    table.index,
    ASSET_SNAPSHOT_HEADERS_,
    SHEETS.ASSET_SNAPSHOTS,
  );

  const months = Math.max(0, Number((options || {}).months || 12));
  let items = table.rows
    .filter((row) => formatAssetSnapshotDate_(row[table.index.snapshot_date]))
    .map((row) => assetSnapshotRowToObject_(row, table.index))
    .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));

  if (months > 0 && items.length > 0) {
    const latestDate = new Date(`${items[items.length - 1].snapshotDate}T00:00:00`);
    const cutoff = new Date(latestDate.getFullYear(), latestDate.getMonth() - months + 1, 1);
    items = items.filter((item) => new Date(`${item.snapshotDate}T00:00:00`) >= cutoff);
  }

  const latest = items.length > 0 ? items[items.length - 1] : null;
  const previous = items.length > 1 ? items[items.length - 2] : null;
  const netChange = latest && previous ? latest.netAssets - previous.netAssets : 0;
  const netChangeRate =
    previous && previous.netAssets !== 0
      ? netChange / Math.abs(previous.netAssets)
      : 0;

  return {
    items,
    latest,
    previous,
    netChange,
    netChangeRate,
    count: items.length,
  };
}

function installDailyAssetSnapshotTrigger_() {
  const handler = "captureAssetSnapshot_";
  const existing = ScriptApp.getProjectTriggers().some(
    (trigger) => trigger.getHandlerFunction() === handler,
  );
  if (existing) {
    return { installed: true, alreadyExisted: true };
  }

  ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(23).create();
  return { installed: true, alreadyExisted: false };
}

function testAssetSnapshotHelpers() {
  const snapshot = buildAssetSnapshotObject_(
    {
      totalAssets: 300000,
      totalLiabilities: 100000,
      netAssets: 200000,
      liquidAssets: 120000,
      investmentAssets: 170000,
      otherAssets: 10000,
    },
    "2026-08-28",
    "2026-08-28T12:00:00.000Z",
  );

  if (
    snapshot.yearMonth !== "2026-08" ||
    snapshot.netAssets !== 200000 ||
    snapshot.investmentAssets !== 170000
  ) {
    throw new Error(`asset snapshot helper不一致: ${JSON.stringify(snapshot)}`);
  }

  return { assertions: "PASS", snapshot };
}
