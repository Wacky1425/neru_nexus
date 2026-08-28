function testLoadTable() {
  const table = loadTable(SHEETS.TRANSACTIONS);

  Logger.log(`values: ${table.values.length}`);
  Logger.log(`rows: ${table.rows.length}`);
  Logger.log(`headers: ${table.headers.join(", ")}`);
  Logger.log(`merchant列: ${table.index["merchant"]}`);
}

function testObjectLoaders() {
  const rules = getRules();
  const configs = loadObjects(SHEETS.IMPORT_CONFIG);
  const accounts = loadObjects(SHEETS.ACCOUNTS);
  const categories = loadObjects(SHEETS.CATEGORIES);

  Logger.log(`rules: ${rules.length}`);
  Logger.log(`configs: ${configs.length}`);
  Logger.log(`accounts: ${accounts.length}`);
  Logger.log(`categories: ${categories.length}`);

  if (rules.length > 0) {
    Logger.log(`先頭rule: ${JSON.stringify(rules[0])}`);
  }

  const olive = getImportConfig("olive_credit_v1");

  Logger.log(`config取得: ${olive.config_name}`);

  if (olive.config_name !== "olive_credit_v1") {
    throw new Error("Olive configを取得できません");
  }
}

function testClassifyMoneyTransaction() {
  const rules = [];

  const incomeResult = classifyMoneyTransaction(
    {
      お預入れ: "10,000",
      お引出し: "",
    },
    {
      merchant: "振込 テスト",
      item_name: "振込 テスト",
      note: "",
      source_type: "CSV_銀行",
      account_name: "三井住友銀行",
      payment_method: "銀行_生活",
      amount: 10000,
    },
    rules,
    "smbc_bank_v1",
  );

  const expenseResult = classifyMoneyTransaction(
    {
      お預入れ: "",
      お引出し: "3,000",
    },
    {
      merchant: "ATM",
      item_name: "ATM",
      note: "",
      source_type: "CSV_銀行",
      account_name: "三井住友銀行",
      payment_method: "銀行_生活",
      amount: 3000,
    },
    rules,
    "smbc_bank_v1",
  );

  Logger.log(`入金テスト: ${incomeResult.type}`);

  Logger.log(`出金テスト: ${expenseResult.type}`);

  if (incomeResult.type !== "収入") {
    throw new Error("入金が収入として判定されません");
  }

  if (expenseResult.type !== "支出") {
    throw new Error("出金が支出として判定されません");
  }

  Logger.log("入出金判定テスト成功");
}

function testOliveCsvTypeMapping() {
  const configV1 = getConfigNameByCsvType("olive_credit_v1");

  Logger.log(`v1 config: ${configV1}`);

  if (!configV1) {
    throw new Error("Olive v1のconfigを取得できません");
  }

  const rows = convertOliveRowsWithoutHeader([
    ["2026/07/01", "ローソン", "610", "", "", "610"],
  ]);

  Logger.log(JSON.stringify(rows));

  if (rows.length !== 1 || Number(rows[0]["請求額"]) !== 610) {
    throw new Error("Olive明細変換に失敗しました");
  }

  Logger.log("Olive CSVテスト成功");
}

function testAccess() {
  const folder = DriveApp.getFolderById(FOLDERS.EVIDENCE_IMAGES);
  const response = UrlFetchApp.fetch("https://example.com");

  const file = folder.createFile("test.txt", "permission check");

  console.log(folder.getName());
  console.log(response.getResponseCode());
  console.log(file.getUrl());
}

function testGetHomeData() {
  const data = getHomeData();

  Logger.log(JSON.stringify(data, null, 2));

  if (!data.yearMonth) {
    throw new Error("yearMonth がありません");
  }

  if (typeof data.availableMoney !== "number") {
    throw new Error("availableMoney が数値ではありません");
  }

  if (typeof data.monthlySurplus !== "number") {
    throw new Error("monthlySurplus が数値ではありません");
  }

  if (typeof data.projectedIncome !== "number") {
    throw new Error("projectedIncome が数値ではありません");
  }

  if (typeof data.fixedExpenseBudget !== "number") {
    throw new Error("fixedExpenseBudget が数値ではありません");
  }

  if (typeof data.variableExpenseBudget !== "number") {
    throw new Error("variableExpenseBudget が数値ではありません");
  }

  if (typeof data.budgetInherited !== "boolean") {
    throw new Error("budgetInherited がbooleanではありません");
  }

  if (typeof data.baseNisa !== "number") {
    throw new Error("baseNisa が数値ではありません");
  }

  if (typeof data.additionalNisa !== "number") {
    throw new Error("additionalNisa が数値ではありません");
  }

  if (typeof data.totalAssets !== "number") {
    throw new Error("totalAssets が数値ではありません");
  }

  if (typeof data.totalLiabilities !== "number") {
    throw new Error("totalLiabilities が数値ではありません");
  }

  if (typeof data.netAssets !== "number") {
    throw new Error("netAssets が数値ではありません");
  }

  if (typeof data.sideBusinessProfit !== "number") {
    throw new Error("sideBusinessProfit が数値ではありません");
  }

  if (!data.moneyHealth) {
    throw new Error("moneyHealth がありません");
  }

  Logger.log("Home APIデータ取得成功");
}

