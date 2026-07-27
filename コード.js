function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const timestamp = new Date();
    const rules = getRules();

    const mode = String(data.mode || "cash").trim(); // cash / memo
    const merchantInput = String(data.merchant || data.content || "").trim();
    const memo = String(data.memo || "").trim();
    const amount = Number(data.amount || 0);

    if (!merchantInput || !amount) {
      throw new Error("merchant/content と amount は必須です");
    }

    let driveUrl = "";
    const imageUrl = data.image || "";

    try {
      if (imageUrl) {
        const response = UrlFetchApp.fetch(imageUrl);
        const blob = response.getBlob();

        const folder = DriveApp.getFolderById("1Kv0tY7pPD6vcumQH-xcyuZ1Mo_XtH39b");
        const safeName = merchantInput.replace(/[\\\/:*?"<>|]/g, "_");
        const fileName =
          Utilities.formatDate(timestamp, "Asia/Tokyo", "yyyyMMdd_HHmmss") +
          "_" +
          safeName;

        const file = folder.createFile(blob.setName(fileName));
        driveUrl = file.getUrl();
      }
    } catch (err) {
      driveUrl = "";
    }

    const sample = {
      transaction_date: Utilities.formatDate(timestamp, "Asia/Tokyo", "yyyy-MM-dd"),
      merchant: normalizeMerchant(merchantInput),
      item_name: merchantInput,
      amount: amount,
      note: memo,
      source_type: "Discord",
      payment_method: mode === "cash" ? "現金" : "pending",
      account_name: "Discord Manual",
      evidence_url: driveUrl,
      original_image_url: imageUrl,
      import_batch: Utilities.formatDate(timestamp, "Asia/Tokyo", "yyyyMMdd_HHmmss"),
      duplicate_key: "",
    };

    let classified;

    if (mode === "memo") {
      classified = {
        type: "メモ",
        major_category: "その他",
        sub_category: "要確認",
        purpose_type: "私用",
        expense_ratio: 0,
        status: "pending",
        wallet: "生活",
        intent: "その他",
      };
    } else if (data.category && String(data.category).trim() !== "") {
      classified = {
        type: "支出",
        major_category: mapMajorCategory(data.category),
        sub_category: data.category,
        purpose_type: guessPurposeType(data.category),
        expense_ratio: guessExpenseRatio(data.category),
        status: "確定",
        wallet: guessPurposeType(data.category) === "経費" ? "事業" : "生活",
        intent: guessIntent(data.category),
      };
    } else {
      classified = classifyTransaction(sample, rules);
    }

    const tx = {
      ...sample,
      ...classified,
    };

    const added = addTransaction(tx);

    rebuildReviewQueue();
    rebuildReviewSummary();
    rebuildAllViews();

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        added: added,
        mode: mode,
        merchant: tx.merchant,
        amount: tx.amount,
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        ok: false,
        error: error.message,
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

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

function testDoPostCash() {
  const e = {
    postData: {
      contents: JSON.stringify({
        merchant: "ローソン",
        amount: 500,
        mode: "cash",
        memo: "テスト現金"
      })
    }
  };

  const result = doPost(e);
  Logger.log(result.getContent());
}

function testDoPostMemo() {
  const e = {
    postData: {
      contents: JSON.stringify({
        merchant: "BOOTH",
        amount: 3200,
        mode: "memo",
        memo: "配信素材テスト"
      })
    }
  };

  const result = doPost(e);
  Logger.log(result.getContent());
}


function testAccess() {
  const folder = DriveApp.getFolderById("1Kv0tY7pPD6vcumQH-xcyuZ1Mo_XtH39b");
  const response = UrlFetchApp.fetch("https://example.com");

  const file = folder.createFile("test.txt", "permission check");

  console.log(folder.getName());
  console.log(response.getResponseCode());
  console.log(file.getUrl());
}

function getRules() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("rules");
  const values = sheet.getDataRange().getValues();

  const headers = values[0];
  const rows = values.slice(1);

  const rules = rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });

  rules.sort((a, b) => Number(a.priority) - Number(b.priority));

  return rules;
}

function normalizeTextForRule(value) {
  let text = String(value || "")
    .toLowerCase()
    .trim();

  // 全角英数字を半角へ
  text = text.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 65248);
  });

  // スペース類を統一
  text = text.replace(/\s+/g, " ");

  // 表記ゆれ統一
  text = text.replace(/ﾍﾟｲﾍﾟｲ/g, "paypay");
  text = text.replace(/ｐａｙｐａｙ/g, "paypay");
  text = text.replace(/paypay/g, "paypay");

  text = text.replace(/ｶｰﾄﾞ/g, "card");
  text = text.replace(/カード/g, "card");

  text = text.replace(/ｸﾚｼﾞｯﾄ/g, "credit");
  text = text.replace(/クレジット/g, "credit");

  text = text.replace(/ﾗｸﾃﾝ/g, "楽天");
  text = text.replace(/ﾐﾂｲｽﾐﾄﾓ/g, "三井住友");

  return text;
}

function isRuleMatched(targetText, keyword, ruleType) {
  const target = normalizeTextForRule(targetText);
  const key = normalizeTextForRule(keyword);
  const type = String(ruleType || "contains").trim();

  if (!target || !key) return false;

  if (type === "contains") {
    return target.includes(key);
  }

  if (type === "starts_with") {
    return target.startsWith(key);
  }

  if (type === "equals") {
    return target === key;
  }

  return false;
}

