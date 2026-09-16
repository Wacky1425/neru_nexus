// ============================================================
// V2.1-4.2 Initial investment snapshot (2026-09-16)
// One-time/idempotent baseline registration from SBI holdings screen.
// Historical trades are NOT synthesized as events; future Gmail events build
// forward from this baseline.
// ============================================================

const V2142_SNAPSHOT_DATE_ = "2026-09-16";

function getV2142SbiInvestmentAccount_() {
  const accounts = getAccountsData_().items || [];
  const exact = accounts.find((a) =>
    a && a.isAsset && a.assetType === "investment" &&
    String(a.accountName || "").normalize("NFKC").includes("SBI証券")
  );
  if (exact) return exact;
  const fallback = accounts.find((a) => a && a.isAsset && a.assetType === "investment");
  if (!fallback) throw new Error("投資資産口座(SBI証券)が見つかりません");
  return fallback;
}

function v2142SnapshotDefinitions_() {
  return [
    {
      securityType: "stock", name: "三菱UFJフィナンシャル・グループ", symbol: "8306.T",
      quantity: 2, priceUnit: 1, averageCost: 3579, currentPrice: 3662,
      priceProvider: "yahoo",
      note: "2026-09-16 SBI保有画面を初期スナップショット化。8/26約定メールあり。"
    },
    {
      securityType: "stock", name: "ソフトバンク", symbol: "9434.T",
      quantity: 100, priceUnit: 1, averageCost: 240, currentPrice: 248.8,
      priceProvider: "yahoo",
      note: "2026-09-16 SBI保有画面を初期スナップショット化。8/26約定メールあり。"
    },
    {
      securityType: "fund", name: "eMAXIS Slim 米国株式（S&P500）", symbol: "03311187",
      quantity: 6673, priceUnit: 10000, averageCost: 44958, currentPrice: 43398,
      priceProvider: "yahoo",
      note: "2026-09-16 SBI保有画面を初期スナップショット化。取得金額30,000円。"
    },
    {
      securityType: "stock", name: "SPYM SPDR ポートフォリオ S&P500 ETF", symbol: "SPYM",
      quantity: 3, priceUnit: 1, averageCost: 14356, currentPrice: 13817,
      priceProvider: "manual",
      note: "2026-09-16 SBI外貨建商品画面を初期スナップショット化。取得単価90.01USD、現在値88.92USD。JPY換算はSBI画面の評価額41,451円/評価損益-1,617円を基準。FX対応まではmanual。"
    }
  ];
}

function findV2142HoldingRow_(table, def) {
  const targetSymbol = normalizeInvestmentSymbol_(def.symbol, def.securityType).toUpperCase();
  const targetName = normalizeHoldingMatchText_(def.name);
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const type = normalizeInvestmentSecurityType_(row[table.index["security_type"]]);
    const symbol = normalizeInvestmentSymbol_(row[table.index["symbol"]], type).toUpperCase();
    const name = normalizeHoldingMatchText_(row[table.index["name"]]);
    if ((targetSymbol && symbol === targetSymbol) || (targetName && name === targetName) ||
        (def.symbol === "03311187" && name.includes("s&p500"))) return i + 2;
  }
  return 0;
}

function writeV2142Holding_(table, sheetRow, accountId, def, isNew) {
  const now = new Date();
  const write = (header, value) => table.sheet.getRange(sheetRow, table.index[header] + 1).setValue(value);
  if (isNew) write("holding_id", Utilities.getUuid());
  write("account_id", accountId);
  write("security_type", def.securityType);
  write("name", def.name);
  const symbolRange = table.sheet.getRange(sheetRow, table.index["symbol"] + 1);
  symbolRange.setNumberFormat("@");
  symbolRange.setValue(def.symbol ? "'" + def.symbol : "");
  write("price_provider", def.priceProvider);
  write("quantity", def.quantity);
  write("price_unit", def.priceUnit);
  write("average_cost", def.averageCost);
  write("current_price", def.currentPrice);
  write("note", def.note);
  write("is_active", 1);
  write("updated_at", now);
  if (isNew) write("created_at", now);
}

function applyV2142InitialInvestmentSnapshot() {
  const account = getV2142SbiInvestmentAccount_();
  const defs = v2142SnapshotDefinitions_();
  let created = 0;
  let updated = 0;

  for (const def of defs) {
    const table = loadInvestmentHoldings_();
    const existingRow = findV2142HoldingRow_(table, def);
    const row = existingRow || table.sheet.getLastRow() + 1;
    writeV2142Holding_(table, row, account.accountId, def, !existingRow);
    if (existingRow) updated++; else created++;
  }
  clearTableCache(SHEETS.INVESTMENT_HOLDINGS);

  const result = verifyV2142InitialInvestmentSnapshot_();
  console.log(JSON.stringify({ created, updated, accountId: account.accountId, accountName: account.accountName, verification: result }, null, 2));
  return { created, updated, accountId: account.accountId, accountName: account.accountName, verification: result };
}

function verifyV2142InitialInvestmentSnapshot_() {
  const account = getV2142SbiInvestmentAccount_();
  const holdings = getInvestmentHoldingsData_().items || [];
  const defs = v2142SnapshotDefinitions_();
  const found = defs.map((def) => {
    const targetSymbol = normalizeInvestmentSymbol_(def.symbol, def.securityType).toUpperCase();
    const item = holdings.find((h) => String(h.symbol || "").toUpperCase() === targetSymbol) ||
      holdings.find((h) => normalizeHoldingMatchText_(h.name) === normalizeHoldingMatchText_(def.name));
    return {
      symbol: def.symbol,
      found: !!item,
      holdingId: item ? item.holdingId : "",
      accountId: item ? item.accountId : "",
      accountOk: !!item && item.accountId === account.accountId,
      quantity: item ? item.quantity : 0,
      quantityOk: !!item && Number(item.quantity) === Number(def.quantity),
      averageCost: item ? item.averageCost : 0,
      currentPrice: item ? item.currentPrice : 0,
      provider: item ? item.priceProvider : ""
    };
  });
  const ready = found.every((x) => x.found && x.accountOk && x.quantityOk);
  return { ready, snapshotDate: V2142_SNAPSHOT_DATE_, holdingCount: holdings.length, accountId: account.accountId, accountName: account.accountName, found };
}

function verifyV2142InitialInvestmentSnapshot() {
  const result = verifyV2142InitialInvestmentSnapshot_();
  console.log(JSON.stringify(result, null, 2));
  return result;
}