function testHomeCalculationHelpers() {
  const budgets = {
    "固定費予算": 80000,
    "変動費予算": 50000,
  };

  const expenses = {
    fixedExpense: 60000,
    variableExpense: 20000,
  };

  const projectedIncome = 230000;

  const freeCash = calculateMonthlyFreeCash_(
    budgets,
    expenses,
    projectedIncome,
  );

  if (freeCash !== 100000) {
    throw new Error(`monthlyFreeCash不一致: ${freeCash}`);
  }

  const availableMoney = calculateAvailableMoney_(
    budgets,
    expenses,
    projectedIncome,
  );

  if (availableMoney !== 30000) {
    throw new Error(`availableMoney不一致: ${availableMoney}`);
  }

  const overBudget = calculateAvailableMoney_(
    budgets,
    { fixedExpense: 90000, variableExpense: 55000 },
    projectedIncome,
  );

  if (overBudget !== -5000) {
    throw new Error(`予算超過時availableMoney不一致: ${overBudget}`);
  }

  return {
    freeCash,
    availableMoney,
    overBudget,
  };
}

function testGetTransactionsData() {
  const data = getTransactionsData({
    limit: 10,
    offset: 0,
  });

  Logger.log(JSON.stringify(data, null, 2));

  if (!Array.isArray(data.items)) {
    throw new Error("itemsが配列ではありません");
  }

  if (data.items.length > 10) {
    throw new Error("limitを超えて取得されています");
  }

  if (data.items.length > 0 && typeof data.items[0].amount !== "number") {
    throw new Error("amountが数値ではありません");
  }

  Logger.log(`取引一覧API成功: ${data.items.length}/${data.total}件`);
}

function testGetAnalyticsData() {
  const result = getAnalyticsData("2026-07");

  console.log(JSON.stringify(result, null, 2));
}

function testGetCategoriesData() {
  const data = getCategoriesData();

  Logger.log(JSON.stringify(data, null, 2));
}

function testGetMasterData() {
  const data = getMasterData();

  Logger.log(JSON.stringify(data, null, 2));
}

function testGmailClassificationSummary() {
  const result = getGmailTransactionCandidates_();

  const items = result && Array.isArray(result.items) ? result.items : [];

  // ============================================================
  // 分類ルールは1回だけ取得
  // ============================================================

  const rules = getRules();

  const rows = [];

  for (const item of items) {
    const tx = buildTransactionFromGmailItem_(item, rules);

    if (!tx) {
      continue;
    }

    /*
     * 今回確認したいのはSMBC。
     *
     * Oliveまで全部Loggerに出すと
     * ログが長くなるので除外。
     */
    if (tx.source_type !== "Gmail_SMBC") {
      continue;
    }

    rows.push({
      sourceKind: String(item.sourceKind || ""),

      date: tx.transaction_date,

      merchant: tx.merchant,

      amount: tx.amount,

      type: tx.type,

      majorCategory: tx.major_category,

      subCategory: tx.sub_category,

      status: tx.status,

      intent: tx.intent,

      moneyDirection: tx.money_direction || "",

      fromAccount: tx.from_account || "",

      toAccount: tx.to_account || "",

      settlementStatus: tx.settlement_status || "",
    });
  }

  Logger.log(
    JSON.stringify(
      {
        count: rows.length,

        items: rows,
      },
      null,
      2,
    ),
  );

  return rows;
}

function testGmailFormalReconcileDryRun() {
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    Logger.log("Transactionsにデータがありません");

    return;
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(index, ["id", "source_type"], SHEETS.TRANSACTIONS);

  const oliveIds = [];
  const smbcIds = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const id = String(row[index["id"]] || "").trim();

    const sourceType = String(row[index["source_type"]] || "").trim();

    if (!id) {
      continue;
    }

    if (sourceType === "CSV_クレカ") {
      oliveIds.push(id);
    } else if (sourceType === "CSV_銀行") {
      smbcIds.push(id);
    }
  }

  const oliveResult = reconcileGmailPreliminaryWithFormalCsv_(
    oliveIds,
    "CSV_クレカ",
    true,
  );

  const smbcResult = reconcileGmailPreliminaryWithFormalCsv_(
    smbcIds,
    "CSV_銀行",
    true,
  );

  const summary = {
    olive: {
      formalCount: oliveResult.formalCount,

      gmailCount: oliveResult.gmailCount,

      matchedCount: oliveResult.matchedCount,

      matches: oliveResult.matches,
    },

    smbc: {
      formalCount: smbcResult.formalCount,

      gmailCount: smbcResult.gmailCount,

      matchedCount: smbcResult.matchedCount,

      matches: smbcResult.matches,
    },
  };

  Logger.log(JSON.stringify(summary, null, 2));

  return summary;
}

