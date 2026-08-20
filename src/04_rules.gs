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

function createDefaultClassification() {
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

function classifyTransaction(transaction, rules) {
  const matchedRule = matchRule(transaction, rules);

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

function classifyMoneyTransaction(row, txBase, rules, configName) {
  let inAmount = 0;
  let outAmount = 0;

  if (configName === "jpbank_v1") {
    inAmount = parseAmount(row["受入金額（円）"]);

    outAmount = parseAmount(row["払出金額（円）"]);
  } else if (configName === "smbc_bank_v1") {
    inAmount = parseAmount(row["お預入れ"]);

    outAmount = parseAmount(row["お引出し"]);
  } else if (configName === "paypay_v1") {
    inAmount = parseAmount(row["入金金額（円）"]);

    outAmount = parseAmount(row["出金金額（円）"]);
  }

  const classified = classifyTransaction(txBase, rules);

  const creditCardAccount = resolveCreditCardAccount_(txBase);

  const isCreditCardSettlement = outAmount > 0 && creditCardAccount;

  const isRuleConfirmed = classified.status === "確定";

  let transactionType = "";

  if (isRuleConfirmed) {
    transactionType = classified.type;
  } else if (isCreditCardSettlement) {
    transactionType = "移動";
  } else if (inAmount > 0) {
    transactionType = "収入";
  } else if (outAmount > 0) {
    transactionType = "支出";
  } else {
    transactionType = classified.type || "支出";
  }

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

  return {
    ...classified,
    type: transactionType,
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

  if (["食費", "住居", "通信", "交通", "生活用品"].includes(major)) {
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

  if (major === "配信" || guessPurposeType(subCategory) === "経費") {
    return "事業活動";
  }

  return "その他";
}

function mapMajorCategory(subCategory) {
  const map = {
    スーパー: "食費",
    コンビニ: "食費",
    外食: "食費",
    カフェ: "食費",

    日用品: "生活費",
    消耗品: "生活費",
    雑貨: "生活費",

    家賃: "固定費",
    通信費: "固定費",
    サブスク: "固定費",
    保険: "固定費",
    水道光熱費: "固定費",
    税金: "固定費",

    電車: "交通",
    バス: "交通",
    タクシー: "交通",
    ガソリン: "交通",
    駐車場: "交通",

    ゲーム: "趣味娯楽",
    グッズ: "趣味娯楽",
    イベント: "趣味娯楽",
    娯楽その他: "趣味娯楽",

    衣服: "美容衣服",
    美容: "美容衣服",
    理容: "美容衣服",

    病院: "医療健康",
    薬: "医療健康",
    健康用品: "医療健康",

    書籍: "仕事・学業",
    ソフト: "仕事・学業",
    研究用品: "仕事・学業",
    講座: "仕事・学業",
    事務用品: "仕事・学業",

    配信機材: "配信活動",
    イラスト依頼: "配信活動",
    配信ソフト: "配信活動",
    素材: "配信活動",
    外注費: "配信活動",
    広告宣伝: "配信活動",
    配信サブスク: "配信活動",

    給与: "収入",
    配信収益: "収入",
    アフィリエイト: "収入",
    その他収入: "収入",

    クレカ引落: "振替",
    電子マネー補充: "振替",
    口座移動: "振替",
    証券口座入金: "振替",

    要確認: "その他",
  };

  return map[subCategory] || "その他";
}

function guessIntent(subCategory) {
  const major = mapMajorCategory(subCategory);

  if (["食費", "住居", "通信", "交通", "生活用品"].includes(major)) {
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

  if (major === "配信" || guessPurposeType(subCategory) === "経費") {
    return "事業活動";
  }

  return "その他";
}

function getCategoriesData() {
  const sheet = SS.getSheetByName(SHEETS.CATEGORIES);

  if (!sheet) {
    throw new Error("categoriesシートがありません");
  }

  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return {
      items: [],
      mapsByType: {},
      mapsByTypeId: {},
      expenseMap: {},
      incomeMap: {},
    };
  }

  const headers = values[0].map((value) => String(value || "").trim());

  const index = {};

  headers.forEach((header, i) => {
    index[header] = i;
  });

  const requiredColumns = [
    "type",
    "major_category_id",
    "major_category",
    "sub_category_id",
    "sub_category",
    "is_expense_target",
    "active",
    "sort_order",
  ];

  for (const column of requiredColumns) {
    if (index[column] === undefined) {
      throw new Error(`categoriesシートに${column}列がありません`);
    }
  }

  const items = [];

  /*
   * 旧Flutter互換:
   * {
   *   支出: {
   *     食費: ["外食", "コンビニ"]
   *   }
   * }
   */
  const mapsByType = {};

  /*
   * ID対応:
   * {
   *   支出: {
   *     major_001: {
   *       majorCategoryId: "major_001",
   *       majorCategory: "食費",
   *       subCategories: [
   *         {
   *           subCategoryId: "sub_001",
   *           subCategory: "外食"
   *         }
   *       ]
   *     }
   *   }
   * }
   */
  const mapsByTypeId = {};

  for (const row of values.slice(1)) {
    const type = String(row[index["type"]] || "").trim();

    const majorCategoryId = String(
      row[index["major_category_id"]] || "",
    ).trim();

    const majorCategory = String(row[index["major_category"]] || "").trim();

    const subCategoryId = String(row[index["sub_category_id"]] || "").trim();

    const subCategory = String(row[index["sub_category"]] || "").trim();

    const expenseTargetValue = row[index["is_expense_target"]];

    const isExpenseTarget =
      expenseTargetValue === true ||
      Number(expenseTargetValue) === 1 ||
      String(expenseTargetValue).trim().toLowerCase() === "true";

    const activeValue = row[index["active"]];

    const active =
      activeValue === true ||
      Number(activeValue) === 1 ||
      String(activeValue).trim().toLowerCase() === "true";

    const sortOrder = Number(row[index["sort_order"]]) || 999;

    const note =
      index["note"] === undefined
        ? ""
        : String(row[index["note"]] || "").trim();

    if (
      !active ||
      !type ||
      !majorCategoryId ||
      !majorCategory ||
      !subCategoryId ||
      !subCategory
    ) {
      continue;
    }

    items.push({
      type,
      majorCategoryId,
      majorCategory,
      subCategoryId,
      subCategory,
      isExpenseTarget,
      active,
      sortOrder,
      note,
    });

    /*
     * 旧形式Map
     */
    if (!mapsByType[type]) {
      mapsByType[type] = {};
    }

    if (!mapsByType[type][majorCategory]) {
      mapsByType[type][majorCategory] = [];
    }

    if (!mapsByType[type][majorCategory].includes(subCategory)) {
      mapsByType[type][majorCategory].push(subCategory);
    }

    /*
     * ID形式Map
     */
    if (!mapsByTypeId[type]) {
      mapsByTypeId[type] = {};
    }

    if (!mapsByTypeId[type][majorCategoryId]) {
      mapsByTypeId[type][majorCategoryId] = {
        majorCategoryId,
        majorCategory,
        sortOrder,
        subCategories: [],
      };
    }

    const subCategories = mapsByTypeId[type][majorCategoryId].subCategories;

    const alreadyExists = subCategories.some(
      (item) => item.subCategoryId === subCategoryId,
    );

    if (!alreadyExists) {
      subCategories.push({
        subCategoryId,
        subCategory,
        sortOrder,
        isExpenseTarget,
        note,
      });
    }
  }

  items.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type.localeCompare(b.type, "ja");
    }

    return a.sortOrder - b.sortOrder;
  });

  Object.values(mapsByTypeId).forEach((typeMap) => {
    Object.values(typeMap).forEach((major) => {
      major.subCategories.sort((a, b) => a.sortOrder - b.sortOrder);
    });
  });

  return {
    items,
    mapsByType,
    mapsByTypeId,

    // 移行中のFlutter互換用
    expenseMap: mapsByType["支出"] || {},

    incomeMap: mapsByType["収入"] || {},
  };
}

function createCategoryFromApp_(data) {
  const type = String(data.type || "").trim();

  const majorCategory = String(data.majorCategory || "").trim();

  const subCategory = String(data.subCategory || "").trim();

  if (!type) {
    throw new Error("typeは必須です");
  }

  if (!majorCategory) {
    throw new Error("majorCategoryは必須です");
  }

  if (!subCategory) {
    throw new Error("subCategoryは必須です");
  }

  const sheet = SS.getSheetByName(SHEETS.CATEGORIES);

  if (!sheet) {
    throw new Error("categoriesシートがありません");
  }

  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    throw new Error("categoriesシートにヘッダーがありません");
  }

  const headers = values[0].map((value) => String(value || "").trim());

  const index = {};

  headers.forEach((header, columnIndex) => {
    index[header] = columnIndex;
  });

  const requiredColumns = [
    "type",
    "major_category_id",
    "major_category",
    "sub_category_id",
    "sub_category",
    "is_expense_target",
    "active",
    "sort_order",
    "note",
  ];

  for (const column of requiredColumns) {
    if (index[column] === undefined) {
      throw new Error(`categoriesシートに${column}列がありません`);
    }
  }

  const existingRows = values.slice(1);

  const sameCategoryIndex = existingRows.findIndex((row) => {
    return (
      String(row[index["type"]] || "").trim() === type &&
      String(row[index["major_category"]] || "").trim() === majorCategory &&
      String(row[index["sub_category"]] || "").trim() === subCategory
    );
  });

  if (sameCategoryIndex !== -1) {
    const existingRow = existingRows[sameCategoryIndex];

    const activeValue = existingRow[index["active"]];

    const isActive =
      activeValue === true ||
      Number(activeValue) === 1 ||
      String(activeValue).trim().toLowerCase() === "true";

    if (isActive) {
      throw new Error("同じカテゴリがすでに存在します");
    }

    const sheetRowNumber = sameCategoryIndex + 2;

    sheet.getRange(sheetRowNumber, index["active"] + 1).setValue(1);

    if (index["note"] !== undefined) {
      sheet
        .getRange(sheetRowNumber, index["note"] + 1)
        .setValue("アプリで再有効化");
    }

    clearTableCache(SHEETS.CATEGORIES);

    return createJsonResponse_(
      {
        type,
        majorCategoryId: String(
          existingRow[index["major_category_id"]] || "",
        ).trim(),
        majorCategory,
        subCategoryId: String(
          existingRow[index["sub_category_id"]] || "",
        ).trim(),
        subCategory,
        reactivated: true,
      },
      "ok",
    );
  }

  const sameMajorRow = existingRows.find((row) => {
    return (
      String(row[index["type"]] || "").trim() === type &&
      String(row[index["major_category"]] || "").trim() === majorCategory
    );
  });

  let majorCategoryId = "";

  if (sameMajorRow) {
    majorCategoryId = String(
      sameMajorRow[index["major_category_id"]] || "",
    ).trim();
  }

  if (!majorCategoryId) {
    majorCategoryId = createNextCategoryId_(
      existingRows,
      index["major_category_id"],
      "major",
    );
  }

  const subCategoryId = createNextCategoryId_(
    existingRows,
    index["sub_category_id"],
    "sub",
  );

  const maxSortOrder = existingRows.reduce((maximum, row) => {
    const value = Number(row[index["sort_order"]] || 0);

    return value > maximum ? value : maximum;
  }, 0);

  const row = new Array(headers.length).fill("");

  row[index["type"]] = type;
  row[index["major_category_id"]] = majorCategoryId;
  row[index["major_category"]] = majorCategory;
  row[index["sub_category_id"]] = subCategoryId;
  row[index["sub_category"]] = subCategory;
  row[index["is_expense_target"]] = type === "支出" ? 1 : 0;
  row[index["active"]] = 1;
  row[index["sort_order"]] = maxSortOrder + 1;
  row[index["note"]] = "アプリ追加";

  sheet.appendRow(row);

  clearTableCache(SHEETS.CATEGORIES);

  return createJsonResponse_(
    {
      type,
      majorCategoryId,
      majorCategory,
      subCategoryId,
      subCategory,
    },
    "ok",
  );
}