function classifyTransaction(tx, rules) {
  const rawText = (
    (tx.merchant || "") + " " +
    (tx.item_name || "") + " " +
    (tx.note || "") + " " +
    (tx.source_type || "") + " " +
    (tx.account_name || "") + " " +
    (tx.payment_method || "")
  );

  const fieldMap = {
    raw_text: rawText,
    merchant: tx.merchant || "",
    item_name: tx.item_name || "",
    note: tx.note || "",
    source_type: tx.source_type || "",
    account_name: tx.account_name || "",
    payment_method: tx.payment_method || "",
    amount: String(tx.amount || ""),
    wallet: tx.wallet || "生活",
  };

  for (const rule of rules) {
    const keyword = String(rule.keyword || "");
    if (!keyword) continue;

    const matchTarget = String(rule.match_target || "raw_text").trim();
    const targetText = fieldMap[matchTarget] !== undefined
      ? fieldMap[matchTarget]
      : rawText;

    if (isRuleMatched(targetText, keyword, rule.rule_type)) {
      return {
        type: rule.type_result,
        major_category: rule.major_category,
        sub_category: rule.sub_category,
        purpose_type: rule.purpose_type,
        expense_ratio: Number(rule.expense_ratio || 0),
        status: rule.status_result,
        wallet: rule.wallet_result || "生活",
        intent: rule.intent_result || "その他",
      };
    }
  }

  return {
    type: "支出",
    major_category: "その他",
    sub_category: "要確認",
    purpose_type: "私用",
    expense_ratio: 0,
    status: "要確認",
    wallet: "生活",
    intent: "その他",
  };
}

function addTransaction(tx) {
  tx.account_name = normalizeAccountName(tx.account_name);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("transactions");

  const now = new Date();
  let ym = "";
  if (tx.transaction_date) {
    const parsedDate = new Date(String(tx.transaction_date).replace(/\./g, "/"));
    if (!isNaN(parsedDate.getTime())) {
      ym = Utilities.formatDate(parsedDate, "Asia/Tokyo", "yyyy-MM");
    }
  }

  if (!ym) {
    ym = Utilities.formatDate(now, "Asia/Tokyo", "yyyy-MM");
  }

  const id = Utilities.getUuid();
  const expenseAmount = tx.amount * tx.expense_ratio;
  const wallet = tx.wallet || "生活";
  const intent = tx.intent || "その他";

  const duplicateKey = buildDuplicateKey(tx);
  const existingKeys = getExistingDuplicateKeys();

  if (existingKeys.has(duplicateKey)) {
    Logger.log("重複のためスキップ: " + duplicateKey);
    return false;
  }

  sheet.appendRow([
    id,
    tx.transaction_date || "",
    now,
    ym,
    tx.type,
    tx.source_type || "manual",
    tx.payment_method || "",
    tx.account_name || "",
    tx.merchant || "",
    tx.item_name || "",
    tx.amount,
    tx.major_category,
    tx.sub_category,
    tx.purpose_type,
    tx.expense_ratio,
    expenseAmount,
    tx.note || "",
    tx.evidence_url || "",
    tx.original_image_url || "",
    tx.import_batch || "",
    duplicateKey,
    tx.status,
    wallet,
    intent
  ]);

  return true;
}

function testAddTransaction() {
  const rules = getRules();

  const sample = {
    transaction_date: "2026-04-18",
    merchant: "マクドナルド",
    item_name: "てりやきセット",
    amount: 850,
    note: "",
    source_type: "test"
  };

  const result = classifyTransaction(sample, rules);

  const tx = {
    ...sample,
    ...result
  };

  addTransaction(tx);
}

function mapMajorCategory(subCategory) {
  const map = {
    "スーパー": "食費",
    "コンビニ": "食費",
    "外食": "食費",
    "カフェ": "食費",

    "日用品": "生活費",
    "消耗品": "生活費",
    "雑貨": "生活費",

    "家賃": "固定費",
    "通信費": "固定費",
    "サブスク": "固定費",
    "保険": "固定費",
    "水道光熱費": "固定費",
    "税金": "固定費",

    "電車": "交通",
    "バス": "交通",
    "タクシー": "交通",
    "ガソリン": "交通",
    "駐車場": "交通",

    "ゲーム": "趣味娯楽",
    "グッズ": "趣味娯楽",
    "イベント": "趣味娯楽",
    "娯楽その他": "趣味娯楽",

    "衣服": "美容衣服",
    "美容": "美容衣服",
    "理容": "美容衣服",

    "病院": "医療健康",
    "薬": "医療健康",
    "健康用品": "医療健康",

    "書籍": "仕事・学業",
    "ソフト": "仕事・学業",
    "研究用品": "仕事・学業",
    "講座": "仕事・学業",
    "事務用品": "仕事・学業",

    "配信機材": "配信活動",
    "イラスト依頼": "配信活動",
    "配信ソフト": "配信活動",
    "素材": "配信活動",
    "外注費": "配信活動",
    "広告宣伝": "配信活動",
    "配信サブスク": "配信活動",

    "給与": "収入",
    "配信収益": "収入",
    "アフィリエイト": "収入",
    "その他収入": "収入",

    "クレカ引落": "振替",
    "電子マネー補充": "振替",
    "口座移動": "振替",
    "証券口座入金": "振替",

    "要確認": "その他",
  };

  return map[subCategory] || "その他";
}

function guessPurposeType(subCategory) {
  const businessCategories = [
    "配信機材",
    "イラスト依頼",
    "配信ソフト",
    "素材",
    "外注費",
    "広告宣伝",
    "配信サブスク",
  ];

  if (businessCategories.includes(subCategory)) return "経費";
  if (subCategory === "通信費" || subCategory === "サブスク") return "共用";
  return "私用";
}

function guessExpenseRatio(subCategory) {
  const fullBusiness = [
    "配信機材",
    "イラスト依頼",
    "配信ソフト",
    "素材",
    "外注費",
    "広告宣伝",
    "配信サブスク",
  ];

  if (fullBusiness.includes(subCategory)) return 1;
  if (subCategory === "通信費") return 0.4;
  if (subCategory === "サブスク") return 0.3;
  return 0;
}