function testPreliminaryEditedPreservation() {
  const headers = [
    "id",
    "transaction_date",
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
    "status",
    "wallet",
    "intent",
    "from_account",
    "to_account",
    "settlement_status",
    "settlement_id",
    "source_id",
    "source_status",
    "source_received_at",
  ];

  const index = createHeaderIndex(headers);

  // ============================================================
  // 後から来た正式CSVを想定
  // ============================================================

  const formalRow = new Array(headers.length).fill("");

  formalRow[index["id"]] = "formal_test";

  formalRow[index["transaction_date"]] = "2026-08-19";

  formalRow[index["type"]] = "支出";

  formalRow[index["source_type"]] = "CSV_クレカ";

  formalRow[index["payment_method"]] = "Oliveクレカ";

  formalRow[index["account_name"]] = "三井住友カードOlive";

  formalRow[index["merchant"]] = "SKEB";

  formalRow[index["item_name"]] = "SKEB";

  formalRow[index["raw_text"]] = "正式CSV / SKEB";

  formalRow[index["amount"]] = 10000;

  formalRow[index["major_category"]] = "その他";

  formalRow[index["sub_category"]] = "要確認";

  formalRow[index["purpose_type"]] = "私用";

  formalRow[index["expense_ratio"]] = 0;

  formalRow[index["expense_amount"]] = 0;

  formalRow[index["status"]] = "要確認";

  formalRow[index["wallet"]] = "生活";

  formalRow[index["intent"]] = "その他";

  // ============================================================
  // ユーザーが速報を編集した状態を想定
  // ============================================================

  const gmailRow = new Array(headers.length).fill("");

  gmailRow[index["id"]] = "gmail_test";

  gmailRow[index["transaction_date"]] = "2026-08-19";

  gmailRow[index["type"]] = "支出";

  gmailRow[index["source_type"]] = "Gmail_Olive";

  gmailRow[index["payment_method"]] = "Oliveクレカ";

  gmailRow[index["account_name"]] = "三井住友カードOlive";

  gmailRow[index["merchant"]] = "SKEB";

  gmailRow[index["item_name"]] = "イラスト外注";

  gmailRow[index["raw_text"]] = "Gmail速報 / SKEB";

  gmailRow[index["amount"]] = 10000;

  // ユーザー編集内容
  gmailRow[index["major_category"]] = "事業";

  gmailRow[index["sub_category"]] = "外注費";

  gmailRow[index["purpose_type"]] = "経費";

  gmailRow[index["expense_ratio"]] = 1;

  gmailRow[index["expense_amount"]] = 10000;

  gmailRow[index["note"]] = "配信用イラスト";

  gmailRow[index["status"]] = "確定";

  gmailRow[index["wallet"]] = "事業";

  gmailRow[index["intent"]] = "経費";

  gmailRow[index["source_status"]] = "preliminary_edited";

  // ============================================================
  // 本番と同じ引継ぎ処理
  // ============================================================

  preserveEditedGmailFields_(formalRow, gmailRow, index);

  const result = {
    // CSV側に残るべきもの
    formalFields: {
      transactionDate: formalRow[index["transaction_date"]],

      sourceType: formalRow[index["source_type"]],

      merchant: formalRow[index["merchant"]],

      itemName: formalRow[index["item_name"]],

      rawText: formalRow[index["raw_text"]],

      amount: formalRow[index["amount"]],
    },

    // ユーザー編集を引き継ぐべきもの
    preservedFields: {
      type: formalRow[index["type"]],

      majorCategory: formalRow[index["major_category"]],

      subCategory: formalRow[index["sub_category"]],

      purposeType: formalRow[index["purpose_type"]],

      expenseRatio: formalRow[index["expense_ratio"]],

      expenseAmount: formalRow[index["expense_amount"]],

      note: formalRow[index["note"]],

      status: formalRow[index["status"]],

      wallet: formalRow[index["wallet"]],

      intent: formalRow[index["intent"]],
    },
  };

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}

