function guessIntent(subCategory) {
  const major = mapMajorCategory(subCategory);

  if ([
    "食費",
    "住居",
    "通信",
    "交通",
    "生活用品"
  ].includes(major)) {
    return "生活維持";
  }

  if (major === "趣味") {
    return "娯楽";
  }

  if (major === "金融") {
    return "資産形成";
  }

  if (major === "交際") {
    return "贈与・交際";
  }

  if (
    major === "配信" ||
    guessPurposeType(subCategory) === "経費"
  ) {
    return "事業活動";
  }

  return "その他";
}

function buildDuplicateKey(tx) {
  return [
    tx.source_type || "",
    tx.transaction_date || "",
    tx.amount || 0,
    tx.merchant || ""
  ].join("|");
}

function getExistingDuplicateKeys() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("transactions");
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return new Set();

  const headers = values[0];
  const duplicateKeyIndex = headers.indexOf("duplicate_key");

  if (duplicateKeyIndex === -1) {
    throw new Error("transactions シートに duplicate_key 列がありません");
  }

  const rows = values.slice(1);
  const keySet = new Set();

  for (const row of rows) {
    const key = row[duplicateKeyIndex];
    if (key) keySet.add(String(key));
  }

  return keySet;
}

function rebuildSummaries() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = ss.getSheetByName("transactions");
  const monthlySheet = ss.getSheetByName("monthly_summary");
  const categorySheet = ss.getSheetByName("category_summary");

  const values = txSheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const rows = values.slice(1);

  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  const monthlyMap = new Map();
  const categoryMap = new Map();

  for (const row of rows) {
    const transactionDateRaw = row[idx["transaction_date"]];
    const yearMonth = normalizeYearMonth(transactionDateRaw);

    const type = String(row[idx["type"]] || "").trim();
    if (type === "メモ") continue;

    const majorCategory = String(row[idx["major_category"]] || "").trim();
    const amount = Number(row[idx["amount"]] || 0);
    const expenseAmount = Number(row[idx["expense_amount"]] || 0);

    if (!yearMonth) continue;

    if (!monthlyMap.has(yearMonth)) {
      monthlyMap.set(yearMonth, {
        total_expense: 0,
        total_income: 0,
        total_discount: 0,
        total_transfer: 0,
        total_business_expense: 0,
        count_transactions: 0,
      });
    }

    const m = monthlyMap.get(yearMonth);
    m.count_transactions += 1;
    m.total_business_expense += expenseAmount;

    if (type === "支出") {
      m.total_expense += amount;
    } else if (type === "収入") {
      m.total_income += amount;
    } else if (type === "値引き" || type === "調整") {
      m.total_discount += amount;
    } else if (type === "振替" || type === "移動") {
      m.total_transfer += amount;
    }
    const catKey = `${yearMonth}|${majorCategory}`;

    if (!categoryMap.has(catKey)) {
      categoryMap.set(catKey, {
        year_month: yearMonth,
        major_category: majorCategory,
        total_amount: 0,
        count_transactions: 0,
      });
    }

    const c = categoryMap.get(catKey);

    if (type === "支出") {
      c.total_amount += amount;
    } else if (type === "値引き" || type === "調整") {
      c.total_amount -= amount;
    }

    c.count_transactions += 1;
  }

  monthlySheet.clearContents();
  monthlySheet.appendRow([
    "year_month",
    "total_expense",
    "total_income",
    "total_discount",
    "total_transfer",
    "total_business_expense",
    "net_expense",
    "count_transactions"
  ]);

  const monthlyRows = Array.from(monthlyMap.entries())
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([yearMonth, m]) => [
      String(yearMonth),
      m.total_expense,
      m.total_income,
      m.total_discount,
      m.total_transfer,
      m.total_business_expense,
      m.total_expense - m.total_discount,
      m.count_transactions
    ]);

  if (monthlyRows.length > 0) {
    monthlySheet.getRange(2, 1, monthlyRows.length, monthlyRows[0].length).setValues(monthlyRows);
  }

  monthlySheet.getRange("A:A").setNumberFormat("@");

  categorySheet.clearContents();
  categorySheet.appendRow([
    "year_month",
    "major_category",
    "total_amount",
    "count_transactions"
  ]);

  const categoryRows = Array.from(categoryMap.values())
    .sort((a, b) => {
      if (String(a.year_month) !== String(b.year_month)) {
        return String(a.year_month).localeCompare(String(b.year_month));
      }
      return String(a.major_category).localeCompare(String(b.major_category));
    })
    .map(c => [
      String(c.year_month),
      c.major_category,
      c.total_amount,
      c.count_transactions
    ]);

  if (categoryRows.length > 0) {
    categorySheet.getRange(2, 1, categoryRows.length, categoryRows[0].length).setValues(categoryRows);
  }

  categorySheet.getRange("A:A").setNumberFormat("@");
}

