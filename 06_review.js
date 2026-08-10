const REVIEW_MANUAL_COLUMNS = [
  "type_manual",
  "major_manual",
  "sub_manual",
  "purpose_manual",
  "expense_ratio_manual",
  "rule_keyword",
  "rule_target",
  "learn"
];

const REVIEW_QUEUE_HEADERS = [
  "id",
  "transaction_date",
  "type",
  "source_type",
  "account_name",
  "payment_method",
  "merchant",
  "merchant_count",
  "item_name",
  "note",
  "raw_text_preview",
  "amount",
  "major_category",
  "sub_category",
  "status",
  "duplicate_key",
  ...REVIEW_MANUAL_COLUMNS
];

function loadReviewManualMap_() {
  const table = loadTable(SHEETS.REVIEW_QUEUE);
  const manualMap = new Map();

  if (table.rows.length === 0) {
    return manualMap;
  }

  if (table.index["merchant"] === undefined) {
    return manualMap;
  }

  for (const row of table.rows) {
    const merchant = getString(
      row,
      table.index,
      "merchant"
    );

    if (!merchant) {
      continue;
    }

    const manualValues = {};

    for (const columnName of REVIEW_MANUAL_COLUMNS) {
      manualValues[columnName] =
        table.index[columnName] === undefined
          ? ""
          : row[table.index[columnName]];
    }

    manualMap.set(merchant, manualValues);
  }

  return manualMap;
}

function buildMerchantCountMap_(rows, index) {
  const countMap = new Map();

  for (const row of rows) {
    const merchant = getString(
      row,
      index,
      "merchant"
    );

    if (!merchant) {
      continue;
    }

    countMap.set(
      merchant,
      (countMap.get(merchant) || 0) + 1
    );
  }

  return countMap;
}

function buildReviewQueueRow_(
  row,
  index,
  merchantCountMap,
  manualMap
    ) {
  const merchant = getString(
    row,
    index,
    "merchant"
  );

  const itemName = getString(
    row,
    index,
    "item_name"
  );

  const note = getString(
    row,
    index,
    "note"
  );

  const paymentMethod =
    index["payment_method"] === undefined
      ? ""
      : row[index["payment_method"]];

  const rawTextPreview = [
    merchant,
    itemName,
    note,
    paymentMethod
  ]
    .filter(value =>
      String(value || "").trim() !== ""
    )
    .join(" / ");

  const manual = manualMap.get(merchant) || {};

  return [
    row[index["id"]],
    row[index["transaction_date"]],
    row[index["type"]],
    row[index["source_type"]],
    row[index["account_name"]],
    paymentMethod,
    merchant,
    merchantCountMap.get(merchant) || 1,
    row[index["item_name"]],
    row[index["note"]],
    rawTextPreview,
    row[index["amount"]],
    row[index["major_category"]],
    row[index["sub_category"]],
    row[index["status"]],
    row[index["duplicate_key"]],
    manual.type_manual || "",
    manual.major_manual || "",
    manual.sub_manual || "",
    manual.purpose_manual || "私用",
    manual.expense_ratio_manual !== "" &&
    manual.expense_ratio_manual !== undefined
      ? manual.expense_ratio_manual
      : 0,
    manual.rule_keyword || merchant,
    manual.rule_target || "merchant",
    manual.learn || ""
  ];
}

function rebuildReviewQueue() {
  const transactionTable = loadTable(SHEETS.TRANSACTIONS)

  // 元の挙動を維持：
  // transactionsに明細がなければreview_queueを変更しない
  if (transactionTable.rows.length === 0) {
    return;
  }

  assertRequiredColumns(
    transactionTable.index,
    [
      "id",
      "transaction_date",
      "type",
      "source_type",
      "account_name",
      "merchant",
      "item_name",
      "note",
      "amount",
      "major_category",
      "sub_category",
      "status",
      "duplicate_key"
    ],
    "transactions"
  );

  const manualMap = loadReviewManualMap_();

  const merchantCountMap = buildMerchantCountMap_(
    transactionTable.rows,
    transactionTable.index
  );

  const targetRows = transactionTable.rows.filter(
    row =>
      getString(
        row,
        transactionTable.index,
        "status"
      ) === "要確認"
  );

  const outputRows = targetRows.map(row =>
    buildReviewQueueRow_(
      row,
      transactionTable.index,
      merchantCountMap,
      manualMap
    )
  );

  writeTable(
    getRequiredSheet(SHEETS.REVIEW_QUEUE),
    1,
    1,
    REVIEW_QUEUE_HEADERS,
    outputRows
  );
}