function getImportConfig(configName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("import_config");
  const values = sheet.getDataRange().getValues();

  const headers = values[0];
  const rows = values.slice(1);

  for (const row of rows) {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);

    if (obj.config_name === configName) {
      const active = String(obj.active || "1").trim();

      if (active !== "1" && active.toUpperCase() !== "TRUE") {
        throw new Error("import_config が inactive です: " + configName);
      }

      return obj;
    }
  }

  throw new Error("import_config に該当設定がありません: " + configName);
}

function readImportCsv() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("import_csv");
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return [];

  const headers = values[0];
  const rows = values.slice(1);

  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function normalizeCsvRow(row, config) {
  const dateValue = row[Object.keys(row)[Number(config.date_col) - 1]];
  const merchantValue = row[Object.keys(row)[Number(config.merchant_col) - 1]];
  const itemValue = row[Object.keys(row)[Number(config.item_col) - 1]];
  const amountValue = row[Object.keys(row)[Number(config.amount_col) - 1]];
  const noteValue = row[Object.keys(row)[Number(config.note_col) - 1]];

  const amount = Number(amountValue) * Number(config.amount_sign || 1);

  return {
    transaction_date: dateValue,
    merchant: merchantValue || "",
    item_name: itemValue || "",
    amount: amount,
    note: noteValue || "",
    source_type: config.source_type || "CSV",
    payment_method: config.payment_method || "",
    account_name: config.account_name || "",
    evidence_url: "",
    original_image_url: "",
    import_batch: Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd_HHmmss"),
    duplicate_key: "",
  };
}

function importCsvToTransactions(configName) {
  const config = getImportConfig(configName);
  const rows = readImportCsv();
  const rules = getRules();

  let addedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    const txBase = normalizeCsvRow(row, config);
    const classified = classifyTransaction(txBase, rules);

    const tx = {
      ...txBase,
      ...classified,
    };

    const added = addTransaction(tx);

    if (added) {
      addedCount++;
    } else {
      skippedCount++;
    }
  }

  Logger.log(`追加: ${addedCount}件 / 重複スキップ: ${skippedCount}件`);
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

function runImportTest() {
  importCsvToTransactions("credit_default");
}

function getLatestCsvFileFromDrive(folderId) {
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();

  let latestFile = null;
  let latestTime = 0;

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName().toLowerCase();

    if (!name.endsWith(".csv")) continue;

    const updatedTime = file.getLastUpdated().getTime();
    if (updatedTime > latestTime) {
      latestTime = updatedTime;
      latestFile = file;
    }
  }

  if (!latestFile) {
    throw new Error("CSVファイルが見つかりません");
  }

  return latestFile;
}

function parseCsvFile(file) {
  const blob = file.getBlob();

  // 日本の金融CSVはShift_JISが多いので先に読む
  const sjis = blob.getDataAsString("Shift_JIS");
  const parsedSjis = Utilities.parseCsv(sjis);

  const joined = parsedSjis.slice(0, 5)
    .map(r => r.join("|"))
    .join("|")
    .normalize("NFKC");

  if (
    joined.includes("年月日") ||
    joined.includes("お引出し") ||
    joined.includes("お預入れ") ||
    joined.includes("お取り扱い内容") ||
    joined.includes("Olive") ||
    joined.includes("クレジット")
  ) {
    return parsedSjis;
  }

  const utf8 = blob.getDataAsString("UTF-8");
  return Utilities.parseCsv(utf8);
}

function readCsvRowsFromDrive(folderId) {
  const file = getLatestCsvFileFromDrive(folderId);
  const values = parseCsvFile(file);

  if (values.length < 2) {
    throw new Error("CSVの中身が空です");
  }

  let headerRowIndex = -1;

  for (let i = 0; i < values.length; i++) {
    const row = values[i].map(v => String(v).trim());

    const isSaison = row.includes("利用日") && row.includes("利用金額");
    const isStacia = row.includes("ご利用日") && row.includes("ご利用先など") && row.includes("お支払い金額(￥)");
    const isJpbank = row.includes("取引日") && row.includes("受入金額（円）") && row.includes("払出金額（円）");
    const isSmbc = row.includes("年月日") && row.includes("お引出し") && row.includes("お預入れ") && row.includes("お取り扱い内容");
    const isPayPay = row.includes("取引日") && row.includes("出金金額（円）") && row.includes("入金金額（円）") && row.includes("取引内容");

    if (isSaison || isStacia || isJpbank || isSmbc || isPayPay) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("明細ヘッダ行が見つかりません");
  }

  const headers = values[headerRowIndex].map(v => String(v).trim());
  const rows = values
    .slice(headerRowIndex + 1)
    .filter(row => row.join("").trim() !== "");

  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });
}

