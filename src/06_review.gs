/**
 * rulesに登録されている最大priorityの次の値を取得する。
 *
 * @param {Array<Array<*>>} rows
 * @param {Object<string, number>} index
 * @return {number}
 */
function getNextRulePriority_(rows, index) {
  const priorities = rows
    .map((row) => Number(row[index["priority"]] || 0))
    .filter((priority) => !isNaN(priority));

  return priorities.length > 0 ? Math.max(...priorities) + 10 : 100;
}

/**
 * rulesのヘッダー順に、新規ルール1行を作る。
 *
 * 将来rulesに列が増えても、列順のズレを防げる。
 *
 * @param {Array<*>} headers
 * @param {Object<string, *>} rule
 * @return {Array<*>}
 */
function buildRuleRow_(headers, rule) {
  return headers.map((header) => {
    const columnName = String(header || "").trim();

    return rule[columnName] !== undefined ? rule[columnName] : "";
  });
}

/**
 * rulesへルールをまとめて追加する。
 *
 * @param {Array<Object<string, *>>} rules
 * @return {number}
 */
function appendRules_(rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return 0;
  }

  const sheet = getRequiredSheet(SHEETS.RULES);
  const table = loadTable(SHEETS.RULES);

  if (table.headers.length === 0) {
    throw new Error("rules にヘッダーがありません");
  }

  assertRequiredColumns(
    table.index,
    [
      "priority",
      "match_target",
      "keyword",
      "rule_type",
      "type_result",
      "major_category",
      "sub_category",
      "purpose_type",
      "expense_ratio",
      "status_result",
    ],
    SHEETS.RULES,
  );

  const rows = rules.map((rule) => buildRuleRow_(table.headers, rule));

  sheet
    .getRange(sheet.getLastRow() + 1, 1, rows.length, table.headers.length)
    .setValues(rows);

  return rows.length;
}


function addRuleFromTransaction_(data) {
  const merchant = String(data.merchant || "").trim();

  const type = String(data.type || "").trim();

  const majorCategory = String(data.majorCategory || "").trim();

  const subCategory = String(data.subCategory || "").trim();

  if (!merchant) {
    throw new Error("ルール登録にはmerchantが必要です");
  }

  if (!type || !majorCategory || !subCategory) {
    throw new Error("ルール登録には分類情報が必要です");
  }

  const ruleTable = loadTable(SHEETS.RULES);

  assertRequiredColumns(
    ruleTable.index,
    [
      "priority",
      "match_target",
      "keyword",
      "rule_type",
      "type_result",
      "major_category",
      "sub_category",
      "purpose_type",
      "expense_ratio",
      "status_result",
      "note",
      "wallet_result",
      "intent_result",
    ],
    SHEETS.RULES,
  );

  const duplicate = ruleTable.rows.some(
    (row) =>
      getString(row, ruleTable.index, "match_target") === "merchant" &&
      getString(row, ruleTable.index, "keyword") === merchant &&
      getString(row, ruleTable.index, "rule_type") === "equals",
  );

  if (duplicate) {
    return {
      added: false,
      reason: "duplicate",

      rule: {
        matchTarget: "merchant",
        keyword: merchant,
        ruleType: "equals",

        typeResult: type,
        majorCategory,
        subCategory,

        purposeType: String(data.purposeType || "私用").trim() || "私用",

        expenseRatio: Number(data.expenseRatio || 0),

        statusResult: "確定",

        walletResult:
          String(data.wallet || "").trim() ||
          (String(data.purposeType || "私用").trim() === "経費"
            ? "事業"
            : "生活"),

        intentResult:
          String(data.intent || "").trim() || guessIntent(type, majorCategory, subCategory),
      },
    };
  }

  const priority = getNextRulePriority_(ruleTable.rows, ruleTable.index);

  const purpose = String(data.purposeType || "私用").trim() || "私用";

  const wallet =
    String(data.wallet || "").trim() || (purpose === "経費" ? "事業" : "生活");

  const intent = String(data.intent || "").trim() || guessIntent(type, majorCategory, subCategory);

  const addedCount = appendRules_([
    {
      priority,
      match_target: "merchant",
      keyword: merchant,
      rule_type: "equals",
      type_result: type,
      major_category: majorCategory,
      sub_category: subCategory,
      purpose_type: purpose,
      expense_ratio: Number(data.expenseRatio || 0),
      status_result: "確定",
      note: "アプリの要確認から追加",
      wallet_result: wallet,
      intent_result: intent,
    },
  ]);

  return {
    added: addedCount > 0,
    reason: addedCount > 0 ? "added" : "not_added",

    rule: {
      priority,
      matchTarget: "merchant",
      keyword: merchant,
      ruleType: "equals",

      typeResult: type,
      majorCategory,
      subCategory,

      purposeType: purpose,
      expenseRatio: Number(data.expenseRatio || 0),

      statusResult: "確定",

      walletResult: wallet,
      intentResult: intent,
    },
  };
}

