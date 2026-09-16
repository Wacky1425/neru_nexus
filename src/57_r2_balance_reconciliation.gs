// ============================================================
// Neru Nexus R2 - opening balance & balance reconciliation
// ============================================================

const R2_BALANCE_RECONCILIATION_HEADERS_ = Object.freeze([
  "reconciliation_id",
  "checked_at",
  "as_of_date",
  "account_id",
  "account_name",
  "calculated_balance",
  "actual_balance",
  "difference",
  "matched",
  "note",
]);

function ensureR2BalanceReconciliationSheet_() {
  let sheet = SS.getSheetByName(SHEETS.BALANCE_RECONCILIATION);
  if (!sheet) {
    sheet = SS.insertSheet(SHEETS.BALANCE_RECONCILIATION);
  }

  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const firstRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const existing = firstRow.map((value) => String(value || "").trim());
  const hasAnyHeader = existing.some((value) => value !== "");

  if (!hasAnyHeader) {
    sheet
      .getRange(1, 1, 1, R2_BALANCE_RECONCILIATION_HEADERS_.length)
      .setValues([R2_BALANCE_RECONCILIATION_HEADERS_]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const missing = R2_BALANCE_RECONCILIATION_HEADERS_.filter(
    (header) => !existing.includes(header),
  );

  if (missing.length > 0) {
    sheet
      .getRange(1, sheet.getLastColumn() + 1, 1, missing.length)
      .setValues([missing]);
  }

  sheet.setFrozenRows(1);
  return sheet;
}

function migrateR2BalanceReconciliation() {
  const sheet = ensureR2BalanceReconciliationSheet_();
  clearTableCache(SHEETS.BALANCE_RECONCILIATION);

  const result = {
    ready: true,
    sheetName: sheet.getName(),
    headers: R2_BALANCE_RECONCILIATION_HEADERS_,
    message:
      "R2残高照合基盤を作成しました。開始残高は自動変更していません。",
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyR2BalanceReconciliation() {
  const sheet = SS.getSheetByName(SHEETS.BALANCE_RECONCILIATION);
  if (!sheet) {
    return {
      ready: false,
        missingSheet: true,
      missingColumns: [...R2_BALANCE_RECONCILIATION_HEADERS_],
    };
  }

  const values = sheet.getDataRange().getValues();
  const headers = values.length > 0
    ? values[0].map((value) => String(value || "").trim())
    : [];
  const missingColumns = R2_BALANCE_RECONCILIATION_HEADERS_.filter(
    (header) => !headers.includes(header),
  );

  const accountData = getAccountsData_();
  const trackedAccounts = (accountData.items || []).filter(
    (account) => account.active !== false && (account.isAsset || account.isLiability),
  );
  const baselineReadyCount = trackedAccounts.filter(
    (account) => String(account.openingBalanceDate || "").trim() !== "",
  ).length;

  return {
    ready: missingColumns.length === 0,
    missingColumns,
    trackedAccountCount: trackedAccounts.length,
    baselineReadyCount,
    baselinePendingCount: trackedAccounts.length - baselineReadyCount,
    reconciliationCount: Math.max(0, values.length - 1),
  };
}

function getLatestR2ReconciliationByAccount_() {
  const sheet = SS.getSheetByName(SHEETS.BALANCE_RECONCILIATION);
  const result = new Map();
  if (!sheet || sheet.getLastRow() < 2) return result;

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map((value) => String(value || "").trim());
  const index = createHeaderIndex(headers);
  assertRequiredColumns(
    index,
    R2_BALANCE_RECONCILIATION_HEADERS_,
    SHEETS.BALANCE_RECONCILIATION,
  );

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const accountId = String(row[index["account_id"]] || "").trim();
    if (!accountId) continue;

    const checkedAtValue = row[index["checked_at"]];
    const checkedAt = checkedAtValue instanceof Date
      ? checkedAtValue.getTime()
      : new Date(checkedAtValue).getTime();
    const sortValue = Number.isFinite(checkedAt) ? checkedAt : i;
    const previous = result.get(accountId);
    if (previous && previous._sortValue > sortValue) continue;

    result.set(accountId, {
      reconciliationId: String(row[index["reconciliation_id"]] || "").trim(),
      checkedAt: formatR2ApiDateTime_(checkedAtValue),
      asOfDate: formatApiDate_(row[index["as_of_date"]]),
      calculatedBalance: Number(row[index["calculated_balance"]] || 0),
      actualBalance: Number(row[index["actual_balance"]] || 0),
      difference: Number(row[index["difference"]] || 0),
      matched:
        row[index["matched"]] === true ||
        Number(row[index["matched"]] || 0) === 1 ||
        String(row[index["matched"]] || "").toLowerCase() === "true",
      note: String(row[index["note"]] || "").trim(),
      _sortValue: sortValue,
    });
  }

  return result;
}

function formatR2ApiDateTime_(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const text = String(value || "").trim();
  if (!text) return "";
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function getR2BalanceReconciliationData_() {
  const balances = getAccountBalancesData_();
  const latestMap = getLatestR2ReconciliationByAccount_();
  const items = (balances.items || [])
    .filter((account) => account.isAsset || account.isLiability)
    .map((account) => {
      const latest = latestMap.get(String(account.accountId || "")) || null;
      const openingBalanceDate = String(account.openingBalanceDate || "").trim();
      const baselineReady = openingBalanceDate !== "";

      return {
        accountId: account.accountId,
        accountName: account.accountName,
        isAsset: account.isAsset === true,
        isLiability: account.isLiability === true,
        assetType: account.assetType || "",
        baselineDate: openingBalanceDate,
        openingBalance: Number(account.openingBalance || 0),
        openingBalanceDate,
        baselineReady,
        calculatedBalance: Number(account.currentBalance || 0),
        latestReconciliation: latest,
      };
    });

  const baselineReadyCount = items.filter((item) => item.baselineReady).length;
  const checkedCount = items.filter((item) => item.latestReconciliation).length;
  const matchedCount = items.filter(
    (item) => item.latestReconciliation && item.latestReconciliation.matched,
  ).length;
  const mismatchCount = items.filter(
    (item) => item.latestReconciliation && !item.latestReconciliation.matched,
  ).length;

  return {
    items,
    totalCount: items.length,
    baselineReadyCount,
    baselinePendingCount: items.length - baselineReadyCount,
    checkedCount,
    uncheckedCount: items.length - checkedCount,
    matchedCount,
    mismatchCount,
    generatedAt: new Date().toISOString(),
  };
}

function saveR2BalanceReconciliationFromApp_(data) {
  const accountId = String(data.accountId || "").trim();
  const actualBalance = Number(data.actualBalance);
  const asOfDate = String(data.asOfDate || "").trim() || formatApiDate_(new Date());
  const note = String(data.note || "").trim();

  if (!accountId) throw new Error("accountIdは必須です");
  if (!Number.isFinite(actualBalance)) throw new Error("actualBalanceが不正です");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    throw new Error("asOfDateはYYYY-MM-DDで指定してください");
  }

  const balances = getAccountBalancesData_();
  const account = (balances.items || []).find(
    (item) => String(item.accountId || "") === accountId,
  );
  if (!account) throw new Error("対象の口座が見つかりません");
  if (!String(account.openingBalanceDate || "").trim()) {
    throw new Error("先に口座設定で基準日・基準残高を設定してください");
  }

  const calculatedBalance = Number(account.currentBalance || 0);
  const difference = actualBalance - calculatedBalance;
  const matched = difference === 0;
  const checkedAt = new Date();
  const reconciliationId =
    "balrec_" + Utilities.getUuid().replace(/-/g, "").slice(0, 18);

  const sheet = ensureR2BalanceReconciliationSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map((value) => String(value || "").trim());
  const index = createHeaderIndex(headers);
  const row = new Array(headers.length).fill("");

  row[index["reconciliation_id"]] = reconciliationId;
  row[index["checked_at"]] = checkedAt;
  row[index["as_of_date"]] = asOfDate;
  row[index["account_id"]] = accountId;
  row[index["account_name"]] = account.accountName;
  row[index["calculated_balance"]] = calculatedBalance;
  row[index["actual_balance"]] = actualBalance;
  row[index["difference"]] = difference;
  row[index["matched"]] = matched ? 1 : 0;
  row[index["note"]] = note;
  sheet.appendRow(row);

  clearTableCache(SHEETS.BALANCE_RECONCILIATION);

  return createJsonResponse_(
    {
      saved: true,
      reconciliationId,
      accountId,
      accountName: account.accountName,
      checkedAt: checkedAt.toISOString(),
      asOfDate,
      calculatedBalance,
      actualBalance,
      difference,
      matched,
      note,
    },
    "ok",
  );
}
