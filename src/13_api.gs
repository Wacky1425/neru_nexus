function getHomeData() {
  const yearMonth = getLatestBudgetMonth();

  if (!yearMonth) {
    throw new Error("対象月がありません");
  }

  return {
    yearMonth,
    dailyBudget: getDailyBudget(yearMonth),
    availableMoney: getAvailableMoney(yearMonth),
    savingForecast: getSavingForecast(yearMonth),
    sideBusinessProfit: getSideBusinessProfit(yearMonth),
    moneyHealth: getMoneyHealth(yearMonth),
    featuredDream: getFeaturedDreamFund(),
    recentTransactions: getTransactionsData({
      limit: 3,
    }).items,
    generatedAt: new Date().toISOString(),
  };
}

function getApiKey_() {
  const apiKey =
    PropertiesService.getScriptProperties().getProperty("NERU_API_KEY");

  if (!apiKey) {
    throw new Error("スクリプトプロパティ NERU_API_KEY が設定されていません");
  }

  return apiKey;
}

function isApiAuthorized_(requestKey) {
  const receivedKey = String(requestKey || "");
  const expectedKey = getApiKey_();

  return receivedKey === expectedKey;
}

function createJsonResponse_(data, status) {
  return ContentService.createTextOutput(
    JSON.stringify({
      success: status !== "error",
      status,
      data,
    }),
  ).setMimeType(ContentService.MimeType.JSON);
}

function createJsonErrorResponse_(message) {
  return ContentService.createTextOutput(
    JSON.stringify({
      success: false,
      status: "error",
      error: {
        message: String(message || "不明なエラー"),
      },
    }),
  ).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const parameters = e && e.parameter ? e.parameter : {};

    if (!isApiAuthorized_(parameters.key)) {
      return createJsonErrorResponse_("認証に失敗しました");
    }

    const action = String(parameters.action || "").trim();

    switch (action) {
      case "home":
        return createJsonResponse_(getHomeData(), "ok");

      case "analytics":
        return createJsonResponse_(
          getAnalyticsData(parameters.yearMonth),
          "ok",
        );

      case "health":
        return createJsonResponse_(
          {
            service: "Neru Nexus API",
            running: true,
            generatedAt: new Date().toISOString(),
          },
          "ok",
        );

      case "transactions":
        return createJsonResponse_(
          getTransactionsData({
            limit: parameters.limit,
            offset: parameters.offset,
            yearMonth: parameters.yearMonth,
            keyword: parameters.keyword,
            majorCategory: parameters.majorCategory,
            reviewOnly: parameters.reviewOnly,
          }),
          "ok",
        );

      case "categories":
        return createJsonResponse_(getCategoriesData(), "ok");

      case "master":
        return createJsonResponse_(getMasterData(), "ok");

      case "review_transactions":
        return createJsonResponse_(
          getReviewTransactionsData({
            limit: parameters.limit,
            offset: parameters.offset,
          }),
          "ok",
        );

      case "review_count":
        return createJsonResponse_(getReviewTransactionCount(), "ok");

      default:
        return createJsonErrorResponse_(`未対応のactionです: ${action}`);
    }
  } catch (error) {
    console.error(error);

    return createJsonErrorResponse_(
      error && error.message ? error.message : error,
    );
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(
      e && e.postData && e.postData.contents ? e.postData.contents : "{}",
    );

    const key = String(data.key || "").trim();

    if (!isApiAuthorized_(key)) {
      return createJsonErrorResponse_("認証に失敗しました");
    }

    const action = String(data.action || "").trim();

    switch (action) {
      case "transaction_create":
        return createTransactionFromApp_(data);

      case "transaction_update":
        return updateTransactionFromApp_(data);

      case "transaction_delete":
        return deleteTransactionFromApp_(data);

      case "csv_import":
        return importCsvFromApp_(data);

      case "discord_transaction":
        return createDiscordTransaction_(data);

      case "category_create":
        return createCategoryFromApp_(data);

      case "category_update":
        return updateCategoryFromApp_(data);

      default:
        return createJsonErrorResponse_(`未対応のactionです: ${action}`);
    }
  } catch (error) {
    console.error(error);

    return createJsonErrorResponse_(
      error && error.message ? error.message : String(error),
    );
  }
}