function normalizeCsvRowByHeader(row, config) {
  let transactionDate = "";
  let merchant = "";
  let itemName = "";
  let amount = 0;
  let note = "";

  if (config.config_name === "saison_card_v1") {
    amount = Number(row["利用金額"] || 0) * Number(config.amount_sign || 1);
    transactionDate = row["利用日"] || "";
    merchant = row["ご利用店名及び商品名"] || "";
    itemName = row["ご利用店名及び商品名"] || "";
    note = row["備考"] || "";

  } else if (config.config_name === "stacia_jcb_v1") {
    amount = Number(String(row["お支払い金額(￥)"] || "0").replace(/,/g, "")) * Number(config.amount_sign || 1);
    transactionDate = String(row["ご利用日"] || "").trim();
    merchant = String(row["ご利用先など"] || "").trim();
    itemName = String(row["ご利用先など"] || "").trim();
    note = String(row["備考"] || "").trim();

    } else if (config.config_name === "olive_credit_v1") {
      amount = Number(String(row["請求額"] || row["金額"] || "0").replace(/,/g, "")) * Number(config.amount_sign || 1);
      transactionDate = String(row["利用日"] || "").trim();
      merchant = String(row["加盟店"] || "").trim();
      itemName = String(row["加盟店"] || "").trim();
      note = "Oliveクレカ";  

  } else if (config.config_name === "jpbank_v1") {
    const inAmount = Number(String(row["受入金額（円）"] || "0").replace(/,/g, ""));
    const outAmount = Number(String(row["払出金額（円）"] || "0").replace(/,/g, ""));

    amount = outAmount > 0 ? outAmount : inAmount;
    transactionDate = String(row["取引日"] || "").trim();
    merchant = [row["詳細１"] || "", row["詳細２"] || ""].join(" ").trim();
    itemName = merchant;
    note = String(row["入出金明細ＩＤ"] || "").trim();

  } else if (config.config_name === "smbc_bank_v1") {
    const inAmount = Number(String(row["お預入れ"] || "0").replace(/,/g, ""));
    const outAmount = Number(String(row["お引出し"] || "0").replace(/,/g, ""));

    amount = outAmount > 0 ? outAmount : inAmount;
    transactionDate = String(row["年月日"] || "").trim();
    merchant = String(row["お取り扱い内容"] || "").trim();
    itemName = merchant;
    note = String(row["メモ"] || "").trim();

  } else if (config.config_name === "paypay_v1") {
    const outAmount = Number(String(row["出金金額（円）"] || "0").replace(/,/g, "").replace(/-/g, "0"));
    const inAmount = Number(String(row["入金金額（円）"] || "0").replace(/,/g, "").replace(/-/g, "0"));

    amount = outAmount > 0 ? outAmount : inAmount;
    transactionDate = String(row["取引日"] || "").trim();
    merchant = String(row["取引先"] || "").trim();
    itemName = [row["取引内容"] || "", row["取引先"] || ""].join(" ").trim();
    note = String(row["取引方法"] || "").trim();

  } else {
    const values = Object.values(row);
    const dateValue = values[Number(config.date_col) - 1];
    const merchantValue = values[Number(config.merchant_col) - 1];
    const itemValue = values[Number(config.item_col) - 1];
    const amountValue = values[Number(config.amount_col) - 1];
    const noteValue = values[Number(config.note_col) - 1];

    amount = Number(String(amountValue || "0").replace(/,/g, "")) * Number(config.amount_sign || 1);
    transactionDate = dateValue || "";
    merchant = merchantValue || "";
    itemName = itemValue || "";
    note = noteValue || "";
  }

  return {
    transaction_date: transactionDate,
    merchant: merchant,
    item_name: itemName,
    amount: amount,
    note: note,
    source_type: config.source_type || "CSV",
    payment_method: config.payment_method || "",
    account_name: config.account_name || "",
    evidence_url: "",
    original_image_url: "",
    import_batch: Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd_HHmmss"),
    duplicate_key: "",
  };
}

function importLatestCsvFromDrive(folderId, configName) {
  const config = getImportConfig(configName);
  const rows = readCsvRowsFromDrive(folderId);
  const rules = getRules();

  let addedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    const txBase = normalizeCsvRowByHeader(row, config);

    txBase.merchant = normalizeMerchant(txBase.merchant);

    if (!txBase.transaction_date || !txBase.merchant || Number(txBase.amount) === 0) {
      continue;
    }

    let classified;

    if (
      config.config_name === "jpbank_v1" ||
      config.config_name === "smbc_bank_v1" ||
      config.config_name === "paypay_v1"
    ) {
      classified = classifyMoneyTransaction(row, txBase, rules, config.config_name);
    } else {
      classified = classifyTransaction(txBase, rules);
    }

    const tx = {
      ...txBase,
      ...classified,
    };

    const added = addTransaction(tx);

    if (added) {
      addedCount++;
    } else {
      skippedCount++;
    }
  }

  Logger.log(`追加: ${addedCount}件 / 重複スキップ: ${skippedCount}件`);
}

function classifyMoneyTransaction(row, txBase, rules, configName) {
  let inAmount = 0;
  let outAmount = 0;

  if (configName === "jpbank_v1") {
    inAmount = Number(String(row["受入金額（円）"] || "0").replace(/,/g, ""));
    outAmount = Number(String(row["払出金額（円）"] || "0").replace(/,/g, ""));
  } else if (configName === "smbc_bank_v1") {
    inAmount = Number(String(row["お預入れ"] || "0").replace(/,/g, ""));
    outAmount = Number(String(row["お引出し"] || "0").replace(/,/g, ""));
  } else if (configName === "paypay_v1") {
    inAmount = Number(String(row["入金金額（円）"] || "0").replace(/,/g, "").replace(/-/g, "0"));
    outAmount = Number(String(row["出金金額（円）"] || "0").replace(/,/g, "").replace(/-/g, "0"));
  }

  const autoType = inAmount > 0 ? "収入" : "支出";
  const classified = classifyTransaction(txBase, rules);

  return {
    ...classified,
    type: classified.type || autoType,
  };
}

function runSaisonImportFromDrive() {
  importLatestCsvFromDrive("1igN1iH0nFHOqf45uGUBIXe7oBPZIE_Hq", "saison_card_v1");
}

function runStaciaImportFromDrive() {
  importLatestCsvFromDrive("1igN1iH0nFHOqf45uGUBIXe7oBPZIE_Hq", "stacia_jcb_v1");
}

function runJpbankImportFromDrive() {
  importLatestCsvFromDrive("1igN1iH0nFHOqf45uGUBIXe7oBPZIE_Hq", "jpbank_v1");
}

function runSmbcImportFromDrive() {
  importLatestCsvFromDrive("1igN1iH0nFHOqf45uGUBIXe7oBPZIE_Hq", "smbc_bank_v1");
}