function deactivateCategoryFromApp_(data) {
  const subCategoryId = String(data.subCategoryId || "").trim();

  if (!subCategoryId) {
    throw new Error("subCategoryIdは必須です");
  }

  const sheet = getRequiredSheet(SHEETS.CATEGORIES);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("カテゴリデータがありません");
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    ["sub_category_id", "active"],
    SHEETS.CATEGORIES,
  );

  let targetRow = -1;

  for (let i = 1; i < values.length; i++) {
    const rowSubCategoryId = String(
      values[i][index["sub_category_id"]] || "",
    ).trim();

    if (rowSubCategoryId === subCategoryId) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) {
    throw new Error("対象のカテゴリが見つかりません");
  }

  sheet.getRange(targetRow, index["active"] + 1).setValue(0);

  clearTableCache(SHEETS.CATEGORIES);

  return createJsonResponse_(
    {
      deactivated: true,
      subCategoryId,
    },
    "ok",
  );
}

function createAccountFromApp_(data) {
  const accountName = String(data.accountName || "").trim();
  const paymentMethod = String(data.paymentMethod || "").trim();
  const wallet = String(data.wallet || "").trim();
  const institution = String(data.institution || "").trim();

  const isAsset = data.isAsset === true;
  const isLiability = data.isLiability === true;

  const openingBalanceValue = data.openingBalance;
  const openingBalanceDate = String(data.openingBalanceDate || "").trim();

  if (!accountName) {
    throw new Error("accountNameは必須です");
  }

  if (!paymentMethod) {
    throw new Error("paymentMethodは必須です");
  }

  if (!wallet) {
    throw new Error("walletは必須です");
  }

  if (isAsset && isLiability) {
    throw new Error("資産口座と負債口座を同時に指定できません");
  }

  const openingBalance =
    openingBalanceValue === null ||
    openingBalanceValue === undefined ||
    openingBalanceValue === ""
      ? 0
      : Number(openingBalanceValue);

  if (!Number.isFinite(openingBalance)) {
    throw new Error("openingBalanceが不正です");
  }

  const sheet = getRequiredSheet(SHEETS.ACCOUNTS);

  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    throw new Error("accountsシートにヘッダーがありません");
  }

  const headers = values[0].map((value) => String(value || "").trim());

  const index = createHeaderIndex(headers);

  assertRequiredColumns(
    index,
    [
      "account_id",
      "account_name",
      "payment_method",
      "wallet",
      "institution",
      "is_asset",
      "is_liability",
      "active",
      "note",
      "sort_order",
      "opening_balance",
      "opening_balance_date",
    ],
    SHEETS.ACCOUNTS,
  );

  const existingRows = values.slice(1);

  const sameNameRowIndex = existingRows.findIndex(
    (row) => String(row[index["account_name"]] || "").trim() === accountName,
  );

  if (sameNameRowIndex !== -1) {
    const existingRow = existingRows[sameNameRowIndex];

    const activeValue = existingRow[index["active"]];

    const isActive =
      activeValue === true ||
      Number(activeValue) === 1 ||
      String(activeValue).trim().toLowerCase() === "true";

    // 現在も有効な口座なら普通の重複
    if (isActive) {
      throw new Error("同じ名前の口座がすでに存在します");
    }

    /*
     * 無効化済みなら新規作成せず、
     * 既存のaccount_idを使って復活させる
     */
    const sheetRowNumber = sameNameRowIndex + 2;

    const existingAccountId = String(
      existingRow[index["account_id"]] || "",
    ).trim();

    sheet
      .getRange(sheetRowNumber, index["payment_method"] + 1)
      .setValue(paymentMethod);

    sheet.getRange(sheetRowNumber, index["wallet"] + 1).setValue(wallet);

    sheet
      .getRange(sheetRowNumber, index["institution"] + 1)
      .setValue(institution);

    sheet
      .getRange(sheetRowNumber, index["is_asset"] + 1)
      .setValue(isAsset ? 1 : 0);

    sheet
      .getRange(sheetRowNumber, index["is_liability"] + 1)
      .setValue(isLiability ? 1 : 0);

    sheet.getRange(sheetRowNumber, index["active"] + 1).setValue(1);

    sheet
      .getRange(sheetRowNumber, index["opening_balance"] + 1)
      .setValue(openingBalance);

    sheet
      .getRange(sheetRowNumber, index["opening_balance_date"] + 1)
      .setValue(openingBalanceDate);

    clearTableCache(SHEETS.ACCOUNTS);
    clearAccountBalanceCache_();

    return createJsonResponse_(
      {
        accountId: existingAccountId,
        accountName,
        paymentMethod,
        wallet,
        institution,
        isAsset,
        isLiability,
        openingBalance,
        openingBalanceDate,
        reactivated: true,
      },
      "ok",
    );
  }

  const accountId = "acc_" + Utilities.getUuid().replace(/-/g, "").slice(0, 16);

  const maxSortOrder = existingRows.reduce((maximum, row) => {
    const value = Number(row[index["sort_order"]] || 0);

    return value > maximum ? value : maximum;
  }, 0);

  const row = new Array(headers.length).fill("");

  row[index["account_id"]] = accountId;

  row[index["account_name"]] = accountName;

  row[index["payment_method"]] = paymentMethod;

  row[index["wallet"]] = wallet;

  row[index["institution"]] = institution;

  row[index["is_asset"]] = isAsset ? 1 : 0;

  row[index["is_liability"]] = isLiability ? 1 : 0;

  row[index["active"]] = 1;

  row[index["note"]] = "アプリ追加";

  row[index["sort_order"]] = maxSortOrder + 1;

  row[index["opening_balance"]] = openingBalance;

  row[index["opening_balance_date"]] = openingBalanceDate;

  sheet.appendRow(row);

  clearTableCache(SHEETS.ACCOUNTS);

  clearAccountBalanceCache_();

  return createJsonResponse_(
    {
      accountId,
      accountName,
      paymentMethod,
      wallet,
      institution,
      isAsset,
      isLiability,
      openingBalance,
      openingBalanceDate,
    },
    "ok",
  );
}

