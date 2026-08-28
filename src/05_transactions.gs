/**
 * 対象月の取引金額を指定列ごとに集計する。
 *
 * @param {*} yearMonth 対象年月
 * @param {string} groupColumn 集計軸となる列名
 * @param {{
 *   type?: string,
 *   wallet?: string,
 *   skipBlank?: boolean
 * }=} options
 * @return {Array<Array<*>>} [[名称, 金額], ...]
 */
/**
 * 条件に一致するtransactionsの行を取得する。
 *
 * @param {{
 *   yearMonth?: string,
 *   type?: string,
 *   wallet?: string,
 *   intent?: string
 * }=} options
 * @param {{
 *   rows: Array<Array<*>>,
 *   index: Object<string, number>
 * }=} transactionTable
 * @return {{
 *   rows: Array<Array<*>>,
 *   index: Object<string, number>
 * }}
 */
function loadTransactions() {
  return loadTable(SHEETS.TRANSACTIONS);
}

function findTransactionById_(id) {
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];

  const index = createHeaderIndex(headers);

  if (index["id"] === undefined) {
    throw new Error("transactionsシートにid列がありません");
  }

  const idColumn = index["id"] + 1;

  const idRange = sheet.getRange(2, idColumn, lastRow - 1, 1);

  const cell = idRange.createTextFinder(id).matchEntireCell(true).findNext();

  if (!cell) {
    return null;
  }

  const rowNumber = cell.getRow();

  const row = sheet.getRange(rowNumber, 1, 1, lastColumn).getValues()[0];

  return {
    sheet,
    headers,
    index,
    row,
    rowNumber,
  };
}

function buildTransactionRow(tx, id, createdAt, yearMonth, duplicateKey) {
  const amount = Number(tx.amount || 0);
  const expenseRatio = Number(tx.expense_ratio || 0);

  return [
    id,
    tx.transaction_date || "",
    createdAt,
    yearMonth,
    tx.type || "",
    tx.source_type || "manual",
    tx.payment_method || "",
    tx.account_name || "",
    tx.merchant || "",
    tx.item_name || "",
    tx.raw_text || "",
    amount,
    tx.major_category || "",
    tx.sub_category || "",
    tx.purpose_type || "",
    expenseRatio,
    amount * expenseRatio,
    tx.note || "",
    tx.evidence_url || "",
    tx.original_image_url || "",
    tx.import_batch || "",
    duplicateKey,
    tx.status || "",
    tx.wallet || "生活",
    tx.intent || "その他",

    tx.from_account || "",
    tx.to_account || "",
    tx.settlement_status || "",
    tx.settlement_id || "",

    // Gmail速報など、元データの一意ID
    tx.source_id || "",

    // preliminary / confirmed / ignored / manual_confirmed
    tx.source_status || "",

    // 元データを受信した日時
    tx.source_received_at || "",
  ];
}

function resolveTransactionYearMonth(transactionDate, fallbackDate) {
  if (transactionDate) {
    const parsedDate = new Date(String(transactionDate).replace(/\./g, "/"));

    if (!isNaN(parsedDate.getTime())) {
      return Utilities.formatDate(parsedDate, "Asia/Tokyo", "yyyy-MM");
    }
  }

  return Utilities.formatDate(fallbackDate, "Asia/Tokyo", "yyyy-MM");
}

function buildDuplicateKey(tx) {
  const sourceType = String(tx.source_type || "")
    .normalize("NFKC")
    .trim();

  const accountName = resolveCanonicalAccountName_(
    String(tx.account_name || "").trim(),
  );

  const transactionDate = normalizeDuplicateDate_(tx.transaction_date);

  const amount = Number(tx.amount || 0);

  const merchant = normalizeMerchant(
    String(tx.merchant || "")
      .normalize("NFKC")
      .trim(),
  );

  return [sourceType, accountName, transactionDate, amount, merchant].join("|");
}