function testIgnoredTransactionExclusion() {
  const table = loadTransactions();

  if (table.rows.length === 0) {
    Logger.log(
      JSON.stringify(
        {
          transactionCount: 0,
          ignoredCount: 0,
        },
        null,
        2,
      ),
    );

    return;
  }

  assertRequiredColumns(
    table.index,
    [
      "id",
      "transaction_date",
      "merchant",
      "amount",
      "source_type",
      "source_status",
      "status",
      "settlement_status",
    ],
    SHEETS.TRANSACTIONS,
  );

  // ============================================================
  // ignored実データ
  // ============================================================

  const ignoredRows = table.rows.filter((row) =>
    isIgnoredTransactionRow_(row, table.index),
  );

  const ignoredIds = new Set(
    ignoredRows.map((row) => getString(row, table.index, "id")),
  );

  // ============================================================
  // 通常一覧API
  // ============================================================

  const transactionResult = getTransactionsData({
    limit: 200,
    offset: 0,
  });

  const ignoredInTransactions = (transactionResult.items || []).filter((item) =>
    ignoredIds.has(String(item.id || "")),
  );

  // ============================================================
  // 要確認一覧API
  // ============================================================

  const reviewResult = getReviewTransactionsData({
    limit: 200,
    offset: 0,
  });

  const ignoredInReview = (reviewResult.items || []).filter((item) =>
    ignoredIds.has(String(item.id || "")),
  );

  // ============================================================
  // 要確認件数
  // ============================================================

  const reviewCountResult = getReviewTransactionCount();

  // ignoredの中で、本来なら要確認対象になる行
  const ignoredReviewRows = ignoredRows.filter((row) => {
    const status = getString(row, table.index, "status");

    const settlementStatus = getString(row, table.index, "settlement_status");

    return status === "要確認" || settlementStatus === "review";
  });

  // ============================================================
  // ignored内容
  // ============================================================

  const ignoredItems = ignoredRows.map((row) => ({
    id: getString(row, table.index, "id"),

    date: formatApiDate_(row[table.index["transaction_date"]]),

    merchant: getString(row, table.index, "merchant"),

    amount: getNumber(row, table.index, "amount"),

    sourceType: getString(row, table.index, "source_type"),

    sourceStatus: getString(row, table.index, "source_status"),

    status: getString(row, table.index, "status"),

    settlementStatus: getString(row, table.index, "settlement_status"),
  }));

  // ============================================================
  // 結果
  // ============================================================

  const result = {
    transactionCount: table.rows.length,

    ignoredCount: ignoredRows.length,

    ignoredReviewCandidateCount: ignoredReviewRows.length,

    normalList: {
      returnedCount: Number(transactionResult.total || 0),

      ignoredFoundCount: ignoredInTransactions.length,

      ok: ignoredInTransactions.length === 0,
    },

    reviewList: {
      returnedCount: Number(reviewResult.total || 0),

      ignoredFoundCount: ignoredInReview.length,

      ok: ignoredInReview.length === 0,
    },

    reviewCount: {
      returnedCount: Number(reviewCountResult.count || 0),

      ignoredReviewCandidateCount: ignoredReviewRows.length,
    },

    ignoredItems,
  };

  Logger.log(JSON.stringify(result, null, 2));
}

function testBackfillExistingGmailFormalMatches() {
  const table = loadTransactions();

  if (table.rows.length === 0) {
    Logger.log(
      JSON.stringify(
        {
          olive: null,
          smbc: null,
        },
        null,
        2,
      ),
    );

    return;
  }

  assertRequiredColumns(
    table.index,
    ["id", "source_type"],
    SHEETS.TRANSACTIONS,
  );

  const oliveFormalIds = [];
  const smbcFormalIds = [];

  for (const row of table.rows) {
    const id = getString(row, table.index, "id");

    const sourceType = getString(row, table.index, "source_type");

    if (!id) {
      continue;
    }

    if (sourceType === "CSV_クレカ") {
      oliveFormalIds.push(id);
    } else if (sourceType === "CSV_銀行") {
      smbcFormalIds.push(id);
    }
  }

  const oliveResult = reconcileGmailPreliminaryWithFormalCsv_(
    oliveFormalIds,
    "CSV_クレカ",
    true,
  );

  const smbcResult = reconcileGmailPreliminaryWithFormalCsv_(
    smbcFormalIds,
    "CSV_銀行",
    true,
  );

  const result = {
    olive: {
      formalCount: oliveResult.formalCount,

      gmailCount: oliveResult.gmailCount,

      matchedCount: oliveResult.matchedCount,

      preservedEditedCount: oliveResult.preservedEditedCount,

      matches: oliveResult.matches,
    },

    smbc: {
      formalCount: smbcResult.formalCount,

      gmailCount: smbcResult.gmailCount,

      matchedCount: smbcResult.matchedCount,

      preservedEditedCount: smbcResult.preservedEditedCount,

      matches: smbcResult.matches,
    },
  };

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}

function testGetGmailImportStatus() {
  const result = getGmailImportStatus_();

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}

// ============================================================
// Home / Dashboard Tests (moved from 07_dashboard.gs)
// ============================================================

// ============================================================
// Budget Tests (moved from 08_budget.gs)
// ============================================================

function testGetBudgetSettings() {
  const result = getBudgetSettings("2026-08");

  if (Object.prototype.hasOwnProperty.call(result, "savingTarget")) {
    throw new Error("旧 savingTarget が budget_settings に残っています");
  }

  if (Object.prototype.hasOwnProperty.call(result, "dreamTarget")) {
    throw new Error("旧 dreamTarget が budget_settings に残っています");
  }

  if (typeof result.nisaTarget !== "number") {
    throw new Error("nisaTarget が数値ではありません");
  }
}