function updateAccountFromApp_(data) {
  const accountId = String(data.accountId || "").trim();

  const accountName = String(data.accountName || "").trim();

  const paymentMethod = String(data.paymentMethod || "").trim();

  const wallet = String(data.wallet || "").trim();

  const institution = String(data.institution || "").trim();

  const isAsset = data.isAsset === true;

  const isLiability = data.isLiability === true;

  const openingBalance = Number(data.openingBalance || 0);

  const openingBalanceDate = String(data.openingBalanceDate || "").trim();

  if (!accountId) {
    throw new Error("accountIdは必須です");
  }

  if (!accountName) {
    throw new Error("accountNameは必須です");
  }

  if (!paymentMethod) {
    throw new Error("paymentMethodは必須です");
  }

  if (!wallet) {
    throw new Error("walletは必須です");
  }

  if (isAsset && isLiability) {
    throw new Error("資産口座と負債口座を同時に指定できません");
  }

  if (!Number.isFinite(openingBalance)) {
    throw new Error("openingBalanceが不正です");
  }

  const sheet = getRequiredSheet(SHEETS.ACCOUNTS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("口座データがありません");
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    [
      "account_id",
      "account_name",
      "payment_method",
      "wallet",
      "institution",
      "is_asset",
      "is_liability",
      "opening_balance",
      "opening_balance_date",
    ],
    SHEETS.ACCOUNTS,
  );

  let targetRow = -1;
  let oldAccountName = "";

  for (let i = 1; i < values.length; i++) {
    const rowAccountId = String(values[i][index["account_id"]] || "").trim();

    if (rowAccountId === accountId) {
      targetRow = i + 1;

      oldAccountName = String(values[i][index["account_name"]] || "").trim();

      break;
    }
  }

  if (targetRow === -1) {
    throw new Error("対象の口座が見つかりません");
  }

  const duplicate = values.slice(1).some((row) => {
    const rowId = String(row[index["account_id"]] || "").trim();

    const rowName = String(row[index["account_name"]] || "").trim();

    return rowId !== accountId && rowName === accountName;
  });

  if (duplicate) {
    throw new Error("同じ名前の口座がすでに存在します");
  }

  sheet.getRange(targetRow, index["account_name"] + 1).setValue(accountName);

  sheet
    .getRange(targetRow, index["payment_method"] + 1)
    .setValue(paymentMethod);

  sheet.getRange(targetRow, index["wallet"] + 1).setValue(wallet);

  sheet.getRange(targetRow, index["institution"] + 1).setValue(institution);

  sheet.getRange(targetRow, index["is_asset"] + 1).setValue(isAsset ? 1 : 0);

  sheet
    .getRange(targetRow, index["is_liability"] + 1)
    .setValue(isLiability ? 1 : 0);

  sheet
    .getRange(targetRow, index["opening_balance"] + 1)
    .setValue(openingBalance);

  sheet
    .getRange(targetRow, index["opening_balance_date"] + 1)
    .setValue(openingBalanceDate);

  if (oldAccountName && oldAccountName !== accountName) {
    renameAccountInTransactions_(oldAccountName, accountName);
  }

  clearTableCache(SHEETS.ACCOUNTS);
  clearTableCache(SHEETS.TRANSACTIONS);
  clearAccountBalanceCache_();
  clearHomeRecentTransactionsCache_();

  return createJsonResponse_(
    {
      updated: true,
      accountId,
      oldAccountName,
      accountName,
    },
    "ok",
  );
}

