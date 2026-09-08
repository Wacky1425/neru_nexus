// ============================================================
// Neru Nexus V2.0-5 - Backend / Persistence Boundary
//
// The current persistence driver is Google Spreadsheet.
// API handlers and domain logic should prefer the repository helpers below
// instead of assuming physical spreadsheet column positions.
//
// A future database backend can implement the same repository contract while
// API v2 + Flutter stay unchanged.
// ============================================================

const NERU_STORAGE_BACKEND = "spreadsheet";
const NERU_STORAGE_SCHEMA_VERSION = "2";

const NERU_BACKEND_REQUIRED_TABLES = Object.freeze([
  SHEETS.TRANSACTIONS,
  SHEETS.CATEGORIES,
  SHEETS.ACCOUNTS,
]);

function getBackendCapabilities_() {
  return {
    backend: NERU_STORAGE_BACKEND,
    schemaVersion: NERU_STORAGE_SCHEMA_VERSION,
    apiVersion: NERU_API_VERSION,
    identityModel: {
      transactionId: "id",
      categoryIds: ["major_category_id", "sub_category_id"],
      accountIds: ["account_id", "from_account_id", "to_account_id"],
    },
    repositoryContract: [
      "loadTable",
      "loadObjects",
      "findById",
      "appendObjects",
      "updateObjectByRow",
      "replaceDataRows",
    ],
    guarantees: {
      headerBasedReads: true,
      headerBasedWrites: true,
      physicalColumnOrderIndependentForRepositoryWrites: true,
      apiContractIndependentFromStorage: true,
      flutterContractIndependentFromStorage: true,
    },
  };
}

function objectToRowByHeaders_(headers, object, fallbackRow) {
  if (!Array.isArray(headers)) {
    throw new Error("headersは配列で指定してください");
  }

  const source = object || {};
  const fallback = Array.isArray(fallbackRow) ? fallbackRow : [];

  return headers.map((header, index) => {
    const key = String(header || "").trim();

    if (key && Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key];
    }

    return index < fallback.length ? fallback[index] : "";
  });
}

function repositoryLoadTable_(sheetName) {
  return loadTable(sheetName);
}

function repositoryLoadObjects_(sheetName) {
  const table = repositoryLoadTable_(sheetName);

  return table.rows.map((row) => rowToObject(table.headers, row));
}

function repositoryFindById_(sheetName, idColumn, idValue) {
  const table = repositoryLoadTable_(sheetName);
  const column = String(idColumn || "").trim();
  const value = String(idValue || "").trim();

  assertRequiredColumns(table.index, [column], sheetName);

  for (let i = 0; i < table.rows.length; i++) {
    if (String(table.rows[i][table.index[column]] || "").trim() === value) {
      return {
        rowNumber: i + 2,
        row: table.rows[i],
        object: rowToObject(table.headers, table.rows[i]),
        headers: table.headers,
        index: table.index,
      };
    }
  }

  return null;
}

function repositoryAppendObjects_(sheetName, objects) {
  if (!Array.isArray(objects) || objects.length === 0) {
    return 0;
  }

  const sheet = getRequiredSheet(sheetName);
  const table = repositoryLoadTable_(sheetName);
  const headers =
    table.headers.length > 0
      ? table.headers.map((value) => String(value || "").trim())
      : [];

  if (headers.length === 0) {
    throw new Error(`${sheetName}にヘッダーがありません`);
  }

  const rows = objects.map((object) =>
    objectToRowByHeaders_(headers, object),
  );

  sheet
    .getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length)
    .setValues(rows);

  clearTableCache(sheetName);
  return rows.length;
}

function repositoryUpdateObjectByRow_(sheetName, rowNumber, object) {
  const sheet = getRequiredSheet(sheetName);
  const table = repositoryLoadTable_(sheetName);

  if (rowNumber < 2) {
    throw new Error("更新対象行が不正です");
  }

  const currentRow = sheet
    .getRange(rowNumber, 1, 1, table.headers.length)
    .getValues()[0];

  const nextRow = objectToRowByHeaders_(
    table.headers,
    object,
    currentRow,
  );

  sheet
    .getRange(rowNumber, 1, 1, table.headers.length)
    .setValues([nextRow]);

  clearTableCache(sheetName);

  return nextRow;
}