function refreshDashboard(targetMonth) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboard = ss.getSheetByName("dashboard");
  const monthlySheet = ss.getSheetByName("monthly_summary");

  const values = monthlySheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const rows = values.slice(1);

  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  let targetRow = null;

  for (const row of rows) {
    if (normalizeYearMonth(row[idx["year_month"]]) === normalizeYearMonth(targetMonth)) {
      targetRow = row;
      break;
    }
  }

  if (!targetRow) {
    throw new Error(`monthly_summary に ${targetMonth} が見つかりません`);
  }

  dashboard.getRange("A1:B7").setValues([
    ["項目", "値"],
    ["今月", normalizeYearMonth(targetMonth)],
    ["今月の支出", targetRow[idx["total_expense"]]],
    ["今月の収入", targetRow[idx["total_income"]]],
    ["今月の値引き", targetRow[idx["total_discount"]]],
    ["今月の実質支出", targetRow[idx["net_expense"]]],
    ["今月の経費合計", targetRow[idx["total_business_expense"]]],
  ]);
}

function getLatestYearMonth() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("monthly_summary");
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("monthly_summary にデータがありません");
  }

  const rows = values.slice(1).filter(r => r[0]);
  const latestRaw = rows[rows.length - 1][0];
  const latest = normalizeYearMonth(latestRaw);

  if (!latest) {
    throw new Error("最新の year_month を正規化できません");
  }

  return latest;
}


function refreshDashboardCategoryTable(targetMonth) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboard = ss.getSheetByName("dashboard");
  const categorySheet = ss.getSheetByName("category_summary");

  const values = categorySheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const rows = values.slice(1);

  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  const filtered = rows.filter(row =>
    normalizeYearMonth(row[idx["year_month"]]) === normalizeYearMonth(targetMonth)
  );

  dashboard.getRange("D20:E100").clearContent();
  dashboard.getRange("D20:E20").setValues([["major_category", "total_amount"]]);

  if (filtered.length === 0) return;

  const out = filtered
    .filter(row => row[idx["major_category"]] && Number(row[idx["total_amount"]]) !== 0)
    .map(row => [
      row[idx["major_category"]],
      row[idx["total_amount"]],
    ]);

  if (out.length > 0) {
    dashboard.getRange(21, 4, out.length, 2).setValues(out);
  }
}

function refreshDashboardFromCell() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboard = ss.getSheetByName("dashboard");
  const targetMonth = normalizeYearMonth(dashboard.getRange("B2").getValue());

  if (!targetMonth) {
    throw new Error("dashboard!B2 に対象月がありません");
  }

  refreshDashboard(targetMonth);
  refreshDashboardCategoryTable(targetMonth);
}

function setLatestMonthToDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboard = ss.getSheetByName("dashboard");

  let latestMonth = "";

  try {
    latestMonth = getLatestYearMonth();
  } catch (e) {
    latestMonth = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM");
  }

  dashboard.getRange("B2").setValue(latestMonth);
}

function rebuildAllViews() {
  rebuildSummaries();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const monthlySheet = ss.getSheetByName("monthly_summary");
  const hasMonthlyData = monthlySheet.getLastRow() >= 2;

  if (!hasMonthlyData) {
    setLatestMonthToDashboard();
    return;
  }

  setLatestMonthToDashboard();
  refreshDashboardFromCell();
}

