// ============================================================
// Ver.1 System / Release Hardening
// ============================================================

const NERU_BACKUP_FOLDER_NAME = "Neru Nexus Backups";
const NERU_BACKUP_RETENTION_COUNT = 30;
const NERU_ERROR_LOG_HEADERS = Object.freeze([
  "logged_at",
  "request_id",
  "method",
  "action",
  "message",
  "stack",
]);

function ensureSystemSheet_(sheetName, headers) {
  let sheet = SS.getSheetByName(sheetName);
  if (!sheet) {
    sheet = SS.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  const currentHeaders = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length))
    .getValues()[0]
    .map((value) => String(value || "").trim());

  for (let i = 0; i < headers.length; i++) {
    if (!currentHeaders[i]) {
      sheet.getRange(1, i + 1).setValue(headers[i]);
    }
  }

  return sheet;
}

function createRequestId_() {
  return Utilities.getUuid().replace(/-/g, "").substring(0, 16);
}

function logApiError_(info) {
  try {
    const sheet = ensureSystemSheet_(SHEETS.ERROR_LOG, NERU_ERROR_LOG_HEADERS);
    const error = info && info.error ? info.error : info;
    const row = [
      new Date(),
      String((info && info.requestId) || ""),
      String((info && info.method) || ""),
      String((info && info.action) || ""),
      String(error && error.message ? error.message : error || "不明なエラー"),
      String(error && error.stack ? error.stack : ""),
    ];
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  } catch (loggingError) {
    console.error("Error log write failed", loggingError);
  }
}

function getRecentErrorLogs_(limit) {
  const sheet = SS.getSheetByName(SHEETS.ERROR_LOG);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const count = Math.min(Math.max(Number(limit || 10), 1), 50);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map((v) => String(v || "").trim());
  const idx = createHeaderIndex(headers);

  return values
    .slice(1)
    .filter((row) => row[idx.logged_at])
    .slice(-count)
    .reverse()
    .map((row) => ({
      loggedAt: formatApiDateTime_(row[idx.logged_at]),
      requestId: String(row[idx.request_id] || ""),
      method: String(row[idx.method] || ""),
      action: String(row[idx.action] || ""),
      message: String(row[idx.message] || ""),
    }));
}