function repositoryReplaceDataRows_(sheetName, objects) {
  const sheet = getRequiredSheet(sheetName);
  const table = repositoryLoadTable_(sheetName);
  const headers = table.headers.map((value) => String(value || "").trim());

  if (headers.length === 0) {
    throw new Error(`${sheetName}にヘッダーがありません`);
  }

  const rows = (objects || []).map((object) =>
    objectToRowByHeaders_(headers, object),
  );

  const existingRowCount = Math.max(sheet.getLastRow() - 1, 0);
  const clearCount = Math.max(existingRowCount, rows.length);

  if (clearCount > 0) {
    sheet.getRange(2, 1, clearCount, headers.length).clearContent();
  }

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  clearTableCache(sheetName);
  return rows.length;
}

function getBackendStatus_() {
  const tables = {};

  for (const sheetName of NERU_BACKEND_REQUIRED_TABLES) {
    const sheet = SS.getSheetByName(sheetName);

    tables[sheetName] = {
      exists: !!sheet,
      rowCount: sheet ? Math.max(sheet.getLastRow() - 1, 0) : 0,
      columnCount: sheet ? sheet.getLastColumn() : 0,
    };
  }

  return {
    ...getBackendCapabilities_(),
    tables,
    generatedAt: new Date().toISOString(),
  };
}

function verifyV205BackendBoundary() {
  const issues = [];

  if (NERU_STORAGE_BACKEND !== "spreadsheet") {
    issues.push(`unexpected backend: ${NERU_STORAGE_BACKEND}`);
  }

  for (const sheetName of NERU_BACKEND_REQUIRED_TABLES) {
    if (!SS.getSheetByName(sheetName)) {
      issues.push(`missing table: ${sheetName}`);
    }
  }

  if (SS.getSheetByName(SHEETS.TRANSACTIONS)) {
    const tx = repositoryLoadTable_(SHEETS.TRANSACTIONS);

    const requiredColumns = [
      "id",
      "major_category_id",
      "sub_category_id",
      "account_id",
      "from_account_id",
      "to_account_id",
    ];

    const missing = requiredColumns.filter(
      (column) => tx.index[column] === undefined,
    );

    if (missing.length > 0) {
      issues.push(`transaction identity columns missing: ${missing.join(",")}`);
    }
  }

  const reorderTestHeaders = ["b", "id", "a"];
  const reorderTestRow = objectToRowByHeaders_(
    reorderTestHeaders,
    { id: "tx_1", a: 10, b: 20 },
  );

  if (
    reorderTestRow[0] !== 20 ||
    reorderTestRow[1] !== "tx_1" ||
    reorderTestRow[2] !== 10
  ) {
    issues.push("header-based write mapping failed");
  }

  const preserveTest = objectToRowByHeaders_(
    ["id", "future_column", "amount"],
    { id: "tx_2", amount: 100 },
    ["old", "keep-me", 50],
  );

  if (preserveTest[1] !== "keep-me") {
    issues.push("unknown-column preservation failed");
  }

  const result = {
    ready: issues.length === 0,
    ...getBackendCapabilities_(),
    issues,
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testBackendRepositoryMapping_() {
  const headers = ["amount", "id", "note"];
  const row = objectToRowByHeaders_(
    headers,
    { id: "abc", amount: 1200, note: "ok" },
  );

  if (row[0] !== 1200 || row[1] !== "abc" || row[2] !== "ok") {
    throw new Error("repository header mapping failed");
  }

  const preserved = objectToRowByHeaders_(
    ["id", "future"],
    { id: "next" },
    ["old", "preserved"],
  );

  if (preserved[1] !== "preserved") {
    throw new Error("repository fallback preservation failed");
  }

  return {
    assertions: "PASS",
    backend: NERU_STORAGE_BACKEND,
  };
}
