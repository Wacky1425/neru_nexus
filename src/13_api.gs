function getHomeData() {
  const currentYearMonth = Utilities.formatDate(
    new Date(),
    "Asia/Tokyo",
    "yyyy-MM",
  );

  const yearMonth = currentYearMonth;

  ensureSummaryFresh_(yearMonth);

  const budgets = getBudgetsForMonth(yearMonth);

  const monthlyData = loadAnalyticsMonthlySummary_();

  const monthly = monthlyData.find((item) => item.yearMonth === yearMonth);

  const fixedExpense = Number(monthly?.fixedExpense || 0);

  const variableExpense = Number(monthly?.variableExpense || 0);

  const totalIncome = Number(monthly?.totalIncome || 0);

  const plannedIncome =
    Number(budgets["給与予定"] || 0) + Number(budgets["副業予定"] || 0);

  // 月途中でも予定収入を使えるようにする。
  // 実収入が予定を上回った場合は実収入を採用。
  const projectedIncome = Math.max(totalIncome, plannedIncome);

  const expenses = {
    fixedExpense,
    variableExpense,
    totalExpense: fixedExpense + variableExpense,
  };

  // ============================================================
  // 今月使える生活費
  // ============================================================

  const availableMoney = calculateAvailableMoney_(
    budgets,
    expenses,
    projectedIncome,
  );

  const dailyBudget = calculateDailyBudget_(yearMonth, availableMoney);

  // ============================================================
  // 今月の資金配分
  //
  // 期限付きGoal
  //   ↓
  // 生活防衛資金
  //   ↓
  // 基本NISA
  //   ↓
  // 追加NISA
  // ============================================================

  const moneyAllocation = calculateMonthlyMoneyAllocation_(
    yearMonth,
    budgets,
    expenses,
    projectedIncome,
  );

  // ============================================================
  // 現金・安全資金
  // ============================================================

  const emergencyFund = moneyAllocation.emergencyFund || {};

  // 全流動現金
  const liquidCash = Number(emergencyFund.rawLiquidCash || 0);

  // Goal予約・カード支払・給料日までの生活費を
  // 差し引いた後の、防衛資金として使える現金
  const protectedCash = Number(emergencyFund.liquidCash || 0);

  // ============================================================
  // 資産
  // ============================================================

  const accountBalances = getAccountBalancesData();

  const totalAssets = Number(accountBalances.totalAssets || 0);

  const totalLiabilities = Number(accountBalances.totalLiabilities || 0);

  const netAssets = Number(accountBalances.netAssets || 0);

  // ============================================================
  // Money Health
  // ============================================================

  const moneyHealth = calculateMoneyHealth_(availableMoney, moneyAllocation);

  // ============================================================
  // その他
  // ============================================================

  const sideBusinessProfit = Number(monthly?.businessProfit || 0);

  const featuredDream = getFeaturedDreamFund();

  const recentTransactions = getHomeRecentTransactions_();

  return {
    yearMonth,

    // ==========================================================
    // 今月の生活費
    // ==========================================================

    availableMoney,
    dailyBudget,

    // ==========================================================
    // 今月のおすすめ資金配分
    // ==========================================================

    monthlySurplus: moneyAllocation.monthlySurplus,

    goalAllocation: moneyAllocation.goalAllocation,

    goalRequired: moneyAllocation.goalRequired,

    goalShortage: moneyAllocation.goalShortage,

    emergencyCashAllocation: moneyAllocation.emergencyCashAllocation,

    baseNisa: moneyAllocation.baseNisa,

    additionalNisa: moneyAllocation.additionalNisa,

    totalNisa: moneyAllocation.totalNisa,

    unallocatedCash: moneyAllocation.unallocatedCash,

    allocationStatus: moneyAllocation.status,

    allocationMessage: moneyAllocation.message,

    goalFundingDetails: moneyAllocation.goalDetails,

    // ==========================================================
    // 現金・生活防衛資金
    // ==========================================================

    liquidCash,
    protectedCash,

    emergencyFund: {
      monthlyEssentialCost: Number(emergencyFund.monthlyEssentialCost || 0),

      targetMonths: Number(emergencyFund.targetMonths || 0),

      targetAmount: Number(emergencyFund.targetAmount || 0),

      coveredMonths: Number(emergencyFund.coveredMonths || 0),

      shortage: Number(emergencyFund.shortage || 0),

      stage: String(emergencyFund.stage || ""),

      cashRatio: Number(emergencyFund.cashRatio || 0),

      nisaRatio: Number(emergencyFund.nisaRatio || 0),

      reservedGoalCash: Number(emergencyFund.reservedGoalCash || 0),

      upcomingCardPayments: Number(emergencyFund.upcomingCardPayments || 0),

      cashNeededUntilPayday: Number(emergencyFund.cashNeededUntilPayday || 0),

      nextPayday: String(emergencyFund.nextPayday || ""),

      daysUntilPayday: Number(emergencyFund.daysUntilPayday || 0),
    },

    // ==========================================================
    // 資産
    // ==========================================================

    totalAssets,
    totalLiabilities,
    netAssets,

    // ==========================================================
    // その他
    // ==========================================================

    sideBusinessProfit,
    moneyHealth,
    featuredDream,
    recentTransactions,

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
            settlementId: parameters.settlementId,
            importBatch: parameters.importBatch,
          }),
          "ok",
        );

      case "categories":
        return createJsonResponse_(getCategoriesData(), "ok");

      case "budget_settings":
        return createJsonResponse_(
          getBudgetSettings(parameters.yearMonth),
          "ok",
        );

      case "import_history":
        return createJsonResponse_(
          getImportHistoryData_({
            limit: parameters.limit,
          }),
          "ok",
        );

      case "master":
        return createJsonResponse_(getMasterData(), "ok");

      case "account_balances":
        return createJsonResponse_(getAccountBalancesData(), "ok");

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

      case "settlement_candidates":
        return createJsonResponse_(
          getSettlementCandidatesData({
            transactionId: parameters.transactionId,
          }),
          "ok",
        );

      case "goals":
        return createJsonResponse_(getGoalsData(), "ok");
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

      case "category_deactivate":
        return deactivateCategoryFromApp_(data);

      case "settlement_confirm":
        return confirmSettlementManually_(data);

      case "update_account_opening_balance":
        return updateAccountOpeningBalanceFromApp_(data);

      case "account_create":
        return createAccountFromApp_(data);

      case "account_update":
        return updateAccountFromApp_(data);

      case "account_deactivate":
        return deactivateAccountFromApp_(data);

      case "budget_settings_update":
        return updateBudgetSettingsFromApp_(data);

      case "goal_create":
        return createGoalFromApp_(data);

      case "goal_update":
        return updateGoalFromApp_(data);

      case "goal_deactivate":
        return deactivateGoalFromApp_(data);

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

  const result = addTransactions([tx], {
    skipDuplicateCheck: true,
  });

  if (result.addedCount === 0) {
    if (result.skippedCount > 0) {
      throw new Error("同じ内容の取引がすでに登録されています");
    }

    throw new Error("取引を登録できませんでした");
  }

  clearTableCache(SHEETS.TRANSACTIONS);
  clearAccountBalanceCache_();
  clearHomeRecentTransactionsCache_();

  const createdId =
    result.addedIds && result.addedIds.length > 0 ? result.addedIds[0] : "";

  const yearMonth = normalizeYearMonth(transactionDate);

  if (yearMonth) {
    markSummaryDirty_(yearMonth);
  }

  return createJsonResponse_(
    {
      addedCount: result.addedCount,

      skippedCount: result.skippedCount,

      source: "app",

      transaction: {
        id: createdId,

        transactionDate: tx.transaction_date,

        merchant: tx.merchant || "",

        itemName: tx.item_name || "",

        amount: tx.amount,

        type: tx.type,

        majorCategory: tx.major_category,

        subCategory: tx.sub_category,

        status: tx.status,

        wallet: tx.wallet,

        intent: tx.intent || "",

        paymentMethod: tx.payment_method,

        accountName: tx.account_name || "",

        rawText: tx.raw_text || "",

        settlementStatus: "",

        settlementId: "",

        fromAccount: "",

        toAccount: "",

        importBatch: tx.import_batch || "",

        note: tx.note || "",
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

  const fromAccount = String(data.fromAccount || "").trim();

  const toAccount = String(data.toAccount || "").trim();

  if (!id) {
    throw new Error("idは必須です");
  }

  if (!transactionDate) {
    throw new Error("transactionDateは必須です");
  }

  if (type !== "支出" && type !== "収入" && type !== "移動") {
    throw new Error("typeは支出、収入、移動を指定してください");
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

  const found = findTransactionById_(id);

  if (!found) {
    throw new Error("更新対象の取引が見つかりません");
  }

  assertRequiredColumns(
    found.index,
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
      "from_account",
      "to_account",
      "settlement_status",
      "settlement_id",
    ],
    SHEETS.TRANSACTIONS,
  );

  const existingRow = found.row;
  const tableIndex = found.index;

  const oldStatus = getString(existingRow, tableIndex, "status");

  const oldTransactionDate = existingRow[tableIndex["transaction_date"]];

  const oldType = getString(existingRow, tableIndex, "type");

  const oldAmount = getNumber(existingRow, tableIndex, "amount");

  const oldMajorCategory = getString(existingRow, tableIndex, "major_category");

  const oldExpenseAmount = getNumber(existingRow, tableIndex, "expense_amount");

  const existingSettlementStatus = getString(
    existingRow,
    tableIndex,
    "settlement_status",
  );

  const existingSettlementId = getString(
    existingRow,
    tableIndex,
    "settlement_id",
  );

  const isCreditCardSettlement = subCategory === "クレカ引落";

  const purposeType = type === "収入" ? "私用" : guessPurposeType(subCategory);

  const expenseRatio = type === "支出" ? guessExpenseRatio(subCategory) : 0;

  const wallet = purposeType === "経費" ? "事業" : "生活";

  const intent = type === "収入" ? "収入" : guessIntent(subCategory);

  const updatedTransaction = {
    transaction_date: transactionDate,

    type,

    source_type:
      getString(existingRow, tableIndex, "source_type") || "Neru Nexus App",

    payment_method: paymentMethod,

    account_name:
      getString(existingRow, tableIndex, "account_name") || "App Manual",

    merchant: normalizeMerchant(title),

    item_name: title,

    raw_text: getString(existingRow, tableIndex, "raw_text"),

    amount,

    major_category: majorCategory,

    sub_category: subCategory,

    purpose_type: purposeType,

    expense_ratio: expenseRatio,

    note: memo,

    evidence_url: getString(existingRow, tableIndex, "evidence_url"),

    original_image_url: getString(
      existingRow,
      tableIndex,
      "original_image_url",
    ),

    import_batch: getString(existingRow, tableIndex, "import_batch"),

    status: status,

    wallet,

    intent,

    from_account:
      type === "移動"
        ? resolveCanonicalAccountName_(
            fromAccount || getString(existingRow, tableIndex, "from_account"),
          )
        : "",

    to_account:
      type === "移動"
        ? resolveCanonicalAccountName_(
            toAccount || getString(existingRow, tableIndex, "to_account"),
          )
        : "",

    settlement_status:
      type !== "移動"
        ? ""
        : isCreditCardSettlement
          ? existingSettlementStatus
          : toAccount || getString(existingRow, tableIndex, "to_account")
            ? "none"
            : "review",

    settlement_id: type === "移動" ? existingSettlementId : "",
  };

  const needsReviewRefresh =
    oldStatus === "要確認" ||
    status === "要確認" ||
    existingSettlementStatus === "review" ||
    updatedTransaction.settlement_status === "review" ||
    saveRule;

  const recordedAt = existingRow[tableIndex["recorded_at"]] || new Date();

  const yearMonth = resolveTransactionYearMonth(transactionDate, recordedAt);

  const duplicateKey = buildDuplicateKey(updatedTransaction);

  const updatedRow = buildTransactionRow(
    updatedTransaction,
    id,
    recordedAt,
    yearMonth,
    duplicateKey,
  );

  const sheet = found.sheet;

  const sheetRowNumber = found.rowNumber;

  sheet
    .getRange(sheetRowNumber, 1, 1, updatedRow.length)
    .setValues([updatedRow]);

  clearTableCache(SHEETS.TRANSACTIONS);
  clearAccountBalanceCache_();
  clearHomeRecentTransactionsCache_();

  let ruleResult = null;

  if (saveRule) {
    const merchantForRule =
      ruleMerchant || getString(existingRow, tableIndex, "merchant");

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

    if (ruleResult.rule) {
      ruleResult.applied = applyRuleToPendingTransactions_(ruleResult.rule, id);
    }
  }

  const newExpenseAmount = amount * expenseRatio;

  const needsSummaryRefresh =
    normalizeYearMonth(oldTransactionDate) !== yearMonth ||
    oldType !== type ||
    oldAmount !== amount ||
    oldMajorCategory !== majorCategory ||
    oldExpenseAmount !== newExpenseAmount;

  if (needsSummaryRefresh) {
    const oldYearMonth = normalizeYearMonth(oldTransactionDate);

    if (oldYearMonth) {
      markSummaryDirty_(oldYearMonth);
    }

    if (yearMonth && yearMonth !== oldYearMonth) {
      markSummaryDirty_(yearMonth);
    }
  }

  return createJsonResponse_(
    {
      updated: true,
      id,
      transaction: {
        id,

        transactionDate,

        merchant: updatedTransaction.merchant || "",

        itemName: updatedTransaction.item_name || "",

        amount,

        type,

        majorCategory,

        subCategory,

        status,

        wallet,

        intent: updatedTransaction.intent || "",

        paymentMethod,

        accountName: updatedTransaction.account_name || "",

        rawText: updatedTransaction.raw_text || "",

        settlementStatus: updatedTransaction.settlement_status || "",

        settlementId: updatedTransaction.settlement_id || "",

        fromAccount: updatedTransaction.from_account || "",

        toAccount: updatedTransaction.to_account || "",

        importBatch: updatedTransaction.import_batch || "",

        note: updatedTransaction.note || "",
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

  const found = findTransactionById_(id);

  if (!found) {
    throw new Error("削除対象が見つかりません");
  }

  assertRequiredColumns(
    found.index,
    ["id", "transaction_date", "status", "settlement_status"],
    SHEETS.TRANSACTIONS,
  );

  const targetRow = found.row;
  const tableIndex = found.index;

  const transactionDate = targetRow[tableIndex["transaction_date"]];

  const status = getString(targetRow, tableIndex, "status");

  const settlementStatus = getString(
    targetRow,
    tableIndex,
    "settlement_status",
  );

  const yearMonth = normalizeYearMonth(transactionDate);

  const needsReviewRefresh =
    status === "要確認" || settlementStatus === "review";

  const sheet = found.sheet;

  const sheetRowNumber = found.rowNumber;

  /*
   * 本体を削除
   */

  sheet.deleteRow(sheetRowNumber);

  /*
   * キャッシュ破棄
   */
  clearTableCache(SHEETS.TRANSACTIONS);

  clearAccountBalanceCache_();

  clearHomeRecentTransactionsCache_();

  /*
   * 派生データ更新。
   *
   * 本体の削除自体は完了しているので、
   * 派生データ更新失敗によって
   * API全体を失敗扱いにはしない。
   */
  const rebuildErrors = [];

  if (yearMonth) {
    markSummaryDirty_(yearMonth);
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
      "recorded_at",
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
      "payment_method",
      "account_name",
      "settlement_status",
      "settlement_id",
      "from_account",
      "to_account",
      "import_batch",
      "note",
    ],
    SHEETS.TRANSACTIONS,
  );

  const settlementId = String(settings.settlementId || "").trim();

  const importBatch = String(settings.importBatch || "").trim();

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

    if (settlementId) {
      const rowSettlementId = getString(row, table.index, "settlement_id");

      if (rowSettlementId !== settlementId) {
        return false;
      }
    }

    if (importBatch) {
      const rowImportBatch = getString(row, table.index, "import_batch");

      if (rowImportBatch !== importBatch) {
        return false;
      }
    }

    return true;
  });

  filteredRows.sort((a, b) => {
    const dateA = new Date(a[table.index["transaction_date"]]);

    const dateB = new Date(b[table.index["transaction_date"]]);

    const dateDifference = dateB.getTime() - dateA.getTime();

    if (dateDifference !== 0) {
      return dateDifference;
    }

    const recordedAtA = new Date(a[table.index["recorded_at"]]);

    const recordedAtB = new Date(b[table.index["recorded_at"]]);

    return recordedAtB.getTime() - recordedAtA.getTime();
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

    paymentMethod: getString(row, table.index, "payment_method"),

    accountName: getString(row, table.index, "account_name"),

    settlementStatus: getString(row, table.index, "settlement_status"),

    settlementId: getString(row, table.index, "settlement_id"),

    fromAccount: getString(row, table.index, "from_account"),

    toAccount: getString(row, table.index, "to_account"),

    importBatch: getString(row, table.index, "import_batch"),

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
      "account_name",
      "raw_text",
      "note",
      "from_account",
      "to_account",
      "settlement_status",
      "settlement_id",
      "import_batch",
    ],
    SHEETS.TRANSACTIONS,
  );

  const filteredRows = table.rows.filter((row) => {
    const status = getString(row, table.index, "status");

    const settlementStatus = getString(row, table.index, "settlement_status");

    return status === "要確認" || settlementStatus === "review";
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

    paymentMethod: getString(row, table.index, "payment_method"),

    accountName: getString(row, table.index, "account_name"),

    rawText: getString(row, table.index, "raw_text"),

    note: getString(row, table.index, "note"),

    fromAccount: getString(row, table.index, "from_account"),

    toAccount: getString(row, table.index, "to_account"),

    settlementStatus: getString(row, table.index, "settlement_status"),

    settlementId: getString(row, table.index, "settlement_id"),

    importBatch: getString(row, table.index, "import_batch"),
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

  assertRequiredColumns(
    table.index,
    ["status", "settlement_status"],
    SHEETS.TRANSACTIONS,
  );

  let count = 0;

  for (const row of table.rows) {
    const status = getString(row, table.index, "status");

    const settlementStatus = getString(row, table.index, "settlement_status");

    if (status === "要確認" || settlementStatus === "review") {
      count++;
    }
  }

  return {
    count,
  };
}

function getSettlementCandidatesData(options) {
  const settings = options || {};

  const transactionId = String(settings.transactionId || "").trim();

  if (!transactionId) {
    throw new Error("transactionIdは必須です");
  }

  const table = loadTransactions();

  if (table.rows.length === 0) {
    return {
      items: [],
    };
  }

  assertRequiredColumns(
    table.index,
    [
      "id",
      "transaction_date",
      "amount",
      "type",
      "account_name",
      "import_batch",
      "to_account",
      "settlement_status",
      "settlement_id",
    ],
    SHEETS.TRANSACTIONS,
  );

  const targetRow = table.rows.find((row) => {
    return String(row[table.index["id"]] || "").trim() === transactionId;
  });

  if (!targetRow) {
    throw new Error("クレカ引落取引が見つかりません");
  }

  const targetType = getString(targetRow, table.index, "type");

  if (targetType !== "移動") {
    throw new Error("移動取引ではありません");
  }

  const cardAccount = resolveCanonicalAccountName_(
    getString(targetRow, table.index, "to_account"),
  );

  if (!cardAccount) {
    return {
      items: [],
    };
  }

  const settlementAmount = getNumber(targetRow, table.index, "amount");

  const groups = {};

  for (const row of table.rows) {
    const type = getString(row, table.index, "type");

    // 銀行引落などの移動行は除外
    if (type === "移動") {
      continue;
    }

    const importBatch = getString(row, table.index, "import_batch");

    if (!importBatch) {
      continue;
    }

    // すでに別の引落と照合済みなら除外
    const settlementId = getString(row, table.index, "settlement_id");

    if (settlementId) {
      continue;
    }

    const rowAccount = resolveCanonicalAccountName_(
      getString(row, table.index, "account_name"),
    );

    if (rowAccount !== cardAccount) {
      continue;
    }

    if (!groups[importBatch]) {
      groups[importBatch] = {
        importBatch,
        cardAccount,
        totalAmount: 0,
        detailCount: 0,
        firstDate: "",
        lastDate: "",
      };
    }

    const group = groups[importBatch];

    group.totalAmount += getNumber(row, table.index, "amount");

    group.detailCount++;

    const date = formatApiDate_(row[table.index["transaction_date"]]);

    if (!group.firstDate || date < group.firstDate) {
      group.firstDate = date;
    }

    if (!group.lastDate || date > group.lastDate) {
      group.lastDate = date;
    }
  }

  const items = Object.values(groups)
    .map((group) => ({
      ...group,

      settlementAmount,

      difference: settlementAmount - group.totalAmount,
    }))
    .sort((a, b) => {
      return Math.abs(a.difference) - Math.abs(b.difference);
    });

  return {
    transactionId,
    cardAccount,
    settlementAmount,
    items,
  };
}

function createGoalFromApp_(data) {
  const goalName = String(data.goalName || "").trim();

  if (!goalName) {
    throw new Error("goalNameは必須です");
  }

  const sheet = getRequiredSheet(SHEETS.GOALS);

  const goalId = Utilities.getUuid();

  const row = [
    goalId,
    goalName,
    String(data.goalType || "").trim(),
    Number(data.targetAmount || 0),
    normalizeGoalDate_(data.targetDate),
    String(data.certainty || "").trim(),
    Number(data.reservedCash || 0),
    Number(data.priority || 0),
    1,
    String(data.note || "").trim(),
  ];

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);

  clearTableCache(SHEETS.GOALS);

  return createJsonResponse_(
    {
      goalId,
      status: "created",
    },
    "ok",
  );
}

function updateGoalFromApp_(data) {
  const goalId = String(data.goalId || "").trim();

  if (!goalId) {
    throw new Error("goalIdは必須です");
  }

  const sheet = getRequiredSheet(SHEETS.GOALS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("Goalが見つかりません");
  }

  const index = createHeaderIndex(values[0]);

  const rowIndex = values.findIndex(
    (row, i) => i > 0 && String(row[index["goal_id"]] || "").trim() === goalId,
  );

  if (rowIndex === -1) {
    throw new Error(`Goalが見つかりません: ${goalId}`);
  }

  const row = values[rowIndex];

  row[index["goal_name"]] = String(data.goalName || "").trim();

  row[index["goal_type"]] = String(data.goalType || "").trim();

  row[index["target_amount"]] = Number(data.targetAmount || 0);

  row[index["target_date"]] = normalizeGoalDate_(data.targetDate);

  row[index["certainty"]] = String(data.certainty || "").trim();

  row[index["reserved_cash"]] = Number(data.reservedCash || 0);

  row[index["priority"]] = Number(data.priority || 0);

  row[index["note"]] = String(data.note || "").trim();

  sheet.getRange(rowIndex + 1, 1, 1, row.length).setValues([row]);

  clearTableCache(SHEETS.GOALS);

  return createJsonResponse_(
    {
      goalId,
      status: "updated",
    },
    "ok",
  );
}

function deactivateGoalFromApp_(data) {
  const goalId = String(data.goalId || "").trim();

  if (!goalId) {
    throw new Error("goalIdは必須です");
  }

  const sheet = getRequiredSheet(SHEETS.GOALS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("Goalが見つかりません");
  }

  const index = createHeaderIndex(values[0]);

  const rowIndex = values.findIndex(
    (row, i) => i > 0 && String(row[index["goal_id"]] || "").trim() === goalId,
  );

  if (rowIndex === -1) {
    throw new Error(`Goalが見つかりません: ${goalId}`);
  }

  sheet.getRange(rowIndex + 1, index["active"] + 1).setValue(0);

  clearTableCache(SHEETS.GOALS);

  return createJsonResponse_(
    {
      goalId,
      status: "deactivated",
    },
    "ok",
  );
}

function normalizeGoalDate_(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return Utilities.formatDate(value, "Asia/Tokyo", "yyyy-MM-dd");
  }

  const text = String(value).normalize("NFKC").trim();

  if (!text) {
    return "";
  }

  const match = text.match(/^(\d{4})[\/\-](\d{1,2})(?:[\/\-](\d{1,2}))?$/);

  if (!match) {
    throw new Error("targetDateの形式が正しくありません");
  }

  const year = match[1];

  const month = String(Number(match[2])).padStart(2, "0");

  const day = String(Number(match[3] || 1)).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
