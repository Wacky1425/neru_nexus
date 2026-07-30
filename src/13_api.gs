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
    generatedAt: new Date().toISOString()
  };
}

function getApiKey_() {
  const apiKey = PropertiesService
    .getScriptProperties()
    .getProperty("NERU_API_KEY");

  if (!apiKey) {
    throw new Error(
      "スクリプトプロパティ NERU_API_KEY が設定されていません"
    );
  }

  return apiKey;
}

function isApiAuthorized_(requestKey) {
  const receivedKey = String(requestKey || "");
  const expectedKey = getApiKey_();

  return receivedKey === expectedKey;
}

function createJsonResponse_(data, status) {
  return ContentService
    .createTextOutput(
      JSON.stringify({
        success: status !== "error",
        status,
        data
      })
    )
    .setMimeType(ContentService.MimeType.JSON);
}

function createJsonErrorResponse_(message) {
  return ContentService
    .createTextOutput(
      JSON.stringify({
        success: false,
        status: "error",
        error: {
          message: String(message || "不明なエラー")
        }
      })
    )
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const parameters = e && e.parameter
      ? e.parameter
      : {};

    if (!isApiAuthorized_(parameters.key)) {
      return createJsonErrorResponse_(
        "認証に失敗しました"
      );
    }

    const action = String(
      parameters.action || ""
    ).trim();

    switch (action) {
      case "home":
        return createJsonResponse_(
          getHomeData(),
          "ok"
        );

      case "analytics":
        return createJsonResponse_(
          getAnalyticsData(
            parameters.yearMonth
          ),
          "ok"
        );

      case "health":
        return createJsonResponse_(
          {
            service: "Neru Nexus API",
            running: true,
            generatedAt: new Date().toISOString()
          },
          "ok"
        );

        case "transactions":
            return createJsonResponse_(
                getTransactionsData({
                limit: parameters.limit,
                offset: parameters.offset,
                yearMonth: parameters.yearMonth
                }),
                "ok"
            );

      default:
        return createJsonErrorResponse_(
          `未対応のactionです: ${action}`
        );
    }

  } catch (error) {
    console.error(error);

    return createJsonErrorResponse_(
      error && error.message
        ? error.message
        : error
    );
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(
      e &&
      e.postData &&
      e.postData.contents
        ? e.postData.contents
        : "{}"
    );

    const key = String(
      data.key || ""
    ).trim();

    if (!isApiAuthorized_(key)) {
      return createJsonErrorResponse_(
        "認証に失敗しました"
      );
    }

    const action = String(
      data.action || ""
    ).trim();

    switch (action) {
      case "transaction_create":
        return createTransactionFromApp_(data);

      case "discord_transaction":
        return createDiscordTransaction_(data);

      default:
        return createJsonErrorResponse_(
          `未対応のactionです: ${action}`
        );
    }

  } catch (error) {
    console.error(error);

    return createJsonErrorResponse_(
      error && error.message
        ? error.message
        : String(error)
    );
  }
}