function normalizeDuplicateDate_(value) {
  if (!value) {
    return "";
  }

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

  // yyyy/MM/dd
  // yyyy-MM-dd
  // 月・日は1桁でも可
  const match = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);

  if (match) {
    const year = match[1];

    const month = String(Number(match[2])).padStart(2, "0");

    const day = String(Number(match[3])).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(text);

  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, "Asia/Tokyo", "yyyy-MM-dd");
  }

  return text;
}

function getExistingDuplicateKeyCounts() {
  const sheet = SS.getSheetByName(SHEETS.TRANSACTIONS);

  if (!sheet) {
    throw new Error(`${SHEETS.TRANSACTIONS}シートがありません`);
  }

  const values = sheet.getDataRange().getValues();

  const counts = new Map();

  if (values.length < 2) {
    return counts;
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    ["transaction_date", "source_type", "account_name", "amount", "merchant"],
    SHEETS.TRANSACTIONS,
  );

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const tx = {
      transaction_date: row[index["transaction_date"]],

      source_type: row[index["source_type"]],

      account_name: row[index["account_name"]],

      amount: row[index["amount"]],

      merchant: row[index["merchant"]],
    };

    // 保存済みduplicate_keyは信用せず、
    // 現在のルールで既存Transactionから再生成する。
    const key = buildDuplicateKey(tx);

    if (!key) {
      continue;
    }

    counts.set(key, Number(counts.get(key) || 0) + 1);
  }

  return counts;
}


function normalizeMerchant(merchant) {
  if (!merchant) return "";

  merchant = String(merchant).trim();
  merchant = merchant.normalize("NFKC");

  merchant = merchant.replace(/　/g, " ");
  merchant = merchant.replace(/^V\d+\s*/i, "");
  merchant = merchant.replace(/\s+/g, " ");

  const upper = merchant.toUpperCase();

  if (upper.includes("AMAZON")) return "Amazon";
  if (upper.includes("GOOGLE PLAY")) return "Google Play";
  if (upper.includes("APPLE COM BILL")) return "Apple";
  if (upper.includes("UBER")) return "Uber Eats";
  if (upper.includes("PLAYSTATION")) return "PlayStation";
  if (upper.includes("PAYPAY") || upper.includes("ペイペイ")) return "PayPay";

  return merchant;
}


function normalizeTextBase(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function loadMerchantAliases() {
  const sheet = SS.getSheetByName(SHEETS.MERCHANT_ALIAS);

  if (!sheet) return new Map();

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return new Map();

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => (idx[h] = i));

  const map = new Map();

  for (const row of values.slice(1)) {
    const raw = normalizeTextBase(row[idx["raw_name"]]);
    const canonical = String(row[idx["canonical_name"]] || "").trim();

    if (!raw || !canonical) continue;

    map.set(raw, canonical);
  }

  return map;
}

function applyMerchantAlias(merchant, aliasMap) {
  const normalized = normalizeTextBase(merchant);

  if (aliasMap.has(normalized)) {
    return aliasMap.get(normalized);
  }

  return merchant;
}


function appendTransactionRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return 0;
  }

  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  sheet
    .getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
    .setValues(rows);

  clearTableCache(SHEETS.TRANSACTIONS);
  clearAccountBalanceCache_();
  return rows.length;
}

