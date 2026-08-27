// ============================================================
// Neru Nexus - Accounts
//
// M_Accounts の取得・CRUD・残高計算・請求月計算を担当。
// ============================================================

function createAccountFromApp_(data) {
  const accountName = String(data.accountName || "").trim();
  const paymentMethod = String(data.paymentMethod || "").trim();
  const wallet = String(data.wallet || "").trim();
  const institution = String(data.institution || "").trim();

  const isAsset = data.isAsset === true;
  const isLiability = data.isLiability === true;

  const openingBalanceValue = data.openingBalance;
  const openingBalanceDate = String(data.openingBalanceDate || "").trim();

  // ============================================================
  // クレカ請求設定
  // ============================================================

  const closingDay = Number(data.closingDay || 0);

  const paymentDay = Number(data.paymentDay || 0);

  const paymentMonthOffset = Number(data.paymentMonthOffset || 0);

  if (!accountName) {
    throw new Error("accountNameは必須です");
  }

  if (!paymentMethod) {
    throw new Error("paymentMethodは必須です");
  }

  if (!wallet) {
    throw new Error("walletは必須です");
  }

  if (isAsset && isLiability) {
    throw new Error("資産口座と負債口座を同時に指定できません");
  }

  const openingBalance =
    openingBalanceValue === null ||
    openingBalanceValue === undefined ||
    openingBalanceValue === ""
      ? 0
      : Number(openingBalanceValue);

  if (!Number.isFinite(openingBalance)) {
    throw new Error("openingBalanceが不正です");
  }

  // ============================================================
  // 請求設定チェック
  //
  // 0 は「未設定」
  // ============================================================

  if (!Number.isInteger(closingDay) || closingDay < 0 || closingDay > 31) {
    throw new Error("closingDayは0〜31で指定してください");
  }

  if (!Number.isInteger(paymentDay) || paymentDay < 0 || paymentDay > 31) {
    throw new Error("paymentDayは0〜31で指定してください");
  }

  if (
    !Number.isInteger(paymentMonthOffset) ||
    paymentMonthOffset < 0 ||
    paymentMonthOffset > 12
  ) {
    throw new Error("paymentMonthOffsetが不正です");
  }

  // 片方だけ設定されている状態は禁止
  if (
    (closingDay > 0 && paymentDay === 0) ||
    (closingDay === 0 && paymentDay > 0)
  ) {
    throw new Error("締め日と支払日は両方設定してください");
  }

  const sheet = getRequiredSheet(SHEETS.ACCOUNTS);

  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    throw new Error("accountsシートにヘッダーがありません");
  }

  const headers = values[0].map((value) => String(value || "").trim());

  const index = createHeaderIndex(headers);

  assertRequiredColumns(
    index,
    [
      "account_id",
      "account_name",
      "payment_method",
      "wallet",
      "institution",
      "is_asset",
      "is_liability",
      "active",
      "note",
      "sort_order",
      "opening_balance",
      "opening_balance_date",

      // クレカ請求設定
      "closing_day",
      "payment_day",
      "payment_month_offset",
    ],
    SHEETS.ACCOUNTS,
  );

  const existingRows = values.slice(1);

  const sameNameRowIndex = existingRows.findIndex(
    (row) => String(row[index["account_name"]] || "").trim() === accountName,
  );

  // ============================================================
  // 無効化済み口座の復活
  // ============================================================

  if (sameNameRowIndex !== -1) {
    const existingRow = existingRows[sameNameRowIndex];

    const activeValue = existingRow[index["active"]];

    const isActive =
      activeValue === true ||
      Number(activeValue) === 1 ||
      String(activeValue).trim().toLowerCase() === "true";

    if (isActive) {
      throw new Error("同じ名前の口座がすでに存在します");
    }

    const sheetRowNumber = sameNameRowIndex + 2;

    const existingAccountId = String(
      existingRow[index["account_id"]] || "",
    ).trim();

    sheet
      .getRange(sheetRowNumber, index["payment_method"] + 1)
      .setValue(paymentMethod);

    sheet.getRange(sheetRowNumber, index["wallet"] + 1).setValue(wallet);

    sheet
      .getRange(sheetRowNumber, index["institution"] + 1)
      .setValue(institution);

    sheet
      .getRange(sheetRowNumber, index["is_asset"] + 1)
      .setValue(isAsset ? 1 : 0);

    sheet
      .getRange(sheetRowNumber, index["is_liability"] + 1)
      .setValue(isLiability ? 1 : 0);

    sheet.getRange(sheetRowNumber, index["active"] + 1).setValue(1);

    sheet
      .getRange(sheetRowNumber, index["opening_balance"] + 1)
      .setValue(openingBalance);

    sheet
      .getRange(sheetRowNumber, index["opening_balance_date"] + 1)
      .setValue(openingBalanceDate);

    // クレカ請求設定
    sheet
      .getRange(sheetRowNumber, index["closing_day"] + 1)
      .setValue(closingDay);

    sheet
      .getRange(sheetRowNumber, index["payment_day"] + 1)
      .setValue(paymentDay);

    sheet
      .getRange(sheetRowNumber, index["payment_month_offset"] + 1)
      .setValue(paymentMonthOffset);

    clearTableCache(SHEETS.ACCOUNTS);

    clearAccountBalanceCache_();

    return createJsonResponse_(
      {
        accountId: existingAccountId,

        accountName,
        paymentMethod,
        wallet,
        institution,
        isAsset,
        isLiability,

        openingBalance,
        openingBalanceDate,

        closingDay,
        paymentDay,
        paymentMonthOffset,

        reactivated: true,
      },
      "ok",
    );
  }

  // ============================================================
  // 新規作成
  // ============================================================

  const accountId = "acc_" + Utilities.getUuid().replace(/-/g, "").slice(0, 16);

  const maxSortOrder = existingRows.reduce((maximum, row) => {
    const value = Number(row[index["sort_order"]] || 0);

    return value > maximum ? value : maximum;
  }, 0);

  const row = new Array(headers.length).fill("");

  row[index["account_id"]] = accountId;

  row[index["account_name"]] = accountName;

  row[index["payment_method"]] = paymentMethod;

  row[index["wallet"]] = wallet;

  row[index["institution"]] = institution;

  row[index["is_asset"]] = isAsset ? 1 : 0;

  row[index["is_liability"]] = isLiability ? 1 : 0;

  row[index["active"]] = 1;

  row[index["note"]] = "アプリ追加";

  row[index["sort_order"]] = maxSortOrder + 1;

  row[index["opening_balance"]] = openingBalance;

  row[index["opening_balance_date"]] = openingBalanceDate;

  // クレカ請求設定
  row[index["closing_day"]] = closingDay;

  row[index["payment_day"]] = paymentDay;

  row[index["payment_month_offset"]] = paymentMonthOffset;

  sheet.appendRow(row);

  clearTableCache(SHEETS.ACCOUNTS);

  clearAccountBalanceCache_();

  return createJsonResponse_(
    {
      accountId,
      accountName,
      paymentMethod,
      wallet,
      institution,
      isAsset,
      isLiability,

      openingBalance,
      openingBalanceDate,

      closingDay,
      paymentDay,
      paymentMonthOffset,
    },
    "ok",
  );
}