function createTransactionFromApp_(data) {
  const transactionDate = String(
    data.transactionDate || ""
  ).trim();

  const type = String(
    data.type || ""
  ).trim();

  const amount = Number(
    data.amount || 0
  );

  const category = String(
    data.category || ""
  ).trim();

  const title = String(
    data.title || ""
  ).trim();

  const paymentMethod = String(
    data.paymentMethod || ""
  ).trim();

  const memo = String(
    data.memo || ""
  ).trim();

  if (!transactionDate) {
    throw new Error(
      "transactionDateは必須です"
    );
  }

  const parsedDate = new Date(
    `${transactionDate}T00:00:00+09:00`
  );

  if (isNaN(parsedDate.getTime())) {
    throw new Error(
      "transactionDateの形式が不正です"
    );
  }

  if (
    type !== "支出" &&
    type !== "収入"
  ) {
    throw new Error(
      "typeは支出または収入を指定してください"
    );
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "amountは1以上で指定してください"
    );
  }

  if (!category) {
    throw new Error(
      "categoryは必須です"
    );
  }

  if (!title) {
    throw new Error(
      "titleは必須です"
    );
  }

  if (!paymentMethod) {
    throw new Error(
      "paymentMethodは必須です"
    );
  }

  const purposeType =
    type === "収入"
      ? "私用"
      : guessPurposeType(category);

  const wallet =
    purposeType === "経費"
      ? "事業"
      : "生活";

  const tx = {
    transaction_date:
      transactionDate,

    merchant:
      normalizeMerchant(title),

    item_name:
      title,

    amount,

    note:
      memo,

    source_type:
      "Neru Nexus App",

    payment_method:
      paymentMethod,

    account_name:
      "App Manual",

    evidence_url:
      "",

    original_image_url:
      "",

    import_batch:
      Utilities.formatDate(
        new Date(),
        "Asia/Tokyo",
        "yyyyMMdd_HHmmss"
      ),

    type,

    major_category:
      mapMajorCategory(category),

    sub_category:
      category,

    purpose_type:
      purposeType,

    expense_ratio:
      type === "支出"
        ? guessExpenseRatio(category)
        : 0,

    status:
      "確定",

    wallet,

    intent:
      type === "収入"
        ? "収入"
        : guessIntent(category)
  };

  const result = addTransactions([
    tx
  ]);

  if (result.addedCount === 0) {
    if (result.skippedCount > 0) {
      throw new Error(
        "同じ内容の取引がすでに登録されています"
      );
    }

    throw new Error(
      "取引を登録できませんでした"
    );
  }

  rebuildReviewQueue();
  rebuildReviewSummary();
  rebuildAllViews();

  return createJsonResponse_(
    {
      addedCount:
        result.addedCount,

      skippedCount:
        result.skippedCount,

      source:
        "app",

      transaction: {
        transactionDate:
          tx.transaction_date,

        type:
          tx.type,

        amount:
          tx.amount,

        category:
          tx.sub_category,

        title:
          tx.item_name,

        paymentMethod:
          tx.payment_method,

        memo:
          tx.note,

        wallet:
          tx.wallet,

        purposeType:
          tx.purpose_type
      }
    },
    "ok"
  );
}

function formatApiDate_(value) {
  if (!value) {
    return "";
  }

  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      "Asia/Tokyo",
      "yyyy-MM-dd"
    );
  }

  const parsedDate = new Date(
    String(value).replace(/\./g, "/")
  );

  if (!isNaN(parsedDate.getTime())) {
    return Utilities.formatDate(
      parsedDate,
      "Asia/Tokyo",
      "yyyy-MM-dd"
    );
  }

  return String(value);
}

function getTransactionsData(options) {
  const settings = options || {};

  const requestedLimit = Number(
    settings.limit || 50
  );

  const requestedOffset = Number(
    settings.offset || 0
  );

  const limit = Math.min(
    Math.max(requestedLimit, 1),
    200
  );

  const offset = Math.max(
    requestedOffset,
    0
  );

  const targetMonth = settings.yearMonth
    ? normalizeBudgetYearMonth(
        settings.yearMonth
      )
    : "";

  const table = loadTransactions();

  if (table.rows.length === 0) {
    return {
      items: [],
      total: 0,
      limit,
      offset,
      hasMore: false
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
      "intent"
    ],
    SHEETS.TRANSACTIONS
  );

  const filteredRows = table.rows.filter(row => {
    if (!targetMonth) {
      return true;
    }

    const rowMonth = normalizeYearMonth(
      row[table.index["transaction_date"]]
    );

    return rowMonth === targetMonth;
  });

  filteredRows.sort((a, b) => {
    const dateA = new Date(
      a[table.index["transaction_date"]]
    );

    const dateB = new Date(
      b[table.index["transaction_date"]]
    );

    return dateB.getTime() - dateA.getTime();
  });

  const total = filteredRows.length;

  const items = filteredRows
    .slice(offset, offset + limit)
    .map(row => ({
      id: getString(
        row,
        table.index,
        "id"
      ),

      transactionDate: formatApiDate_(
        row[table.index["transaction_date"]]
      ),

      merchant: getString(
        row,
        table.index,
        "merchant"
      ),

      itemName: getString(
        row,
        table.index,
        "item_name"
      ),

      amount: getNumber(
        row,
        table.index,
        "amount"
      ),

      type: getString(
        row,
        table.index,
        "type"
      ),

      majorCategory: getString(
        row,
        table.index,
        "major_category"
      ),

      subCategory: getString(
        row,
        table.index,
        "sub_category"
      ),

      status: getString(
        row,
        table.index,
        "status"
      ),

      wallet: getString(
        row,
        table.index,
        "wallet"
      ),

      intent: getString(
        row,
        table.index,
        "intent"
      )
    }));

  return {
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total
  };
}