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


function getInvestmentAccountNameSet_() {
  const accounts = getAccountsData_().items || [];
  return new Set(
    accounts
      .filter(
        (item) =>
          item &&
          item.isAsset === true &&
          String(item.assetType || "").trim() === "investment",
      )
      .map((item) => resolveCanonicalAccountName_(item.accountName))
      .filter(Boolean),
  );
}

function getInvestmentContributionBetween_(startExclusive, endInclusive) {
  const startDate = formatAssetSnapshotDate_(startExclusive);
  const endDate = formatAssetSnapshotDate_(endInclusive);
  if (!startDate || !endDate || startDate >= endDate) return 0;

  const investmentAccounts = getInvestmentAccountNameSet_();
  if (investmentAccounts.size === 0) return 0;

  const table = loadTransactions();
  if (!table.rows.length) return 0;

  assertRequiredColumns(
    table.index,
    [
      "transaction_date",
      "type",
      "from_account",
      "to_account",
      "status",
    ],
    SHEETS.TRANSACTIONS,
  );

  let contribution = 0;

  for (const row of table.rows) {
    if (isIgnoredTransactionRow_(row, table.index)) continue;

    const type = getString(row, table.index, "type");
    if (type !== "移動" && type !== "振替") continue;

    const date = normalizeDuplicateDate_(
      row[table.index["transaction_date"]],
    );
    if (!date || date <= startDate || date > endDate) continue;

    const fromAccount = resolveCanonicalAccountName_(
      getString(row, table.index, "from_account"),
    );
    const toAccount = resolveCanonicalAccountName_(
      getString(row, table.index, "to_account"),
    );

    const fromInvestment = investmentAccounts.has(fromAccount);
    const toInvestment = investmentAccounts.has(toAccount);

    // Investment -> investment is only an internal rebalance.
    if (fromInvestment === toInvestment) continue;

    const amount = Math.abs(
      getNumber(row, table.index, "amount"),
    );
    if (!(amount > 0)) continue;

    if (toInvestment) contribution += amount;
    if (fromInvestment) contribution -= amount;
  }

  return Math.round(contribution);
}

function calculateInvestmentPerformancePeriod_(
  startInvestmentAssets,
  endInvestmentAssets,
  netContribution,
) {
  const startValue = assetSnapshotNumber_(startInvestmentAssets);
  const endValue = assetSnapshotNumber_(endInvestmentAssets);
  const contribution = assetSnapshotNumber_(netContribution);
  const investmentChange = endValue - startValue;
  const investmentReturn = investmentChange - contribution;

  // This is a deliberately simple approximation, not TWR/XIRR.
  const denominator =
    Math.abs(startValue) + Math.max(0, contribution);

  return {
    startInvestmentAssets: startValue,
    endInvestmentAssets: endValue,
    investmentChange,
    netContribution: contribution,
    investmentReturn,
    investmentReturnRate:
      denominator > 0 ? investmentReturn / denominator : 0,
  };
}

function buildInvestmentPerformanceTrend_(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      startInvestmentAssets: 0,
      endInvestmentAssets: 0,
      investmentChange: 0,
      netContribution: 0,
      investmentReturn: 0,
      investmentReturnRate: 0,
      comparable: false,
    };
  }

  if (items.length === 1) {
    return {
      startInvestmentAssets: items[0].investmentAssets,
      endInvestmentAssets: items[0].investmentAssets,
      investmentChange: 0,
      netContribution: 0,
      investmentReturn: 0,
      investmentReturnRate: 0,
      comparable: false,
    };
  }

  let netContribution = 0;
  for (let i = 1; i < items.length; i++) {
    const contribution = getInvestmentContributionBetween_(
      items[i - 1].snapshotDate,
      items[i].snapshotDate,
    );
    items[i].periodContribution = contribution;
    items[i].periodInvestmentReturn =
      items[i].investmentAssets -
      items[i - 1].investmentAssets -
      contribution;
    netContribution += contribution;
  }

  items[0].periodContribution = 0;
  items[0].periodInvestmentReturn = 0;

  return {
    ...calculateInvestmentPerformancePeriod_(
      items[0].investmentAssets,
      items[items.length - 1].investmentAssets,
      netContribution,
    ),
    comparable: true,
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

  const investmentPerformance = buildInvestmentPerformanceTrend_(items);

  return {
    items,
    latest,
    previous,
    netChange,
    netChangeRate,
    investmentPerformance,
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

  const performance = calculateInvestmentPerformancePeriod_(
    100000,
    135000,
    20000,
  );

  if (
    performance.investmentChange !== 35000 ||
    performance.netContribution !== 20000 ||
    performance.investmentReturn !== 15000
  ) {
    throw new Error(
      `investment performance helper不一致: ${JSON.stringify(performance)}`,
    );
  }

  return { assertions: "PASS", snapshot, performance };
}