function updateAccountFromApp_(data) {
  const accountId = String(data.accountId || "").trim();

  const accountName = String(data.accountName || "").trim();

  const paymentMethod = String(data.paymentMethod || "").trim();

  const wallet = String(data.wallet || "").trim();

  const institution = String(data.institution || "").trim();

  const isAsset = data.isAsset === true;

  const isLiability = data.isLiability === true;

  const openingBalance = Number(data.openingBalance || 0);

  const openingBalanceDate = String(data.openingBalanceDate || "").trim();

  // ============================================================
  // クレカ請求設定
  // ============================================================

  const closingDay = Number(data.closingDay || 0);

  const paymentDay = Number(data.paymentDay || 0);

  const paymentMonthOffset = Number(data.paymentMonthOffset || 0);

  // ============================================================
  // バリデーション
  // ============================================================

  if (!accountId) {
    throw new Error("accountIdは必須です");
  }

  if (!accountName) {
    throw new Error("accountNameは必須です");
  }

  if (!paymentMethod) {
    throw new Error("paymentMethodは必須です");
  }

  if (!wallet) {
    throw new Error("walletは必須です");
  }

  if (isAsset && isLiability) {
    throw new Error("資産口座と負債口座を同時に指定できません");
  }

  if (!Number.isFinite(openingBalance)) {
    throw new Error("openingBalanceが不正です");
  }

  if (!Number.isInteger(closingDay) || closingDay < 0 || closingDay > 31) {
    throw new Error("closingDayは0〜31で指定してください");
  }

  if (!Number.isInteger(paymentDay) || paymentDay < 0 || paymentDay > 31) {
    throw new Error("paymentDayは0〜31で指定してください");
  }

  if (
    !Number.isInteger(paymentMonthOffset) ||
    paymentMonthOffset < 0 ||
    paymentMonthOffset > 12
  ) {
    throw new Error("paymentMonthOffsetが不正です");
  }

  if (
    (closingDay > 0 && paymentDay === 0) ||
    (closingDay === 0 && paymentDay > 0)
  ) {
    throw new Error("締め日と支払日は両方設定してください");
  }

  // ============================================================
  // Accounts取得
  // ============================================================

  const sheet = getRequiredSheet(SHEETS.ACCOUNTS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("口座データがありません");
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    [
      "account_id",
      "account_name",
      "payment_method",
      "wallet",
      "institution",
      "is_asset",
      "is_liability",
      "opening_balance",
      "opening_balance_date",
      "closing_day",
      "payment_day",
      "payment_month_offset",
    ],
    SHEETS.ACCOUNTS,
  );

  // ============================================================
  // 更新対象検索
  // ============================================================

  let targetRow = -1;

  let oldAccountName = "";

  let oldClosingDay = 0;

  let oldPaymentDay = 0;

  let oldPaymentMonthOffset = 0;

  for (let i = 1; i < values.length; i++) {
    const rowAccountId = String(values[i][index["account_id"]] || "").trim();

    if (rowAccountId !== accountId) {
      continue;
    }

    targetRow = i + 1;

    oldAccountName = String(values[i][index["account_name"]] || "").trim();

    oldClosingDay = Number(values[i][index["closing_day"]] || 0);

    oldPaymentDay = Number(values[i][index["payment_day"]] || 0);

    oldPaymentMonthOffset = Number(
      values[i][index["payment_month_offset"]] || 0,
    );

    break;
  }

  if (targetRow === -1) {
    throw new Error("対象の口座が見つかりません");
  }

  // ============================================================
  // 名前重複チェック
  // ============================================================

  const duplicate = values.slice(1).some((row) => {
    const rowId = String(row[index["account_id"]] || "").trim();

    const rowName = String(row[index["account_name"]] || "").trim();

    return rowId !== accountId && rowName === accountName;
  });

  if (duplicate) {
    throw new Error("同じ名前の口座がすでに存在します");
  }

  // ============================================================
  // 請求設定変更判定
  // ============================================================

  const billingSettingsChanged =
    oldClosingDay !== closingDay ||
    oldPaymentDay !== paymentDay ||
    oldPaymentMonthOffset !== paymentMonthOffset;

  // ============================================================
  // Accounts更新
  // ============================================================

  sheet.getRange(targetRow, index["account_name"] + 1).setValue(accountName);

  sheet
    .getRange(targetRow, index["payment_method"] + 1)
    .setValue(paymentMethod);

  sheet.getRange(targetRow, index["wallet"] + 1).setValue(wallet);

  sheet.getRange(targetRow, index["institution"] + 1).setValue(institution);

  sheet.getRange(targetRow, index["is_asset"] + 1).setValue(isAsset ? 1 : 0);

  sheet
    .getRange(targetRow, index["is_liability"] + 1)
    .setValue(isLiability ? 1 : 0);

  sheet
    .getRange(targetRow, index["opening_balance"] + 1)
    .setValue(openingBalance);

  sheet
    .getRange(targetRow, index["opening_balance_date"] + 1)
    .setValue(openingBalanceDate);

  // ============================================================
  // クレカ請求設定更新
  // ============================================================

  sheet.getRange(targetRow, index["closing_day"] + 1).setValue(closingDay);

  sheet.getRange(targetRow, index["payment_day"] + 1).setValue(paymentDay);

  sheet
    .getRange(targetRow, index["payment_month_offset"] + 1)
    .setValue(paymentMonthOffset);

  // ============================================================
  // 口座名変更
  // ============================================================

  if (oldAccountName && oldAccountName !== accountName) {
    renameAccountInTransactions_(oldAccountName, accountName);
  }

  // ============================================================
  // キャッシュ削除
  //
  // 再照合より先に行う。
  // getAccountBillingSettings_() が
  // 古い締め日設定を参照するのを防ぐ。
  // ============================================================

  clearTableCache(SHEETS.ACCOUNTS);

  clearTableCache(SHEETS.TRANSACTIONS);

  clearAccountBalanceCache_();

  clearHomeRecentTransactionsCache_();

  // ============================================================
  // 請求設定変更時の再照合
  // ============================================================

  let reconciliationResult = null;

  /*
   * 条件：
   *
   * ・負債口座
   * ・締め日 / 支払日 / 支払月のどれかが変更
   * ・請求設定が有効
   *
   * matched / manual_matched は
   * reconcilePendingCardSettlements_() 側で除外される。
   */
  if (
    isLiability &&
    billingSettingsChanged &&
    closingDay > 0 &&
    paymentDay > 0
  ) {
    reconciliationResult = reconcilePendingCardSettlements_(accountName);
  }

  // ============================================================
  // Response
  // ============================================================

  return createJsonResponse_(
    {
      updated: true,

      accountId,

      oldAccountName,

      accountName,

      closingDay,

      paymentDay,

      paymentMonthOffset,

      billingSettingsChanged,

      reconciliation: reconciliationResult,
    },
    "ok",
  );
}