function addTransactions(transactions, options = {}) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return {
      addedCount: 0,
      skippedCount: 0,
      addedIds: [],
    };
  }

  const skipDuplicateCheck = options.skipDuplicateCheck === true;

  // DBに既に何件存在するか
  const existingCounts = skipDuplicateCheck
    ? new Map()
    : getExistingDuplicateKeyCounts();

  // 今回のCSV内で、
  // 同じキーが何件目まで出てきたか
  const incomingCounts = new Map();

  const rows = [];

  const addedIds = [];

  let skippedCount = 0;

  for (const originalTransaction of transactions) {
    const tx = {
      ...originalTransaction,

      account_name: resolveCanonicalAccountName_(originalTransaction.account_name),
    };

    const duplicateKey = buildDuplicateKey(tx);

    // ------------------------------------------
    // 同一キーの出現回数
    // ------------------------------------------

    const incomingCount = Number(incomingCounts.get(duplicateKey) || 0) + 1;

    incomingCounts.set(duplicateKey, incomingCount);

    const existingCount = Number(existingCounts.get(duplicateKey) || 0);

    /*
     * 例：
     *
     * DBに同一キーが2件ある
     *
     * CSV側
     * 1件目 → skip
     * 2件目 → skip
     * 3件目 → 新規追加
     *
     * これにより、
     * 本当に同日・同額・同店舗の取引が
     * 複数回存在しても保持できる。
     */
    if (!skipDuplicateCheck && incomingCount <= existingCount) {
      Logger.log(
        "重複のためスキップ: " +
          duplicateKey +
          ` (${incomingCount}/${existingCount})`,
      );

      skippedCount++;

      continue;
    }

    const createdAt = new Date();

    const yearMonth = resolveTransactionYearMonth(
      tx.transaction_date,
      createdAt,
    );

    const id = Utilities.getUuid();

    addedIds.push(id);

    rows.push(buildTransactionRow(tx, id, createdAt, yearMonth, duplicateKey));
  }

  const addedCount = appendTransactionRows(rows);

  return {
    addedCount,
    skippedCount,
    addedIds,
  };
}

// ============================================================
// Transaction API Handlers
// ============================================================