function renameAccountInTransactions_(oldName, newName) {
  if (!oldName || !newName || oldName === newName) {
    return;
  }

  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return;
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    ["account_name", "from_account", "to_account"],
    SHEETS.TRANSACTIONS,
  );

  let changed = false;

  for (let i = 1; i < values.length; i++) {
    for (const column of ["account_name", "from_account", "to_account"]) {
      const current = String(values[i][index[column]] || "").trim();

      if (current === oldName) {
        values[i][index[column]] = newName;

        changed = true;
      }
    }
  }

  if (!changed) {
    return;
  }

  sheet
    .getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));
}

function deactivateAccountFromApp_(data) {
  const accountId = String(data.accountId || "").trim();

  if (!accountId) {
    throw new Error("accountIdは必須です");
  }

  const sheet = getRequiredSheet(SHEETS.ACCOUNTS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("口座データがありません");
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(index, ["account_id", "active"], SHEETS.ACCOUNTS);

  let targetRow = -1;

  for (let i = 1; i < values.length; i++) {
    const rowAccountId = String(values[i][index["account_id"]] || "").trim();

    if (rowAccountId === accountId) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) {
    throw new Error("対象の口座が見つかりません");
  }

  sheet.getRange(targetRow, index["active"] + 1).setValue(0);

  clearTableCache(SHEETS.ACCOUNTS);

  clearAccountBalanceCache_();

  return createJsonResponse_(
    {
      deactivated: true,
      accountId,
    },
    "ok",
  );
}

function updateCategoryFromApp_(data) {
  const subCategoryId = String(data.subCategoryId || "").trim();

  const majorCategory = String(data.majorCategory || "").trim();

  const subCategory = String(data.subCategory || "").trim();

  const active = toBoolean_(data.active, true);

  if (!subCategoryId) {
    throw new Error("subCategoryIdは必須です");
  }

  if (!majorCategory) {
    throw new Error("majorCategoryは必須です");
  }

  if (!subCategory) {
    throw new Error("subCategoryは必須です");
  }

  const sheet = SS.getSheetByName(SHEETS.CATEGORIES);

  if (!sheet) {
    throw new Error("categoriesシートがありません");
  }

  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    throw new Error("更新対象のカテゴリがありません");
  }

  const headers = values[0].map((value) => String(value || "").trim());

  const index = {};

  headers.forEach((header, columnIndex) => {
    index[header] = columnIndex;
  });

  const requiredColumns = [
    "type",
    "major_category_id",
    "major_category",
    "sub_category_id",
    "sub_category",
    "active",
  ];

  for (const column of requiredColumns) {
    if (index[column] === undefined) {
      throw new Error(`categoriesシートに${column}列がありません`);
    }
  }

  let targetRowIndex = -1;

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const rowSubCategoryId = String(
      values[rowIndex][index["sub_category_id"]] || "",
    ).trim();

    if (rowSubCategoryId === subCategoryId) {
      targetRowIndex = rowIndex;
      break;
    }
  }

  if (targetRowIndex === -1) {
    throw new Error("更新対象のカテゴリが見つかりません");
  }

  const type = String(values[targetRowIndex][index["type"]] || "").trim();
  const oldMajorCategory = String(
    values[targetRowIndex][index["major_category"]] || "",
  ).trim();

  const oldSubCategory = String(
    values[targetRowIndex][index["sub_category"]] || "",
  ).trim();

  const majorCategoryId = String(
    values[targetRowIndex][index["major_category_id"]] || "",
  ).trim();

  if (!majorCategoryId) {
    throw new Error("更新対象の大カテゴリIDがありません");
  }

  const duplicateExists = values.slice(1).some((row, indexInSlice) => {
    const actualRowIndex = indexInSlice + 1;

    if (actualRowIndex === targetRowIndex) {
      return false;
    }

    return (
      String(row[index["type"]] || "").trim() === type &&
      String(row[index["major_category"]] || "").trim() === majorCategory &&
      String(row[index["sub_category"]] || "").trim() === subCategory
    );
  });

  if (duplicateExists) {
    throw new Error("同じカテゴリがすでに存在します");
  }

  // 同じ大カテゴリIDを持つ全行の大カテゴリ名を更新
  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const rowMajorCategoryId = String(
      values[rowIndex][index["major_category_id"]] || "",
    ).trim();

    if (rowMajorCategoryId === majorCategoryId) {
      values[rowIndex][index["major_category"]] = majorCategory;
    }
  }

  // 小カテゴリ固有の項目は対象行だけ更新
  values[targetRowIndex][index["sub_category"]] = subCategory;

  values[targetRowIndex][index["active"]] = active ? 1 : 0;

  // 大カテゴリ名変更が複数行に及ぶのでまとめて書き戻す
  sheet
    .getRange(2, 1, values.length - 1, headers.length)
    .setValues(values.slice(1));

  if (oldMajorCategory !== majorCategory || oldSubCategory !== subCategory) {
    renameCategoryInTransactions_({
      type,
      oldMajorCategory,
      newMajorCategory: majorCategory,
      oldSubCategory,
      newSubCategory: subCategory,
    });
  }

  clearTableCache(SHEETS.CATEGORIES);

  return createJsonResponse_(
    {
      subCategoryId,
      majorCategory,
      subCategory,
      active,
    },
    "ok",
  );
}