function applyRuleToPendingTransactions_(rule, excludeId = "") {
  if (!rule) {
    return {
      matchedCount: 0,
      updatedCount: 0,
    };
  }

  if (rule.matchTarget !== "merchant" || rule.ruleType !== "equals") {
    return {
      matchedCount: 0,
      updatedCount: 0,
    };
  }

  const keyword = String(rule.keyword || "").trim();

  if (!keyword) {
    return {
      matchedCount: 0,
      updatedCount: 0,
    };
  }

  const table = loadTransactions();

  if (table.rows.length === 0) {
    return {
      matchedCount: 0,
      updatedCount: 0,
    };
  }

  assertRequiredColumns(
    table.index,
    [
      "id",
      "transaction_date",
      "merchant",
      "type",
      "major_category",
      "sub_category",
      "purpose_type",
      "expense_ratio",
      "expense_amount",
      "status",
      "wallet",
      "intent",
      "source_status",
    ],
    SHEETS.TRANSACTIONS,
  );

  const sheet = SS.getSheetByName(SHEETS.TRANSACTIONS);

  if (!sheet) {
    throw new Error("transactionsシートがありません");
  }

  const updates = [];

  const dirtyMonths = new Set();

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];

    // ==========================================================
    // ignoredはルール自動適用の対象外
    // ==========================================================

    if (isIgnoredTransactionRow_(row, table.index)) {
      continue;
    }

    const transactionId = getString(row, table.index, "id");

    if (excludeId && transactionId === excludeId) {
      continue;
    }

    const status = getString(row, table.index, "status");

    // 要確認だけを見る
    if (status !== "要確認") {
      continue;
    }

    const merchant = getString(row, table.index, "merchant");

    // 今回作ったmerchantルールだけを見る
    if (merchant !== keyword) {
      continue;
    }

    const amount = getNumber(row, table.index, "amount");

    const expenseRatio = Number(rule.expenseRatio || 0);

    row[table.index["type"]] = rule.typeResult;

    row[table.index["major_category"]] = rule.majorCategory;

    row[table.index["sub_category"]] = rule.subCategory;

    row[table.index["purpose_type"]] = rule.purposeType;

    row[table.index["expense_ratio"]] = expenseRatio;

    row[table.index["expense_amount"]] =
      rule.typeResult === "支出" ? amount * expenseRatio : 0;

    row[table.index["status"]] = rule.statusResult || "確定";

    row[table.index["wallet"]] = rule.walletResult;

    row[table.index["intent"]] = rule.intentResult;

    const transactionDate = row[table.index["transaction_date"]];

    const yearMonth = normalizeYearMonth(transactionDate);

    if (yearMonth) {
      dirtyMonths.add(yearMonth);
    }

    updates.push({
      rowNumber: i + 2,
      values: row,
    });
  }

  // ============================================================
  // 一致した行だけ書き込む
  // ============================================================

  for (const update of updates) {
    sheet
      .getRange(update.rowNumber, 1, 1, update.values.length)
      .setValues([update.values]);
  }

  if (updates.length > 0) {
    clearTableCache(SHEETS.TRANSACTIONS);

    clearAccountBalanceCache_();

    clearHomeRecentTransactionsCache_();

    for (const yearMonth of dirtyMonths) {
      markSummaryDirty_(yearMonth);
    }
  }

  return {
    matchedCount: updates.length,

    updatedCount: updates.length,
  };
}

// ============================================================
// Review API Handlers
// ============================================================

function getReviewTransactionsData(options) {
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
      "source_type",
      "source_status",
      "source_received_at",
    ],
    SHEETS.TRANSACTIONS,
  );

  const filteredRows = table.rows.filter((row) => {
    // ignoredは要確認一覧に出さない
    if (isIgnoredTransactionRow_(row, table.index)) {
      return false;
    }

    const status = getString(row, table.index, "status");
    const settlementStatus = getString(row, table.index, "settlement_status");

    // Gmail速報であること自体は「要確認」の理由にしない。
    // ユーザー判断が必要な分類状態か、照合確認が必要な取引だけ表示する。
    return status === "要確認" || settlementStatus === "review";
  });

  filteredRows.sort((a, b) => {
    const dateA = new Date(a[table.index["transaction_date"]]);

    const dateB = new Date(b[table.index["transaction_date"]]);

    return dateB.getTime() - dateA.getTime();
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

function getReviewTransactionCount() {
  const table = loadTransactions();

  if (table.rows.length === 0) {
    return {
      count: 0,
    };
  }

  assertRequiredColumns(
    table.index,
    ["status", "settlement_status", "source_status", "source_received_at"],
    SHEETS.TRANSACTIONS,
  );

  let count = 0;

  for (const row of table.rows) {
    if (isIgnoredTransactionRow_(row, table.index)) {
      continue;
    }

    const status = getString(row, table.index, "status");
    const settlementStatus = getString(row, table.index, "settlement_status");

    if (status === "要確認" || settlementStatus === "review") {
      count++;
    }
  }

  return {
    count,
  };
}