function reclassifyAllTransactions() {
  const txSheet = getRequiredSheet("transactions");
  const rules = getRules();

  const values = txSheet.getDataRange().getValues();

  if (values.length < 2) {
    return;
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    [
      "merchant",
      "item_name",
      "note",
      "amount",
      "type",
      "major_category",
      "sub_category",
      "purpose_type",
      "expense_ratio",
      "expense_amount",
      "status",
      "wallet",
      "intent"
    ],
    "transactions"
  );

  let updatedCount = 0;

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex];

    const transaction = {
      merchant: row[index["merchant"]] || "",
      item_name: row[index["item_name"]] || "",
      note: row[index["note"]] || ""
    };

    const classified = classifyTransaction(transaction, rules);
    const amount = Number(row[index["amount"]] || 0);
    const expenseRatio = Number(classified.expense_ratio || 0);

    row[index["type"]] = classified.type;
    row[index["major_category"]] = classified.major_category;
    row[index["sub_category"]] = classified.sub_category;
    row[index["purpose_type"]] = classified.purpose_type;
    row[index["expense_ratio"]] = expenseRatio;
    row[index["expense_amount"]] = amount * expenseRatio;
    row[index["status"]] = classified.status;
    row[index["wallet"]] = classified.wallet || "生活";
    row[index["intent"]] = classified.intent || "その他";

    updatedCount++;
  }

  txSheet
    .getRange(
      2,
      1,
      values.length - 1,
      values[0].length
    )
    .setValues(values.slice(1));

  Logger.log(`再分類完了: ${updatedCount}件`);
}


function migrateRulesToCategoryV2() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("rules");

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  const majorMap = {
    "固定費": "通信",
    "趣味娯楽": "趣味",
    "生活費": "生活用品",
    "配信活動": "仕事・副業",
    "振替": "移動",
    "値引き": "調整",
  };

  const subMap = {
    "通信費": "スマホ",
    "サブスク": "サブスク",
    "配信ソフト": "ソフトウェア",
    "娯楽その他": "動画",
    "雑貨": "日用品",
    "イラスト依頼": "イラスト依頼",
    "電子マネー補充": "電子マネーチャージ",
    "ポイント還元": "ポイント還元",
    "クレカ引落": "クレカ引落",
    "口座移動": "口座移動",
    "ゲーム": "ゲーム",
    "外食": "外食",
    "コンビニ": "コンビニ",
    "電車": "電車",
    "イベント": "イベント",
    "税金": "税金",
    "手数料": "手数料",
    "給与": "給与",
    "配信収益": "配信収益",
    "その他収入": "その他収入",
    "キャッシュバック": "キャッシュバック",
    "個人間送金": "個人間送金",
  };

  for (let r = 1; r < values.length; r++) {
    const row = values[r];

    let type = String(row[idx["type_result"]] || "");
    let major = String(row[idx["major_category"]] || "");
    let sub = String(row[idx["sub_category"]] || "");

    if (type === "振替") type = "移動";
    if (type === "値引き") type = "調整";

    if (majorMap[major]) major = majorMap[major];
    if (subMap[sub]) sub = subMap[sub];

    sheet.getRange(r + 1, idx["type_result"] + 1).setValue(type);
    sheet.getRange(r + 1, idx["major_category"] + 1).setValue(major);
    sheet.getRange(r + 1, idx["sub_category"] + 1).setValue(sub);
  }
}

function learnRulesFromReviewQueue() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reviewSheet = ss.getSheetByName("review_queue");
  const rulesSheet = ss.getSheetByName("rules");

  const values = reviewSheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const rows = values.slice(1);

  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  const requiredCols = [
    "merchant",
    "type_manual",
    "major_manual",
    "sub_manual",
    "purpose_manual",
    "expense_ratio_manual",
    "rule_keyword",
    "rule_target",
    "learn"
  ];

  for (const col of requiredCols) {
    if (idx[col] === undefined) {
      throw new Error(`review_queue に列がありません: ${col}`);
    }
  }

  const ruleValues = rulesSheet.getDataRange().getValues();
  const ruleHeaders = ruleValues[0];

  const rIdx = {};
  ruleHeaders.forEach((h, i) => rIdx[h] = i);

  const priorityCol = rIdx["priority"];
  const priorities = ruleValues.slice(1)
    .map(r => Number(r[priorityCol] || 0))
    .filter(n => !isNaN(n));

  let nextPriority = priorities.length > 0 ? Math.max(...priorities) + 10 : 100;

  const newRules = [];

  for (const row of rows) {
    const learnValue = String(row[idx["learn"]] || "").toUpperCase();
    if (learnValue !== "TRUE" && learnValue !== "1" && learnValue !== "YES") continue;

    const merchant = String(row[idx["merchant"]] || "").trim();
    const keyword = String(row[idx["rule_keyword"]] || merchant).trim();
    const matchTarget = String(row[idx["rule_target"]] || "merchant").trim();

    const type = String(row[idx["type_manual"]] || "").trim();
    const major = String(row[idx["major_manual"]] || "").trim();
    const sub = String(row[idx["sub_manual"]] || "").trim();
    const purpose = String(row[idx["purpose_manual"]] || "私用").trim();
    const expenseRatio = Number(row[idx["expense_ratio_manual"]] || 0);

    if (!keyword || !type || !major || !sub) continue;

    newRules.push([
      nextPriority,
      matchTarget,
      keyword,
      "contains",
      type,
      major,
      sub,
      purpose,
      expenseRatio,
      "確定",
      "review_queueから追加"
    ]);

    nextPriority += 10;
  }

  if (newRules.length > 0) {
    rulesSheet.getRange(
      rulesSheet.getLastRow() + 1,
      1,
      newRules.length,
      newRules[0].length
    ).setValues(newRules);
  }

  Logger.log(`rules追加: ${newRules.length}件`);
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