function renameCategoryInTransactions_(options) {
  const {
    type,
    oldMajorCategory,
    newMajorCategory,
    oldSubCategory,
    newSubCategory,
  } = options;

  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return;
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    ["transaction_date", "type", "major_category", "sub_category"],
    SHEETS.TRANSACTIONS,
  );

  let changed = false;

  const changedMonths = new Set();

  for (let i = 1; i < values.length; i++) {
    const rowType = String(values[i][index["type"]] || "").trim();

    const rowMajor = String(values[i][index["major_category"]] || "").trim();

    const rowSub = String(values[i][index["sub_category"]] || "").trim();

    if (rowType !== type) {
      continue;
    }

    // 元の大カテゴリに属していた取引だけ対象
    if (rowMajor !== oldMajorCategory) {
      continue;
    }

    // 大カテゴリ名は、その大カテゴリ配下の全取引を変更
    let rowChanged = false;

    if (oldMajorCategory !== newMajorCategory) {
      values[i][index["major_category"]] = newMajorCategory;

      rowChanged = true;
    }

    if (oldSubCategory !== newSubCategory && rowSub === oldSubCategory) {
      values[i][index["sub_category"]] = newSubCategory;

      rowChanged = true;
    }

    if (rowChanged) {
      changed = true;

      const yearMonth = normalizeYearMonth(
        values[i][index["transaction_date"]],
      );

      if (yearMonth) {
        changedMonths.add(yearMonth);
      }
    }
  }

  if (!changed) {
    return;
  }

  sheet
    .getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));
  for (const yearMonth of changedMonths) {
    markSummaryDirty_(yearMonth);
  }
  clearTableCache(SHEETS.TRANSACTIONS);
  clearAccountBalanceCache_();
  clearHomeRecentTransactionsCache_();
}