function createTransactionFromApp_(data) {
  const transactionDate = String(data.transactionDate || "").trim();

  const type = String(data.type || "").trim();

  const amount = Number(data.amount || 0);

  const majorCategory = String(data.majorCategory || "").trim();

  const subCategory = String(data.subCategory || "").trim();

  const title = String(data.title || "").trim();

  const paymentMethod = String(data.paymentMethod || "").trim();

  const status = String(data.status || "要確認").trim();

  const accountName = String(data.accountName || "").trim();

  const memo = String(data.memo || "").trim();

  if (!transactionDate) {
    throw new Error("transactionDateは必須です");
  }

  const parsedDate = new Date(`${transactionDate}T00:00:00+09:00`);

  if (isNaN(parsedDate.getTime())) {
    throw new Error("transactionDateの形式が不正です");
  }

  if (type !== "支出" && type !== "収入") {
    throw new Error("typeは支出または収入を指定してください");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amountは1以上で指定してください");
  }

  if (!majorCategory) {
    throw new Error("majorCategoryは必須です");
  }

  if (!subCategory) {
    throw new Error("subCategoryは必須です");
  }

  if (!title) {
    throw new Error("titleは必須です");
  }

  if (!paymentMethod) {
    throw new Error("paymentMethodは必須です");
  }

  if (status !== "確定" && status !== "要確認") {
    throw new Error("statusは確定または要確認を指定してください");
  }

  const purposeType = type === "収入" ? "私用" : guessPurposeType(subCategory);

  const wallet = purposeType === "経費" ? "事業" : "生活";

  const tx = {
    transaction_date: transactionDate,

    merchant: normalizeMerchant(title),

    item_name: title,

    amount,

    note: memo,

    source_type: "Neru Nexus App",

    payment_method: paymentMethod,

    account_name: "App Manual",

    evidence_url: "",

    original_image_url: "",

    import_batch: Utilities.formatDate(
      new Date(),
      "Asia/Tokyo",
      "yyyyMMdd_HHmmss",
    ),

    type,

    major_category: majorCategory,

    sub_category: subCategory,

    purpose_type: purposeType,

    expense_ratio: type === "支出" ? guessExpenseRatio(subCategory) : 0,

    status: status,

    account_name: accountName,

    wallet,

    intent: type === "収入" ? "収入" : guessIntent(subCategory),
  };

  const result = addTransactions([tx]);

  if (result.addedCount === 0) {
    if (result.skippedCount > 0) {
      throw new Error("同じ内容の取引がすでに登録されています");
    }

    throw new Error("取引を登録できませんでした");
  }

  rebuildReviewQueue();
  rebuildReviewSummary();
  rebuildAllViews();

  return createJsonResponse_(
    {
      addedCount: result.addedCount,

      skippedCount: result.skippedCount,

      source: "app",

      transaction: {
        transactionDate: tx.transaction_date,

        type: tx.type,

        amount: tx.amount,

        majorCategory: tx.major_category,

        subCategory: tx.sub_category,

        title: tx.item_name,

        paymentMethod: tx.payment_method,

        memo: tx.note,

        wallet: tx.wallet,

        purposeType: tx.purpose_type,
      },
    },
    "ok",
  );
}

