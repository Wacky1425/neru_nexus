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
  const folder = DriveApp.getFolderById("1Kv0tY7pPD6vcumQH-xcyuZ1Mo_XtH39b");
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