function toBoolean_(value, defaultValue) {
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  const text = String(value).trim().toLowerCase();

  if (text === "true" || text === "1") {
    return true;
  }

  if (text === "false" || text === "0") {
    return false;
  }

  return defaultValue;
}

function createNextCategoryId_(rows, columnIndex, prefix) {
  let maximum = 0;

  for (const row of rows) {
    const value = String(row[columnIndex] || "").trim();

    const match = value.match(new RegExp(`^${prefix}_(\\d+)$`));

    if (!match) {
      continue;
    }

    const number = Number(match[1]);

    if (number > maximum) {
      maximum = number;
    }
  }

  return `${prefix}_${String(maximum + 1).padStart(3, "0")}`;
}

function getMasterData() {
  const categories = getCategoriesData();
  const accounts = getAccountsData_();

  const transactionTypes = buildTransactionTypes_(categories.items);

  const transactionStatuses = ["要確認", "確定"];

  return {
    categories,
    accounts: accounts.items,
    transactionTypes,
    transactionStatuses,
    settings: {},
    generatedAt: new Date().toISOString(),
  };
}

function getAccountsData_() {
  const sheet = SS.getSheetByName(SHEETS.ACCOUNTS);

  if (!sheet) {
    throw new Error("accountsシートがありません");
  }

  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return {
      items: [],
    };
  }

  const headers = values[0].map((value) => String(value || "").trim());

  const index = {};

  headers.forEach((header, i) => {
    index[header] = i;
  });

  const requiredColumns = [
    "account_id",
    "account_name",
    "payment_method",
    "wallet",
    "active",
  ];

  for (const column of requiredColumns) {
    if (index[column] === undefined) {
      throw new Error(`accountsシートに${column}列がありません`);
    }
  }

  const items = [];

  for (const row of values.slice(1)) {
    const activeValue = row[index["active"]];

    const active =
      activeValue === true ||
      Number(activeValue) === 1 ||
      String(activeValue).trim().toLowerCase() === "true";

    if (!active) {
      continue;
    }

    const accountId = String(row[index["account_id"]] || "").trim();

    const accountName = String(row[index["account_name"]] || "").trim();

    const paymentMethod = String(row[index["payment_method"]] || "").trim();

    const wallet = String(row[index["wallet"]] || "").trim();

    if (!accountId || !accountName || !paymentMethod) {
      continue;
    }

    items.push({
      accountId,
      accountName,
      paymentMethod,
      wallet,
      institution:
        index["institution"] === undefined
          ? ""
          : String(row[index["institution"]] || "").trim(),

      isAsset:
        index["is_asset"] === undefined
          ? false
          : Number(row[index["is_asset"]] || 0) === 1,

      isLiability:
        index["is_liability"] === undefined
          ? false
          : Number(row[index["is_liability"]] || 0) === 1,
      active,

      note:
        index["note"] === undefined
          ? ""
          : String(row[index["note"]] || "").trim(),

      openingBalance:
        index["opening_balance"] === undefined
          ? 0
          : Number(row[index["opening_balance"]] || 0),

      openingBalanceDate:
        index["opening_balance_date"] === undefined
          ? ""
          : formatApiDate_(row[index["opening_balance_date"]]),

      sortOrder:
        index["sort_order"] === undefined
          ? 999
          : Number(row[index["sort_order"]] || 999),
    });
  }
  items.sort((a, b) => {
    return a.sortOrder - b.sortOrder;
  });
  return {
    items,
  };
}