function renameAccountInTransactions_(oldName, newName) {
  if (!oldName || !newName || oldName === newName) {
    return;
  }

  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return;
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    ["account_name", "from_account", "to_account"],
    SHEETS.TRANSACTIONS,
  );

  let changed = false;

  for (let i = 1; i < values.length; i++) {
    for (const column of ["account_name", "from_account", "to_account"]) {
      const current = String(values[i][index[column]] || "").trim();

      if (current === oldName) {
        values[i][index[column]] = newName;

        changed = true;
      }
    }
  }

  if (!changed) {
    return;
  }

  sheet
    .getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));
}

function deactivateAccountFromApp_(data) {
  const accountId = String(data.accountId || "").trim();

  if (!accountId) {
    throw new Error("accountIdは必須です");
  }

  const sheet = getRequiredSheet(SHEETS.ACCOUNTS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("口座データがありません");
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(index, ["account_id", "active"], SHEETS.ACCOUNTS);

  let targetRow = -1;

  for (let i = 1; i < values.length; i++) {
    const rowAccountId = String(values[i][index["account_id"]] || "").trim();

    if (rowAccountId === accountId) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) {
    throw new Error("対象の口座が見つかりません");
  }

  sheet.getRange(targetRow, index["active"] + 1).setValue(0);

  clearTableCache(SHEETS.ACCOUNTS);

  clearAccountBalanceCache_();

  return createJsonResponse_(
    {
      deactivated: true,
      accountId,
    },
    "ok",
  );
}

function getAccountsData_() {
  const sheet = SS.getSheetByName(SHEETS.ACCOUNTS);

  if (!sheet) {
    throw new Error("accountsシートがありません");
  }

  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return {
      items: [],
    };
  }

  const headers = values[0].map((value) => String(value || "").trim());

  const index = {};

  headers.forEach((header, i) => {
    index[header] = i;
  });

  const requiredColumns = [
    "account_id",
    "account_name",
    "payment_method",
    "wallet",
    "active",
  ];

  for (const column of requiredColumns) {
    if (index[column] === undefined) {
      throw new Error(`accountsシートに${column}列がありません`);
    }
  }

  const items = [];

  for (const row of values.slice(1)) {
    const activeValue = row[index["active"]];

    const active =
      activeValue === true ||
      Number(activeValue) === 1 ||
      String(activeValue).trim().toLowerCase() === "true";

    if (!active) {
      continue;
    }

    const accountId = String(row[index["account_id"]] || "").trim();

    const accountName = String(row[index["account_name"]] || "").trim();

    const paymentMethod = String(row[index["payment_method"]] || "").trim();

    const wallet = String(row[index["wallet"]] || "").trim();

    if (!accountId || !accountName || !paymentMethod) {
      continue;
    }

    items.push({
      accountId,
      accountName,
      paymentMethod,
      wallet,

      institution:
        index["institution"] === undefined
          ? ""
          : String(row[index["institution"]] || "").trim(),

      assetType:
        index["asset_type"] === undefined
          ? ""
          : String(row[index["asset_type"]] || "").trim(),

      isAsset:
        index["is_asset"] === undefined
          ? false
          : Number(row[index["is_asset"]] || 0) === 1,

      isLiability:
        index["is_liability"] === undefined
          ? false
          : Number(row[index["is_liability"]] || 0) === 1,

      active,

      note:
        index["note"] === undefined
          ? ""
          : String(row[index["note"]] || "").trim(),

      openingBalance:
        index["opening_balance"] === undefined
          ? 0
          : Number(row[index["opening_balance"]] || 0),

      openingBalanceDate:
        index["opening_balance_date"] === undefined
          ? ""
          : formatApiDate_(row[index["opening_balance_date"]]),

      sortOrder:
        index["sort_order"] === undefined
          ? 999
          : Number(row[index["sort_order"]] || 999),

      // ========================================================
      // クレカ請求設定
      // ========================================================

      closingDay:
        index["closing_day"] === undefined
          ? 0
          : Number(row[index["closing_day"]] || 0),

      paymentDay:
        index["payment_day"] === undefined
          ? 0
          : Number(row[index["payment_day"]] || 0),

      paymentMonthOffset:
        index["payment_month_offset"] === undefined
          ? 0
          : Number(row[index["payment_month_offset"]] || 0),
    });
  }

  items.sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    items,
  };
}

