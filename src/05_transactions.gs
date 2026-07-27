function addTransaction(tx) {
  tx.account_name = normalizeAccountName(
    tx.account_name
  );

  const duplicateKey = buildDuplicateKey(tx);
  const existingKeys = getExistingDuplicateKeys();

  if (existingKeys.has(duplicateKey)) {
    Logger.log(
      "重複のためスキップ: " + duplicateKey
    );

    return false;
  }

  const createdAt = new Date();

  const yearMonth = resolveTransactionYearMonth(
    tx.transaction_date,
    createdAt
  );

  const row = buildTransactionRow(
    tx,
    Utilities.getUuid(),
    createdAt,
    yearMonth,
    duplicateKey
  );

  appendTransactionRow(row);

  return true;
}

/**
 * 対象月の取引金額を指定列ごとに集計する。
 *
 * @param {*} yearMonth 対象年月
 * @param {string} groupColumn 集計軸となる列名
 * @param {{
 *   type?: string,
 *   wallet?: string,
 *   skipBlank?: boolean
 * }=} options
 * @return {Array<Array<*>>} [[名称, 金額], ...]
 */
function summarizeTransactionsByField(
  yearMonth,
  groupColumn,
  options,
  transactionTable
    ) {
    const table = transactionTable || loadTransactions();
    const settings = options || {};

  if (table.rows.length === 0) {
    return [];
  }

  const requiredColumns = [
    "transaction_date",
    "type",
    "wallet",
    "amount",
    groupColumn
  ];

  assertRequiredColumns(
    table.index,
    requiredColumns,
    "transactions"
  );

  const targetMonth =
    normalizeBudgetYearMonth(yearMonth);

  const targetType =
    String(settings.type || "").trim();

  const targetWallet =
    String(settings.wallet || "").trim();

  const skipBlank =
    settings.skipBlank === true;

  const amountMap = new Map();

  for (const row of table.rows) {
    const transactionMonth = normalizeYearMonth(
      row[table.index["transaction_date"]]
    );

    if (transactionMonth !== targetMonth) {
      continue;
    }

    const type = String(
      row[table.index["type"]] || ""
    ).trim();

    if (targetType && type !== targetType) {
      continue;
    }

    const wallet = String(
      row[table.index["wallet"]] || ""
    ).trim();

    if (targetWallet && wallet !== targetWallet) {
      continue;
    }

    const groupName = String(
      row[table.index[groupColumn]] || ""
    ).trim();

    if (skipBlank && !groupName) {
      continue;
    }

    const amount = Number(
      row[table.index["amount"]] || 0
    );

    if (amount === 0) {
      continue;
    }

    amountMap.set(
      groupName,
      (amountMap.get(groupName) || 0) + amount
    );
  }

  return Array.from(amountMap.entries())
    .sort((a, b) => b[1] - a[1]);
}

function filterTransactions(options) {

  const table = loadTable("transactions");

  if (table.rows.length === 0) {
    return [];
  }

  const opt = options || {};

  return table.rows.filter(row => {

    if (opt.yearMonth) {

      const month = normalizeYearMonth(
        row[table.index["transaction_date"]]
      );

      if (month !== opt.yearMonth) {
        return false;
      }

    }

    if (opt.type) {

      if (
        String(row[table.index["type"]]).trim()
        !== opt.type
      ) {
        return false;
      }

    }

    if (opt.wallet) {

      if (
        String(row[table.index["wallet"]]).trim()
        !== opt.wallet
      ) {
        return false;
      }

    }

    return true;

  });

}

/**
 * 条件に一致するtransactionsの行を取得する。
 *
 * @param {{
 *   yearMonth?: string,
 *   type?: string,
 *   wallet?: string,
 *   intent?: string
 * }=} options
 * @param {{
 *   rows: Array<Array<*>>,
 *   index: Object<string, number>
 * }=} transactionTable
 * @return {{
 *   rows: Array<Array<*>>,
 *   index: Object<string, number>
 * }}
 */
