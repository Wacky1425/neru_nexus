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
  const importRows = readImportCsv();

  Logger.log(`rules: ${rules.length}`);
  Logger.log(`configs: ${configs.length}`);
  Logger.log(`import_csv: ${importRows.length}`);

  if (rules.length > 0) {
    Logger.log(`先頭rule: ${JSON.stringify(rules[0])}`);
  }

  const olive = getImportConfig("olive_credit_v1");

  Logger.log(`config取得: ${olive.config_name}`);
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

  const configV2 = getConfigNameByCsvType("olive_credit_v2");

  Logger.log(`v1 config: ${configV1}`);
  Logger.log(`v2 config: ${configV2}`);

  if (configV1 !== "olive_credit_v1" || configV2 !== "olive_credit_v1") {
    throw new Error("Oliveのconfig変換に失敗しました");
  }

  const rows = convertOliveRowsWithoutHeader([
    ["2026/07/01", "ローソン", "610", "", "", "610"],
  ]);

  Logger.log(JSON.stringify(rows));

  if (rows.length !== 1 || rows[0]["請求額"] !== 610) {
    throw new Error("Olive明細変換に失敗しました");
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
        memo: "テスト現金",
      }),
    },
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
        memo: "配信素材テスト",
      }),
    },
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
    source_type: "test",
  };

  const result = classifyTransaction(sample, rules);

  const tx = {
    ...sample,
    ...result,
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

function testCategorySummary() {
  Logger.log(
    JSON.stringify(getCategorySummary(getLatestBudgetMonth()), null, 2),
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
    const row = values[0].map((v) => String(v).trim());

    Logger.log(file.getName());
    Logger.log(JSON.stringify(row));
  }
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

  if (typeof data.savingForecast !== "number") {
    throw new Error("savingForecast が数値ではありません");
  }

  if (typeof data.sideBusinessProfit !== "number") {
    throw new Error("sideBusinessProfit が数値ではありません");
  }

  if (!data.moneyHealth) {
    throw new Error("moneyHealth がありません");
  }

  Logger.log("Home APIデータ取得成功");
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

function testCreateTransactionFromApp() {
  const result = createTransactionFromApp_({
    transactionDate: "2026-07-30",
    type: "支出",
    amount: 380,
    category: "食費",
    title: "アプリ登録テスト",
    paymentMethod: "現金",
    memo: "Flutter接続前のテスト",
  });

  Logger.log(result.getContent());
}

function testGetCategoriesData() {
  const data = getCategoriesData();

  Logger.log(JSON.stringify(data, null, 2));
}

function testGetMasterData() {
  const data = getMasterData();

  Logger.log(JSON.stringify(data, null, 2));
}

function testCreateCategoryFromApp() {
  const result = createCategoryFromApp_({
    type: "支出",
    majorCategory: "テスト",
    subCategory: "動作確認",
  });

  Logger.log(result.getContent());
}

function testUpdateCategoryFromApp() {
  const result = updateCategoryFromApp_({
    subCategoryId: "sub_001",
    majorCategory: "食費",
    subCategory: "外食",
    active: true,
  });

  Logger.log(result.getContent());
}

function testClearAnalyticsCache() {
  clearAnalyticsSummaryCache_();
}

function debugFinancialSettings() {
  const settings = getFinancialSettings_();

  console.log(settings);
}

function testExistingOliveCsvVsGmail() {
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    Logger.log("Transactionsにデータがありません");
    return;
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    [
      "id",
      "transaction_date",
      "source_type",
      "account_name",
      "merchant",
      "amount",
      "source_id",
      "source_status",
    ],
    SHEETS.TRANSACTIONS,
  );

  const csvRows = [];
  const gmailRows = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const sourceType = String(row[index["source_type"]] || "").trim();

    const accountName = resolveCanonicalAccountName_(
      row[index["account_name"]],
    );

    if (accountName !== "三井住友カードOlive") {
      continue;
    }

    if (sourceType === "CSV_クレカ") {
      csvRows.push({
        id: String(row[index["id"]] || "").trim(),

        date: normalizeSettlementDate_(row[index["transaction_date"]]),

        amount: Number(row[index["amount"]] || 0),

        merchant: normalizeMerchant(String(row[index["merchant"]] || "")),
      });

      continue;
    }

    if (sourceType === "Gmail_Olive") {
      const sourceStatus = String(row[index["source_status"]] || "").trim();

      if (sourceStatus && sourceStatus !== "preliminary") {
        continue;
      }

      gmailRows.push({
        id: String(row[index["id"]] || "").trim(),

        sourceId: String(row[index["source_id"]] || "").trim(),

        date: normalizeSettlementDate_(row[index["transaction_date"]]),

        amount: Number(row[index["amount"]] || 0),

        merchant: normalizeMerchant(String(row[index["merchant"]] || "")),
      });
    }
  }

  const usedCsvIndexes = new Set();

  const matches = [];
  const unmatchedGmail = [];

  for (const gmail of gmailRows) {
    let candidateIndex = -1;
    let matchType = "";

    // ==========================================================
    // ① 同日 + 同額
    // ==========================================================

    for (let i = 0; i < csvRows.length; i++) {
      if (usedCsvIndexes.has(i)) {
        continue;
      }

      const csv = csvRows[i];

      if (csv.date === gmail.date && csv.amount === gmail.amount) {
        candidateIndex = i;
        matchType = "same_date_amount";
        break;
      }
    }

    // ==========================================================
    // ② 同額 + 日付±7日
    // ==========================================================

    if (candidateIndex === -1) {
      let bestDiff = Infinity;

      for (let i = 0; i < csvRows.length; i++) {
        if (usedCsvIndexes.has(i)) {
          continue;
        }

        const csv = csvRows[i];

        if (csv.amount !== gmail.amount) {
          continue;
        }

        const diffDays = diffDateDays_(gmail.date, csv.date);

        if (diffDays < 0 || diffDays > 7) {
          continue;
        }

        if (diffDays < bestDiff) {
          bestDiff = diffDays;
          candidateIndex = i;
          matchType = `amount_date_diff_${diffDays}`;
        }
      }
    }

    if (candidateIndex === -1) {
      unmatchedGmail.push({
        gmailTransactionId: gmail.id,
        gmailSourceId: gmail.sourceId,
        date: gmail.date,
        amount: gmail.amount,
        merchant: gmail.merchant,
      });

      continue;
    }

    const csv = csvRows[candidateIndex];

    usedCsvIndexes.add(candidateIndex);

    matches.push({
      matchType,

      gmailTransactionId: gmail.id,

      gmailSourceId: gmail.sourceId,

      gmailDate: gmail.date,

      csvTransactionId: csv.id,

      csvDate: csv.date,

      amount: gmail.amount,

      gmailMerchant: gmail.merchant,

      csvMerchant: csv.merchant,
    });
  }

  const summary = {
    gmailCount: gmailRows.length,

    csvCount: csvRows.length,

    matchedCount: matches.length,

    unmatchedCount: unmatchedGmail.length,

    matchTypeCounts: {},

    matches,

    unmatchedGmail,
  };

  for (const match of matches) {
    summary.matchTypeCounts[match.matchType] =
      Number(summary.matchTypeCounts[match.matchType] || 0) + 1;
  }

  Logger.log(JSON.stringify(summary, null, 2));

  return summary;
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

function reclassifyExistingGmailSmbcPreliminary() {
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    Logger.log("Transactionsにデータがありません");
    return;
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    [
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
    ],
    SHEETS.TRANSACTIONS,
  );

  const rules = getRules();

  let targetCount = 0;
  let updatedCount = 0;

  const updatedItems = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const sourceType = String(row[index["source_type"]] || "").trim();

    const sourceStatus = String(row[index["source_status"]] || "").trim();

    if (sourceType !== "Gmail_SMBC" || sourceStatus !== "preliminary") {
      continue;
    }

    targetCount++;

    const transactionDate = normalizeSettlementDate_(
      row[index["transaction_date"]],
    );

    const merchant = String(row[index["merchant"]] || "").trim();

    const rawText = String(row[index["raw_text"]] || "").trim();

    const amount = Number(row[index["amount"]] || 0);

    /*
     * 既存行から
     * Gmail解析item相当を再構築する。
     *
     * 入金/出金は現状のtypeではなく、
     * 取引内容から推定する。
     */
    let sourceKind = "";

    const normalizedMerchant = merchant.normalize("NFKC").toUpperCase();

    /*
     * 今回の既存9件では、
     * 給与/CTは入金、それ以外は出金。
     */
    if (
      normalizedMerchant.includes("ソフトヒユーベリオン") ||
      normalizedMerchant.includes("ソフトヒューベリオン") ||
      normalizedMerchant.includes("ワキタ ホクト")
    ) {
      sourceKind = "smbc_deposit";
    } else {
      sourceKind = "smbc_withdrawal";
    }

    const item = {
      sourceKind,

      transactionDate,

      amount,

      content: rawText || merchant,

      messageId: String(row[index["source_id"]] || "").trim(),

      receivedAt: String(row[index["source_received_at"]] || "").trim(),
    };

    const rebuilt = buildTransactionFromGmailItem_(item, rules);

    if (!rebuilt) {
      continue;
    }

    // ==========================================================
    // 分類・移動メタデータだけ更新
    //
    // id / 日付 / 金額 / source_id 等は保持する。
    // ==========================================================

    row[index["type"]] = rebuilt.type || "";

    row[index["major_category"]] = rebuilt.major_category || "";

    row[index["sub_category"]] = rebuilt.sub_category || "";

    row[index["purpose_type"]] = rebuilt.purpose_type || "";

    row[index["expense_ratio"]] = Number(rebuilt.expense_ratio || 0);

    row[index["expense_amount"]] = amount * Number(rebuilt.expense_ratio || 0);

    row[index["status"]] = rebuilt.status || "";

    row[index["wallet"]] = rebuilt.wallet || "生活";

    row[index["intent"]] = rebuilt.intent || "その他";

    row[index["from_account"]] = rebuilt.from_account || "";

    row[index["to_account"]] = rebuilt.to_account || "";

    row[index["settlement_status"]] = rebuilt.settlement_status || "";

    row[index["settlement_id"]] = rebuilt.settlement_id || "";

    updatedCount++;

    updatedItems.push({
      id: String(row[index["id"]] || ""),

      merchant,

      amount,

      type: rebuilt.type,

      majorCategory: rebuilt.major_category,

      subCategory: rebuilt.sub_category,

      fromAccount: rebuilt.from_account || "",

      toAccount: rebuilt.to_account || "",

      settlementStatus: rebuilt.settlement_status || "",
    });
  }

  if (updatedCount > 0) {
    sheet
      .getRange(2, 1, values.length - 1, values[0].length)
      .setValues(values.slice(1));

    clearTableCache(SHEETS.TRANSACTIONS);

    clearAccountBalanceCache_();

    clearHomeRecentTransactionsCache_();

    markSummaryDirty_("2026-08");
  }

  Logger.log(
    JSON.stringify(
      {
        targetCount,
        updatedCount,
        items: updatedItems,
      },
      null,
      2,
    ),
  );

  return {
    targetCount,
    updatedCount,
    items: updatedItems,
  };
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