function normalizeAllTransactions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("transactions");

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  for (let i = 1; i < values.length; i++) {
    const merchant = values[i][idx["merchant"]];
    values[i][idx["merchant"]] = normalizeMerchant(merchant);
  }

  sheet.getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));
}

function normalizeTextBase(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function loadMerchantAliases() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("merchant_alias");

  if (!sheet) return new Map();

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return new Map();

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

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

function normalizeAllTransactionsWithAlias() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("transactions");
  const aliasMap = loadMerchantAliases();

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  for (let i = 1; i < values.length; i++) {
    let merchant = values[i][idx["merchant"]];

    merchant = normalizeMerchant(merchant);
    merchant = applyMerchantAlias(merchant, aliasMap);

    values[i][idx["merchant"]] = merchant;
  }

  sheet.getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));
}

function buildMerchantFrequencyMap() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("transactions");

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return {};

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  const map = {};

  for (const row of values.slice(1)) {
    const merchant = String(row[idx["merchant"]] || "").trim();
    if (!merchant) continue;

    map[merchant] = (map[merchant] || 0) + 1;
  }

  return map;
}

function learnRulesFromBulkReview() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bulkSheet = ss.getSheetByName("bulk_review");
  const rulesSheet = ss.getSheetByName("rules");

  const values = bulkSheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const rows = values.slice(1);

  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  const ruleValues = rulesSheet.getDataRange().getValues();
  const ruleHeaders = ruleValues[0];

  const rIdx = {};
  ruleHeaders.forEach((h, i) => rIdx[h] = i);

  const priorities = ruleValues.slice(1)
    .map(r => Number(r[rIdx["priority"]] || 0))
    .filter(n => !isNaN(n));

  let nextPriority = priorities.length > 0 ? Math.max(...priorities) + 10 : 100;

  const newRules = [];

  for (const row of rows) {
    const bulkSafe = String(row[idx["bulk_safe"]] || "").toUpperCase();
    if (bulkSafe !== "TRUE" && bulkSafe !== "1" && bulkSafe !== "YES") continue;

    const merchant = String(row[idx["merchant"]] || "").trim();
    const keyword = String(row[idx["rule_keyword"]] || merchant).trim();
    const matchTarget = String(row[idx["rule_target"]] || "merchant").trim();

    const type = String(row[idx["type_manual"]] || "").trim();
    const major = String(row[idx["major_manual"]] || "").trim();
    const sub = String(row[idx["sub_manual"]] || "").trim();
    const purpose = String(row[idx["purpose_manual"]] || "私用").trim();
    const ratio = Number(row[idx["expense_ratio_manual"]] || 0);
    const note = String(row[idx["note"]] || "bulk_reviewから追加").trim();

    if (!keyword || !type || !major || !sub) continue;

    newRules.push([
      nextPriority,
      matchTarget,
      keyword,
      "equals",
      type,
      major,
      sub,
      purpose,
      ratio,
      "確定",
      note
    ]);

    nextPriority += 10;
  }

  if (newRules.length > 0) {
    rulesSheet.getRange(
      rulesSheet.getLastRow() + 1,
      1,
      newRules.length,
      newRules[0].length
    ).setValues(newRules);
  }

  Logger.log(`bulk rules追加: ${newRules.length}件`);
}