function getAccountBalancesData_() {
  const accountsResult = getAccountsData_();

  const transactionTable = loadTransactions();

  const accounts = accountsResult.items || [];

  if (accounts.length === 0) {
    return {
      items: [],
      totalAssets: 0,
      totalLiabilities: 0,
      netAssets: 0,
    };
  }

  // ============================================================
  // Transactionsがない場合
  // ============================================================

  if (transactionTable.rows.length === 0) {
    const items = accounts.map((account) => {
      const currentBalance = Number(account.openingBalance || 0);

      return {
        ...account,
        currentBalance,

        // クレジットカード請求情報
        nextBillingYearMonth: "",
        nextBillingAmount: 0,
        laterBillingAmount: account.isLiability
          ? Math.max(0, currentBalance)
          : 0,
      };
    });

    return buildAccountBalanceResult_(items);
  }

  // ============================================================
  // 必須列
  // ============================================================

  assertRequiredColumns(
    transactionTable.index,
    [
      "transaction_date",
      "type",
      "amount",
      "account_name",
      "from_account",
      "to_account",

      // カード請求予定計算で使用
      "source_type",
      "merchant",
      "item_name",
      "note",
      "settlement_status",
      "settlement_id",

      // Gmail速報の論理除外判定で使用
      "source_status",
    ],
    SHEETS.TRANSACTIONS,
  );

  // ============================================================
  // カード請求設定
  //
  // M_Accountsはここで1回だけ読む。
  // ============================================================

  const billingSettingsMap = buildAccountBillingSettingsMap_();

  // ============================================================
  // 未照合カード明細を
  //
  // カード口座
  // +
  // 請求年月
  //
  // ごとに集計する。
  //
  // Map構造：
  //
  // cardBillingMonthTotals
  //
  // 三井住友カードOlive
  //   ├ 2026-09 → 18240
  //   └ 2026-10 → 14240
  //
  // ============================================================

  const cardBillingMonthTotals = new Map();

  for (const row of transactionTable.rows) {
    // ==========================================================
    // ignoredはカード請求予定に含めない
    // ==========================================================

    if (isIgnoredTransactionRow_(row, transactionTable.index)) {
      continue;
    }

    const sourceType = getString(row, transactionTable.index, "source_type");

    // クレジットカードCSV明細のみ
    if (sourceType !== "CSV_クレカ") {
      continue;
    }

    // ----------------------------------------------------------
    // カード口座
    // ----------------------------------------------------------

    const cardAccount = resolveCanonicalAccountName_(
      getString(row, transactionTable.index, "account_name"),
    );

    if (!cardAccount) {
      continue;
    }

    // ----------------------------------------------------------
    // 既に照合済みの明細は未払請求から除外
    // ----------------------------------------------------------

    const settlementStatus = getString(
      row,
      transactionTable.index,
      "settlement_status",
    );

    const settlementId = getString(
      row,
      transactionTable.index,
      "settlement_id",
    );

    if (
      settlementStatus === "matched" ||
      settlementStatus === "manual_matched" ||
      settlementId
    ) {
      continue;
    }

    // ----------------------------------------------------------
    // 利用日
    // ----------------------------------------------------------

    const transactionDate = formatApiDate_(
      row[transactionTable.index["transaction_date"]],
    );

    if (!transactionDate) {
      continue;
    }

    // ----------------------------------------------------------
    // 遅延損害金判定
    //
    // Settlementと同じ仕様。
    // ----------------------------------------------------------

    const merchant = getString(row, transactionTable.index, "merchant")
      .normalize("NFKC")
      .trim();

    const itemName = getString(row, transactionTable.index, "item_name")
      .normalize("NFKC")
      .trim();

    const note = getString(row, transactionTable.index, "note")
      .normalize("NFKC")
      .trim();

    const isLateFee =
      merchant.includes("遅延損害金") ||
      itemName.includes("遅延損害金") ||
      note.includes("遅延損害金");

    // ----------------------------------------------------------
    // 請求年月
    // ----------------------------------------------------------

    let billingYearMonth = "";

    if (isLateFee) {
      // 遅延損害金は利用日の年月をそのまま請求月にする
      billingYearMonth = transactionDate.substring(0, 7);
    } else {
      billingYearMonth = calculateBillingYearMonthFromSettings_(
        transactionDate,
        cardAccount,
        billingSettingsMap,
      );
    }

    if (!billingYearMonth) {
      continue;
    }

    // ----------------------------------------------------------
    // 金額
    // ----------------------------------------------------------

    const amount = getNumber(row, transactionTable.index, "amount");

    if (amount <= 0) {
      continue;
    }

    // ----------------------------------------------------------
    // カード × 請求月 で集計
    // ----------------------------------------------------------

    if (!cardBillingMonthTotals.has(cardAccount)) {
      cardBillingMonthTotals.set(cardAccount, new Map());
    }

    const monthMap = cardBillingMonthTotals.get(cardAccount);

    const currentAmount = Number(monthMap.get(billingYearMonth) || 0);

    monthMap.set(billingYearMonth, currentAmount + amount);
  }

  // ============================================================
  // 各カードの「次回請求」を作る
  //
  // 未照合の請求年月のうち
  // 最も古いものを次回請求とする。
  // ============================================================

  const cardBillingSummaryMap = new Map();

  for (const [cardAccount, monthMap] of cardBillingMonthTotals.entries()) {
    const billingMonths = Array.from(monthMap.keys()).sort();

    if (billingMonths.length === 0) {
      continue;
    }

    const nextBillingYearMonth = billingMonths[0];

    const nextBillingAmount = Number(monthMap.get(nextBillingYearMonth) || 0);

    cardBillingSummaryMap.set(cardAccount, {
      nextBillingYearMonth,
      nextBillingAmount,
    });
  }

  // ============================================================
  // 口座残高計算
  // ============================================================

  const items = accounts.map((account) => {
    let currentBalance = Number(account.openingBalance || 0);

    const openingDate = String(account.openingBalanceDate || "").trim();

    const accountName = resolveCanonicalAccountName_(account.accountName);

    const isAsset = account.isAsset === true;

    const isLiability = account.isLiability === true;

    // ----------------------------------------------------------
    // 現在残高
    // ----------------------------------------------------------

    for (const row of transactionTable.rows) {
      // ========================================================
      // ignoredは口座残高に反映しない
      // ========================================================

      if (isIgnoredTransactionRow_(row, transactionTable.index)) {
        continue;
      }

      const transactionDate = formatApiDate_(
        row[transactionTable.index["transaction_date"]],
      );

      // 基準日より前の取引は使わない
      if (openingDate && transactionDate && transactionDate <= openingDate) {
        continue;
      }

      const type = getString(row, transactionTable.index, "type");

      const amount = getNumber(row, transactionTable.index, "amount");

      const rowAccount = resolveCanonicalAccountName_(
        getString(row, transactionTable.index, "account_name"),
      );

      const fromAccount = resolveCanonicalAccountName_(
        getString(row, transactionTable.index, "from_account"),
      );

      const toAccount = resolveCanonicalAccountName_(
        getString(row, transactionTable.index, "to_account"),
      );

      // --------------------------------------------------------
      // 収入
      // --------------------------------------------------------

      if (type === "収入") {
        if (rowAccount === accountName) {
          if (isLiability) {
            currentBalance -= amount;
          } else {
            currentBalance += amount;
          }
        }

        continue;
      }

      // --------------------------------------------------------
      // 支出
      // --------------------------------------------------------

      if (type === "支出") {
        if (rowAccount === accountName) {
          if (isLiability) {
            currentBalance += amount;
          } else {
            currentBalance -= amount;
          }
        }

        continue;
      }

      // --------------------------------------------------------
      // 移動 / 振替
      // --------------------------------------------------------

      if (type === "移動" || type === "振替") {
        if (fromAccount === accountName) {
          if (isLiability) {
            currentBalance += amount;
          } else {
            currentBalance -= amount;
          }
        }

        if (toAccount === accountName) {
          if (isLiability) {
            currentBalance -= amount;
          } else {
            currentBalance += amount;
          }
        }
      }
    }

    // ==========================================================
    // クレジットカード請求情報
    // ==========================================================

    const billingSummary = cardBillingSummaryMap.get(accountName);

    const nextBillingYearMonth =
      isLiability && billingSummary ? billingSummary.nextBillingYearMonth : "";

    const nextBillingAmount =
      isLiability && billingSummary
        ? Number(billingSummary.nextBillingAmount || 0)
        : 0;

    /*
     * 現在のカード負債残高から
     * 次回請求分を除いた残り。
     *
     * 手動照合時は銀行側の実引落額を正としているため、
     * 明細全体を再集計せずcurrentBalanceを基準にする。
     */
    const laterBillingAmount = isLiability
      ? Math.max(0, currentBalance - nextBillingAmount)
      : 0;

    return {
      ...account,

      currentBalance,

      nextBillingYearMonth,

      nextBillingAmount,

      laterBillingAmount,
    };
  });

  return buildAccountBalanceResult_(items);
}