function updateTransactionFromApp_(data) {
  const id = String(data.id || "").trim();

  const transactionDate = String(data.transactionDate || "").trim();

  const type = String(data.type || "").trim();

  const amount = Number(data.amount || 0);

  const majorCategory = String(data.majorCategory || "").trim();

  const subCategory = String(data.subCategory || "").trim();

  const title = String(data.title || "").trim();

  const paymentMethod = String(data.paymentMethod || "").trim();

  const status = String(data.status || "要確認").trim();

  const memo = String(data.memo || "").trim();

  const saveRule = toBoolean_(data.saveRule, false);

  const ruleMerchant = String(data.merchant || "").trim();

  if (!id) {
    throw new Error("idは必須です");
  }

  if (!transactionDate) {
    throw new Error("transactionDateは必須です");
  }

  if (type !== "支出" && type !== "収入") {
    throw new Error("typeは支出または収入を指定してください");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amountは1以上で指定してください");
  }

  if (!majorCategory) {
    throw new Error("majorCategoryは必須です");
  }

  if (!subCategory) {
    throw new Error("subCategoryは必須です");
  }

  if (!title) {
    throw new Error("titleは必須です");
  }

  if (!paymentMethod) {
    throw new Error("paymentMethodは必須です");
  }

  if (status !== "確定" && status !== "要確認") {
    throw new Error("statusは確定または要確認を指定してください");
  }

  const table = loadTransactions();

  if (table.rows.length === 0) {
    throw new Error("更新対象の取引が見つかりません");
  }

  assertRequiredColumns(
    table.index,
    [
      "id",
      "transaction_date",
      "recorded_at",
      "year_month",
      "type",
      "source_type",
      "payment_method",
      "account_name",
      "merchant",
      "item_name",
      "raw_text",
      "amount",
      "major_category",
      "sub_category",
      "purpose_type",
      "expense_ratio",
      "expense_amount",
      "note",
      "evidence_url",
      "original_image_url",
      "import_batch",
      "duplicate_key",
      "status",
      "wallet",
      "intent",
      "wallet",
      "intent",
      "from_account",
      "to_account",
      "settlement_status",
      "settlement_id",
    ],
    SHEETS.TRANSACTIONS,
  );

  const rowIndex = table.rows.findIndex(
    (row) => String(row[table.index["id"]] || "").trim() === id,
  );

  if (rowIndex === -1) {
    throw new Error("更新対象の取引が見つかりません");
  }

  const existingRow = table.rows[rowIndex];

  const purposeType = type === "収入" ? "私用" : guessPurposeType(subCategory);

  const expenseRatio = type === "支出" ? guessExpenseRatio(subCategory) : 0;

  const wallet = purposeType === "経費" ? "事業" : "生活";

  const intent = type === "収入" ? "収入" : guessIntent(subCategory);

  const updatedTransaction = {
    transaction_date: transactionDate,

    type,

    source_type:
      getString(existingRow, table.index, "source_type") || "Neru Nexus App",

    payment_method: paymentMethod,

    account_name:
      getString(existingRow, table.index, "account_name") || "App Manual",

    merchant: normalizeMerchant(title),

    item_name: title,

    raw_text: getString(existingRow, table.index, "raw_text"),

    amount,

    major_category: majorCategory,

    sub_category: subCategory,

    purpose_type: purposeType,

    expense_ratio: expenseRatio,

    note: memo,

    evidence_url: getString(existingRow, table.index, "evidence_url"),

    original_image_url: getString(
      existingRow,
      table.index,
      "original_image_url",
    ),

    import_batch: getString(existingRow, table.index, "import_batch"),

    status: status,

    wallet,

    intent,

    from_account: getString(existingRow, table.index, "from_account"),

    to_account: getString(existingRow, table.index, "to_account"),

    settlement_status: getString(existingRow, table.index, "settlement_status"),

    settlement_id: getString(existingRow, table.index, "settlement_id"),
  };

  const recordedAt = existingRow[table.index["recorded_at"]] || new Date();

  const yearMonth = resolveTransactionYearMonth(transactionDate, recordedAt);

  const duplicateKey = buildDuplicateKey(updatedTransaction);

  const updatedRow = buildTransactionRow(
    updatedTransaction,
    id,
    recordedAt,
    yearMonth,
    duplicateKey,
  );

  const sheet = SS.getSheetByName(SHEETS.TRANSACTIONS);

  if (!sheet) {
    throw new Error("transactionsシートがありません");
  }

  const sheetRowNumber = rowIndex + 2;

  sheet
    .getRange(sheetRowNumber, 1, 1, updatedRow.length)
    .setValues([updatedRow]);

  clearTableCache(SHEETS.TRANSACTIONS);

  let ruleResult = null;

  if (saveRule) {
    const merchantForRule =
      ruleMerchant || getString(existingRow, table.index, "merchant");

    if (!merchantForRule) {
      throw new Error("ルール登録対象の取引先を取得できません");
    }

    ruleResult = addRuleFromTransaction_({
      merchant: merchantForRule,
      type,
      majorCategory,
      subCategory,
      purposeType,
      expenseRatio,
      wallet,
      intent,
    });
  }

  rebuildReviewQueue();
  rebuildReviewSummary();
  rebuildAllViews();

  return createJsonResponse_(
    {
      updated: true,
      id,
      transaction: {
        transactionDate,
        type,
        amount,
        majorCategory,
        subCategory,
        title,
        paymentMethod,
        memo,
        wallet,
        purposeType,
      },
    },
    "ok",
  );
}

