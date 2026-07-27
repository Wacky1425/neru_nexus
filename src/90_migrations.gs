function migrateRulesToCategoryV2() {
  const sheet = SS.getSheetByName("rules");

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

function migrateRulesToFinalCategories() {
  const sheet = SS.getSheetByName("rules");

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

function initializeTransactionWallet() {
  const sheet = SS.getSheetByName("transactions");

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
  const sheet = SS.getSheetByName("rules");

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

function initializeRuleIntent() {
  const sheet = SS.getSheetByName("rules");

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