function filterTransactionRows(options, transactionTable) {
  const table = transactionTable || loadTransactions();
  const settings = options || {};

  if (table.rows.length === 0) {
    return {
      rows: [],
      index: table.index
    };
  }

  assertRequiredColumns(
    table.index,
    [
      "transaction_date",
      "type",
      "wallet"
    ],
    "transactions"
  );

  const targetMonth = settings.yearMonth
    ? normalizeBudgetYearMonth(settings.yearMonth)
    : "";

  const targetType = String(
    settings.type || ""
  ).trim();

  const targetWallet = String(
    settings.wallet || ""
  ).trim();

  const targetIntent = String(
    settings.intent || ""
  ).trim();

  if (
    targetIntent &&
    table.index["intent"] === undefined
  ) {
    throw new Error(
      "transactions に intent 列がありません"
    );
  }

  const rows = table.rows.filter(row => {
    if (targetMonth) {
      const rowMonth = normalizeYearMonth(
        row[table.index["transaction_date"]]
      );

      if (rowMonth !== targetMonth) {
        return false;
      }
    }

    if (targetType) {
      const rowType = getString(
        row,
        table.index,
        "type"
      );

      if (rowType !== targetType) {
        return false;
      }
    }

    if (targetWallet) {
      const rowWallet = getString(
        row,
        table.index,
        "wallet"
      );

      if (rowWallet !== targetWallet) {
        return false;
      }
    }

    if (targetIntent) {
      const rowIntent = getString(
        row,
        table.index,
        "intent"
      );

      if (rowIntent !== targetIntent) {
        return false;
      }
    }

    return true;
  });

  return {
    rows,
    index: table.index
  };
}

function getMonthlyLivingExpense(yearMonth,table) {
  const filtered = filterTransactionRows({
    yearMonth,
    type: "支出",
    wallet: "生活"
  },
  table
  );

  assertRequiredColumns(
    filtered.index,
    ["amount"],
    "transactions"
  );

  return filtered.rows.reduce(
    (total, row) =>
      total + getNumber(
        row,
        filtered.index,
        "amount"
      ),
    0
  );
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
    const major = getString(
      row,
      filtered.index,
      "major_category"
    );

    const sub = getString(
      row,
      filtered.index,
      "sub_category"
    );

    const amount = getNumber(
      row,
      filtered.index,
      "amount"
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
    const type = getString(
      row,
      filtered.index,
      "type"
    );

    const amount = getNumber(
      row,
      filtered.index,
      "amount"
    );

    if (type === "収入") {
      income += amount;
    } else if (type === "支出") {
      expense += amount;
    }
  }

  return income - expense;
}

function loadTransactions() {
  return loadTable("transactions");
}

function buildTransactionRow(
  tx,
  id,
  createdAt,
  yearMonth,
  duplicateKey
    ) {
  const amount = Number(tx.amount || 0);
  const expenseRatio = Number(tx.expense_ratio || 0);

  return [
    id,
    tx.transaction_date || "",
    createdAt,
    yearMonth,
    tx.type || "",
    tx.source_type || "manual",
    tx.payment_method || "",
    tx.account_name || "",
    tx.merchant || "",
    tx.item_name || "",
    amount,
    tx.major_category || "",
    tx.sub_category || "",
    tx.purpose_type || "",
    expenseRatio,
    amount * expenseRatio,
    tx.note || "",
    tx.evidence_url || "",
    tx.original_image_url || "",
    tx.import_batch || "",
    duplicateKey,
    tx.status || "",
    tx.wallet || "生活",
    tx.intent || "その他"
  ];
}

function appendTransactionRow(row) {
  getRequiredSheet("transactions")
    .appendRow(row);
}

function resolveTransactionYearMonth(transactionDate, fallbackDate) {
  if (transactionDate) {
    const parsedDate = new Date(
      String(transactionDate).replace(/\./g, "/")
    );

    if (!isNaN(parsedDate.getTime())) {
      return Utilities.formatDate(
        parsedDate,
        "Asia/Tokyo",
        "yyyy-MM"
      );
    }
  }

  return Utilities.formatDate(
    fallbackDate,
    "Asia/Tokyo",
    "yyyy-MM"
  );
}

function createTransactionAccessor(row, index) {
  return {
    get(name) {
      return getString(row, index, name);
    },

    number(name) {
      return getNumber(row, index, name);
    }
  };
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