// ============================================================
// CSV Tests (moved from 10_csv_import.gs)
// ============================================================

function testGmailImportDryRun() {
  const result = getGmailTransactionCandidates_();

  const items = result && Array.isArray(result.items) ? result.items : [];

  const transactions = [];

  // 分類ルールは1回だけ
  const rules = getRules();

  for (const item of items) {
    const tx = buildTransactionFromGmailItem_(item, rules);

    if (tx) {
      transactions.push(tx);
    }
  }

  const importCandidates = filterGmailTransactionsForImport_(transactions);

  const candidateSourceIds = new Set(
    importCandidates.map((tx) => String(tx.source_id || "").trim()),
  );

  const skippedTransactions = transactions.filter(
    (tx) => !candidateSourceIds.has(String(tx.source_id || "").trim()),
  );

  const summary = {
    gmailFoundCount: items.length,

    convertedCount: transactions.length,

    skippedCount: skippedTransactions.length,

    importCandidateCount: importCandidates.length,

    importCandidates: importCandidates.map((tx) => ({
      date: tx.transaction_date,

      type: tx.type,

      sourceType: tx.source_type,

      accountName: tx.account_name,

      merchant: tx.merchant,

      amount: tx.amount,

      majorCategory: tx.major_category,

      subCategory: tx.sub_category,

      fromAccount: tx.from_account || "",

      toAccount: tx.to_account || "",

      sourceId: tx.source_id,
    })),

    skippedTransactions: skippedTransactions.map((tx) => ({
      date: tx.transaction_date,

      type: tx.type,

      sourceType: tx.source_type,

      accountName: tx.account_name,

      merchant: tx.merchant,

      amount: tx.amount,

      sourceId: tx.source_id,
    })),
  };

  Logger.log(JSON.stringify(summary, null, 2));

  return summary;
}

function testGmailImportDryRunSummary() {
  const result = getGmailTransactionCandidates_();

  const items = result && Array.isArray(result.items) ? result.items : [];

  const transactions = [];

  // 分類ルールは1回だけ
  const rules = getRules();

  for (const item of items) {
    const tx = buildTransactionFromGmailItem_(item, rules);

    if (tx) {
      transactions.push(tx);
    }
  }

  const candidates = filterGmailTransactionsForImport_(transactions);

  const summary = {};

  for (const tx of candidates) {
    const yearMonth = normalizeYearMonth(tx.transaction_date) || "unknown";

    const sourceType = String(tx.source_type || "unknown");

    const key = yearMonth + " / " + sourceType;

    summary[key] = Number(summary[key] || 0) + 1;
  }

  Logger.log(
    JSON.stringify(
      {
        gmailFoundCount: items.length,

        convertedCount: transactions.length,

        skippedCount: transactions.length - candidates.length,

        importCandidateCount: candidates.length,

        candidateBreakdown: summary,
      },
      null,
      2,
    ),
  );

  return {
    gmailFoundCount: items.length,

    convertedCount: transactions.length,

    skippedCount: transactions.length - candidates.length,

    importCandidateCount: candidates.length,

    candidateBreakdown: summary,
  };
}

