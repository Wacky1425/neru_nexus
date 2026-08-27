

// ============================================================
// Gmail Status / User Operations
// ============================================================

function confirmPreliminaryTransactionFromApp_(data) {
  const id = String(data.id || "").trim();

  if (!id) {
    throw new Error("idは必須です");
  }

  const found = findTransactionById_(id);

  if (!found) {
    throw new Error("対象の取引が見つかりません");
  }

  assertRequiredColumns(
    found.index,
    ["id", "transaction_date", "source_type", "source_status"],
    SHEETS.TRANSACTIONS,
  );

  const row = found.row;
  const index = found.index;

  const sourceType = getString(row, index, "source_type");

  const sourceStatus = getString(row, index, "source_status");

  if (sourceType !== "Gmail_Olive" && sourceType !== "Gmail_SMBC") {
    throw new Error("Gmail速報以外の取引は手動確定できません");
  }

  if (sourceStatus !== "preliminary" && sourceStatus !== "preliminary_edited") {
    throw new Error("この取引は速報状態ではありません");
  }

  row[index["source_status"]] = "manual_confirmed";

  found.sheet.getRange(found.rowNumber, 1, 1, row.length).setValues([row]);

  clearTableCache(SHEETS.TRANSACTIONS);

  clearAccountBalanceCache_();

  clearHomeRecentTransactionsCache_();

  const yearMonth = normalizeYearMonth(row[index["transaction_date"]]);

  if (yearMonth) {
    markSummaryDirty_(yearMonth);
  }

  return createJsonResponse_(
    {
      confirmed: true,
      id,
      sourceStatus: "manual_confirmed",
    },
    "ok",
  );
}

function restoreIgnoredTransactionFromApp_(data) {
  const id = String(data.id || "").trim();

  if (!id) {
    throw new Error("idは必須です");
  }

  const found = findTransactionById_(id);

  if (!found) {
    throw new Error("対象の取引が見つかりません");
  }

  assertRequiredColumns(
    found.index,
    [
      "id",
      "transaction_date",
      "source_type",
      "source_status",
      "settlement_status",
      "settlement_id",
    ],
    SHEETS.TRANSACTIONS,
  );

  const row = found.row;
  const index = found.index;

  const sourceType = getString(row, index, "source_type");

  const sourceStatus = getString(row, index, "source_status");

  if (sourceType !== "Gmail_Olive" && sourceType !== "Gmail_SMBC") {
    throw new Error("Gmail速報以外の取引は復元できません");
  }

  if (sourceStatus !== "ignored") {
    throw new Error("この取引は除外済みではありません");
  }

  row[index["source_status"]] = "preliminary";

  // CSV突合によるignoredではなく、
  // ユーザー操作による除外を戻す想定なので
  // 照合情報もクリアする。
  row[index["settlement_status"]] = "";
  row[index["settlement_id"]] = "";

  found.sheet.getRange(found.rowNumber, 1, 1, row.length).setValues([row]);

  clearTableCache(SHEETS.TRANSACTIONS);

  clearAccountBalanceCache_();

  clearHomeRecentTransactionsCache_();

  const yearMonth = normalizeYearMonth(row[index["transaction_date"]]);

  if (yearMonth) {
    rebuildSummariesForMonth_(yearMonth);

    markSummaryDirty_(yearMonth);
  }

  return createJsonResponse_(
    {
      restored: true,
      id,
      sourceStatus: "preliminary",
    },
    "ok",
  );
}