function migrateRulesToFinalCategories() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("rules");

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  const majorMap = {
    "生活用品": "生活",
    "仕事・副業": "配信"
  };

  const subMap = {
    "ソフト購入": "ソフト購入",
    "配信経費": "配信経費",
    "イラスト依頼": "イラスト依頼",
    "機材": "機材",
    "仕事用品": "仕事用品"
  };

  for (let r = 1; r < values.length; r++) {
    let major = String(values[r][idx["major_category"]] || "").trim();
    let sub = String(values[r][idx["sub_category"]] || "").trim();

    if (majorMap[major]) major = majorMap[major];
    if (subMap[sub]) sub = subMap[sub];

    sheet.getRange(r + 1, idx["major_category"] + 1).setValue(major);
    sheet.getRange(r + 1, idx["sub_category"] + 1).setValue(sub);
  }

  Logger.log("rulesカテゴリ移行完了");
}

function rebuildRecurringCandidates() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = ss.getSheetByName("transactions");
  const outSheet = ss.getSheetByName("recurring_candidates");

  const values = txSheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  const map = new Map();

  for (const row of values.slice(1)) {
    const type = String(row[idx["type"]] || "").trim();
    if (type !== "支出") continue;

    const merchant = String(row[idx["merchant"]] || "").trim();
    if (!merchant) continue;

    const amount = Number(row[idx["amount"]] || 0);
    if (!amount) continue;

    const ym = normalizeYearMonth(row[idx["transaction_date"]]);
    if (!ym) continue;

    const major = String(row[idx["major_category"]] || "").trim();
    const sub = String(row[idx["sub_category"]] || "").trim();

    // 金額を100円単位で丸めて、多少のズレを吸収
    const amountBucket = Math.round(amount / 100) * 100;
    const key = `${merchant}|${amountBucket}`;

    if (!map.has(key)) {
      map.set(key, {
        merchant,
        amountBucket,
        months: new Set(),
        amounts: [],
        category: `${major} / ${sub}`,
      });
    }

    const item = map.get(key);
    item.months.add(ym);
    item.amounts.push(amount);
  }

  const candidates = Array.from(map.values())
    .filter(item => item.months.size >= 2)
    .map(item => {
      const months = Array.from(item.months).sort();
      const avg = item.amounts.reduce((a, b) => a + b, 0) / item.amounts.length;

      return [
        item.merchant,
        item.amountBucket,
        months.length,
        months[0],
        months[months.length - 1],
        Math.round(avg),
        item.category,
        "候補",
        ""
      ];
    })
    .sort((a, b) => {
      if (b[2] !== a[2]) return b[2] - a[2];
      return b[5] - a[5];
    });

  outSheet.clearContents();
  outSheet.appendRow([
    "merchant",
    "amount",
    "month_count",
    "first_month",
    "last_month",
    "avg_amount",
    "category",
    "status",
    "note"
  ]);

  if (candidates.length > 0) {
    outSheet.getRange(2, 1, candidates.length, candidates[0].length).setValues(candidates);
  }
}

function initializeTransactionWallet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("transactions");

  if (!sheet) {
    throw new Error("transactions シートがありません");
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    Logger.log("transactions にデータがありません");
    return;
  }

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => {
    idx[String(h).trim()] = i;
  });

  if (idx["wallet"] === undefined) {
    throw new Error("transactions に wallet 列がありません");
  }

  let updatedCount = 0;

  for (let r = 1; r < values.length; r++) {
    const current = String(values[r][idx["wallet"]] || "").trim();

    if (!current) {
      values[r][idx["wallet"]] = "生活";
      updatedCount++;
    }
  }

  sheet
    .getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));

  Logger.log(`transactions wallet初期設定: ${updatedCount}件`);
}
function initializeRuleWallet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("rules");

  if (!sheet) {
    throw new Error("rules シートがありません");
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    Logger.log("rules にデータがありません");
    return;
  }

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => {
    idx[String(h).trim()] = i;
  });

  if (idx["wallet_result"] === undefined) {
    throw new Error("rules に wallet_result 列がありません");
  }

  let updatedCount = 0;

  for (let r = 1; r < values.length; r++) {
    const current = String(values[r][idx["wallet_result"]] || "").trim();
    if (current) continue;

    const major = String(values[r][idx["major_category"]] || "").trim();
    const sub = String(values[r][idx["sub_category"]] || "").trim();
    const purpose = String(values[r][idx["purpose_type"]] || "").trim();

    let wallet = "生活";

    if (
      major === "配信" ||
      purpose === "経費" ||
      [
        "配信収益",
        "配信経費",
        "機材",
        "イラスト依頼",
        "素材購入",
        "ソフト購入",
        "外注",
        "広告",
        "配信サブスク"
      ].includes(sub)
    ) {
      wallet = "事業";
    }

    values[r][idx["wallet_result"]] = wallet;
    updatedCount++;
  }

  sheet
    .getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));

  Logger.log(`rules wallet_result初期設定: ${updatedCount}件`);
}