function runRegressionTests() {
  testBusinessReportHelpers();
  testGetBusinessReportData();
  testInvestmentValuationHelpers();
  testAccountAssetTypeHelpers();
  testRecurringCandidateHelpers();
  const tests = [
    // ==========================================================
    // Core / Sheet / Loader
    // ==========================================================

    {
      name: "testLoadTable",
      fn: testLoadTable,
    },

    {
      name: "testObjectLoaders",
      fn: testObjectLoaders,
    },

    {
      name: "testAccess",
      fn: testAccess,
    },

    // ==========================================================
    // Classification / CSV Config
    // ==========================================================

    {
      name: "testClassifyMoneyTransaction",
      fn: testClassifyMoneyTransaction,
    },

    {
      name: "testOliveCsvTypeMapping",
      fn: testOliveCsvTypeMapping,
    },

    // ==========================================================
    // Transactions / API Read
    // ==========================================================

    {
      name: "testGetTransactionsData",
      fn: testGetTransactionsData,
    },

    {
      name: "testGetCategoriesData",
      fn: testGetCategoriesData,
    },

    {
      name: "testGetMasterData",
      fn: testGetMasterData,
    },

    // ==========================================================
    // Home / Budget / Analytics
    // ==========================================================
    {
      name: "testGetHomeData",
      fn: testGetHomeData,
    },

    {
      name: "testHomeCalculationHelpers",
      fn: testHomeCalculationHelpers,
    },

    {
      name: "testGetBudgetSettings",
      fn: testGetBudgetSettings,
    },

    {
      name: "testGetAnalyticsData",
      fn: testGetAnalyticsData,
    },

    // ==========================================================
    // Gmail
    // ==========================================================

    {
      name: "testGmailClassificationSummary",
      fn: testGmailClassificationSummary,
    },

    {
      name: "testGmailFormalReconcileDryRun",
      fn: testGmailFormalReconcileDryRun,
    },

    {
      name: "testPreliminaryEditedPreservation",
      fn: testPreliminaryEditedPreservation,
    },

    {
      name: "testIgnoredTransactionExclusion",
      fn: testIgnoredTransactionExclusion,
    },

    {
      name: "testBackfillExistingGmailFormalMatches",
      fn: testBackfillExistingGmailFormalMatches,
    },

    {
      name: "testGmailImportDryRun",
      fn: testGmailImportDryRun,
    },

    {
      name: "testGmailImportDryRunSummary",
      fn: testGmailImportDryRunSummary,
    },

    {
      name: "testGetGmailImportStatus",
      fn: testGetGmailImportStatus,
    },

    // ==========================================================
    // Accounts / Settlement / CSV
    // ==========================================================

    {
      name: "testAccountBalancesSafe",
      fn: testAccountBalancesSafe,
    },

    {
      name: "testSettlementStatusesSafe",
      fn: testSettlementStatusesSafe,
    },

    {
      name: "testCsvCoreSafe",
      fn: testCsvCoreSafe,
    },
  

    // Cleanup 7 - Categories / Rules
    {
      name: "testCleanup7CategorySpecification",
      fn: testCleanup7CategorySpecification,
    },
    {
      name: "testCleanup7GuessMetadata",
      fn: testCleanup7GuessMetadata,
    },
];

  const results = [];

  Logger.log(`========== 回帰テスト開始: ${tests.length}件 ==========`);

  for (const test of tests) {
    const startedAt = Date.now();

    try {
      const value = test.fn();

      const durationMs = Date.now() - startedAt;

      results.push({
        name: test.name,
        success: true,
        durationMs,
        result: value === undefined ? null : value,
      });

      Logger.log(`✅ ${test.name} (${durationMs}ms)`);
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      const message =
        error && error.message ? String(error.message) : String(error);

      results.push({
        name: test.name,
        success: false,
        durationMs,
        error: message,
      });

      Logger.log(`❌ ${test.name} (${durationMs}ms): ${message}`);
    }
  }

  const successCount = results.filter((item) => item.success).length;

  const failedResults = results.filter((item) => !item.success);

  const failedCount = failedResults.length;

  const totalDurationMs = results.reduce(
    (sum, item) => sum + Number(item.durationMs || 0),
    0,
  );

  const summary = {
    totalCount: results.length,

    successCount,

    failedCount,

    success: failedCount === 0,

    totalDurationMs,

    failedTests: failedResults.map((item) => ({
      name: item.name,

      error: item.error || "",
    })),

    results,
  };

  Logger.log("========== 回帰テスト結果 ==========");

  Logger.log(JSON.stringify(summary, null, 2));

  if (failedCount > 0) {
    throw new Error(
      `回帰テスト失敗: ${failedCount}/${results.length}件\n` +
        failedResults.map((item) => `${item.name}: ${item.error}`).join("\n"),
    );
  }

  Logger.log(`✅ 全${results.length}件成功 / ` + `${totalDurationMs}ms`);

  return summary;
}

// ============================================================
// Accounts / Settlement / CSV Safe Regression Tests
// ============================================================

function testAccountBalancesSafe() {
  const result = getAccountBalancesData();

  if (!result || !Array.isArray(result.items)) {
    throw new Error("口座残高データの形式が不正です");
  }

  if (typeof result.totalAssets !== "number") {
    throw new Error("totalAssets が数値ではありません");
  }

  if (typeof result.totalLiabilities !== "number") {
    throw new Error("totalLiabilities が数値ではありません");
  }

  if (typeof result.netAssets !== "number") {
    throw new Error("netAssets が数値ではありません");
  }

  Logger.log(
    JSON.stringify({
      accountCount: result.items.length,
      totalAssets: result.totalAssets,
      totalLiabilities: result.totalLiabilities,
      netAssets: result.netAssets,
    }),
  );

  return {
    accountCount: result.items.length,
    totalAssets: result.totalAssets,
    totalLiabilities: result.totalLiabilities,
    netAssets: result.netAssets,
  };
}

function testSettlementStatusesSafe() {
  const result = getSettlementStatusesData_();

  if (!result || !Array.isArray(result.items)) {
    throw new Error("Settlementデータの形式が不正です");
  }

  if (!result.summary) {
    throw new Error("Settlement summary がありません");
  }

  const requiredSummaryFields = [
    "totalCount",
    "matchedCount",
    "manualMatchedCount",
    "reviewCount",
    "pendingCount",
  ];

  for (const field of requiredSummaryFields) {
    if (typeof result.summary[field] !== "number") {
      throw new Error(`Settlement summary.${field} が数値ではありません`);
    }
  }

  Logger.log(
    JSON.stringify({
      itemCount: result.items.length,
      summary: result.summary,
      performance: result.performance || {},
    }),
  );

  return {
    itemCount: result.items.length,
    summary: result.summary,
  };
}