function testIgnoredEndToEndTemporary() {
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("Transactionsにテスト対象がありません");
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    ["id", "transaction_date", "source_status", "status", "settlement_status"],
    SHEETS.TRANSACTIONS,
  );

  // ignoredではない既存取引を1件選ぶ
  let targetIndex = -1;

  for (let i = 1; i < values.length; i++) {
    const currentSourceStatus = String(
      values[i][index["source_status"]] || "",
    ).trim();

    if (currentSourceStatus !== "ignored") {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex < 0) {
    throw new Error("テスト対象にできる取引がありません");
  }

  const targetRow = values[targetIndex];

  const transactionId = String(targetRow[index["id"]] || "").trim();

  const transactionDate = targetRow[index["transaction_date"]];

  const yearMonth = normalizeYearMonth(transactionDate);

  const originalSourceStatus = targetRow[index["source_status"]];

  const originalStatus = targetRow[index["status"]];

  const originalSettlementStatus = targetRow[index["settlement_status"]];

  const rowNumber = targetIndex + 1;

  try {
    // ==========================================================
    // 一時的にignored化
    // ==========================================================

    sheet.getRange(rowNumber, index["source_status"] + 1).setValue("ignored");

    clearTableCache(SHEETS.TRANSACTIONS);
    clearAccountBalanceCache_();
    clearHomeRecentTransactionsCache_();

    if (yearMonth) {
      rebuildSummariesForMonth_(yearMonth);
    }

    // ==========================================================
    // 通常一覧
    // ==========================================================

    const transactionResult = getTransactionsData({
      limit: 200,
      offset: 0,
    });

    const existsInNormalList = (transactionResult.items || []).some(
      (item) => String(item.id || "") === transactionId,
    );

    // ==========================================================
    // 要確認一覧
    // ==========================================================

    const reviewResult = getReviewTransactionsData({
      limit: 200,
      offset: 0,
    });

    const existsInReviewList = (reviewResult.items || []).some(
      (item) => String(item.id || "") === transactionId,
    );

    // ==========================================================
    // 全体ignored判定
    // ==========================================================

    const refreshedTable = loadTransactions();

    const refreshedTarget = refreshedTable.rows.find(
      (row) => getString(row, refreshedTable.index, "id") === transactionId,
    );

    const storedAsIgnored = refreshedTarget
      ? isIgnoredTransactionRow_(refreshedTarget, refreshedTable.index)
      : false;

    const result = {
      transactionId,
      yearMonth,

      original: {
        sourceStatus: String(originalSourceStatus || ""),
        status: String(originalStatus || ""),
        settlementStatus: String(originalSettlementStatus || ""),
      },

      ignoredStored: storedAsIgnored,

      normalList: {
        exists: existsInNormalList,
        ok: !existsInNormalList,
      },

      reviewList: {
        exists: existsInReviewList,
        ok: !existsInReviewList,
      },
    };

    Logger.log(JSON.stringify(result, null, 2));

    return result;
  } finally {
    // ==========================================================
    // 必ず元に戻す
    // ==========================================================

    sheet
      .getRange(rowNumber, index["source_status"] + 1)
      .setValue(originalSourceStatus);

    clearTableCache(SHEETS.TRANSACTIONS);
    clearAccountBalanceCache_();
    clearHomeRecentTransactionsCache_();

    if (yearMonth) {
      rebuildSummariesForMonth_(yearMonth);
    }
  }
}

