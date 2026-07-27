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