function buildAccountBalanceResult_(items) {
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const account of items) {
    const balance = Number(account.currentBalance || 0);

    if (account.isAsset) {
      totalAssets += balance;
    }

    if (account.isLiability) {
      totalLiabilities += balance;
    }
  }

  return {
    items,
    totalAssets,
    totalLiabilities,
    netAssets: totalAssets - totalLiabilities,
  };
}

function updateAccountOpeningBalanceFromApp_(data) {
  const accountId = String(data.accountId || "").trim();

  const openingBalanceValue = data.openingBalance;

  const openingBalanceDate = String(data.openingBalanceDate || "").trim();

  if (!accountId) {
    throw new Error("accountIdは必須です");
  }

  if (
    openingBalanceValue === null ||
    openingBalanceValue === undefined ||
    openingBalanceValue === ""
  ) {
    throw new Error("openingBalanceは必須です");
  }

  const openingBalance = Number(openingBalanceValue);

  if (!Number.isFinite(openingBalance)) {
    throw new Error("openingBalanceが不正です");
  }

  if (!openingBalanceDate) {
    throw new Error("openingBalanceDateは必須です");
  }

  const sheet = getRequiredSheet(SHEETS.ACCOUNTS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("口座データがありません");
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    ["account_id", "opening_balance", "opening_balance_date"],
    SHEETS.ACCOUNTS,
  );

  let targetRow = -1;

  for (let i = 1; i < values.length; i++) {
    const rowAccountId = String(values[i][index["account_id"]] || "").trim();

    if (rowAccountId === accountId) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) {
    throw new Error("対象の口座が見つかりません");
  }

  sheet
    .getRange(targetRow, index["opening_balance"] + 1)
    .setValue(openingBalance);

  sheet
    .getRange(targetRow, index["opening_balance_date"] + 1)
    .setValue(openingBalanceDate);

  clearTableCache(SHEETS.ACCOUNTS);

  clearAccountBalanceCache_();

  return createJsonResponse_(
    {
      updated: true,
      accountId,
      openingBalance,
      openingBalanceDate,
    },
    "ok",
  );
}