function rebuildReviewSummary() {
  const table = loadTable(SHEETS.REVIEW_QUEUE);
  const summarySheet = getRequiredSheet(SHEETS.REVIEW_SUMMARY);

  if (table.rows.length === 0) {
    writeTable(
      summarySheet,
      1,
      1,
      [
        "merchant",
        "count",
        "total_amount",
        "sample_category"
      ],
      []
    );

    return;
  }

  assertRequiredColumns(
    table.index,
    [
      "merchant",
      "amount",
      "major_category",
      "sub_category"
    ],
    SHEETS.REVIEW_QUEUE
  );

  const summaryMap = new Map();

  for (const row of table.rows) {
    const merchant = getString(
      row,
      table.index,
      "merchant"
    );

    if (!merchant) {
      continue;
    }

    const amount = getNumber(
      row,
      table.index,
      "amount"
    );

    const major = getString(
      row,
      table.index,
      "major_category"
    );

    const sub = getString(
      row,
      table.index,
      "sub_category"
    );

    if (!summaryMap.has(merchant)) {
      summaryMap.set(merchant, {
        merchant,
        count: 0,
        totalAmount: 0,
        sampleCategory: `${major} / ${sub}`
      });
    }

    const summary = summaryMap.get(merchant);

    summary.count += 1;
    summary.totalAmount += amount;
  }

  const rows = Array
    .from(summaryMap.values())
    .sort((a, b) => b.count - a.count)
    .map(summary => [
      summary.merchant,
      summary.count,
      summary.totalAmount,
      summary.sampleCategory
    ]);

  writeTable(
    summarySheet,
    1,
    1,
    [
      "merchant",
      "count",
      "total_amount",
      "sample_category"
    ],
    rows
  );
}

function rebuildBulkReview() {
  const table = loadTable(SHEETS.REVIEW_SUMMARY);
  const bulkSheet = getRequiredSheet(SHEETS.BULK_REVIEW);

  const headers = [
    "merchant",
    "count",
    "total_amount",
    "current_category",
    "bulk_safe",
    "type_manual",
    "major_manual",
    "sub_manual",
    "purpose_manual",
    "expense_ratio_manual",
    "rule_keyword",
    "rule_target",
    "note"
  ];

  if (table.rows.length === 0) {
    writeTable(
      bulkSheet,
      1,
      1,
      headers,
      []
    );

    return;
  }

  assertRequiredColumns(
    table.index,
    [
      "merchant",
      "count",
      "total_amount",
      "sample_category"
    ],
    SHEETS.REVIEW_SUMMARY
  );

  const rows = table.rows.map(row => {
    const merchant = getString(
      row,
      table.index,
      "merchant"
    );

    return [
      merchant,
      getNumber(row, table.index, "count"),
      getNumber(row, table.index, "total_amount"),
      getString(row, table.index, "sample_category"),
      "",
      "",
      "",
      "",
      "私用",
      0,
      merchant,
      "merchant",
      ""
    ];
  });

  writeTable(
    bulkSheet,
    1,
    1,
    headers,
    rows
  );
}

/**
 * rulesに登録されている最大priorityの次の値を取得する。
 *
 * @param {Array<Array<*>>} rows
 * @param {Object<string, number>} index
 * @return {number}
 */
function getNextRulePriority_(rows, index) {
  const priorities = rows
    .map(row =>
      Number(row[index["priority"]] || 0)
    )
    .filter(priority =>
      !isNaN(priority)
    );

  return priorities.length > 0
    ? Math.max(...priorities) + 10
    : 100;
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
  return headers.map(header => {
    const columnName = String(header || "").trim();

    return rule[columnName] !== undefined
      ? rule[columnName]
      : "";
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
      "status_result"
    ],
    SHEETS.RULES
  );

  const rows = rules.map(rule =>
    buildRuleRow_(table.headers, rule)
  );

  sheet
    .getRange(
      sheet.getLastRow() + 1,
      1,
      rows.length,
      table.headers.length
    )
    .setValues(rows);

  return rows.length;
}

