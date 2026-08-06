function testLoadTable() {
  const table = loadTable("transactions");

  Logger.log(`values: ${table.values.length}`);
  Logger.log(`rows: ${table.rows.length}`);
  Logger.log(`headers: ${table.headers.join(", ")}`);
  Logger.log(`merchant列: ${table.index["merchant"]}`);
}

function testObjectLoaders() {
  const rules = getRules();
  const configs = loadObjects("import_config");
  const importRows = readImportCsv();

  Logger.log(`rules: ${rules.length}`);
  Logger.log(`configs: ${configs.length}`);
  Logger.log(`import_csv: ${importRows.length}`);

  if (rules.length > 0) {
    Logger.log(
      `先頭rule: ${JSON.stringify(rules[0])}`
    );
  }

  const olive = getImportConfig(
    "olive_credit_v1"
  );

  Logger.log(
    `config取得: ${olive.config_name}`
  );
}

function testClassifyMoneyTransaction() {
  const rules = [];

  const incomeResult = classifyMoneyTransaction(
    {
      "お預入れ": "10,000",
      "お引出し": ""
    },
    {
      merchant: "振込 テスト",
      item_name: "振込 テスト",
      note: "",
      source_type: "CSV_銀行",
      account_name: "三井住友銀行",
      payment_method: "銀行_生活",
      amount: 10000
    },
    rules,
    "smbc_bank_v1"
  );

  const expenseResult = classifyMoneyTransaction(
    {
      "お預入れ": "",
      "お引出し": "3,000"
    },
    {
      merchant: "ATM",
      item_name: "ATM",
      note: "",
      source_type: "CSV_銀行",
      account_name: "三井住友銀行",
      payment_method: "銀行_生活",
      amount: 3000
    },
    rules,
    "smbc_bank_v1"
  );

  Logger.log(
    `入金テスト: ${incomeResult.type}`
  );

  Logger.log(
    `出金テスト: ${expenseResult.type}`
  );

  if (incomeResult.type !== "収入") {
    throw new Error(
      "入金が収入として判定されません"
    );
  }

  if (expenseResult.type !== "支出") {
    throw new Error(
      "出金が支出として判定されません"
    );
  }

  Logger.log("入出金判定テスト成功");
}

function testOliveCsvTypeMapping() {
  const configV1 = getConfigNameByCsvType(
    "olive_credit_v1"
  );

  const configV2 = getConfigNameByCsvType(
    "olive_credit_v2"
  );

  Logger.log(`v1 config: ${configV1}`);
  Logger.log(`v2 config: ${configV2}`);

  if (
    configV1 !== "olive_credit_v1" ||
    configV2 !== "olive_credit_v1"
  ) {
    throw new Error(
      "Oliveのconfig変換に失敗しました"
    );
  }

  const rows = convertOliveRowsWithoutHeader([
    [
      "2026/07/01",
      "ローソン",
      "610",
      "",
      "",
      "610"
    ]
  ]);

  Logger.log(JSON.stringify(rows));

  if (
    rows.length !== 1 ||
    rows[0]["請求額"] !== 610
  ) {
    throw new Error(
      "Olive明細変換に失敗しました"
    );
  }

  Logger.log("Olive CSVテスト成功");
}

function testDoPostCash() {
  const e = {
    postData: {
      contents: JSON.stringify({
        merchant: "ローソン",
        amount: 500,
        mode: "cash",
        memo: "テスト現金"
      })
    }
  };

  const result = doPost(e);
  Logger.log(result.getContent());
}

function testDoPostMemo() {
  const e = {
    postData: {
      contents: JSON.stringify({
        merchant: "BOOTH",
        amount: 3200,
        mode: "memo",
        memo: "配信素材テスト"
      })
    }
  };

  const result = doPost(e);
  Logger.log(result.getContent());
}


function testAccess() {
  const folder = DriveApp.getFolderById(FOLDERS.EVIDENCE_IMAGES);
  const response = UrlFetchApp.fetch("https://example.com");

  const file = folder.createFile("test.txt", "permission check");

  console.log(folder.getName());
  console.log(response.getResponseCode());
  console.log(file.getUrl());
}

