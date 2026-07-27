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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reviewSheet = ss.getSheetByName("review_queue");
  const summarySheet = ss.getSheetByName("review_summary");

  const values = reviewSheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const rows = values.slice(1);

  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  const map = new Map();

  for (const row of rows) {
    const merchant = String(row[idx["merchant"]] || "").trim();
    const amount = Number(row[idx["amount"]] || 0);
    const major = String(row[idx["major_category"]] || "").trim();
    const sub = String(row[idx["sub_category"]] || "").trim();

    if (!merchant) continue;

    if (!map.has(merchant)) {
      map.set(merchant, {
        merchant,
        count: 0,
        total_amount: 0,
        sample_category: `${major} / ${sub}`,
      });
    }

    const item = map.get(merchant);
    item.count += 1;
    item.total_amount += amount;
  }

  const output = Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .map(item => [
      item.merchant,
      item.count,
      item.total_amount,
      item.sample_category
    ]);

  summarySheet.clearContents();
  summarySheet.appendRow([
    "merchant",
    "count",
    "total_amount",
    "sample_category"
  ]);

  if (output.length > 0) {
    summarySheet.getRange(2, 1, output.length, output[0].length).setValues(output);
  }
}