function learnRulesFromReviewQueue() {
  const reviewTable = loadTable(SHEETS.REVIEW_QUEUE);
  const ruleTable = loadTable(SHEETS.RULES);

  if (reviewTable.rows.length === 0) {
    Logger.log("rules追加: 0件");
    return;
  }

  assertRequiredColumns(
    reviewTable.index,
    [
      "merchant",
      "type_manual",
      "major_manual",
      "sub_manual",
      "purpose_manual",
      "expense_ratio_manual",
      "rule_keyword",
      "rule_target",
      "learn"
    ],
    SHEETS.REVIEW_QUEUE
  );

  assertRequiredColumns(
    ruleTable.index,
    ["priority"],
    SHEETS.RULES
  );

  let nextPriority = getNextRulePriority_(
    ruleTable.rows,
    ruleTable.index
  );

  const newRules = [];

  for (const row of reviewTable.rows) {
    const learnValue = getString(
      row,
      reviewTable.index,
      "learn"
    ).toUpperCase();

    if (
      !["TRUE", "1", "YES"].includes(learnValue)
    ) {
      continue;
    }

    const merchant = getString(
      row,
      reviewTable.index,
      "merchant"
    );

    const keyword =
      getString(
        row,
        reviewTable.index,
        "rule_keyword"
      ) || merchant;

    const matchTarget =
      getString(
        row,
        reviewTable.index,
        "rule_target"
      ) || "merchant";

    const type = getString(
      row,
      reviewTable.index,
      "type_manual"
    );

    const major = getString(
      row,
      reviewTable.index,
      "major_manual"
    );

    const sub = getString(
      row,
      reviewTable.index,
      "sub_manual"
    );

    if (!keyword || !type || !major || !sub) {
      continue;
    }

    const purpose =
      getString(
        row,
        reviewTable.index,
        "purpose_manual"
      ) || "私用";

    newRules.push({
      priority: nextPriority,
      match_target: matchTarget,
      keyword,
      rule_type: "contains",
      type_result: type,
      major_category: major,
      sub_category: sub,
      purpose_type: purpose,
      expense_ratio: getNumber(
        row,
        reviewTable.index,
        "expense_ratio_manual"
      ),
      status_result: "確定",
      wallet_result:
        purpose === "経費" ? "事業" : "生活",
      intent_result: guessIntent(sub),
      note: "review_queueから追加"
    });

    nextPriority += 10;
  }

  const addedCount = appendRules_(newRules);

  Logger.log(`rules追加: ${addedCount}件`);
}

function learnRulesFromBulkReview() {
  const bulkTable = loadTable(SHEETS.BULK_REVIEW);
  const ruleTable = loadTable(SHEETS.RULES);

  if (bulkTable.rows.length === 0) {
    Logger.log("bulk rules追加: 0件");
    return;
  }

  assertRequiredColumns(
    bulkTable.index,
    [
      "merchant",
      "bulk_safe",
      "type_manual",
      "major_manual",
      "sub_manual",
      "purpose_manual",
      "expense_ratio_manual",
      "rule_keyword",
      "rule_target",
      "note"
    ],
    SHEETS.BULK_REVIEW
  );

  assertRequiredColumns(
    ruleTable.index,
    ["priority"],
    SHEETS.RULES
  );

  let nextPriority = getNextRulePriority_(
    ruleTable.rows,
    ruleTable.index
  );

  const newRules = [];

  for (const row of bulkTable.rows) {
    const bulkSafe = getString(
      row,
      bulkTable.index,
      "bulk_safe"
    ).toUpperCase();

    if (
      !["TRUE", "1", "YES"].includes(bulkSafe)
    ) {
      continue;
    }

    const merchant = getString(
      row,
      bulkTable.index,
      "merchant"
    );

    const keyword =
      getString(
        row,
        bulkTable.index,
        "rule_keyword"
      ) || merchant;

    const matchTarget =
      getString(
        row,
        bulkTable.index,
        "rule_target"
      ) || "merchant";

    const type = getString(
      row,
      bulkTable.index,
      "type_manual"
    );

    const major = getString(
      row,
      bulkTable.index,
      "major_manual"
    );

    const sub = getString(
      row,
      bulkTable.index,
      "sub_manual"
    );

    if (!keyword || !type || !major || !sub) {
      continue;
    }

    const purpose =
      getString(
        row,
        bulkTable.index,
        "purpose_manual"
      ) || "私用";

    const note =
      getString(
        row,
        bulkTable.index,
        "note"
      ) || "bulk_reviewから追加";

    newRules.push({
      priority: nextPriority,
      match_target: matchTarget,
      keyword,
      rule_type: "equals",
      type_result: type,
      major_category: major,
      sub_category: sub,
      purpose_type: purpose,
      expense_ratio: getNumber(
        row,
        bulkTable.index,
        "expense_ratio_manual"
      ),
      status_result: "確定",
      wallet_result:
        purpose === "経費" ? "事業" : "生活",
      intent_result: guessIntent(sub),
      note
    });

    nextPriority += 10;
  }

  const addedCount = appendRules_(newRules);

  Logger.log(
    `bulk rules追加: ${addedCount}件`
  );
}