function runPayPayImportFromDrive() {
  importLatestCsvFromDrive("1igN1iH0nFHOqf45uGUBIXe7oBPZIE_Hq", "paypay_v1");
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


function normalizeYearMonth(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, "Asia/Tokyo", "yyyy-MM");
  }

  const s = String(value || "").trim();

  if (/^\d{4}-\d{2}$/.test(s)) {
    return s;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s.slice(0, 7);
  }

  if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) {
    return s.slice(0, 7).replace("/", "-");
  }

  if (/^\d{8}$/.test(s)) {
    return s.slice(0, 4) + "-" + s.slice(4, 6);
  }

  return "";
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

function detectCsvTypeFromRows(values) {
  for (let i = 0; i < values.length; i++) {
    const row = values[i].map(v => String(v).trim());

    const joined = row.join("|");
    const normalizedJoined = joined.normalize("NFKC");

    const isSmbcBank =
      joined.includes("年月日") &&
      joined.includes("お引出し") &&
      joined.includes("お預入れ") &&
      joined.includes("お取り扱い内容");

    const isPayPay =
      row.includes("取引日") &&
      row.includes("出金金額（円）") &&
      row.includes("入金金額（円）") &&
      row.includes("取引内容");

    const isOliveCard =
      row.includes("利用日") &&
      row.includes("加盟店") &&
      row.includes("金額") &&
      row.includes("請求額");
    
    const isOliveCardNoHeader =
      row.length >= 6 &&
      /^\d{4}\/\d{2}\/\d{2}$/.test(row[0]) &&
      !isNaN(Number(row[2]));

    const isOliveCreditNoHeader =
      normalizedJoined.includes("Olive") &&
      normalizedJoined.includes("クレジット");

    if (isSmbcBank) {
      return {
        csvType: "smbc_bank_v1",
        headerRowIndex: i,
      };
    }

    if (isPayPay) {
      return {
        csvType: "paypay_v1",
        headerRowIndex: i,
      };
    }

    if (isOliveCard) {
      return {
        csvType: "olive_credit_v1",
        headerRowIndex: i,
      };
    }

    if (isOliveCardNoHeader) {
      return {
        csvType: "olive_credit_v2",
        headerRowIndex: i
      };
    }

    if (isOliveCreditNoHeader) {
      return {
        csvType: "olive_credit_v1",
        headerRowIndex: -1,
      };
    }
  }

  return {
    csvType: "unknown",
    headerRowIndex: -1,
  };
}

function readCsvRowsFromFile(file) {
  const values = parseCsvFile(file);
  const detected = detectCsvTypeFromRows(values);

  if (detected.csvType === "olive_credit_v1" && detected.headerRowIndex === -1) {
    const rows = values
      .slice(1)
      .filter(row => row.join("").trim() !== "")
      .filter(row => String(row[0] || "").trim() !== "");

    const objects = rows.map(row => ({
      "利用日": row[0],
      "加盟店": row[1],
      "金額": row[2],
      "請求額": row[5],
    }));

    return {
      csvType: detected.csvType,
      rows: objects,
    };
  }

  if (detected.csvType === "unknown") {
    throw new Error("CSV種別を判定できません: " + file.getName());
  }

  const headers = values[detected.headerRowIndex].map(v => String(v).trim());
  const rows = values
    .slice(detected.headerRowIndex + 1)
    .filter(row => row.join("").trim() !== "");

  const objects = rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });

  return {
    csvType: detected.csvType,
    rows: objects,
  };
}

function getConfigNameByCsvType(csvType) {
  const map = {
    smbc_bank_v1: "smbc_bank_v1",
    paypay_v1: "paypay_v1",
    olive_credit_v1: "olive_credit_v1",
  };

  if (!map[csvType]) {
    throw new Error("対応していないCSV種別です: " + csvType);
  }

  return map[csvType];
}

function importCsvFileAuto(file) {
  const parsed = readCsvRowsFromFile(file);
  const configName = getConfigNameByCsvType(parsed.csvType);
  const config = getImportConfig(configName);
  const rules = getRules();

  let addedCount = 0;
  let skippedCount = 0;

  for (const row of parsed.rows) {
    const txBase = normalizeCsvRowByHeader(row, config);
    txBase.merchant = normalizeMerchant(txBase.merchant);

    if (!txBase.transaction_date || !txBase.merchant || Number(txBase.amount) === 0) {
      continue;
    }

    let classified;

    if (
      config.config_name === "smbc_bank_v1" ||
      config.config_name === "paypay_v1"
    ) {
      classified = classifyMoneyTransaction(row, txBase, rules, config.config_name);
    } else {
      classified = classifyTransaction(txBase, rules);
    }

    const tx = {
      ...txBase,
      ...classified,
    };

    const added = addTransaction(tx);

    if (added) addedCount++;
    else skippedCount++;
  }

  Logger.log(
    `${file.getName()} / ${parsed.csvType} / 追加: ${addedCount}件 / 重複スキップ: ${skippedCount}件`
  );
}

function runImportAllCsv() {
  const folderId = "1igN1iH0nFHOqf45uGUBIXe7oBPZIE_Hq";
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName().toLowerCase();

    if (!name.endsWith(".csv")) continue;

    try {
      importCsvFileAuto(file);
    } catch (error) {
      Logger.log("取込失敗: " + file.getName() + " / " + error.message);
    }
  }

  reclassifyAllTransactions();
  rebuildReviewQueue();
  rebuildReviewSummary();
  rebuildAllViews();
}

function debugCsvHeader() {
  const folderId = "YOUR_FOLDER_ID";
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    if (!file.getName().endsWith(".csv")) continue;

    const values = parseCsvFile(file);
    const row = values[0].map(v => String(v).trim());

    Logger.log(file.getName());
    Logger.log(JSON.stringify(row));
  }
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