function validateTransactionAccounts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = ss.getSheetByName("transactions");
  const accountSheet = ss.getSheetByName("accounts");

  if (!txSheet) {
    throw new Error("transactions シートがありません");
  }

  if (!accountSheet) {
    throw new Error("accounts シートがありません");
  }

  const txValues = txSheet.getDataRange().getValues();
  const accountValues = accountSheet.getDataRange().getValues();

  if (txValues.length < 2) {
    Logger.log("transactions にデータがありません");
    return;
  }

  if (accountValues.length < 2) {
    throw new Error("accounts にデータがありません");
  }

  const txHeaders = txValues[0];
  const txIdx = {};
  txHeaders.forEach((h, i) => {
    txIdx[String(h).trim()] = i;
  });

  if (txIdx["account_name"] === undefined) {
    throw new Error("transactions に account_name 列がありません");
  }

  const accountHeaders = accountValues[0];
  const accountIdx = {};
  accountHeaders.forEach((h, i) => {
    accountIdx[String(h).trim()] = i;
  });

  if (accountIdx["account_name"] === undefined) {
    throw new Error("accounts に account_name 列がありません");
  }

  const validAccounts = new Set();

  for (const row of accountValues.slice(1)) {
    const accountName = String(
      row[accountIdx["account_name"]] || ""
    ).trim();

    if (accountName) {
      validAccounts.add(accountName);
    }
  }

  const unknownMap = new Map();

  for (const row of txValues.slice(1)) {
    const accountName = String(
      row[txIdx["account_name"]] || ""
    ).trim();

    if (!accountName) {
      unknownMap.set(
        "(空欄)",
        (unknownMap.get("(空欄)") || 0) + 1
      );
      continue;
    }

    if (!validAccounts.has(accountName)) {
      unknownMap.set(
        accountName,
        (unknownMap.get(accountName) || 0) + 1
      );
    }
  }

  if (unknownMap.size === 0) {
    Logger.log("全ての account_name が accounts マスタに登録されています");
    return;
  }

  Logger.log("未登録の account_name:");

  for (const [accountName, count] of unknownMap.entries()) {
    Logger.log(`${accountName}: ${count}件`);
  }

  throw new Error(
    `未登録の account_name が ${unknownMap.size}種類あります`
  );
}

function normalizeAccountName(accountName) {
  const raw = String(accountName || "").trim();
  if (!raw) return "";

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("account_alias");

  if (!sheet) return raw;

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return raw;

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => {
    idx[String(h).trim()] = i;
  });

  for (const row of values.slice(1)) {
    const alias = String(row[idx["raw_account_name"]] || "").trim();
    const canonical = String(row[idx["canonical_account_name"]] || "").trim();

    if (alias === raw && canonical) {
      return canonical;
    }
  }

  return raw;
}

function initializeRuleIntent() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("rules");

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  let updated = 0;

  for (let i = 1; i < values.length; i++) {

    if (values[i][idx["intent_result"]]) continue;

    const major = String(values[i][idx["major_category"]] || "");
    const sub = String(values[i][idx["sub_category"]] || "");
    const wallet = String(values[i][idx["wallet_result"]] || "");

    let intent = "その他";

    // ===== 生活維持 =====
    if (
      major === "食費" ||
      major === "住居" ||
      major === "通信" ||
      major === "交通" ||
      major === "生活用品"
    ) {
      intent = "生活維持";
    }

    // ===== 娯楽 =====
    else if (
      major === "趣味"
    ) {
      intent = "娯楽";
    }

    // ===== 資産形成 =====
    else if (
      major === "金融"
    ) {
      intent = "資産形成";
    }

    // ===== 事業 =====
    else if (
      wallet === "事業"
    ) {
      intent = "事業活動";
    }

    // ===== プレゼント =====
    else if (
      major === "交際"
    ) {
      intent = "贈与・交際";
    }

    values[i][idx["intent_result"]] = intent;
    updated++;
  }

  sheet.getRange(2,1,values.length-1,values[0].length)
       .setValues(values.slice(1));

  Logger.log(updated + "件更新");
}