function deleteTransactionFromApp_(data) {
  const id = String(data.id || "").trim();

  if (!id) {
    throw new Error("idは必須です");
  }

  const sheet = SS.getSheetByName(SHEETS.TRANSACTIONS);

  if (!sheet) {
    throw new Error(`${SHEETS.TRANSACTIONS}シートがありません`);
  }

  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    throw new Error("データがありません");
  }

  const headers = values[0];

  const idIndex = headers.indexOf("id");

  if (idIndex == -1) {
    throw new Error("id列がありません");
  }

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idIndex]).trim() === id) {
      sheet.deleteRow(i + 1);

      clearTableCache(SHEETS.TRANSACTIONS);

      /*
       * 取引そのものの削除は完了済み。
       * 派生シートの再構築に失敗しても、
       * 削除API自体は成功として返す。
       */
      const rebuildErrors = [];

      try {
        rebuildReviewQueue();
      } catch (error) {
        console.error("rebuildReviewQueue失敗", error);

        rebuildErrors.push("reviewQueue");
      }

      try {
        rebuildReviewSummary();
      } catch (error) {
        console.error("rebuildReviewSummary失敗", error);

        rebuildErrors.push("reviewSummary");
      }

      try {
        rebuildAllViews();
      } catch (error) {
        console.error("rebuildAllViews失敗", error);

        rebuildErrors.push("allViews");
      }

      return createJsonResponse_(
        {
          deleted: true,
          id,
          rebuildErrors,
        },
        "ok",
      );
    }
  }

  throw new Error("削除対象が見つかりません");
}

function formatApiDate_(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Asia/Tokyo", "yyyy-MM-dd");
  }

  const parsedDate = new Date(String(value).replace(/\./g, "/"));

  if (!isNaN(parsedDate.getTime())) {
    return Utilities.formatDate(parsedDate, "Asia/Tokyo", "yyyy-MM-dd");
  }

  return String(value);
}