function testAddTransaction() {
  const rules = getRules();

  const sample = {
    transaction_date: "2026-04-18",
    merchant: "マクドナルド",
    item_name: "てりやきセット",
    amount: 850,
    note: "",
    source_type: "test"
  };

  const result = classifyTransaction(sample, rules);

  const tx = {
    ...sample,
    ...result
  };

  addTransaction(tx);
}

function testGetAvailableMoney() {
  const value = getAvailableMoney("2026-08");
  Logger.log(`あと使えるお金: ${value}`);
}

function testDreamFund() {

  const dream = getDreamFund("dream_001");

  Logger.log(JSON.stringify(dream, null, 2));

}

function testFeaturedDreamFund() {
  const dream = getFeaturedDreamFund();
  Logger.log(JSON.stringify(dream, null, 2));
}

function testCategorySummary(){

  Logger.log(
    JSON.stringify(
      getCategorySummary(getLatestBudgetMonth()),
      null,
      2
    )
  );

}

function debugCsvHeader() {
  const folderId = "YOUR_FOLDER_ID";
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    if (!file.getName().endsWith(".csv")) continue;

    const values = parseCsvFile(file);
    const row = values[0].map(v => String(v).trim());

    Logger.log(file.getName());
    Logger.log(JSON.stringify(row));
  }
}

function testGetHomeData() {
  const data = getHomeData();

  Logger.log(
    JSON.stringify(data, null, 2)
  );

  if (!data.yearMonth) {
    throw new Error("yearMonth がありません");
  }

  if (typeof data.availableMoney !== "number") {
    throw new Error(
      "availableMoney が数値ではありません"
    );
  }

  if (typeof data.savingForecast !== "number") {
    throw new Error(
      "savingForecast が数値ではありません"
    );
  }

  if (typeof data.sideBusinessProfit !== "number") {
    throw new Error(
      "sideBusinessProfit が数値ではありません"
    );
  }

  if (!data.moneyHealth) {
    throw new Error("moneyHealth がありません");
  }

  Logger.log("Home APIデータ取得成功");
}

function testGetTransactionsData() {
  const data = getTransactionsData({
    limit: 10,
    offset: 0
  });

  Logger.log(
    JSON.stringify(data, null, 2)
  );

  if (!Array.isArray(data.items)) {
    throw new Error(
      "itemsが配列ではありません"
    );
  }

  if (data.items.length > 10) {
    throw new Error(
      "limitを超えて取得されています"
    );
  }

  if (
    data.items.length > 0 &&
    typeof data.items[0].amount !== "number"
  ) {
    throw new Error(
      "amountが数値ではありません"
    );
  }

  Logger.log(
    `取引一覧API成功: ${data.items.length}/${data.total}件`
  );
}

function testGetAnalyticsData() {
  const result =
    getAnalyticsData("2026-07");

  console.log(
    JSON.stringify(result, null, 2)
  );
}

function testCreateTransactionFromApp() {
  const result = createTransactionFromApp_({
    transactionDate: "2026-07-30",
    type: "支出",
    amount: 380,
    category: "食費",
    title: "アプリ登録テスト",
    paymentMethod: "現金",
    memo: "Flutter接続前のテスト"
  });

  Logger.log(
    result.getContent()
  );
}

function testGetCategoriesData() {
  const data = getCategoriesData();

  Logger.log(
    JSON.stringify(
      data,
      null,
      2
    )
  );
}

function testGetMasterData() {
  const data = getMasterData();

  Logger.log(
    JSON.stringify(
      data,
      null,
      2
    )
  );
}

function testCreateCategoryFromApp() {
  const result =
    createCategoryFromApp_({
      type: "支出",
      majorCategory: "テスト",
      subCategory: "動作確認"
    });

  Logger.log(
    result.getContent()
  );
}

function testUpdateCategoryFromApp() {
  const result =
    updateCategoryFromApp_({
      subCategoryId: "sub_001",
      majorCategory: "食費",
      subCategory: "外食",
      active: true
    });

  Logger.log(
    result.getContent()
  );
}