function getAccountBillingSettings_(rawAccountName) {
  const accountName = resolveCanonicalAccountName_(rawAccountName);

  if (!accountName) {
    return null;
  }

  const rows = loadObjects(SHEETS.ACCOUNTS);

  const row = rows.find((item) => {
    return String(item.account_name || "").trim() === accountName;
  });

  if (!row) {
    return null;
  }

  const closingDay = Number(row.closing_day || 0);

  const paymentDay = Number(row.payment_day || 0);

  const paymentMonthOffset = Number(row.payment_month_offset || 0);

  if (
    !Number.isInteger(closingDay) ||
    closingDay <= 0 ||
    !Number.isInteger(paymentDay) ||
    paymentDay <= 0
  ) {
    return null;
  }

  return {
    accountName,
    closingDay,
    paymentDay,
    paymentMonthOffset,
  };
}

function calculateBillingYearMonth_(transactionDate, rawAccountName) {
  const settings = getAccountBillingSettings_(rawAccountName);

  if (!settings) {
    return "";
  }

  const text = normalizeImportDate_(transactionDate);

  if (!text) {
    return "";
  }

  const [year, month, day] = text.split("-").map(Number);

  let closingYear = year;
  let closingMonth = month;

  // 月末締め
  if (settings.closingDay === 31) {
    // その利用月の締めに入る
  } else if (day > settings.closingDay) {
    // 締め日を過ぎていたら次回締め
    closingMonth++;

    if (closingMonth > 12) {
      closingMonth = 1;
      closingYear++;
    }
  }

  let billingMonth = closingMonth + settings.paymentMonthOffset;

  let billingYear = closingYear;

  while (billingMonth > 12) {
    billingMonth -= 12;
    billingYear++;
  }

  return `${billingYear}-` + String(billingMonth).padStart(2, "0");
}