function getAccountBalancesData_() {
  const accountsResult = getAccountsData_();

  const transactionTable = loadTransactions();

  const accounts = accountsResult.items || [];

  if (accounts.length === 0) {
    return {
      items: [],
      totalAssets: 0,
      totalLiabilities: 0,
      netAssets: 0,
    };
  }

  if (transactionTable.rows.length === 0) {
    const items = accounts.map((account) => {
      const currentBalance = Number(account.openingBalance || 0);

      return {
        ...account,
        currentBalance,
      };
    });

    return buildAccountBalanceResult_(items);
  }

  assertRequiredColumns(
    transactionTable.index,
    [
      "transaction_date",
      "type",
      "amount",
      "account_name",
      "from_account",
      "to_account",
    ],
    SHEETS.TRANSACTIONS,
  );

  const items = accounts.map((account) => {
    let currentBalance = Number(account.openingBalance || 0);

    const openingDate = String(account.openingBalanceDate || "").trim();

    const accountName = resolveCanonicalAccountName_(account.accountName);
    const isAsset = account.isAsset === true;

    const isLiability = account.isLiability === true;

    for (const row of transactionTable.rows) {
      const transactionDate = formatApiDate_(
        row[transactionTable.index["transaction_date"]],
      );

      // 基準日より前の取引は使わない
      if (openingDate && transactionDate && transactionDate <= openingDate) {
        continue;
      }

      const type = getString(row, transactionTable.index, "type");

      const amount = getNumber(row, transactionTable.index, "amount");

      const rowAccount = resolveCanonicalAccountName_(
        getString(row, transactionTable.index, "account_name"),
      );

      const fromAccount = resolveCanonicalAccountName_(
        getString(row, transactionTable.index, "from_account"),
      );

      const toAccount = resolveCanonicalAccountName_(
        getString(row, transactionTable.index, "to_account"),
      );

      if (type === "収入") {
        if (rowAccount === accountName) {
          if (isLiability) {
            currentBalance -= amount;
          } else {
            currentBalance += amount;
          }
        }

        continue;
      }

      if (type === "支出") {
        if (rowAccount === accountName) {
          if (isLiability) {
            currentBalance += amount;
          } else {
            currentBalance -= amount;
          }
        }

        continue;
      }

      if (type === "移動" || type === "振替") {
        if (fromAccount === accountName) {
          if (isLiability) {
            currentBalance += amount;
          } else {
            currentBalance -= amount;
          }
        }

        if (toAccount === accountName) {
          if (isLiability) {
            currentBalance -= amount;
          } else {
            currentBalance += amount;
          }
        }
      }
    }

    return {
      ...account,
      currentBalance,
    };
  });

  return buildAccountBalanceResult_(items);
}

function buildAccountBalanceResult_(items) {
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const account of items) {
    const balance = Number(account.currentBalance || 0);

    if (account.isAsset) {
      totalAssets += balance;
    }

    if (account.isLiability) {
      totalLiabilities += balance;
    }
  }

  return {
    items,
    totalAssets,
    totalLiabilities,
    netAssets: totalAssets - totalLiabilities,
  };
}

function updateAccountOpeningBalanceFromApp_(data) {
  const accountId = String(data.accountId || "").trim();

  const openingBalanceValue = data.openingBalance;

  const openingBalanceDate = String(data.openingBalanceDate || "").trim();

  if (!accountId) {
    throw new Error("accountIdは必須です");
  }

  if (
    openingBalanceValue === null ||
    openingBalanceValue === undefined ||
    openingBalanceValue === ""
  ) {
    throw new Error("openingBalanceは必須です");
  }

  const openingBalance = Number(openingBalanceValue);

  if (!Number.isFinite(openingBalance)) {
    throw new Error("openingBalanceが不正です");
  }

  if (!openingBalanceDate) {
    throw new Error("openingBalanceDateは必須です");
  }

  const sheet = getRequiredSheet(SHEETS.ACCOUNTS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("口座データがありません");
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    ["account_id", "opening_balance", "opening_balance_date"],
    SHEETS.ACCOUNTS,
  );

  let targetRow = -1;

  for (let i = 1; i < values.length; i++) {
    const rowAccountId = String(values[i][index["account_id"]] || "").trim();

    if (rowAccountId === accountId) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) {
    throw new Error("対象の口座が見つかりません");
  }

  sheet
    .getRange(targetRow, index["opening_balance"] + 1)
    .setValue(openingBalance);

  sheet
    .getRange(targetRow, index["opening_balance_date"] + 1)
    .setValue(openingBalanceDate);

  clearTableCache(SHEETS.ACCOUNTS);

  clearAccountBalanceCache_();

  return createJsonResponse_(
    {
      updated: true,
      accountId,
      openingBalance,
      openingBalanceDate,
    },
    "ok",
  );
}

function buildTransactionTypes_(categoryItems) {
  const types = [];

  for (const item of categoryItems) {
    const value = String(item.type || "").trim();

    if (value && !types.includes(value)) {
      types.push(value);
    }
  }

  return types;
}