function createTransactionFromApp_(data) {
  const transactionDate = String(data.transactionDate || "").trim();

  const type = String(data.type || "").trim();

  const amount = Number(data.amount || 0);

  const majorCategory = String(data.majorCategory || "").trim();

  const subCategory = String(data.subCategory || "").trim();

  const title = String(data.title || "").trim();

  const paymentMethod = String(data.paymentMethod || "").trim();

  const accountName = String(data.accountName || "").trim();

  const status = String(data.status || "要確認").trim();

  const memo = String(data.memo || "").trim();

  const explicitPurposeType = String(data.purposeType || "").trim();
  const explicitExpenseRatio = Number(data.expenseRatio);
  const evidenceUrl = String(data.evidenceUrl || "").trim();

  const fromAccount = String(data.fromAccount || "").trim();
  const toAccount = String(data.toAccount || "").trim();

  if (!transactionDate) {
    throw new Error("transactionDateは必須です");
  }

  const parsedDate = new Date(`${transactionDate}T00:00:00+09:00`);

  if (isNaN(parsedDate.getTime())) {
    throw new Error("transactionDateの形式が不正です");
  }

  if (type !== "支出" && type !== "収入" && type !== "移動") {
    throw new Error("typeは支出、収入、移動を指定してください");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amountは1以上で指定してください");
  }

  if (!majorCategory) {
    throw new Error("majorCategoryは必須です");
  }

  if (!subCategory) {
    throw new Error("subCategoryは必須です");
  }

  if (!title) {
    throw new Error("titleは必須です");
  }

  if (!paymentMethod) {
    throw new Error("paymentMethodは必須です");
  }

  if (status !== "確定" && status !== "要確認") {
    throw new Error("statusは確定または要確認を指定してください");
  }

  if (type === "移動") {
    if (!fromAccount) {
      throw new Error("移動元口座は必須です");
    }

    if (!toAccount) {
      throw new Error("移動先口座は必須です");
    }

    if (
      resolveCanonicalAccountName_(fromAccount) ===
      resolveCanonicalAccountName_(toAccount)
    ) {
      throw new Error("移動元口座と移動先口座は別の口座を指定してください");
    }
  }

  const purposeType =
    type === "移動"
      ? "私用"
      : type === "収入"
        ? explicitPurposeType === "事業収入" || majorCategory === "副業"
          ? "事業収入"
          : "私用"
        : explicitPurposeType === "経費" || explicitPurposeType === "私用"
          ? explicitPurposeType
          : guessPurposeType(majorCategory, subCategory);

  const expenseRatio =
    type === "支出" && Number.isFinite(explicitExpenseRatio)
      ? Math.max(0, Math.min(1, explicitExpenseRatio))
      : type === "支出"
        ? guessExpenseRatio(majorCategory, subCategory)
        : 0;

  const wallet =
    purposeType === "経費" || purposeType === "事業収入" ? "事業" : "生活";

  const tx = {
    transaction_date: transactionDate,

    merchant: normalizeMerchant(title),

    item_name: title,

    amount,

    note: memo,

    source_type: "Neru Nexus App",

    payment_method: paymentMethod,

    evidence_url: evidenceUrl,

    original_image_url: "",

    import_batch: Utilities.formatDate(
      new Date(),
      "Asia/Tokyo",
      "yyyyMMdd_HHmmss",
    ),

    type,

    major_category: majorCategory,

    sub_category: subCategory,

    purpose_type: purposeType,

    expense_ratio: expenseRatio,

    status: status,

    account_name:
      type === "移動"
        ? resolveCanonicalAccountName_(fromAccount)
        : accountName,

    wallet,

    intent:
      type === "収入" ? "収入" : guessIntent(type, majorCategory, subCategory),

    from_account:
      type === "移動" ? resolveCanonicalAccountName_(fromAccount) : "",

    to_account:
      type === "移動" ? resolveCanonicalAccountName_(toAccount) : "",

    settlement_status: type === "移動" ? "none" : "",

    settlement_id: "",
  };

  const result = addTransactions([tx], {
    skipDuplicateCheck: true,
  });

  if (result.addedCount === 0) {
    if (result.skippedCount > 0) {
      throw new Error("同じ内容の取引がすでに登録されています");
    }

    throw new Error("取引を登録できませんでした");
  }

  clearTableCache(SHEETS.TRANSACTIONS);
  clearAccountBalanceCache_();
  clearHomeRecentTransactionsCache_();

  const createdId =
    result.addedIds && result.addedIds.length > 0 ? result.addedIds[0] : "";

  const yearMonth = normalizeYearMonth(transactionDate);

  if (yearMonth) {
    markSummaryDirty_(yearMonth);
  }

  return createJsonResponse_(
    {
      addedCount: result.addedCount,

      skippedCount: result.skippedCount,

      source: "app",

      transaction: {
        id: createdId,

        transactionDate: tx.transaction_date,

        merchant: tx.merchant || "",

        itemName: tx.item_name || "",

        amount: tx.amount,

        type: tx.type,

        majorCategory: tx.major_category,

        subCategory: tx.sub_category,

        status: tx.status,

        purposeType: tx.purpose_type || "",
        expenseRatio: Number(tx.expense_ratio || 0),
        expenseAmount: Number(tx.amount || 0) * Number(tx.expense_ratio || 0),
        evidenceUrl: tx.evidence_url || "",

        wallet: tx.wallet,

        intent: tx.intent || "",

        paymentMethod: tx.payment_method,

        accountName: tx.account_name || "",

        rawText: tx.raw_text || "",

        settlementStatus: tx.settlement_status || "",

        settlementId: tx.settlement_id || "",

        fromAccount: tx.from_account || "",

        toAccount: tx.to_account || "",

        importBatch: tx.import_batch || "",

        note: tx.note || "",

        sourceType: tx.source_type || "",
      },
    },
    "ok",
  );
}