function getTransactionsData(options) {
  const settings = options || {};

  const requestedLimit = Number(settings.limit || 50);

  const requestedOffset = Number(settings.offset || 0);

  const limit = Math.min(Math.max(requestedLimit, 1), 200);

  const offset = Math.max(requestedOffset, 0);

  const targetMonth = settings.yearMonth
    ? normalizeBudgetYearMonth(settings.yearMonth)
    : "";

  const keyword = String(settings.keyword || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();

  const majorCategory = String(settings.majorCategory || "").trim();

  const reviewOnly = toBoolean_(settings.reviewOnly, false);

  const table = loadTransactions();

  if (table.rows.length === 0) {
    return {
      items: [],
      total: 0,
      limit,
      offset,
      hasMore: false,
    };
  }

  assertRequiredColumns(
    table.index,
    [
      "id",
      "transaction_date",
      "merchant",
      "item_name",
      "amount",
      "type",
      "major_category",
      "sub_category",
      "status",
      "wallet",
      "raw_text",
      "intent",
    ],
    SHEETS.TRANSACTIONS,
  );

  const filteredRows = table.rows.filter((row) => {
    if (targetMonth) {
      const rowMonth = normalizeYearMonth(row[table.index["transaction_date"]]);

      if (rowMonth !== targetMonth) {
        return false;
      }
    }

    if (majorCategory) {
      const rowMajorCategory = getString(row, table.index, "major_category");

      if (rowMajorCategory !== majorCategory) {
        return false;
      }
    }

    if (reviewOnly) {
      const status = getString(row, table.index, "status");

      if (status !== "要確認") {
        return false;
      }
    }

    if (keyword) {
      const searchableText = [
        getString(row, table.index, "merchant"),
        getString(row, table.index, "item_name"),
        getString(row, table.index, "major_category"),
        getString(row, table.index, "sub_category"),
        getString(row, table.index, "wallet"),
        getString(row, table.index, "intent"),
      ]
        .join(" ")
        .normalize("NFKC")
        .toLowerCase();

      if (!searchableText.includes(keyword)) {
        return false;
      }
    }

    return true;
  });

  filteredRows.sort((a, b) => {
    const dateA = new Date(a[table.index["transaction_date"]]);

    const dateB = new Date(b[table.index["transaction_date"]]);

    return dateB.getTime() - dateA.getTime();
  });

  const total = filteredRows.length;

  const items = filteredRows.slice(offset, offset + limit).map((row) => ({
    id: getString(row, table.index, "id"),

    transactionDate: formatApiDate_(row[table.index["transaction_date"]]),

    merchant: getString(row, table.index, "merchant"),

    itemName: getString(row, table.index, "item_name"),

    amount: getNumber(row, table.index, "amount"),

    type: getString(row, table.index, "type"),

    majorCategory: getString(row, table.index, "major_category"),

    subCategory: getString(row, table.index, "sub_category"),

    status: getString(row, table.index, "status"),

    wallet: getString(row, table.index, "wallet"),

    intent: getString(row, table.index, "intent"),

    rawText: getString(row, table.index, "raw_text"),
  }));

  return {
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}

function getReviewTransactionsData(options) {
  const settings = options || {};

  const requestedLimit = Number(settings.limit || 100);

  const requestedOffset = Number(settings.offset || 0);

  const limit = Math.min(Math.max(requestedLimit, 1), 200);

  const offset = Math.max(requestedOffset, 0);

  const table = loadTransactions();

  if (table.rows.length === 0) {
    return {
      items: [],
      total: 0,
      limit,
      offset,
      hasMore: false,
    };
  }

  assertRequiredColumns(
    table.index,
    [
      "id",
      "transaction_date",
      "merchant",
      "item_name",
      "amount",
      "type",
      "major_category",
      "sub_category",
      "status",
      "wallet",
      "intent",
      "payment_method",
      "raw_text",
      "note",
    ],
    SHEETS.TRANSACTIONS,
  );

  const filteredRows = table.rows.filter(
    (row) => getString(row, table.index, "status") === "要確認",
  );

  filteredRows.sort((a, b) => {
    const dateA = new Date(a[table.index["transaction_date"]]);

    const dateB = new Date(b[table.index["transaction_date"]]);

    return dateB.getTime() - dateA.getTime();
  });

  const total = filteredRows.length;

  const items = filteredRows.slice(offset, offset + limit).map((row) => ({
    id: getString(row, table.index, "id"),

    transactionDate: formatApiDate_(row[table.index["transaction_date"]]),

    merchant: getString(row, table.index, "merchant"),

    itemName: getString(row, table.index, "item_name"),

    amount: getNumber(row, table.index, "amount"),

    type: getString(row, table.index, "type"),

    majorCategory: getString(row, table.index, "major_category"),

    subCategory: getString(row, table.index, "sub_category"),

    status: getString(row, table.index, "status"),

    wallet: getString(row, table.index, "wallet"),

    intent: getString(row, table.index, "intent"),

    paymentMethod: getString(row, table.index, "payment_method"),

    rawText: getString(row, table.index, "raw_text"),

    note: getString(row, table.index, "note"),
  }));

  return {
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}

function getReviewTransactionCount() {
  const table = loadTransactions();

  if (table.rows.length === 0) {
    return {
      count: 0,
    };
  }

  assertRequiredColumns(table.index, ["status"], SHEETS.TRANSACTIONS);

  let count = 0;

  for (const row of table.rows) {
    if (getString(row, table.index, "status") === "要確認") {
      count++;
    }
  }

  return {
    count,
  };
}