function initializeCategoryIds() {
  const sheet = SS.getSheetByName(SHEETS.CATEGORIES);

  if (!sheet) {
    throw new Error("categoriesシートがありません");
  }

  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return;
  }

  const headers = values[0].map((value) => String(value || "").trim());

  const requiredHeaders = [
    "type",
    "major_category_id",
    "major_category",
    "sub_category_id",
    "sub_category",
    "is_expense_target",
    "active",
    "sort_order",
    "note",
  ];

  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`categoriesシートに${header}列がありません`);
    }
  }

  const index = {};

  headers.forEach((header, columnIndex) => {
    index[header] = columnIndex;
  });

  const majorIdMap = new Map();
  const usedMajorIds = new Set();
  const usedSubIds = new Set();

  let nextMajorNumber = 1;
  let nextSubNumber = 1;

  // 既に入っているIDを先に記憶
  for (const row of values.slice(1)) {
    const type = String(row[index["type"]] || "").trim();

    const majorCategory = String(row[index["major_category"]] || "").trim();

    const majorCategoryId = String(
      row[index["major_category_id"]] || "",
    ).trim();

    const subCategoryId = String(row[index["sub_category_id"]] || "").trim();

    if (type && majorCategory && majorCategoryId) {
      majorIdMap.set(`${type}|${majorCategory}`, majorCategoryId);

      usedMajorIds.add(majorCategoryId);
    }

    if (subCategoryId) {
      usedSubIds.add(subCategoryId);
    }
  }

  function createMajorId() {
    let id;

    do {
      id = `major_${String(nextMajorNumber++).padStart(3, "0")}`;
    } while (usedMajorIds.has(id));

    usedMajorIds.add(id);

    return id;
  }

  function createSubId() {
    let id;

    do {
      id = `sub_${String(nextSubNumber++).padStart(3, "0")}`;
    } while (usedSubIds.has(id));

    usedSubIds.add(id);

    return id;
  }

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex];

    const type = String(row[index["type"]] || "").trim();

    const majorCategory = String(row[index["major_category"]] || "").trim();

    const subCategory = String(row[index["sub_category"]] || "").trim();

    if (!type || !majorCategory || !subCategory) {
      continue;
    }

    const majorKey = `${type}|${majorCategory}`;

    let majorCategoryId = String(row[index["major_category_id"]] || "").trim();

    if (!majorCategoryId) {
      majorCategoryId = majorIdMap.get(majorKey) || createMajorId();

      majorIdMap.set(majorKey, majorCategoryId);

      row[index["major_category_id"]] = majorCategoryId;
    }

    let subCategoryId = String(row[index["sub_category_id"]] || "").trim();

    if (!subCategoryId) {
      subCategoryId = createSubId();

      row[index["sub_category_id"]] = subCategoryId;
    }

    const activeValue = row[index["active"]];

    if (activeValue === "" || activeValue === null) {
      row[index["active"]] = 1;
    }

    const sortOrderValue = row[index["sort_order"]];

    if (sortOrderValue === "" || sortOrderValue === null) {
      row[index["sort_order"]] = rowIndex;
    }
  }

  sheet.getRange(1, 1, values.length, headers.length).setValues(values);

  clearTableCache(SHEETS.CATEGORIES);
}

function getAccountBillingSettings_(rawAccountName) {
  const accountName = resolveCanonicalAccountName_(rawAccountName);

  if (!accountName) {
    return null;
  }

  const rows = loadObjects(SHEETS.ACCOUNTS);

  const row = rows.find((item) => {
    return String(item.account_name || "").trim() === accountName;
  });

  if (!row) {
    return null;
  }

  const closingDay = Number(row.closing_day || 0);

  const paymentDay = Number(row.payment_day || 0);

  const paymentMonthOffset = Number(row.payment_month_offset || 0);

  if (
    !Number.isInteger(closingDay) ||
    closingDay <= 0 ||
    !Number.isInteger(paymentDay) ||
    paymentDay <= 0
  ) {
    return null;
  }

  return {
    accountName,
    closingDay,
    paymentDay,
    paymentMonthOffset,
  };
}

function calculateBillingYearMonth_(transactionDate, rawAccountName) {
  const settings = getAccountBillingSettings_(rawAccountName);

  if (!settings) {
    return "";
  }

  const text = normalizeImportDate_(transactionDate);

  if (!text) {
    return "";
  }

  const [year, month, day] = text.split("-").map(Number);

  let closingYear = year;
  let closingMonth = month;

  // 月末締め
  if (settings.closingDay === 31) {
    // その利用月の締めに入る
  } else if (day > settings.closingDay) {
    // 締め日を過ぎていたら次回締め
    closingMonth++;

    if (closingMonth > 12) {
      closingMonth = 1;
      closingYear++;
    }
  }

  let billingMonth = closingMonth + settings.paymentMonthOffset;

  let billingYear = closingYear;

  while (billingMonth > 12) {
    billingMonth -= 12;
    billingYear++;
  }

  return `${billingYear}-` + String(billingMonth).padStart(2, "0");
}

function getImportBillingYearMonth_(rows, config) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "";
  }

  // クレカCSV以外は請求月を持たない
  if (String(config.source_type || "").trim() !== "CSV_クレカ") {
    return "";
  }

  const accountName = String(config.account_name || "").trim();

  if (!accountName) {
    return "";
  }

  const billingMonths = new Set();

  for (const row of rows) {
    const keys = Object.keys(row);

    const dateKey = keys[Number(config.date_col) - 1];

    if (!dateKey) {
      continue;
    }

    const transactionDate = row[dateKey];

    const billingYearMonth = calculateBillingYearMonth_(
      transactionDate,
      accountName,
    );

    if (billingYearMonth) {
      billingMonths.add(billingYearMonth);
    }
  }

  // CSV全体が1つの請求月に収まる場合だけ確定
  if (billingMonths.size === 1) {
    return Array.from(billingMonths)[0];
  }

  // 複数請求月が含まれるCSVは
  // 無理に代表月を設定しない
  return "";
}

function getImportBillingYearMonths_(rows, config) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  if (String(config.source_type || "").trim() !== "CSV_クレカ") {
    return [];
  }

  const accountName = String(config.account_name || "").trim();

  if (!accountName) {
    return [];
  }

  const billingMonths = new Set();

  for (const row of rows) {
    const keys = Object.keys(row);

    const dateKey = keys[Number(config.date_col) - 1];

    if (!dateKey) {
      continue;
    }

    const billingYearMonth = calculateBillingYearMonth_(
      row[dateKey],
      accountName,
    );

    if (billingYearMonth) {
      billingMonths.add(billingYearMonth);
    }
  }

  return Array.from(billingMonths).sort();
}