function rebuildBulkReview() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const summarySheet = ss.getSheetByName("review_summary");
  const bulkSheet = ss.getSheetByName("bulk_review");

  const values = summarySheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const rows = values.slice(1);

  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  bulkSheet.clearContents();

  bulkSheet.appendRow([
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
  ]);

  const out = rows.map(row => {
    const merchant = String(row[idx["merchant"]] || "").trim();
    const count = row[idx["count"]];
    const total = row[idx["total_amount"]];
    const currentCategory = row[idx["sample_category"]];

    return [
      merchant,
      count,
      total,
      currentCategory,
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

  if (out.length > 0) {
    bulkSheet.getRange(2, 1, out.length, out[0].length).setValues(out);
  }
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










function getAvailableMoney(yearMonth) {
  const budgets = getBudgetsForMonth(yearMonth);
  const expenses =
    getMonthlyLivingExpenseBreakdown(yearMonth);

  return (
    Number(budgets["給与予定"] || 0)
    - Number(budgets["固定費予算"] || 0)
    - Number(budgets["NISA積立"] || 0)
    - Number(budgets["貯金目標"] || 0)
    - expenses.variableExpense
  );
}


function getMonthlyLivingExpense(yearMonth) {
  const result = filterTransactionRows({
    yearMonth,
    type: "支出",
    wallet: "生活"
  });

  assertRequiredColumns(
    result.index,
    ["amount"],
    "transactions"
  );

  return result.rows.reduce(
    (total, row) =>
      total +
      Number(row[result.index["amount"]] || 0),
    0
  );
}

function testGetAvailableMoney() {
  const value = getAvailableMoney("2026-08");
  Logger.log(`あと使えるお金: ${value}`);
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



function rebuildHomeDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("home");

  if (!sheet) {
    throw new Error("home シートがありません");
  }

  const yearMonth = getLatestBudgetMonth();
  if (!yearMonth) {
    throw new Error("budgets に対象月がありません");
  }

  const availableMoney = getAvailableMoney(yearMonth);
  const savingForecast = getSavingForecast(yearMonth);
  const sideProfit = getSideBusinessProfit(yearMonth);
  const health = getMoneyHealth(yearMonth);
  const featuredDream = getFeaturedDreamFund();

  sheet.clear();

  // 全体設定
  sheet.setHiddenGridlines(true);

  for (let col = 1; col <= 6; col++) {
    sheet.setColumnWidth(col, 110);
  }

  sheet.setRowHeight(1, 38);
  sheet.setRowHeight(2, 22);
  sheet.setRowHeight(4, 28);
  sheet.setRowHeight(6, 32);
  sheet.setRowHeight(7, 48);
  sheet.setRowHeight(8, 20);
  sheet.setRowHeight(10, 32);
  sheet.setRowHeight(11, 48);
  sheet.setRowHeight(12, 20);
  sheet.setRowHeight(14,32);
  sheet.setRowHeight(15,80);
  sheet.setRowHeight(16,25);
  sheet.setRowHeight(17,25);
  sheet.setRowHeight(19, 32);
  sheet.setRowHeight(20, 30);
  sheet.setRowHeight(21, 48);
  sheet.setRowHeight(22, 28);
  sheet.setRowHeight(23, 28);

  // タイトル
  sheet.getRange("A1:F1")
    .merge()
    .setValue("Neru Nexus")
    .setFontSize(24)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.getRange("A2:F2")
    .merge()
    .setValue("Your Personal Finance OS")
    .setFontSize(10)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.getRange("A1:F1")
    .setBackground("#263238")
    .setFontColor("#FFFFFF");

  sheet.getRange("A2:F2")
    .setBackground("#263238")
    .setFontColor("#CFD8DC");

  sheet.getRange("A4:D4")
    .setBackground("#ECEFF1");

  // 対象月
  sheet.getRange("A4:B4")
    .merge()
    .setValue("対象月")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange("C4:D4")
    .merge()
    .setValue(yearMonth)
    .setHorizontalAlignment("center");

  // カード1：あと使えるお金
  sheet.getRange("A6:B6")
    .merge()
    .setValue("あと使えるお金")
    .setFontSize(13)
    .setFontWeight("bold");

  sheet.getRange("A7:B8")
    .merge()
    .setValue(availableMoney)
    .setNumberFormat('¥#,##0;[Red]-¥#,##0')
    .setFontSize(26)
    .setFontWeight("bold");

  // カード2：今月貯金予測
  sheet.getRange("C6:D6")
    .merge()
    .setValue("今月貯金予測")
    .setFontSize(13)
    .setFontWeight("bold");

  sheet.getRange("C7:D8")
    .merge()
    .setValue(savingForecast)
    .setNumberFormat('¥#,##0;[Red]-¥#,##0')
    .setFontSize(26)
    .setFontWeight("bold");

  // カード3：副業利益
  sheet.getRange("E6:F6")
    .merge()
    .setValue("副業利益")
    .setFontSize(13)
    .setFontWeight("bold");

  sheet.getRange("E7:F8")
    .merge()
    .setValue(sideProfit)
    .setNumberFormat('¥#,##0;[Red]-¥#,##0')
    .setFontSize(26)
    .setFontWeight("bold");

  // 補足表示
  sheet.getRange("A10:B10")
    .merge()
    .setValue("生活")
    .setFontWeight("bold");

  sheet.getRange("A11:B12")
    .merge()
    .setValue(
      availableMoney >= 0
        ? "今月の自由枠は残っています"
        : "今月の自由枠を超えています"
    )
    .setWrap(true);

  sheet.getRange("C10:D10")
    .merge()
    .setValue("貯金")
    .setFontWeight("bold");

  sheet.getRange("C11:D12")
    .merge()
    .setValue(
      savingForecast >= 0
        ? "今月は貯金できる見込みです"
        : "今月は赤字見込みです"
    )
    .setWrap(true);

  sheet.getRange("E10:F10")
    .merge()
    .setValue("事業")
    .setFontWeight("bold");

  sheet.getRange("E11:F12")
    .merge()
    .setValue(
      sideProfit >= 0
        ? "副業は黒字です"
        : "副業は赤字です"
    )
    .setWrap(true);

  sheet.getRange("A14:F14")
    .merge()
    .setValue("Money Health")
    .setFontWeight("bold")
    .setFontSize(14);

  sheet.getRange("A15:F17")
    .merge()
    .setValue(
      [
        `${health.level} ${health.title}`,
        "",
        health.message
      ].join("\n")
    )
    .setHorizontalAlignment("left")
    .setVerticalAlignment("top")
    .setFontSize(11)
    .setWrap(true);

  // Dream Fund
  sheet.getRange("A19:F19")
    .merge()
    .setValue("Dream Fund")
    .setFontSize(14)
    .setFontWeight("bold");

  if (featuredDream) {
    const progressPercent = Math.round(featuredDream.progress * 100);

    sheet.getRange("A20:F20")
      .merge()
      .setValue(featuredDream.name)
      .setFontSize(13)
      .setFontWeight("bold");

    sheet.getRange("A21:F21")
      .merge()
      .setValue(progressPercent / 100)
      .setNumberFormat("0%")
      .setFontSize(26)
      .setFontWeight("bold");

    sheet.getRange("A22:C22")
      .merge()
      .setValue("現在額");

    sheet.getRange("D22:F22")
      .merge()
      .setValue(featuredDream.current_amount)
      .setNumberFormat('¥#,##0');

    sheet.getRange("A23:C23")
      .merge()
      .setValue("目標まであと");

    sheet.getRange("D23:F23")
      .merge()
      .setValue(featuredDream.remain_amount)
      .setNumberFormat('¥#,##0');

    sheet.getRange("A19:F23")
      .setBackground("#FFF8E1");

    sheet.getRange("A21:F21")
      .setFontColor("#F57F17");
  } else {
    sheet.getRange("A20:F23")
      .merge()
      .setValue("進行中のDream Fundはありません")
      .setWrap(true)
      .setBackground("#F7F7F7");
  }
  
  // カード背景の初期色
  sheet.getRange("A6:B8").setBackground("#E8F5E9");
  sheet.getRange("C6:D8").setBackground("#E3F2FD");
  sheet.getRange("E6:F8").setBackground("#F3E5F5");

  sheet.getRange("A10:B12").setBackground("#F7F7F7");
  sheet.getRange("C10:D12").setBackground("#F7F7F7");
  sheet.getRange("E10:F12").setBackground("#F7F7F7");

  sheet.getRange("A14:F17").setBackground("#F7F7F7");

  // あと使えるお金
  if (availableMoney < 0) {
    sheet.getRange("A6:B8").setBackground("#FFEBEE");
    sheet.getRange("A7:B8").setFontColor("#C62828");
  } else if (availableMoney < 10000) {
    sheet.getRange("A6:B8").setBackground("#FFF8E1");
    sheet.getRange("A7:B8").setFontColor("#F57F17");
  } else {
    sheet.getRange("A7:B8").setFontColor("#2E7D32");
  }

  // 貯金予測
  if (savingForecast < 0) {
    sheet.getRange("C6:D8").setBackground("#FFEBEE");
    sheet.getRange("C7:D8").setFontColor("#C62828");
  } else {
    sheet.getRange("C7:D8").setFontColor("#1565C0");
  }

  // 副業利益
  if (sideProfit < 0) {
    sheet.getRange("E6:F8").setBackground("#FFEBEE");
    sheet.getRange("E7:F8").setFontColor("#C62828");
  } else {
    sheet.getRange("E7:F8").setFontColor("#6A1B9A");
  }

  // Money Health
  if (health.level === "🔴") {
    sheet.getRange("A14:F17").setBackground("#FFEBEE");
    sheet.getRange("A15:F17").setFontColor("#C62828");
  } else if (health.level === "🟡") {
    sheet.getRange("A14:F17").setBackground("#FFF8E1");
    sheet.getRange("A15:F17").setFontColor("#F57F17");
  } else {
    sheet.getRange("A14:F17").setBackground("#E8F5E9");
    sheet.getRange("A15:F17").setFontColor("#2E7D32");
  }

  // 共通レイアウト
  sheet.getRange("A1:F23")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  const cardRanges = [
    "A6:B8",
    "C6:D8",
    "E6:F8",
    "A10:B12",
    "C10:D12",
    "E10:F12",
    "A14:F17",
    "A19:F23"
  ];

  for (const rangeName of cardRanges) {
    sheet.getRange(rangeName)
      .setBorder(
        true,
        true,
        true,
        true,
        false,
        false,
        "#B0BEC5",
        SpreadsheetApp.BorderStyle.SOLID
      );
  }

  Logger.log(
    [
      `${yearMonth}`,
      `あと使えるお金: ${availableMoney}`,
      `今月貯金予測: ${savingForecast}`,
      `副業利益: ${sideProfit}`
    ].join(" / ")
  );
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

function getMonthlyLivingExpenseBreakdown(yearMonth) {
  const filtered = filterTransactionRows({
    yearMonth,
    type: "支出",
    wallet: "生活"
  });

  const result = {
    fixedExpense: 0,
    variableExpense: 0,
    totalExpense: 0
  };

  if (filtered.rows.length === 0) {
    return result;
  }

  assertRequiredColumns(
    filtered.index,
    [
      "major_category",
      "sub_category",
      "amount"
    ],
    "transactions"
  );

  for (const row of filtered.rows) {
    const major = String(
      row[filtered.index["major_category"]] || ""
    ).trim();

    const sub = String(
      row[filtered.index["sub_category"]] || ""
    ).trim();

    const amount = Number(
      row[filtered.index["amount"]] || 0
    );

    result.totalExpense += amount;

    if (isFixedExpenseCategory(major, sub)) {
      result.fixedExpense += amount;
    } else {
      result.variableExpense += amount;
    }
  }

  return result;
}

function getSavingForecast(yearMonth) {
  const budgets = getBudgetsForMonth(yearMonth);

  const salary =
    Number(budgets["給与予定"] || 0);

  const fixedCostBudget =
    Number(budgets["固定費予算"] || 0);

  const variableBudget =
    Number(budgets["変動費予算"] || 0);

  const investmentTarget =
    Number(budgets["NISA積立"] || 0);

  const expenses =
    getMonthlyLivingExpenseBreakdown(yearMonth);

  const targetMonth =
    normalizeBudgetYearMonth(yearMonth);

  const now = new Date();

  const currentMonth = Utilities.formatDate(
    now,
    "Asia/Tokyo",
    "yyyy-MM"
  );

  let projectedVariableExpense = variableBudget;

  if (targetMonth === currentMonth) {
    const elapsedDays = Number(
      Utilities.formatDate(
        now,
        "Asia/Tokyo",
        "d"
      )
    );

    const [year, month] = targetMonth
      .split("-")
      .map(Number);

    const daysInMonth =
      new Date(year, month, 0).getDate();

    if (
      elapsedDays > 0 &&
      expenses.variableExpense > 0
    ) {
      projectedVariableExpense = Math.round(
        expenses.variableExpense /
        elapsedDays *
        daysInMonth
      );
    }
  } else if (targetMonth < currentMonth) {
    projectedVariableExpense =
      expenses.variableExpense;
  }

  return (
    salary
    - fixedCostBudget
    - projectedVariableExpense
    - investmentTarget
  );
}

function testHomeMetrics() {
  const yearMonth = getLatestBudgetMonth();

  Logger.log(`対象月: ${yearMonth}`);
  Logger.log(`あと使えるお金: ${getAvailableMoney(yearMonth)}`);
  Logger.log(`今月貯金予測: ${getSavingForecast(yearMonth)}`);
}

function getSideBusinessProfit(yearMonth) {
  const filtered = filterTransactionRows({
    yearMonth,
    wallet: "事業"
  });

  if (filtered.rows.length === 0) {
    return 0;
  }

  assertRequiredColumns(
    filtered.index,
    ["type", "amount"],
    "transactions"
  );

  let income = 0;
  let expense = 0;

  for (const row of filtered.rows) {
    const type = String(
      row[filtered.index["type"]] || ""
    ).trim();

    const amount = Number(
      row[filtered.index["amount"]] || 0
    );

    if (type === "収入") {
      income += amount;
    } else if (type === "支出") {
      expense += amount;
    }
  }

  return income - expense;
}

function testHomeDashboard(){

  rebuildHomeDashboard();

  Logger.log("Home更新完了");

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

function testDreamFund() {

  const dream = getDreamFund("dream_001");

  Logger.log(JSON.stringify(dream, null, 2));

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

function testFeaturedDreamFund() {
  const dream = getFeaturedDreamFund();
  Logger.log(JSON.stringify(dream, null, 2));
}

function rebuildAnalytics() {

  rebuildCategoryTable();

  rebuildMonthlyTable();

  rebuildWalletTable();

  rebuildIntentTable();

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

function testCategorySummary(){

  Logger.log(
    JSON.stringify(
      getCategorySummary(getLatestBudgetMonth()),
      null,
      2
    )
  );

}

function rebuildCategoryTable() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const analytics = ss.getSheetByName("analytics");

  const yearMonth = getLatestBudgetMonth();

  const data = getCategorySummary(yearMonth);

  analytics.getRange("A3:B1000").clearContent();

  analytics.getRange("A3").setValue("カテゴリ");
  analytics.getRange("B3").setValue("金額");

  if(data.length===0){
    return;
  }

  const values = data.map(d=>[
    d.category,
    d.amount
  ]);

  analytics
    .getRange(4,1,values.length,2)
    .setValues(values);

}

function rebuildMonthlyTable() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const analytics = ss.getSheetByName("analytics");
  const monthly = ss.getSheetByName("monthly_summary");

  const values = monthly.getDataRange().getValues();

  analytics.getRange("D3:E1000").clearContent();

  analytics.getRange("D3").setValue("年月");
  analytics.getRange("E3").setValue("支出");

  if(values.length < 2){
    return;
  }

  const headers = values[0];
  const idx = {};

  headers.forEach((h,i)=>idx[h]=i);

  const result = [];

  for(const row of values.slice(1)){

    result.push([
      row[idx["year_month"]],
      row[idx["net_expense"]]
    ]);

  }

  analytics
    .getRange(4,4,result.length,2)
    .setValues(result);

}

function rebuildWalletTable() {
  const analytics = getRequiredSheet("analytics");

  analytics
    .getRange("G3:H1000")
    .clearContent();

  analytics
    .getRange("G3:H3")
    .setValues([["Wallet", "金額"]]);

  const result = summarizeTransactionsByField(
    getLatestBudgetMonth(),
    "wallet",
    {
      type: "支出",
      skipBlank: true
    }
  );

  if (result.length === 0) {
    return;
  }

  analytics
    .getRange(4, 7, result.length, 2)
    .setValues(result);
}

function rebuildIntentTable() {
  const analytics = getRequiredSheet("analytics");

  analytics
    .getRange("J3:K1000")
    .clearContent();

  analytics
    .getRange("J3:K3")
    .setValues([["Intent", "金額"]]);

  const result = summarizeTransactionsByField(
    getLatestBudgetMonth(),
    "intent",
    {
      type: "支出",
      skipBlank: false
    }
  );

  if (result.length === 0) {
    return;
  }

  analytics
    .getRange(4, 10, result.length, 2)
    .setValues(result);
}

function testLoadTable() {
  const table = loadTable("transactions");

  Logger.log(`values: ${table.values.length}`);
  Logger.log(`rows: ${table.rows.length}`);
  Logger.log(`headers: ${table.headers.join(", ")}`);
  Logger.log(`merchant列: ${table.index["merchant"]}`);
}