function testCsvCoreSafe() {
  // ----------------------------------------------------------
  // 1. SMBC銀行
  // ----------------------------------------------------------

  const smbcResult = detectCsvTypeFromRows([
    ["年月日", "お引出し", "お預入れ", "お取り扱い内容"],
  ]);

  if (!smbcResult || smbcResult.csvType !== "smbc_bank_v1") {
    throw new Error("SMBC銀行CSVの判定に失敗しました");
  }

  // ----------------------------------------------------------
  // 2. PayPay
  // ----------------------------------------------------------

  const payPayResult = detectCsvTypeFromRows([
    ["取引日", "出金金額（円）", "入金金額（円）", "取引内容"],
  ]);

  if (!payPayResult || payPayResult.csvType !== "paypay_v1") {
    throw new Error("PayPay CSVの判定に失敗しました");
  }

  // ----------------------------------------------------------
  // 3. Olive
  // ----------------------------------------------------------

  const oliveResult = detectCsvTypeFromRows([
    ["利用日", "加盟店", "金額", "請求額"],
  ]);

  if (!oliveResult || oliveResult.csvType !== "olive_credit_v1") {
    throw new Error("Olive CSVの判定に失敗しました");
  }

  // ----------------------------------------------------------
  // 4. セゾン
  // ----------------------------------------------------------

  const saisonResult = detectCsvTypeFromRows([
    ["利用日", "ご利用店名及び商品名", "利用金額", "支払区分名称"],
  ]);

  if (!saisonResult || saisonResult.csvType !== "saison_credit_v1") {
    throw new Error("セゾンCSVの判定に失敗しました");
  }

  // ----------------------------------------------------------
  // 5. ImportConfig
  // ----------------------------------------------------------

  const csvTypes = [
    "smbc_bank_v1",
    "paypay_v1",
    "olive_credit_v1",
    "saison_credit_v1",
  ];

  const configs = [];

  for (const csvType of csvTypes) {
    const configName = getConfigNameByCsvType(csvType);

    if (!configName) {
      throw new Error(`${csvType} のconfig名を取得できません`);
    }

    const config = getImportConfig(configName);

    if (!config) {
      throw new Error(`${configName} のImportConfigを取得できません`);
    }

    configs.push({
      csvType,
      configName,
    });
  }

  Logger.log(
    JSON.stringify({
      smbc: smbcResult,
      payPay: payPayResult,
      olive: oliveResult,
      saison: saisonResult,
      configs,
    }),
  );

  return {
    detectedCount: 4,
    configCount: configs.length,
    configs,
  };
}

// ============================================================
// Cleanup 7 - Category / Rules regression
// ============================================================

function testCleanup7CategorySpecification() {
  const data = getCategoriesData();
  const items = data.items || [];

  const hasExpenseReview = items.some(
    (item) =>
      item.type === "支出" &&
      item.majorCategory === "その他" &&
      item.subCategory === "要確認",
  );

  const hasIncomeReview = items.some(
    (item) =>
      item.type === "収入" &&
      item.majorCategory === "収入" &&
      item.subCategory === "要確認",
  );

  const essentialCount = items.filter(
    (item) => item.type === "支出" && item.essential === true,
  ).length;

  if (!hasExpenseReview) {
    throw new Error("支出/その他/要確認 がありません");
  }

  if (!hasIncomeReview) {
    throw new Error("収入/収入/要確認 がありません");
  }

  if (essentialCount === 0) {
    throw new Error("essentialカテゴリが設定されていません");
  }

  return {
    essentialCount,
    hasExpenseReview,
    hasIncomeReview,
  };
}

function testCleanup7GuessMetadata() {
  const cases = [
    {
      type: "支出",
      major: "配信",
      sub: "イラスト依頼",
      purpose: "経費",
      ratio: 1,
      intent: "事業活動",
    },
    {
      type: "支出",
      major: "住居",
      sub: "ネット回線",
      purpose: "共用",
      ratio: 0.4,
      intent: "生活維持",
    },
    {
      type: "支出",
      major: "通信",
      sub: "スマホ",
      purpose: "共用",
      ratio: 0.4,
      intent: "生活維持",
    },
    {
      type: "収入",
      major: "収入",
      sub: "要確認",
      purpose: "私用",
      ratio: 0,
      intent: "収入",
    },
  ];

  for (const testCase of cases) {
    const purpose =
      testCase.type === "収入"
        ? "私用"
        : guessPurposeType(testCase.major, testCase.sub);
    const ratio =
      testCase.type === "支出"
        ? guessExpenseRatio(testCase.major, testCase.sub)
        : 0;
    const intent = guessIntent(
      testCase.type,
      testCase.major,
      testCase.sub,
    );

    if (
      purpose !== testCase.purpose ||
      ratio !== testCase.ratio ||
      intent !== testCase.intent
    ) {
      throw new Error(
        `guess metadata不一致: ${JSON.stringify({
          testCase,
          actual: { purpose, ratio, intent },
        })}`,
      );
    }
  }

  const incomeDefault = createDefaultClassification("収入");
  if (
    incomeDefault.type !== "収入" ||
    incomeDefault.major_category !== "収入" ||
    incomeDefault.sub_category !== "要確認"
  ) {
    throw new Error("収入のdefault classificationが不正です");
  }

  return { caseCount: cases.length };
}

