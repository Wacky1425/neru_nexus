// ============================================================
// Neru Nexus - Classification Rules
//
// 取引分類ルール、分類判定、カテゴリ推測のみを担当。
// ============================================================

function normalizeTextForRule(value) {
  let text = String(value || "")
    .toLowerCase()
    .trim();

  // 全角英数字を半角へ
  text = text.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (s) {
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
  const rules = loadObjects(SHEETS.RULES).filter(
    (rule) => String(rule.keyword || "").trim() !== "",
  );

  rules.sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0));

  return rules;
}

function matchRule(transaction, rules) {
  const targetText = [
    transaction.merchant,
    transaction.item_name,
    transaction.note,
  ]
    .filter(Boolean)
    .join(" ");

  for (const rule of rules) {
    const keyword = String(rule.keyword || "").trim();

    if (!keyword) {
      continue;
    }

    if (isRuleMatched(targetText, keyword, rule.rule_type)) {
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
    intent: rule.intent_result || "その他",
  };
}

function createDefaultClassification(typeHint) {
  const normalizedType = String(typeHint || "").trim();

  if (normalizedType === "収入") {
    return {
      type: "収入",
      major_category: "収入",
      sub_category: "要確認",
      purpose_type: "私用",
      expense_ratio: 0,
      status: "要確認",
      wallet: "生活",
      intent: "収入",
    };
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

function classifyTransaction(transaction, rules, typeHint) {
  const matchedRule = matchRule(transaction, rules);

  if (!matchedRule) {
    const defaultType =
      String(typeHint || "").trim() || String(transaction.type || "").trim();

    return createDefaultClassification(defaultType);
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

function classifyMoneyTransaction(row, txBase, rules, configName) {
  // ============================================================
  // PayPayは専用分類
  // ============================================================

  if (configName === "paypay_v1") {
    return classifyPayPayTransaction_(row, txBase, rules);
  }

  // ============================================================
  // 元CSVの入出金額
  // ============================================================

  let inAmount = 0;
  let outAmount = 0;

  if (configName === "jpbank_v1") {
    inAmount = parseAmount(row["受入金額（円）"]);

    outAmount = parseAmount(row["払出金額（円）"]);
  } else if (configName === "smbc_bank_v1") {
    inAmount = parseAmount(row["お預入れ"]);

    outAmount = parseAmount(row["お引出し"]);
  }

  // ============================================================
  // 通常ルール分類
  // ============================================================

  const classified = classifyTransaction(
    txBase,
    rules,
    inAmount > 0 ? "収入" : "支出",
  );

  const isRuleConfirmed = classified.status === "確定";

  const classifiedType = String(classified.type || "").trim();

  const majorCategory = String(classified.major_category || "").trim();

  const subCategory = String(classified.sub_category || "").trim();

  const intent = String(classified.intent || "").trim();

  const transferSubCategories = [
    "口座移動",
    "電子マネーチャージ",
    "クレカ引落",
    "証券口座移動",
    "現金引出",
    "個人間送金",
  ];

  const isTransferClassification =
    classifiedType === "移動" ||
    classifiedType === "振替" ||
    majorCategory === "移動" ||
    intent === "移動" ||
    transferSubCategories.includes(subCategory);

  // ============================================================
  // 銀行への特殊入金
  // ============================================================

  const bankDeposit = inAmount > 0 ? detectBankDepositType_(txBase) : null;

  // ------------------------------------------------------------
  // 給与
  // ------------------------------------------------------------

  if (bankDeposit && bankDeposit.kind === "salary") {
    return {
      ...classified,

      type: "収入",

      major_category: "収入",

      sub_category: "給与",

      purpose_type: "私用",

      expense_ratio: 0,

      status: "確定",

      wallet: "生活",

      intent: "収入",
    };
  }

  // ------------------------------------------------------------
  // 自分の別口座 → 銀行
  // ------------------------------------------------------------

  if (bankDeposit && bankDeposit.kind === "transfer") {
    return {
      ...classified,

      type: "移動",

      major_category: "移動",

      sub_category: "口座移動",

      purpose_type: "私用",

      expense_ratio: 0,

      status: "要確認",

      wallet: "生活",

      intent: "移動",
    };
  }

  // ============================================================
  // 銀行 → 電子マネーチャージ
  // ============================================================

  const electronicMoneyCharge =
    outAmount > 0 ? detectBankElectronicMoneyCharge_(txBase) : null;

  if (electronicMoneyCharge) {
    return {
      ...classified,

      type: "移動",

      major_category: "移動",

      sub_category: "電子マネーチャージ",

      purpose_type: "私用",

      expense_ratio: 0,

      status: "確定",

      wallet: "生活",

      intent: "移動",

      transfer_destination_account: electronicMoneyCharge.accountName,
    };
  }

  // ============================================================
  // クレカ引落判定
  // ============================================================

  const creditCardAccount = resolveCreditCardAccount_(txBase);

  const isCreditCardSettlement = outAmount > 0 && Boolean(creditCardAccount);

  // ============================================================
  // type決定
  // ============================================================

  let transactionType = "";

  if (isRuleConfirmed && isTransferClassification) {
    transactionType = "移動";
  } else if (isRuleConfirmed) {
    transactionType = classifiedType || (inAmount > 0 ? "収入" : "支出");
  } else if (isCreditCardSettlement) {
    transactionType = "移動";
  } else if (inAmount > 0) {
    transactionType = "収入";
  } else if (outAmount > 0) {
    transactionType = "支出";
  } else {
    transactionType = classifiedType || "支出";
  }

  // ============================================================
  // 未登録クレカ引落
  // ============================================================

  if (isCreditCardSettlement && !isRuleConfirmed) {
    return {
      ...classified,

      type: "移動",

      major_category: "移動",

      sub_category: "クレカ引落",

      purpose_type: "私用",

      expense_ratio: 0,

      status: "確定",

      wallet: "生活",

      intent: "移動",
    };
  }

  // ============================================================
  // 確定済み移動ルール
  // ============================================================

  if (isRuleConfirmed && isTransferClassification) {
    return {
      ...classified,

      type: "移動",

      intent: "移動",
    };
  }

  // ============================================================
  // 通常取引
  // ============================================================

  return {
    ...classified,

    type: transactionType,
  };
}

/**
 * ============================================================
 * 銀行側の電子マネーチャージ判定
 *
 * 対象：
 *   PAYPAY
 *   JD /AEON PAY
 *
 * CSV_銀行 / Gmail_SMBC 共通で使用する。
 *
 * 戻り値：
 *   null
 *     → 電子マネーチャージではない
 *
 *   {
 *     accountName: "PayPay" など
 *   }
 * ============================================================
 */
function detectBankElectronicMoneyCharge_(tx) {
  const text = [tx.merchant, tx.item_name, tx.raw_text, tx.note]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return null;
  }

  // ============================================================
  // PayPay
  // ============================================================

  if (text.includes("PAYPAY")) {
    return {
      accountName: "PayPay",
    };
  }

  // ============================================================
  // AEON PAY
  //
  // 三井住友銀行明細では
  //   JD /AEON PAY
  // と表示される。
  // ============================================================

  if (text.includes("AEON PAY")) {
    return {
      accountName: "AEON PAY",
    };
  }

  return null;
}

/**
 * 銀行への入金内容から特殊な入金を判定する。
 *
 * kind:
 *   salary   = 給与
 *   transfer = 自分の別口座などからの資金移動
 */
function detectBankDepositType_(tx) {
  const text = [tx.merchant, tx.item_name, tx.raw_text, tx.note]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return null;
  }

  // ============================================================
  // 給与
  // ============================================================

  if (
    text.includes("ソフトヒユーベリオン") ||
    text.includes("ソフトヒューベリオン")
  ) {
    return {
      kind: "salary",
    };
  }

  // ============================================================
  // 自分名義からの資金移動
  //
  // CT ワキタ ホクト
  //
  // 移動元口座までは銀行通知から確定できないので
  // from_account は空欄のままreviewにする。
  // ============================================================

  if (text.includes("ワキタ ホクト")) {
    return {
      kind: "transfer",
    };
  }

  return null;
}

function classifyPayPayTransaction_(row, txBase, rules) {
  const inAmount = parseAmount(row["入金金額（円）"]);
  const outAmount = parseAmount(row["出金金額（円）"]);

  const transactionContent = String(row["取引内容"] || "")
    .normalize("NFKC")
    .trim();

  /*
   * PayPayの「取引方法」には
   *   PayPayポイント
   *   PayPayポイント (34円), PayPay残高 (166円)
   * のような支払原資が入る。
   *
   * これを通常のM_Rules判定に含めると、
   * 「ポイント」というキーワードのルールが
   * 実際の買い物より先に誤ヒットすることがある。
   *
   * PayPayの支払い分類では取引方法(note)を除外し、
   * 店名・取引内容だけでカテゴリ判定する。
   */
  const classificationTarget = {
    ...txBase,
    note: "",
  };

  const classified = classifyTransaction(
    classificationTarget,
    rules,
    inAmount > 0 ? "収入" : "支出",
  );
  const isRuleConfirmed = classified.status === "確定";

  // ------------------------------------------------------------
  // 通常の買い物
  // ------------------------------------------------------------
  if (transactionContent.startsWith("支払い")) {
    return {
      ...classified,
      // ポイント併用・全額ポイント払いでも商品の総額を支出として扱う
      type: "支出",
    };
  }

  // ------------------------------------------------------------
  // PayPay残高へのチャージ
  // ------------------------------------------------------------
  if (transactionContent.startsWith("チャージ")) {
    return {
      ...classified,
      type: "移動",
      major_category: "移動",
      sub_category: "電子マネーチャージ",
      purpose_type: "私用",
      expense_ratio: 0,
      status: "確定",
      wallet: "生活",
      intent: "移動",
    };
  }

  /*
   * 送金・受取は、店名などに確定ルールがあればその分類を優先。
   * 例:
   *   はなまるへの送金 → 食費/外食
   *   立替返金の受取   → 収入/立替返金
   */
  if (isRuleConfirmed) {
    return classified;
  }

  if (transactionContent.startsWith("受け取った金額") || inAmount > 0) {
    return {
      ...classified,
      type: "収入",
    };
  }

  if (transactionContent.startsWith("送った金額") || outAmount > 0) {
    return {
      ...classified,
      type: "支出",
    };
  }

  return {
    ...classified,
    type: classified.type || "支出",
  };
}

function guessPurposeType(majorCategory, subCategory) {
  const major = String(majorCategory || "").trim();
  const sub = String(subCategory || "").trim();

  // 配信カテゴリは原則100%事業用途。
  if (major === "配信") {
    return "経費";
  }

  // 私用と事業で共用しやすい通信インフラ。
  if (
    (major === "住居" && sub === "ネット回線") ||
    (major === "通信" && sub === "スマホ")
  ) {
    return "共用";
  }

  return "私用";
}

function guessExpenseRatio(majorCategory, subCategory) {
  const major = String(majorCategory || "").trim();
  const sub = String(subCategory || "").trim();

  if (major === "配信") {
    return 1;
  }

  // 既存運用の通信按分率を維持。
  if (
    (major === "住居" && sub === "ネット回線") ||
    (major === "通信" && sub === "スマホ")
  ) {
    return 0.4;
  }

  return 0;
}



function guessIntent(type, majorCategory, subCategory) {
  const normalizedType = String(type || "").trim();
  const major = String(majorCategory || "").trim();

  if (normalizedType === "収入") {
    return "収入";
  }

  if (normalizedType === "移動" || normalizedType === "振替") {
    return "移動";
  }

  if (normalizedType === "調整") {
    return "その他";
  }

  if (["食費", "生活", "住居", "交通", "通信", "ペット"].includes(major)) {
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

  if (major === "配信") {
    return "事業活動";
  }

  // 会社員としての仕事・学習支出は、配信事業とは分離する。
  if (major === "仕事") {
    return "その他";
  }

  return "その他";
}