function updateTransactionFromApp_(data) {
  const id = String(data.id || "").trim();

  const transactionDate = String(data.transactionDate || "").trim();

  const type = String(data.type || "").trim();

  const amount = Number(data.amount || 0);

  const majorCategory = String(data.majorCategory || "").trim();

  const subCategory = String(data.subCategory || "").trim();

  const title = String(data.title || "").trim();

  const paymentMethod = String(data.paymentMethod || "").trim();

  const accountName = String(data.accountName || "").trim();

  const status = String(data.status || "要確認").trim();

  const memo = String(data.memo || "").trim();

  const explicitPurposeType = String(data.purposeType || "").trim();
  const explicitExpenseRatio = Number(data.expenseRatio);
  const evidenceUrl = String(data.evidenceUrl || "").trim();

  const saveRule = toBoolean_(data.saveRule, false);

  const ruleMerchant = String(data.merchant || "").trim();

  const fromAccount = String(data.fromAccount || "").trim();

  const toAccount = String(data.toAccount || "").trim();

  if (!id) {
    throw new Error("idは必須です");
  }

  if (!transactionDate) {
    throw new Error("transactionDateは必須です");
  }

  if (type !== "支出" && type !== "収入" && type !== "移動") {
    throw new Error("typeは支出、収入、移動を指定してください");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amountは1以上で指定してください");
  }

  if (!majorCategory) {
    throw new Error("majorCategoryは必須です");
  }

  if (!subCategory) {
    throw new Error("subCategoryは必須です");
  }

  if (!title) {
    throw new Error("titleは必須です");
  }

  if (!paymentMethod) {
    throw new Error("paymentMethodは必須です");
  }

  if (status !== "確定" && status !== "要確認") {
    throw new Error("statusは確定または要確認を指定してください");
  }

  const found = findTransactionById_(id);

  if (!found) {
    throw new Error("更新対象の取引が見つかりません");
  }

  assertRequiredColumns(
    found.index,
    [
      "id",
      "transaction_date",
      "recorded_at",
      "year_month",
      "type",
      "source_type",
      "payment_method",
      "account_name",
      "merchant",
      "item_name",
      "raw_text",
      "amount",
      "major_category",
      "sub_category",
      "purpose_type",
      "expense_ratio",
      "expense_amount",
      "note",
      "evidence_url",
      "original_image_url",
      "import_batch",
      "duplicate_key",
      "status",
      "purpose_type",
      "expense_ratio",
      "expense_amount",
      "evidence_url",
      "wallet",
      "intent",
      "from_account",
      "to_account",
      "settlement_status",
      "settlement_id",
      "source_id",
      "source_status",
      "source_received_at",
    ],
    SHEETS.TRANSACTIONS,
  );

  const existingRow = found.row;
  const tableIndex = found.index;

  const oldStatus = getString(existingRow, tableIndex, "status");

  const oldTransactionDate = existingRow[tableIndex["transaction_date"]];

  const oldType = getString(existingRow, tableIndex, "type");

  const oldAmount = getNumber(existingRow, tableIndex, "amount");

  const oldMajorCategory = getString(existingRow, tableIndex, "major_category");

  const oldExpenseAmount = getNumber(existingRow, tableIndex, "expense_amount");

  const existingSettlementStatus = getString(
    existingRow,
    tableIndex,
    "settlement_status",
  );

  const existingSettlementId = getString(
    existingRow,
    tableIndex,
    "settlement_id",
  );

  const existingSourceId = getString(existingRow, tableIndex, "source_id");

  const existingSourceStatus = getString(
    existingRow,
    tableIndex,
    "source_status",
  );

  const existingSourceType = getString(
    existingRow,
    tableIndex,
    "source_type",
  );

  const existingMerchant = getString(existingRow, tableIndex, "merchant");

  const isImportedTransaction =
    existingSourceType !== "" && existingSourceType !== "Neru Nexus App";

  const existingSourceReceivedAt =
    existingRow[tableIndex["source_received_at"]] || "";

  // ============================================================
  // Gmail速報をユーザーが編集したことを記録
  //
  // preliminary
  //   → preliminary_edited
  //
  // すでにpreliminary_editedならそのまま。
  // CSV等の通常取引には影響しない。
  // ============================================================

  let nextSourceStatus = existingSourceStatus;

  if (
    existingSourceStatus === "preliminary" ||
    existingSourceStatus === "preliminary_edited"
  ) {
    nextSourceStatus = "preliminary_edited";
  }

  const isCreditCardSettlement = subCategory === "クレカ引落";

  const purposeType =
    type === "収入"
      ? explicitPurposeType === "事業収入" || majorCategory === "副業" ? "事業収入" : "私用"
      : explicitPurposeType === "経費" || explicitPurposeType === "私用"
        ? explicitPurposeType
        : guessPurposeType(majorCategory, subCategory);

  const expenseRatio =
    type === "支出" && Number.isFinite(explicitExpenseRatio)
      ? Math.max(0, Math.min(1, explicitExpenseRatio))
      : type === "支出"
        ? guessExpenseRatio(majorCategory, subCategory)
        : 0;

  const wallet =
    purposeType === "経費" || purposeType === "事業収入" ? "事業" : "生活";

  const intent = type === "収入" ? "収入" : guessIntent(type, majorCategory, subCategory);

  const updatedTransaction = {
    transaction_date: transactionDate,

    type,

    source_type: existingSourceType || "Neru Nexus App",

    payment_method: paymentMethod,

    account_name: isImportedTransaction
      ? getString(existingRow, tableIndex, "account_name")
      : resolveCanonicalAccountName_(
          accountName || getString(existingRow, tableIndex, "account_name"),
        ),

    merchant: isImportedTransaction
      ? existingMerchant
      : normalizeMerchant(title),

    item_name: title,

    raw_text: getString(existingRow, tableIndex, "raw_text"),

    amount,

    major_category: majorCategory,

    sub_category: subCategory,

    purpose_type: purposeType,

    expense_ratio: expenseRatio,

    note: memo,

    evidence_url: evidenceUrl,

    original_image_url: getString(
      existingRow,
      tableIndex,
      "original_image_url",
    ),

    import_batch: getString(existingRow, tableIndex, "import_batch"),

    status,

    wallet,

    intent,

    from_account:
      type === "移動"
        ? resolveCanonicalAccountName_(
            fromAccount || getString(existingRow, tableIndex, "from_account"),
          )
        : "",

    to_account:
      type === "移動"
        ? resolveCanonicalAccountName_(
            toAccount || getString(existingRow, tableIndex, "to_account"),
          )
        : "",

    settlement_status:
      type !== "移動"
        ? ""
        : isCreditCardSettlement
          ? existingSettlementStatus
          : toAccount || getString(existingRow, tableIndex, "to_account")
            ? "none"
            : "review",

    settlement_id: type === "移動" ? existingSettlementId : "",

    source_id: existingSourceId,

    source_status: nextSourceStatus,

    source_received_at: existingSourceReceivedAt,
  };

  const needsReviewRefresh =
    oldStatus === "要確認" ||
    status === "要確認" ||
    existingSettlementStatus === "review" ||
    updatedTransaction.settlement_status === "review" ||
    saveRule;

  const recordedAt = existingRow[tableIndex["recorded_at"]] || new Date();

  const yearMonth = resolveTransactionYearMonth(transactionDate, recordedAt);

  const duplicateKey = buildDuplicateKey(updatedTransaction);

  const updatedRow = buildTransactionRow(
    updatedTransaction,
    id,
    recordedAt,
    yearMonth,
    duplicateKey,
  );

  const sheet = found.sheet;

  const sheetRowNumber = found.rowNumber;

  sheet
    .getRange(sheetRowNumber, 1, 1, updatedRow.length)
    .setValues([updatedRow]);

  clearTableCache(SHEETS.TRANSACTIONS);

  clearAccountBalanceCache_();

  clearHomeRecentTransactionsCache_();

  let ruleResult = null;

  if (saveRule) {
    const merchantForRule =
      ruleMerchant || getString(existingRow, tableIndex, "merchant");

    if (!merchantForRule) {
      throw new Error("ルール登録対象の取引先を取得できません");
    }

    ruleResult = addRuleFromTransaction_({
      merchant: merchantForRule,
      type,
      majorCategory,
      subCategory,
      purposeType,
      expenseRatio,
      wallet,
      intent,
    });

    if (ruleResult.rule) {
      ruleResult.applied = applyRuleToPendingTransactions_(ruleResult.rule, id);
    }
  }

  const newExpenseAmount = amount * expenseRatio;

  const needsSummaryRefresh =
    normalizeYearMonth(oldTransactionDate) !== yearMonth ||
    oldType !== type ||
    oldAmount !== amount ||
    oldMajorCategory !== majorCategory ||
    oldExpenseAmount !== newExpenseAmount;

  if (needsSummaryRefresh) {
    const oldYearMonth = normalizeYearMonth(oldTransactionDate);

    if (oldYearMonth) {
      markSummaryDirty_(oldYearMonth);
    }

    if (yearMonth && yearMonth !== oldYearMonth) {
      markSummaryDirty_(yearMonth);
    }
  }

  return createJsonResponse_(
    {
      updated: true,

      id,

      transaction: {
        id,

        transactionDate,

        merchant: updatedTransaction.merchant || "",

        itemName: updatedTransaction.item_name || "",

        amount,

        type,

        majorCategory,

        subCategory,

        status,

        purposeType,
        expenseRatio,
        expenseAmount: amount * expenseRatio,
        evidenceUrl: updatedTransaction.evidence_url || "",

        wallet,

        intent: updatedTransaction.intent || "",

        paymentMethod,

        accountName: updatedTransaction.account_name || "",

        rawText: updatedTransaction.raw_text || "",

        settlementStatus: updatedTransaction.settlement_status || "",

        settlementId: updatedTransaction.settlement_id || "",

        fromAccount: updatedTransaction.from_account || "",

        toAccount: updatedTransaction.to_account || "",

        importBatch: updatedTransaction.import_batch || "",

        note: updatedTransaction.note || "",

        sourceId: updatedTransaction.source_id || "",

        sourceType: updatedTransaction.source_type || "",

        sourceStatus: updatedTransaction.source_status || "",

        sourceReceivedAt: updatedTransaction.source_received_at || "",
      },
    },
    "ok",
  );
}