function testRecurringCandidateHelpers() {
  const table = {
    index: {
      transaction_date: 0,
      type: 1,
      merchant: 2,
      amount: 3,
      major_category: 4,
      sub_category: 5,
      source_status: 6,
    },
    rows: [
      ["2026-05-01", "支出", "NETFLIX", 1490, "娯楽", "動画", "formal"],
      ["2026-06-01", "支出", "NETFLIX", 1490, "娯楽", "動画", "formal"],
      ["2026-07-01", "支出", "NETFLIX", 1490, "娯楽", "動画", "formal"],
      ["2026-05-10", "支出", "東京電力", 4200, "水道光熱", "電気", "formal"],
      ["2026-06-10", "支出", "東京電力", 6100, "水道光熱", "電気", "formal"],
      ["2026-07-10", "支出", "東京電力", 7300, "水道光熱", "電気", "formal"],
      ["2026-05-02", "支出", "Amazon", 1000, "私用", "買い物", "formal"],
      ["2026-05-12", "支出", "Amazon", 3000, "私用", "買い物", "formal"],
      ["2026-06-02", "支出", "Amazon", 1200, "私用", "買い物", "formal"],
      ["2026-06-12", "支出", "Amazon", 4500, "私用", "買い物", "formal"],
      ["2026-07-02", "支出", "Amazon", 2000, "私用", "買い物", "formal"],
      ["2026-07-12", "支出", "Amazon", 5000, "私用", "買い物", "formal"],
    ],
  };

  const items = buildRecurringCandidateObjects_(buildRecurringCandidateMap_(table));
  const netflix = items.find((item) => item.merchant === "NETFLIX");
  const power = items.find((item) => item.merchant === "東京電力");
  const amazon = items.find((item) => item.merchant === "Amazon");

  if (!netflix || netflix.suggestedType !== "サブスク") {
    throw new Error("NETFLIXをサブスク候補として検出できませんでした");
  }
  if (!power || power.suggestedType !== "固定費") {
    throw new Error("変動額の水道光熱費を固定費候補として検出できませんでした");
  }
  if (amazon) {
    throw new Error("高頻度EC利用を定期支払い候補から除外できませんでした");
  }

  Logger.log(JSON.stringify({ assertions: "PASS", items }, null, 2));
  return { assertions: "PASS", items };
}


function testAccountAssetTypeHelpers() {
  const cases = [
    ["", "銀行", "三井住友銀行", "三井住友銀行", true, false, "cash"],
    ["", "その他", "SBI証券", "SBI証券", true, false, "investment"],
    ["investment", "銀行", "投資用口座", "", true, false, "investment"],
    ["", "クレジットカード", "Olive", "", false, true, "liability"],
    ["", "その他", "その他資産", "", true, false, "other"],
  ];

  for (const item of cases) {
    const actual = normalizeAccountAssetType_(
      item[0],
      item[1],
      item[2],
      item[3],
      item[4],
      item[5],
    );

    if (actual !== item[6]) {
      throw new Error(
        `assetType推定不一致: expected=${item[6]}, actual=${actual}`,
      );
    }
  }

  Logger.log(JSON.stringify({ assertions: "PASS", caseCount: cases.length }));
  return { assertions: "PASS", caseCount: cases.length };
}


function testInvestmentValuationHelpers() {
  const stockValue = investmentMarketValue_(10, 2500, 1);
  const fundValue = investmentMarketValue_(123456, 18450, 10000);
  const fundCost = investmentCostValue_(123456, 15000, 10000);

  if (stockValue !== 25000) {
    throw new Error(`株式評価額計算不一致: ${stockValue}`);
  }

  if (Math.abs(fundValue - 227776.32) > 0.01) {
    throw new Error(`投信評価額計算不一致: ${fundValue}`);
  }

  if (Math.abs(fundCost - 185184) > 0.01) {
    throw new Error(`投信取得額計算不一致: ${fundCost}`);
  }

  if (normalizeInvestmentSecurityType_("fund") !== "fund") {
    throw new Error("securityType正規化不一致");
  }

  if (normalizeInvestmentProvider_("yahoo", "cash") !== "manual") {
    throw new Error("現金provider正規化不一致");
  }

  Logger.log(JSON.stringify({ assertions: "PASS", caseCount: 5 }));
  return { assertions: "PASS", caseCount: 5 };
}
