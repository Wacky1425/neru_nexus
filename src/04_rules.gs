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


function getRules() {
  const rules = loadObjects("rules")
    .filter(rule =>
      String(rule.keyword || "").trim() !== ""
    );

  rules.sort(
    (a, b) =>
      Number(a.priority || 0) -
      Number(b.priority || 0)
  );

  return rules;
}

function matchRule(transaction, rules) {
  const targetText = [
    transaction.merchant,
    transaction.item_name,
    transaction.note
  ]
    .filter(Boolean)
    .join(" ");

  for (const rule of rules) {
    const keyword = String(rule.keyword || "").trim();

    if (!keyword) {
      continue;
    }

    if (
      isRuleMatched(
        targetText,
        keyword,
        rule.rule_type
      )
    ) {
      return rule;
    }
  }

  return null;
}

function buildClassification(rule) {
  return {
    type: rule.type_result,
    major_category: rule.major_category,
    sub_category: rule.sub_category,
    purpose_type: rule.purpose_type,
    expense_ratio: Number(rule.expense_ratio || 0),
    status: rule.status_result,
    wallet: rule.wallet_result || "生活",
    intent: rule.intent_result || "その他"
  };
}

function createDefaultClassification() {
  return {
    type: "支出",
    major_category: "その他",
    sub_category: "要確認",
    purpose_type: "私用",
    expense_ratio: 0,
    status: "要確認",
    wallet: "生活",
    intent: "その他"
  };
}

function classifyTransaction(transaction, rules) {

  const matchedRule =
    matchRule(transaction, rules);

  if (!matchedRule) {
    return createDefaultClassification();
  }

  return buildClassification(matchedRule);

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

function classifyMoneyTransaction(
  row,
  txBase,
  rules,
  configName
    ) {
  let inAmount = 0;
  let outAmount = 0;

  if (configName === "jpbank_v1") {
    inAmount = parseAmount(
      row["受入金額（円）"]
    );

    outAmount = parseAmount(
      row["払出金額（円）"]
    );

  } else if (configName === "smbc_bank_v1") {
    inAmount = parseAmount(
      row["お預入れ"]
    );

    outAmount = parseAmount(
      row["お引出し"]
    );

  } else if (configName === "paypay_v1") {
    inAmount = parseAmount(
      row["入金金額（円）"]
    );

    outAmount = parseAmount(
      row["出金金額（円）"]
    );
  }

  const classified = classifyTransaction(
    txBase,
    rules
  );

  const isRuleConfirmed =
    classified.status === "確定";

  let transactionType = "";

  if (isRuleConfirmed) {
    transactionType = classified.type;
  } else if (inAmount > 0) {
    transactionType = "収入";
  } else if (outAmount > 0) {
    transactionType = "支出";
  } else {
    transactionType = classified.type || "支出";
  }

  return {
    ...classified,
    type: transactionType
  };
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