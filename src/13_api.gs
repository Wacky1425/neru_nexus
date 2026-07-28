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