function getIgnoredTransactionsData(options) {
  const settings = options || {};

  const requestedLimit = Number(settings.limit || 100);
  const requestedOffset = Number(settings.offset || 0);

  const limit = Math.min(Math.max(requestedLimit, 1), 200);
  const offset = Math.max(requestedOffset, 0);

  const table = loadTransactions();

  if (table.rows.length === 0) {
    return {
      items: [],
      total: 0,
      limit,
      offset,
      hasMore: false,
    };
  }

  assertRequiredColumns(
    table.index,
    [
      "id",
      "transaction_date",
      "recorded_at",
      "merchant",
      "item_name",
      "amount",
      "type",
      "major_category",
      "sub_category",
      "status",
      "wallet",
      "intent",
      "payment_method",
      "account_name",
      "raw_text",
      "note",
      "from_account",
      "to_account",
      "settlement_status",
      "settlement_id",
      "import_batch",
      "source_id",
      "source_status",
      "source_received_at",
    ],
    SHEETS.TRANSACTIONS,
  );

  const filteredRows = table.rows.filter((row) => {
    const sourceStatus = getString(row, table.index, "source_status");

    return sourceStatus === "ignored";
  });

  filteredRows.sort((a, b) => {
    const dateA = new Date(a[table.index["transaction_date"]]);

    const dateB = new Date(b[table.index["transaction_date"]]);

    const dateDifference = dateB.getTime() - dateA.getTime();

    if (dateDifference !== 0) {
      return dateDifference;
    }

    const recordedAtA = new Date(a[table.index["recorded_at"]]);

    const recordedAtB = new Date(b[table.index["recorded_at"]]);

    return recordedAtB.getTime() - recordedAtA.getTime();
  });

  const total = filteredRows.length;

  const items = filteredRows.slice(offset, offset + limit).map((row) => ({
    id: getString(row, table.index, "id"),

    transactionDate: formatApiDate_(row[table.index["transaction_date"]]),

    merchant: getString(row, table.index, "merchant"),

    itemName: getString(row, table.index, "item_name"),

    amount: getNumber(row, table.index, "amount"),

    type: getString(row, table.index, "type"),

    majorCategory: getString(row, table.index, "major_category"),

    subCategory: getString(row, table.index, "sub_category"),

    status: getString(row, table.index, "status"),

    wallet: getString(row, table.index, "wallet"),

    intent: getString(row, table.index, "intent"),

    paymentMethod: getString(row, table.index, "payment_method"),

    accountName: getString(row, table.index, "account_name"),

    rawText: getString(row, table.index, "raw_text"),

    note: getString(row, table.index, "note"),

    fromAccount: getString(row, table.index, "from_account"),

    toAccount: getString(row, table.index, "to_account"),

    settlementStatus: getString(row, table.index, "settlement_status"),

    settlementId: getString(row, table.index, "settlement_id"),

    importBatch: getString(row, table.index, "import_batch"),

    sourceId: getString(row, table.index, "source_id"),

    sourceStatus: getString(row, table.index, "source_status"),

    sourceReceivedAt: formatApiDateTime_(
      row[table.index["source_received_at"]],
    ),
  }));

  return {
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}

function saveGmailImportStatus_(status) {
  const properties = PropertiesService.getScriptProperties();

  const now = new Date();

  const payload = {
    ...status,

    updatedAt: Utilities.formatDate(now, "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss"),
  };

  properties.setProperty(
    GMAIL_IMPORT_STATUS_PROPERTY_KEY,
    JSON.stringify(payload),
  );

  return payload;
}

function getGmailImportStatus_() {
  const properties = PropertiesService.getScriptProperties();

  const value = properties.getProperty(GMAIL_IMPORT_STATUS_PROPERTY_KEY);

  if (!value) {
    return {
      hasStatus: false,
      status: "not_run",
      updatedAt: "",
      gmailFoundCount: 0,
      convertedCount: 0,
      skippedCount: 0,
      importCandidateCount: 0,
      oliveCount: 0,
      smbcCount: 0,
      addedCount: 0,
      errorMessage: "",
    };
  }

  try {
    const parsed = JSON.parse(value);

    return {
      hasStatus: true,
      status: String(parsed.status || ""),
      updatedAt: String(parsed.updatedAt || ""),
      gmailFoundCount: Number(parsed.gmailFoundCount || 0),
      convertedCount: Number(parsed.convertedCount || 0),
      skippedCount: Number(parsed.skippedCount || 0),
      importCandidateCount: Number(parsed.importCandidateCount || 0),
      oliveCount: Number(parsed.oliveCount || 0),
      smbcCount: Number(parsed.smbcCount || 0),
      addedCount: Number(parsed.addedCount || 0),
      errorMessage: String(parsed.errorMessage || ""),
    };
  } catch (error) {
    return {
      hasStatus: false,
      status: "invalid",
      updatedAt: "",
      gmailFoundCount: 0,
      convertedCount: 0,
      skippedCount: 0,
      importCandidateCount: 0,
      oliveCount: 0,
      smbcCount: 0,
      addedCount: 0,
      errorMessage: "保存済みステータスを読み込めませんでした",
    };
  }
}

// ============================================================
// Gmail Ignore Operation
// ============================================================

function ignoreTransactionFromApp_(data) {
  const id = String(data.id || "").trim();

  if (!id) {
    throw new Error("idは必須です");
  }

  const found = findTransactionById_(id);

  if (!found) {
    throw new Error("対象の取引が見つかりません");
  }

  assertRequiredColumns(
    found.index,
    ["id", "transaction_date", "source_type", "source_status"],
    SHEETS.TRANSACTIONS,
  );

  const row = found.row;
  const index = found.index;

  const sourceType = getString(row, index, "source_type");

  const sourceStatus = getString(row, index, "source_status");

  if (sourceType !== "Gmail_Olive" && sourceType !== "Gmail_SMBC") {
    throw new Error("Gmail速報以外の取引は除外できません");
  }

  if (sourceStatus !== "preliminary" && sourceStatus !== "preliminary_edited") {
    throw new Error("この取引は速報状態ではありません");
  }

  row[index["source_status"]] = "ignored";

  found.sheet.getRange(found.rowNumber, 1, 1, row.length).setValues([row]);

  clearTableCache(SHEETS.TRANSACTIONS);

  clearAccountBalanceCache_();

  clearHomeRecentTransactionsCache_();

  const yearMonth = normalizeYearMonth(row[index["transaction_date"]]);

  if (yearMonth) {
    rebuildSummariesForMonth_(yearMonth);

    markSummaryDirty_(yearMonth);
  }

  return createJsonResponse_(
    {
      ignored: true,
      id,
      sourceStatus: "ignored",
    },
    "ok",
  );
}