function deleteTransactionFromApp_(data) {
  const id = String(data.id || "").trim();

  if (!id) {
    throw new Error("idは必須です");
  }

  const found = findTransactionById_(id);

  if (!found) {
    throw new Error("削除対象が見つかりません");
  }

  assertRequiredColumns(
    found.index,
    ["id", "transaction_date", "status", "settlement_status"],
    SHEETS.TRANSACTIONS,
  );

  const targetRow = found.row;
  const tableIndex = found.index;

  const transactionDate = targetRow[tableIndex["transaction_date"]];

  const status = getString(targetRow, tableIndex, "status");

  const settlementStatus = getString(
    targetRow,
    tableIndex,
    "settlement_status",
  );

  const yearMonth = normalizeYearMonth(transactionDate);

  const needsReviewRefresh =
    status === "要確認" || settlementStatus === "review";

  const sheet = found.sheet;

  const sheetRowNumber = found.rowNumber;

  /*
   * 本体を削除
   */

  sheet.deleteRow(sheetRowNumber);

  /*
   * キャッシュ破棄
   */
  clearTableCache(SHEETS.TRANSACTIONS);

  clearAccountBalanceCache_();

  clearHomeRecentTransactionsCache_();

  /*
   * 派生データ更新。
   *
   * 本体の削除自体は完了しているので、
   * 派生データ更新失敗によって
   * API全体を失敗扱いにはしない。
   */
  const rebuildErrors = [];

  if (yearMonth) {
    markSummaryDirty_(yearMonth);
  }

  return createJsonResponse_(
    {
      deleted: true,
      id,
      rebuildErrors,
    },
    "ok",
  );
}

