function getHomeData() {
  const yearMonth = getLatestBudgetMonth();

  if (!yearMonth) {
    throw new Error("対象月がありません");
  }

  return {
    yearMonth,
    availableMoney: getAvailableMoney(yearMonth),
    savingForecast: getSavingForecast(yearMonth),
    sideBusinessProfit: getSideBusinessProfit(yearMonth),
    moneyHealth: getMoneyHealth(yearMonth),
    featuredDream: getFeaturedDreamFund(),
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