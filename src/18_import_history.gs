

// ============================================================
// Import History
// ============================================================

const R1_IMPORT_HISTORY_COLUMNS = Object.freeze([
  "import_batch", "imported_at", "csv_type", "config_name", "account_name",
  "file_name", "target_year_month", "period_start", "period_end", "row_count",
  "added_count", "skipped_count", "ignored_count", "status", "billing_year_months",
  "file_hash", "duplicate_status", "existing_count", "new_count"
]);

function ensureR1ImportHistoryColumns_() {
  const sheet = getRequiredSheet(SHEETS.IMPORT_HISTORY);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map((value) => String(value || "").trim());
  const existing = new Set(headers.filter(Boolean));
  let nextColumn = headers.length + 1;
  for (const name of R1_IMPORT_HISTORY_COLUMNS) {
    if (!existing.has(name)) {
      sheet.getRange(1, nextColumn++).setValue(name);
    }
  }
  clearTableCache(SHEETS.IMPORT_HISTORY);
  return sheet;
}

function addImportHistory_(data) {
  const sheet = ensureR1ImportHistoryColumns_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map((value) => String(value || "").trim());
  const record = {
    import_batch: String(data.importBatch || ""), imported_at: data.importedAt || new Date(),
    csv_type: String(data.csvType || ""), config_name: String(data.configName || ""),
    account_name: String(data.accountName || ""), file_name: String(data.fileName || ""),
    target_year_month: String(data.targetYearMonth || ""), period_start: String(data.periodStart || ""),
    period_end: String(data.periodEnd || ""), row_count: Number(data.rowCount || 0),
    added_count: Number(data.addedCount || 0), skipped_count: Number(data.skippedCount || 0),
    ignored_count: Number(data.ignoredCount || 0), status: String(data.status || "completed"),
    billing_year_months: String((data.billingYearMonths || []).join(",")),
    file_hash: String(data.fileHash || ""), duplicate_status: String(data.duplicateStatus || ""),
    existing_count: Number(data.existingCount || 0), new_count: Number(data.newCount || 0),
  };
  const row = headers.map((header) => Object.prototype.hasOwnProperty.call(record, header) ? record[header] : "");
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  clearTableCache(SHEETS.IMPORT_HISTORY);
}

function sha256HexText_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text || ""), Utilities.Charset.UTF_8);
  return bytes.map((b) => (b < 0 ? b + 256 : b).toString(16).padStart(2, "0")).join("");
}

function findImportHistoryByHash_(fileHash) {
  const hash = String(fileHash || "").trim();
  if (!hash) return [];
  return loadObjects(SHEETS.IMPORT_HISTORY).filter((row) => String(row.file_hash || "").trim() === hash);
}

function migrateR1ImportAudit() {
  const sheet = ensureR1ImportHistoryColumns_();
  return { ok: true, sheet: sheet.getName(), columns: R1_IMPORT_HISTORY_COLUMNS.length };
}

function verifyR1ImportAudit() {
  const sheet = ensureR1ImportHistoryColumns_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((v) => String(v || "").trim());
  const missing = R1_IMPORT_HISTORY_COLUMNS.filter((name) => !headers.includes(name));
  if (missing.length) throw new Error("R1 ImportHistory列不足: " + missing.join(", "));
  if (typeof previewCsvImportFromApp_ !== "function") throw new Error("previewCsvImportFromApp_ がありません");
  return { ok: true, columns: R1_IMPORT_HISTORY_COLUMNS.length };
}