function getTransactionsData(options) {
  const settings = options || {};

  const requestedLimit = Number(settings.limit || 50);
  const requestedOffset = Number(settings.offset || 0);

  const limit = Math.min(Math.max(requestedLimit, 1), 200);
  const offset = Math.max(requestedOffset, 0);

  const targetMonth = settings.yearMonth
    ? normalizeBudgetYearMonth(settings.yearMonth)
    : "";

  const keyword = String(settings.keyword || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();

  const majorCategory = String(settings.majorCategory || "").trim();

  const reviewOnly = toBoolean_(settings.reviewOnly, false);

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
      "raw_text",
      "intent",
      "payment_method",
      "account_name",
      "settlement_status",
      "settlement_id",
      "from_account",
      "to_account",
      "import_batch",
      "note",
      "source_id",
      "source_type",
      "source_status",
      "source_received_at",
    ],
    SHEETS.TRANSACTIONS,
  );

  const settlementId = String(settings.settlementId || "").trim();
  const importBatch = String(settings.importBatch || "").trim();

  const filteredRows = table.rows.filter((row) => {
    // ignoredは通常一覧に表示しない
    if (isIgnoredTransactionRow_(row, table.index)) {
      return false;
    }

    if (targetMonth) {
      const rowMonth = normalizeYearMonth(row[table.index["transaction_date"]]);

      if (rowMonth !== targetMonth) {
        return false;
      }
    }

    if (majorCategory) {
      const rowMajorCategory = getString(row, table.index, "major_category");

      if (rowMajorCategory !== majorCategory) {
        return false;
      }
    }

    if (reviewOnly) {
      const status = getString(row, table.index, "status");

      if (status !== "要確認") {
        return false;
      }
    }

    if (keyword) {
      const searchableText = [
        getString(row, table.index, "merchant"),
        getString(row, table.index, "item_name"),
        getString(row, table.index, "major_category"),
        getString(row, table.index, "sub_category"),
        getString(row, table.index, "wallet"),
        getString(row, table.index, "intent"),
      ]
        .join(" ")
        .normalize("NFKC")
        .toLowerCase();

      if (!searchableText.includes(keyword)) {
        return false;
      }
    }

    if (settlementId) {
      const rowSettlementId = getString(row, table.index, "settlement_id");

      if (rowSettlementId !== settlementId) {
        return false;
      }
    }

    if (importBatch) {
      const rowImportBatch = getString(row, table.index, "import_batch");

      if (rowImportBatch !== importBatch) {
        return false;
      }
    }

    return true;
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
    purposeType: getString(row, table.index, "purpose_type"),
    expenseRatio: getNumber(row, table.index, "expense_ratio"),
    expenseAmount: getNumber(row, table.index, "expense_amount"),
    evidenceUrl: getString(row, table.index, "evidence_url"),
    wallet: getString(row, table.index, "wallet"),
    intent: getString(row, table.index, "intent"),
    rawText: getString(row, table.index, "raw_text"),
    paymentMethod: getString(row, table.index, "payment_method"),
    accountName: getString(row, table.index, "account_name"),
    settlementStatus: getString(row, table.index, "settlement_status"),
    settlementId: getString(row, table.index, "settlement_id"),
    fromAccount: getString(row, table.index, "from_account"),
    toAccount: getString(row, table.index, "to_account"),
    importBatch: getString(row, table.index, "import_batch"),
    note: getString(row, table.index, "note"),
    sourceId: getString(row, table.index, "source_id"),
    sourceType: getString(row, table.index, "source_type"),
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