function testIgnoredBalanceTemporary() {
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("Transactionsにテスト対象がありません");
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    [
      "id",
      "transaction_date",
      "type",
      "amount",
      "account_name",
      "from_account",
      "to_account",
      "source_status",
    ],
    SHEETS.TRANSACTIONS,
  );

  // ============================================================
  // 現在の残高を取得
  // ============================================================

  clearAccountBalanceCache_();

  const before = getAccountBalancesData();

  const beforeItems = before.items || [];

  // ============================================================
  // 残高に確実に影響している取引を探す
  //
  // 支出・収入：
  //   account_name が登録口座に存在
  //
  // 移動：
  //   from_account / to_account のどちらかが登録口座に存在
  // ============================================================

  const accountNames = new Set(
    beforeItems
      .map((item) =>
        resolveCanonicalAccountName_(String(item.accountName || "").trim()),
      )
      .filter(Boolean),
  );

  let targetIndex = -1;
  let targetAccountName = "";

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const sourceStatus = String(row[index["source_status"]] || "").trim();

    if (sourceStatus === "ignored") {
      continue;
    }

    const type = String(row[index["type"]] || "").trim();

    const amount = Number(row[index["amount"]] || 0);

    if (amount <= 0) {
      continue;
    }

    const accountName = resolveCanonicalAccountName_(
      String(row[index["account_name"]] || "").trim(),
    );

    const fromAccount = resolveCanonicalAccountName_(
      String(row[index["from_account"]] || "").trim(),
    );

    const toAccount = resolveCanonicalAccountName_(
      String(row[index["to_account"]] || "").trim(),
    );

    if ((type === "支出" || type === "収入") && accountNames.has(accountName)) {
      targetIndex = i;
      targetAccountName = accountName;
      break;
    }

    if ((type === "移動" || type === "振替") && accountNames.has(fromAccount)) {
      targetIndex = i;
      targetAccountName = fromAccount;
      break;
    }

    if ((type === "移動" || type === "振替") && accountNames.has(toAccount)) {
      targetIndex = i;
      targetAccountName = toAccount;
      break;
    }
  }

  if (targetIndex < 0) {
    throw new Error("残高テストに使える取引が見つかりません");
  }

  const targetRow = values[targetIndex];

  const transactionId = String(targetRow[index["id"]] || "").trim();

  const transactionDate = targetRow[index["transaction_date"]];

  const type = String(targetRow[index["type"]] || "").trim();

  const amount = Number(targetRow[index["amount"]] || 0);

  const originalSourceStatus = targetRow[index["source_status"]];

  const rowNumber = targetIndex + 1;

  const beforeAccount = beforeItems.find(
    (item) =>
      resolveCanonicalAccountName_(String(item.accountName || "").trim()) ===
      targetAccountName,
  );

  if (!beforeAccount) {
    throw new Error("テスト対象口座の変更前残高を取得できません");
  }

  try {
    // ==========================================================
    // 一時的に ignored
    // ==========================================================

    sheet.getRange(rowNumber, index["source_status"] + 1).setValue("ignored");

    clearTableCache(SHEETS.TRANSACTIONS);
    clearAccountBalanceCache_();
    clearHomeRecentTransactionsCache_();

    // ==========================================================
    // ignored後の残高
    // ==========================================================

    const after = getAccountBalancesData();

    const afterAccount = (after.items || []).find(
      (item) =>
        resolveCanonicalAccountName_(String(item.accountName || "").trim()) ===
        targetAccountName,
    );

    if (!afterAccount) {
      throw new Error("テスト対象口座の変更後残高を取得できません");
    }

    const beforeBalance = Number(beforeAccount.currentBalance || 0);

    const afterBalance = Number(afterAccount.currentBalance || 0);

    const actualDifference = afterBalance - beforeBalance;

    // ==========================================================
    // 結果
    //
    // ignored化によって残高が変化していれば、
    // 少なくとも残高計算から除外されたことを確認できる。
    // ==========================================================

    const result = {
      transactionId,

      transactionDate: formatApiDate_(transactionDate),

      type,

      amount,

      accountName: targetAccountName,

      beforeBalance,

      afterBalance,

      actualDifference,

      expectedAbsoluteDifference: amount,

      ok: Math.abs(actualDifference) === Math.abs(amount),
    };

    Logger.log(JSON.stringify(result, null, 2));

    return result;
  } finally {
    // ==========================================================
    // 必ず復元
    // ==========================================================

    sheet
      .getRange(rowNumber, index["source_status"] + 1)
      .setValue(originalSourceStatus);

    clearTableCache(SHEETS.TRANSACTIONS);
    clearAccountBalanceCache_();
    clearHomeRecentTransactionsCache_();
  }
}

