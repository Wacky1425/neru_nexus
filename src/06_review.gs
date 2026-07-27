function rebuildReviewQueue() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = ss.getSheetByName("transactions");
  const reviewSheet = ss.getSheetByName("review_queue");

  const manualCols = [
    "type_manual",
    "major_manual",
    "sub_manual",
    "purpose_manual",
    "expense_ratio_manual",
    "rule_keyword",
    "rule_target",
    "learn"
  ];

  // 既存review_queueの手入力内容を退避
  const oldManualMap = new Map();
  const oldValues = reviewSheet.getDataRange().getValues();

  if (oldValues.length >= 2) {
    const oldHeaders = oldValues[0];
    const oldIdx = {};
    oldHeaders.forEach((h, i) => oldIdx[h] = i);

    for (const oldRow of oldValues.slice(1)) {
      const merchant = String(oldRow[oldIdx["merchant"]] || "").trim();
      if (!merchant) continue;

      const manual = {};
      for (const col of manualCols) {
        manual[col] = oldIdx[col] !== undefined ? oldRow[oldIdx[col]] : "";
      }

      oldManualMap.set(merchant, manual);
    }
  }

  const values = txSheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const rows = values.slice(1);

  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  // merchant頻度を作る
  const merchantCountMap = new Map();
  for (const row of rows) {
    const merchant = String(row[idx["merchant"]] || "").trim();
    if (!merchant) continue;
    merchantCountMap.set(merchant, (merchantCountMap.get(merchant) || 0) + 1);
  }

  const targets = rows.filter(row => {
    const status = String(row[idx["status"]] || "").trim();
    return status === "要確認";
  });

  reviewSheet.clearContents();

  reviewSheet.appendRow([
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
    ...manualCols
  ]);

  if (targets.length === 0) return;

  const out = targets.map(row => {
    const merchant = String(row[idx["merchant"]] || "").trim();
    const itemName = String(row[idx["item_name"]] || "").trim();
    const note = String(row[idx["note"]] || "").trim();
    const paymentMethod = idx["payment_method"] !== undefined
      ? row[idx["payment_method"]]
      : "";

    const rawTextPreview = [
      merchant,
      itemName,
      note,
      paymentMethod
    ].filter(v => String(v || "").trim() !== "").join(" / ");

    const oldManual = oldManualMap.get(merchant) || {};

    return [
      row[idx["id"]],
      row[idx["transaction_date"]],
      row[idx["type"]],
      row[idx["source_type"]],
      row[idx["account_name"]],
      paymentMethod,
      row[idx["merchant"]],
      merchantCountMap.get(merchant) || 1,
      row[idx["item_name"]],
      row[idx["note"]],
      rawTextPreview,
      row[idx["amount"]],
      row[idx["major_category"]],
      row[idx["sub_category"]],
      row[idx["status"]],
      row[idx["duplicate_key"]],
      oldManual.type_manual || "",
      oldManual.major_manual || "",
      oldManual.sub_manual || "",
      oldManual.purpose_manual || "私用",
      oldManual.expense_ratio_manual !== "" && oldManual.expense_ratio_manual !== undefined
        ? oldManual.expense_ratio_manual
        : 0,
      oldManual.rule_keyword || merchant,
      oldManual.rule_target || "merchant",
      oldManual.learn || ""
    ];
  });

  reviewSheet.getRange(2, 1, out.length, out[0].length).setValues(out);
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