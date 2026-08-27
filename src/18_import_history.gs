

// ============================================================
// Import History
// ============================================================

function addImportHistory_(data) {
  const sheet = getRequiredSheet(SHEETS.IMPORT_HISTORY);

  const row = [
    String(data.importBatch || ""),
    data.importedAt || new Date(),
    String(data.csvType || ""),
    String(data.configName || ""),
    String(data.accountName || ""),
    String(data.fileName || ""),
    String(data.targetYearMonth || ""),
    String(data.periodStart || ""),
    String(data.periodEnd || ""),
    Number(data.rowCount || 0),
    Number(data.addedCount || 0),
    Number(data.skippedCount || 0),
    Number(data.ignoredCount || 0),
    String(data.status || "completed"),
    String((data.billingYearMonths || []).join(",")),
  ];

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
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