function getImportPeriod_(rows, config) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      targetYearMonth: "",
      periodStart: "",
      periodEnd: "",
    };
  }

  const dateHeader = String(config.date_header || "").trim();

  const dates = [];

  for (const row of rows) {
    let rawDate = "";

    if (dateHeader && row[dateHeader] !== undefined) {
      rawDate = row[dateHeader];
    } else {
      const keys = Object.keys(row);

      const dateKey = keys[Number(config.date_col) - 1];

      rawDate = row[dateKey];
    }

    const normalizedDate = normalizeImportDate_(rawDate);

    if (normalizedDate) {
      dates.push(normalizedDate);
    }
  }

  if (dates.length === 0) {
    return {
      targetYearMonth: "",
      periodStart: "",
      periodEnd: "",
    };
  }

  dates.sort();

  const periodStart = dates[0];
  const periodEnd = dates[dates.length - 1];

  // 現状は「最後に利用があった月」を代表月として扱う
  const targetYearMonth = periodEnd.substring(0, 7);

  return {
    targetYearMonth,
    periodStart,
    periodEnd,
  };
}

function normalizeImportDate_(value) {
  if (!value) {
    return "";
  }

  // Google Sheetsから取得したDate型
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return "";
    }

    return Utilities.formatDate(value, "Asia/Tokyo", "yyyy-MM-dd");
  }

  const text = String(value).normalize("NFKC").trim();

  if (!text) {
    return "";
  }

  // yyyy/MM/dd または yyyy-MM-dd
  const match = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);

  if (match) {
    const year = match[1];

    const month = String(Number(match[2])).padStart(2, "0");

    const day = String(Number(match[3])).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  // その他Dateとして解釈可能な形式の保険
  const parsed = new Date(text);

  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, "Asia/Tokyo", "yyyy-MM-dd");
  }

  return "";
}

function getImportHistoryData_(options = {}) {
  const requestedLimit = Number(options.limit || 50);
  const limit = Math.min(Math.max(requestedLimit, 1), 200);

  const rows = loadObjects(SHEETS.IMPORT_HISTORY);

  const items = rows
    .filter((row) => String(row.import_batch || "").trim())
    .map((row) => ({
      importBatch: String(row.import_batch || "").trim(),

      importedAt: formatApiDateTime_(row.imported_at),

      csvType: String(row.csv_type || "").trim(),

      configName: String(row.config_name || "").trim(),

      accountName: String(row.account_name || "").trim(),

      fileName: String(row.file_name || "").trim(),

      targetYearMonth: normalizeYearMonth(row.target_year_month),

      periodStart: formatApiDate_(row.period_start),

      periodEnd: formatApiDate_(row.period_end),

      rowCount: Number(row.row_count || 0),

      addedCount: Number(row.added_count || 0),

      skippedCount: Number(row.skipped_count || 0),

      ignoredCount: Number(row.ignored_count || 0),

      billingYearMonths: (() => {
        const value = row.billing_year_months;

        if (!value) {
          return [];
        }

        // Sheetsが「2026-07」を日付として保持している場合
        if (value instanceof Date) {
          const normalized = normalizeYearMonth(value);

          return normalized ? [normalized] : [];
        }

        // 複数月 "2026-07,2026-08" の場合
        return String(value)
          .split(",")
          .map((item) => normalizeYearMonth(item.trim()))
          .filter((item) => /^\d{4}-\d{2}$/.test(item));
      })(),

      status: String(row.status || "").trim(),

      fileHash: String(row.file_hash || "").trim(),
      duplicateStatus: String(row.duplicate_status || "").trim(),
      existingCount: Number(row.existing_count || 0),
      newCount: Number(row.new_count || 0),
    }))
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    .slice(0, limit);
  const configs = loadObjects(SHEETS.IMPORT_CONFIG)
    .filter((row) => {
      const active = String(row.active === undefined ? "1" : row.active)
        .trim()
        .toUpperCase();

      return active === "1" || active === "TRUE";
    })
    .map((row) => ({
      configName: String(row.config_name || "").trim(),

      accountName: String(row.account_name || "").trim(),

      sourceType: String(row.source_type || "").trim(),
    }))
    .filter((row) => row.configName && row.accountName);
  return {
    items,
    total: rows.length,
    configs,
  };
}

function formatApiDateTime_(value) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (isNaN(date.getTime())) {
    return "";
  }

  return Utilities.formatDate(date, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss");
}