function buildRecurringCandidateMap_(transactionTable) {
  const candidateMap = new Map();

  assertRequiredColumns(
    transactionTable.index,
    [
      "transaction_date",
      "type",
      "merchant",
      "amount",
      "major_category",
      "sub_category"
    ],
    "transactions"
  );

  for (const row of transactionTable.rows) {
    const type = getString(
      row,
      transactionTable.index,
      "type"
    );

    if (type !== "支出") {
      continue;
    }

    const merchant = getString(
      row,
      transactionTable.index,
      "merchant"
    );

    const amount = getNumber(
      row,
      transactionTable.index,
      "amount"
    );

    const yearMonth = normalizeYearMonth(
      row[transactionTable.index["transaction_date"]]
    );

    if (!merchant || !amount || !yearMonth) {
      continue;
    }

    const major = getString(
      row,
      transactionTable.index,
      "major_category"
    );

    const sub = getString(
      row,
      transactionTable.index,
      "sub_category"
    );

    const amountBucket =
      Math.round(amount / 100) * 100;

    const key = `${merchant}|${amountBucket}`;

    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        merchant,
        amountBucket,
        months: new Set(),
        amounts: [],
        category: `${major} / ${sub}`
      });
    }

    const candidate = candidateMap.get(key);

    candidate.months.add(yearMonth);
    candidate.amounts.push(amount);
  }

  return candidateMap;
}

function buildRecurringCandidateRows_(candidateMap) {
  return Array.from(candidateMap.values())
    .filter(candidate =>
      candidate.months.size >= 2
    )
    .map(candidate => {
      const months = Array
        .from(candidate.months)
        .sort();

      const totalAmount = candidate.amounts.reduce(
        (total, amount) => total + amount,
        0
      );

      const averageAmount = Math.round(
        totalAmount / candidate.amounts.length
      );

      return [
        candidate.merchant,
        candidate.amountBucket,
        months.length,
        months[0],
        months[months.length - 1],
        averageAmount,
        candidate.category,
        "候補",
        ""
      ];
    })
    .sort((a, b) => {
      if (b[2] !== a[2]) {
        return b[2] - a[2];
      }

      return b[5] - a[5];
    });
}

function rebuildRecurringCandidates() {
  const transactionTable = loadTransactions();

  const candidateMap =
    buildRecurringCandidateMap_(
      transactionTable
    );

  const rows =
    buildRecurringCandidateRows_(
      candidateMap
    );

  writeTable(
    getRequiredSheet(SHEETS.RECURRING_CANDIDATES),
    1,
    1,
    [
      "merchant",
      "amount",
      "month_count",
      "first_month",
      "last_month",
      "avg_amount",
      "category",
      "status",
      "note"
    ],
    rows
  );

  Logger.log(
    `定期支払い候補: ${rows.length}件`
  );
}

function addRuleFromTransaction_(data) {
  const merchant = String(
    data.merchant || ""
  ).trim();

  const type = String(
    data.type || ""
  ).trim();

  const majorCategory = String(
    data.majorCategory || ""
  ).trim();

  const subCategory = String(
    data.subCategory || ""
  ).trim();

  if (!merchant) {
    throw new Error(
      "ルール登録にはmerchantが必要です"
    );
  }

  if (
    !type ||
    !majorCategory ||
    !subCategory
  ) {
    throw new Error(
      "ルール登録には分類情報が必要です"
    );
  }

  const ruleTable = loadTable(
    SHEETS.RULES
  );

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
      "intent_result"
    ],
    SHEETS.RULES
  );

  const duplicate = ruleTable.rows.some(
    row =>
      getString(
        row,
        ruleTable.index,
        "match_target"
      ) === "merchant" &&
      getString(
        row,
        ruleTable.index,
        "keyword"
      ) === merchant &&
      getString(
        row,
        ruleTable.index,
        "rule_type"
      ) === "equals"
  );

  if (duplicate) {
    return {
      added: false,
      reason: "duplicate"
    };
  }

  const priority = getNextRulePriority_(
    ruleTable.rows,
    ruleTable.index
  );

  const purpose =
    String(
      data.purposeType || "私用"
    ).trim() || "私用";

  const wallet =
    String(
      data.wallet || ""
    ).trim() ||
    (
      purpose === "経費"
        ? "事業"
        : "生活"
    );

  const intent =
    String(
      data.intent || ""
    ).trim() ||
    guessIntent(subCategory);

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
      expense_ratio: Number(
        data.expenseRatio || 0
      ),
      status_result: "確定",
      note: "アプリの要確認から追加",
      wallet_result: wallet,
      intent_result: intent
    }
  ]);

  return {
    added: addedCount > 0,
    reason:
      addedCount > 0
        ? "added"
        : "not_added"
  };
}