function isFixedExpenseCategory(majorCategory, subCategory) {
  const major = String(majorCategory || "").trim();
  const sub = String(subCategory || "").trim();

  if (major === "住居" || major === "通信") {
    return true;
  }

  if (
    major === "金融" &&
    ["税金", "保険"].includes(sub)
  ) {
    return true;
  }

  return false;
}

function getMoneyHealth(yearMonth) {

  const available = getAvailableMoney(yearMonth);
  const savingForecast = getSavingForecast(yearMonth);
  const expense = getMonthlyLivingExpenseBreakdown(yearMonth);

  let level = "🟢";
  let title = "順調です";

  const comments = [];

  if (available < 0) {

    level = "🔴";
    title = "予算オーバー";

    comments.push("今月の自由に使えるお金を超えています。");

  } else if (available < 10000) {

    level = "🟡";
    title = "少し注意";

    comments.push("残りの自由枠が1万円未満です。");

  } else {

    comments.push("今月は予算内で推移しています。");

  }

  if (savingForecast < 0) {

    comments.push("このままでは今月は赤字予測です。");

  } else {

    comments.push(
      `今月は約${savingForecast.toLocaleString()}円貯金できる見込みです。`
    );

  }

  if (expense.variableExpense > expense.fixedExpense) {

    comments.push("変動費が固定費を上回っています。");

  }

  return {

    level,
    title,
    message: comments.join("\n")

  };

}

function getDreamFund(dreamId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("dream_funds");

  if (!sheet) {
    throw new Error("dream_funds シートがありません");
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => idx[String(h).trim()] = i);

  for (const row of values.slice(1)) {

    if (String(row[idx["dream_id"]]) !== dreamId) {
      continue;
    }

    const target = Number(row[idx["target_amount"]] || 0);
    const current = Number(row[idx["current_amount"]] || 0);
    const monthly = Number(row[idx["monthly_plan"]] || 0);

    const remain = Math.max(target - current, 0);

    let progress = 0;

    if (target > 0) {
      progress = current / target;
    }

    let remainMonths = 0;

    if (monthly > 0) {
      remainMonths = Math.ceil(remain / monthly);
    }

    return {
      dream_id: dreamId,
      name: row[idx["name"]],
      wallet: row[idx["wallet"]],
      target_amount: target,
      current_amount: current,
      remain_amount: remain,
      monthly_plan: monthly,
      progress,
      remain_months: remainMonths,
      target_date: row[idx["target_date"]],
      priority: row[idx["priority"]],
      status: row[idx["status"]]
    };
  }

  return null;
}

function getFeaturedDreamFund() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("dream_funds");

  if (!sheet) {
    throw new Error("dream_funds シートがありません");
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => {
    idx[String(h).trim()] = i;
  });

  const priorityOrder = {
    High: 3,
    Medium: 2,
    Low: 1
  };

  const candidates = [];

  for (const row of values.slice(1)) {
    const dreamId = String(row[idx["dream_id"]] || "").trim();
    const status = String(row[idx["status"]] || "").trim();
    const priority = String(row[idx["priority"]] || "").trim();

    if (!dreamId || status !== "進行中") continue;

    const dream = getDreamFund(dreamId);
    if (!dream) continue;

    candidates.push({
      ...dream,
      priority_score: priorityOrder[priority] || 0
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.priority_score !== a.priority_score) {
      return b.priority_score - a.priority_score;
    }

    return a.dream_id.localeCompare(b.dream_id);
  });

  return candidates[0];
}

function getCategorySummary(yearMonth){

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("category_summary");

  const values = sheet.getDataRange().getValues();

  if(values.length < 2){
    return [];
  }

  const headers = values[0];
  const idx = {};

  headers.forEach((h,i)=>idx[h]=i);

  const result = [];

  for(const row of values.slice(1)){

    if(String(row[idx["year_month"]]) !== yearMonth){
      continue;
    }

    result.push({

      category: row[idx["major_category"]],
      amount: Number(row[idx["total_amount"]]||0)

    });

  }

  result.sort((a,b)=>b.amount-a.amount);

  return result;

}
