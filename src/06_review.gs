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
  const table = loadTable("review_queue");
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
  const transactionTable = loadTable("transactions");

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
    getRequiredSheet("review_queue"),
    1,
    1,
    REVIEW_QUEUE_HEADERS,
    outputRows
  );
}

function rebuildReviewSummary() {
  const table = loadTable("review_queue");
  const summarySheet = getRequiredSheet("review_summary");

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
    "review_queue"
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
  const table = loadTable("review_summary");
  const bulkSheet = getRequiredSheet("bulk_review");

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
    "review_summary"
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