function getOrCreateBackupFolder_() {
  const folders = DriveApp.getFoldersByName(NERU_BACKUP_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(NERU_BACKUP_FOLDER_NAME);
}

function createNeruNexusBackup_() {
  const folder = getOrCreateBackupFolder_();
  const source = DriveApp.getFileById(SS.getId());
  const timestamp = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd_HHmmss");
  const backupName = `Neru_Nexus_Backup_${timestamp}`;
  const copy = source.makeCopy(backupName, folder);

  pruneOldNeruNexusBackups_(folder);

  return {
    fileId: copy.getId(),
    fileName: copy.getName(),
    fileUrl: copy.getUrl(),
    createdAt: new Date().toISOString(),
  };
}

function createNeruNexusBackupFromApp_() {
  return createJsonResponse_(createNeruNexusBackup_(), "ok");
}

function pruneOldNeruNexusBackups_(folder) {
  const files = [];
  const iterator = folder.getFiles();
  while (iterator.hasNext()) {
    const file = iterator.next();
    if (file.getName().startsWith("Neru_Nexus_Backup_")) files.push(file);
  }

  files.sort((a, b) => b.getDateCreated().getTime() - a.getDateCreated().getTime());
  for (let i = NERU_BACKUP_RETENTION_COUNT; i < files.length; i++) {
    files[i].setTrashed(true);
  }
}

function getLatestBackupInfo_() {
  const folders = DriveApp.getFoldersByName(NERU_BACKUP_FOLDER_NAME);
  if (!folders.hasNext()) return null;

  const folder = folders.next();
  const iterator = folder.getFiles();
  let latest = null;
  while (iterator.hasNext()) {
    const file = iterator.next();
    if (!file.getName().startsWith("Neru_Nexus_Backup_")) continue;
    if (!latest || file.getDateCreated().getTime() > latest.getDateCreated().getTime()) {
      latest = file;
    }
  }

  if (!latest) return null;
  return {
    fileName: latest.getName(),
    fileUrl: latest.getUrl(),
    createdAt: latest.getDateCreated().toISOString(),
  };
}

function setupDailyNeruNexusBackupTrigger_() {
  const functionName = "scheduledNeruNexusBackup";
  const exists = ScriptApp.getProjectTriggers().some(
    (trigger) => trigger.getHandlerFunction() === functionName,
  );

  if (!exists) {
    ScriptApp.newTrigger(functionName).timeBased().everyDays(1).atHour(3).create();
  }

  return { installed: true, alreadyExisted: exists };
}

function scheduledNeruNexusBackup() {
  return createNeruNexusBackup_();
}

function runDataIntegrityCheck_() {
  const errors = [];
  const warnings = [];
  const checks = [];

  function pass(name, detail) {
    checks.push({ name, ok: true, detail: String(detail || "OK") });
  }
  function fail(name, detail) {
    checks.push({ name, ok: false, detail: String(detail || "NG") });
    errors.push(`${name}: ${detail}`);
  }
  function warn(name, detail) {
    warnings.push(`${name}: ${detail}`);
  }

  const requiredSheets = [
    SHEETS.TRANSACTIONS,
    SHEETS.CATEGORIES,
    SHEETS.ACCOUNTS,
    SHEETS.IMPORT_CONFIG,
    SHEETS.IMPORT_HISTORY,
  ];

  const missingSheets = requiredSheets.filter((name) => !SS.getSheetByName(name));
  if (missingSheets.length === 0) pass("required_sheets", `${requiredSheets.length} sheets`);
  else fail("required_sheets", `missing: ${missingSheets.join(", ")}`);

  if (missingSheets.includes(SHEETS.TRANSACTIONS)) {
    return { ok: false, errors, warnings, checks, generatedAt: new Date().toISOString() };
  }

  const tx = loadTable(SHEETS.TRANSACTIONS);
  const requiredTxColumns = [
    "id", "transaction_date", "type", "amount", "account_name",
    "major_category", "sub_category", "status", "source_type",
  ];
  const missingColumns = requiredTxColumns.filter((name) => tx.index[name] === undefined);
  if (missingColumns.length === 0) pass("transaction_columns", `${requiredTxColumns.length} columns`);
  else fail("transaction_columns", `missing: ${missingColumns.join(", ")}`);

  const idCounts = new Map();
  let invalidAmountCount = 0;
  let invalidDateCount = 0;
  for (const row of tx.rows) {
    const id = getString(row, tx.index, "id");
    if (id) idCounts.set(id, (idCounts.get(id) || 0) + 1);

    const type = getString(row, tx.index, "type");
    const amount = Number(row[tx.index.amount]);
    if ((type === "支出" || type === "収入") && (!Number.isFinite(amount) || amount <= 0)) {
      invalidAmountCount++;
    }

    const dateText = formatApiDate_(row[tx.index.transaction_date]);
    if (!dateText) invalidDateCount++;
  }

  const duplicateIds = [...idCounts.entries()].filter(([, count]) => count > 1);
  if (duplicateIds.length === 0) pass("transaction_ids", `${idCounts.size} unique ids`);
  else fail("transaction_ids", `${duplicateIds.length} duplicate ids`);

  if (invalidAmountCount === 0) pass("transaction_amounts", "all valid");
  else fail("transaction_amounts", `${invalidAmountCount} invalid amounts`);

  if (invalidDateCount === 0) pass("transaction_dates", "all valid");
  else fail("transaction_dates", `${invalidDateCount} invalid dates`);

  if (!missingSheets.includes(SHEETS.ACCOUNTS)) {
    const accountRows = loadObjects(SHEETS.ACCOUNTS);
    const validAccounts = new Set(
      accountRows.map((row) => String(row.account_name || "").trim()).filter(Boolean),
    );
    const unknownAccounts = new Set();
    for (const row of tx.rows) {
      const accountName = getString(row, tx.index, "account_name");
      if (accountName && !validAccounts.has(accountName)) unknownAccounts.add(accountName);
    }
    if (unknownAccounts.size === 0) pass("transaction_accounts", `${validAccounts.size} master accounts`);
    else fail("transaction_accounts", `unknown: ${[...unknownAccounts].join(", ")}`);
  }

  if (!missingSheets.includes(SHEETS.IMPORT_HISTORY)) {
    const histories = loadObjects(SHEETS.IMPORT_HISTORY);
    const batchCounts = new Map();
    for (const row of histories) {
      const batch = String(row.import_batch || "").trim();
      if (batch) batchCounts.set(batch, (batchCounts.get(batch) || 0) + 1);
    }
    const duplicateBatches = [...batchCounts.entries()].filter(([, count]) => count > 1);
    if (duplicateBatches.length === 0) pass("import_batches", `${batchCounts.size} unique batches`);
    else warn("import_batches", `${duplicateBatches.length} duplicate batch ids`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checks,
    generatedAt: new Date().toISOString(),
  };
}

function getSystemDiagnostics_() {
  const integrity = runDataIntegrityCheck_();
  return {
    apiVersion: NERU_API_VERSION,
    service: "Neru Nexus API",
    spreadsheetName: SS.getName(),
    integrity,
    latestBackup: getLatestBackupInfo_(),
    recentErrors: getRecentErrorLogs_(10),
    generatedAt: new Date().toISOString(),
  };
}

function runReleaseChecks() {
  const regression = runRegressionTests();
  const integrity = runDataIntegrityCheck_();
  if (!integrity.ok) {
    throw new Error(`データ整合性checkに失敗しました: ${integrity.errors.join(" / ")}`);
  }
  const backupTrigger = setupDailyNeruNexusBackupTrigger_();
  const assetSnapshotTrigger = installDailyAssetSnapshotTrigger_();
  const gmailEvidenceTrigger = installDailyGmailEvidenceTrigger_();
  const sbiInvestmentTrigger = installDailySbiInvestmentTrigger_();
  const result = {
    apiVersion: NERU_API_VERSION,
    regression,
    integrity,
    backupTrigger,
    assetSnapshotTrigger,
    gmailEvidenceTrigger,
    sbiInvestmentTrigger,
    checkedAt: new Date().toISOString(),
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