function getImportBillingYearMonths_(rows, config) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  if (String(config.source_type || "").trim() !== "CSV_クレカ") {
    return [];
  }

  const accountName = String(config.account_name || "").trim();

  if (!accountName) {
    return [];
  }

  const billingMonths = new Set();

  for (const row of rows) {
    const keys = Object.keys(row);

    const dateKey = keys[Number(config.date_col) - 1];

    if (!dateKey) {
      continue;
    }

    const billingYearMonth = calculateBillingYearMonth_(
      row[dateKey],
      accountName,
    );

    if (billingYearMonth) {
      billingMonths.add(billingYearMonth);
    }
  }

  return Array.from(billingMonths).sort();
}

// ============================================================
// Account Balance Cache / Public Access
// ============================================================

function getAccountBalancesData() {
  const cache = CacheService.getScriptCache();

  const cached = cache.get(ACCOUNT_BALANCE_CACHE_KEY);

  if (cached) {
    return JSON.parse(cached);
  }

  const result = getAccountBalancesData_();

  cache.put(ACCOUNT_BALANCE_CACHE_KEY, JSON.stringify(result), 21600);

  return result;
}

function clearAccountBalanceCache_() {
  CacheService.getScriptCache().remove(ACCOUNT_BALANCE_CACHE_KEY);
}