function testIgnoredMonthlySummaryTemporary() {
  const transactionSheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const transactionValues = transactionSheet.getDataRange().getValues();

  if (transactionValues.length < 2) {
    throw new Error("Transactionsにテスト対象がありません");
  }

  const transactionIndex = createHeaderIndex(transactionValues[0]);

  assertRequiredColumns(
    transactionIndex,
    ["id", "transaction_date", "type", "amount", "source_status"],
    SHEETS.TRANSACTIONS,
  );

  // ============================================================
  // 支出または収入のテスト対象を探す
  //
  // 移動はtotal_transfer側になるので、
  // 今回はまず支出/収入を明確に確認する。
  // ============================================================

  let targetIndex = -1;

  for (let i = 1; i < transactionValues.length; i++) {
    const row = transactionValues[i];

    const sourceStatus = String(
      row[transactionIndex["source_status"]] || "",
    ).trim();

    if (sourceStatus === "ignored") {
      continue;
    }

    const type = String(row[transactionIndex["type"]] || "").trim();

    if (type !== "支出" && type !== "収入") {
      continue;
    }

    const amount = Number(row[transactionIndex["amount"]] || 0);

    if (amount <= 0) {
      continue;
    }

    const yearMonth = normalizeYearMonth(
      row[transactionIndex["transaction_date"]],
    );

    if (!yearMonth) {
      continue;
    }

    targetIndex = i;

    break;
  }

  if (targetIndex < 0) {
    throw new Error("月次集計テストに使える取引が見つかりません");
  }

  const targetRow = transactionValues[targetIndex];

  const transactionId = String(targetRow[transactionIndex["id"]] || "").trim();

  const transactionDate = targetRow[transactionIndex["transaction_date"]];

  const yearMonth = normalizeYearMonth(transactionDate);

  const type = String(targetRow[transactionIndex["type"]] || "").trim();

  const amount = Number(targetRow[transactionIndex["amount"]] || 0);

  const originalSourceStatus = targetRow[transactionIndex["source_status"]];

  const rowNumber = targetIndex + 1;

  // ============================================================
  // 月次Summaryを取得するhelper
  // ============================================================

  function getMonthlySummaryRow_() {
    const summaryTable = loadTable(SHEETS.MONTHLY_SUMMARY);

    if (
      !summaryTable ||
      !Array.isArray(summaryTable.rows) ||
      summaryTable.rows.length === 0
    ) {
      return null;
    }

    assertRequiredColumns(
      summaryTable.index,
      [
        "year_month",
        "total_expense",
        "total_income",
        "total_transfer",
        "count_transactions",
      ],
      SHEETS.MONTHLY_SUMMARY,
    );

    return (
      summaryTable.rows.find(
        (row) =>
          String(row[summaryTable.index["year_month"]] || "").trim() ===
          yearMonth,
      ) || null
    );
  }

  // ============================================================
  // まず現在のSummaryを最新化
  // ============================================================

  rebuildSummariesForMonth_(yearMonth);

  clearTableCache(SHEETS.MONTHLY_SUMMARY);

  const beforeRow = getMonthlySummaryRow_();

  if (!beforeRow) {
    throw new Error(`月次集計が見つかりません: ${yearMonth}`);
  }

  const beforeTable = loadTable(SHEETS.MONTHLY_SUMMARY);

  const before = {
    totalExpense: getNumber(beforeRow, beforeTable.index, "total_expense"),

    totalIncome: getNumber(beforeRow, beforeTable.index, "total_income"),

    totalTransfer: getNumber(beforeRow, beforeTable.index, "total_transfer"),

    countTransactions: getNumber(
      beforeRow,
      beforeTable.index,
      "count_transactions",
    ),
  };

  try {
    // ==========================================================
    // 一時的に ignored
    // ==========================================================

    transactionSheet
      .getRange(rowNumber, transactionIndex["source_status"] + 1)
      .setValue("ignored");

    clearTableCache(SHEETS.TRANSACTIONS);

    // ==========================================================
    // 対象月を再集計
    // ==========================================================

    rebuildSummariesForMonth_(yearMonth);

    clearTableCache(SHEETS.MONTHLY_SUMMARY);

    const afterTable = loadTable(SHEETS.MONTHLY_SUMMARY);

    const afterRow = afterTable.rows.find(
      (row) =>
        String(row[afterTable.index["year_month"]] || "").trim() === yearMonth,
    );

    if (!afterRow) {
      throw new Error("ignored後の月次集計が見つかりません");
    }

    const after = {
      totalExpense: getNumber(afterRow, afterTable.index, "total_expense"),

      totalIncome: getNumber(afterRow, afterTable.index, "total_income"),

      totalTransfer: getNumber(afterRow, afterTable.index, "total_transfer"),

      countTransactions: getNumber(
        afterRow,
        afterTable.index,
        "count_transactions",
      ),
    };

    // ==========================================================
    // 差分
    // ==========================================================

    const differences = {
      totalExpense: after.totalExpense - before.totalExpense,

      totalIncome: after.totalIncome - before.totalIncome,

      totalTransfer: after.totalTransfer - before.totalTransfer,

      countTransactions: after.countTransactions - before.countTransactions,
    };

    let amountOk = false;

    if (type === "支出") {
      amountOk = differences.totalExpense === -amount;
    } else if (type === "収入") {
      amountOk = differences.totalIncome === -amount;
    }

    const countOk = differences.countTransactions === -1;

    const result = {
      transactionId,

      transactionDate: formatApiDate_(transactionDate),

      yearMonth,

      type,

      amount,

      before,

      after,

      differences,

      amountOk,

      countOk,

      ok: amountOk && countOk,
    };

    Logger.log(JSON.stringify(result, null, 2));

    return result;
  } finally {
    // ==========================================================
    // 必ず元に戻す
    // ==========================================================

    transactionSheet
      .getRange(rowNumber, transactionIndex["source_status"] + 1)
      .setValue(originalSourceStatus);

    clearTableCache(SHEETS.TRANSACTIONS);

    rebuildSummariesForMonth_(yearMonth);

    clearTableCache(SHEETS.MONTHLY_SUMMARY);

    clearAnalyticsSummaryCache_();
  }
}

function testGetGmailImportStatus() {
  const result = getGmailImportStatus_();

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}
