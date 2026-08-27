function resetTransactionsForProduction() {
  const transactionSheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const lastRow = transactionSheet.getLastRow();

  const lastColumn = transactionSheet.getLastColumn();

  if (lastRow > 1) {
    transactionSheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
  }

  clearTableCache(SHEETS.TRANSACTIONS);

  clearGeneratedSheetRows_(SHEETS.RECURRING_CANDIDATES);

  clearGeneratedSheetRows_(SHEETS.MONTHLY_SUMMARY);

  clearGeneratedSheetRows_(SHEETS.CATEGORY_SUMMARY);
  rebuildAllViews();

  Logger.log("本番取引データを初期化しました");
}

function clearGeneratedSheetRows_(sheetName) {
  const sheet = SS.getSheetByName(sheetName);

  if (!sheet) {
    return;
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
  }

  clearTableCache(sheetName);
}

function resetTransactionDataForReimport() {
  // ============================================================
  // 1. T_Transactions をヘッダー以外すべて削除
  // ============================================================
  const transactionSheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const transactionLastRow = transactionSheet.getLastRow();

  if (transactionLastRow > 1) {
    transactionSheet
      .getRange(2, 1, transactionLastRow - 1, transactionSheet.getLastColumn())
      .clearContent();
  }

  // ============================================================
  // 2. 取込履歴もリセット
  //
  // 全CSVを入れ直すので履歴も作り直す。
  // M_ImportConfig等の設定は消さない。
  // ============================================================
  const importHistorySheet = getRequiredSheet(SHEETS.IMPORT_HISTORY);

  const importHistoryLastRow = importHistorySheet.getLastRow();

  if (importHistoryLastRow > 1) {
    importHistorySheet
      .getRange(
        2,
        1,
        importHistoryLastRow - 1,
        importHistorySheet.getLastColumn(),
      )
      .clearContent();
  }

  // ============================================================
  // 3. キャッシュクリア
  // ============================================================
  clearTableCache(SHEETS.TRANSACTIONS);
  clearTableCache(SHEETS.IMPORT_HISTORY);

  clearAccountBalanceCache_();
  clearHomeRecentTransactionsCache_();

  // ============================================================
  // 4. 派生データを空のTransactionsから再構築
  //
  // settlement情報はT_Transactions内に持っているので、
  // Transactionsを消せば古い紐付けも一緒に消える。
  // ============================================================
  rebuildAllViews();

  Logger.log(
    "取引系データのリセット完了。M_Rules / M_Categories / M_Accounts / M_ImportConfig は保持されています。",
  );
}

/**
 * 今回誤って取り込んだOlive CSV分だけ削除する。
 *
 * 対象：
 * import_batch = 20260825_171712
 * source_type  = CSV_クレカ
 *
 * 他の過去取引は触らない。
 */
// ============================================================
// Transaction maintenance / diagnostics
// ============================================================

function reclassifyAllTransactions() {
  const txSheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const rules = getRules();

  const values = txSheet.getDataRange().getValues();

  if (values.length < 2) {
    return;
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    [
      "merchant",
      "item_name",
      "note",
      "amount",
      "type",
      "major_category",
      "sub_category",
      "purpose_type",
      "expense_ratio",
      "expense_amount",
      "status",
      "wallet",
      "intent",
    ],
    SHEETS.TRANSACTIONS,
  );

  let updatedCount = 0;

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex];

    const transaction = {
      merchant: row[index["merchant"]] || "",
      item_name: row[index["item_name"]] || "",
      note: row[index["note"]] || "",
    };

    const classified = classifyTransaction(transaction, rules);
    const amount = Number(row[index["amount"]] || 0);
    const expenseRatio = Number(classified.expense_ratio || 0);

    row[index["type"]] = classified.type;
    row[index["major_category"]] = classified.major_category;
    row[index["sub_category"]] = classified.sub_category;
    row[index["purpose_type"]] = classified.purpose_type;
    row[index["expense_ratio"]] = expenseRatio;
    row[index["expense_amount"]] = amount * expenseRatio;
    row[index["status"]] = classified.status;
    row[index["wallet"]] = classified.wallet || "生活";
    row[index["intent"]] = classified.intent || "その他";

    updatedCount++;
  }

  txSheet
    .getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));

  Logger.log(`再分類完了: ${updatedCount}件`);
}

function normalizeAllTransactions() {
  const sheet = SS.getSheetByName(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => (idx[h] = i));

  for (let i = 1; i < values.length; i++) {
    const merchant = values[i][idx["merchant"]];
    values[i][idx["merchant"]] = normalizeMerchant(merchant);
  }

  sheet
    .getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));
}

function normalizeAllTransactionsWithAlias() {
  const sheet = SS.getSheetByName(SHEETS.TRANSACTIONS);
  const aliasMap = loadMerchantAliases();

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => (idx[h] = i));

  for (let i = 1; i < values.length; i++) {
    let merchant = values[i][idx["merchant"]];

    merchant = normalizeMerchant(merchant);
    merchant = applyMerchantAlias(merchant, aliasMap);

    values[i][idx["merchant"]] = merchant;
  }

  sheet
    .getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));
}

function buildMerchantFrequencyMap() {
  const sheet = SS.getSheetByName(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return {};

  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => (idx[h] = i));

  const map = {};

  for (const row of values.slice(1)) {
    const merchant = String(row[idx["merchant"]] || "").trim();
    if (!merchant) continue;

    map[merchant] = (map[merchant] || 0) + 1;
  }

  return map;
}

function validateTransactionAccounts() {
  const txSheet = SS.getSheetByName(SHEETS.TRANSACTIONS);
  const accountSheet = SS.getSheetByName(SHEETS.ACCOUNTS);

  if (!txSheet) {
    throw new Error("transactions シートがありません");
  }

  if (!accountSheet) {
    throw new Error("accounts シートがありません");
  }

  const txValues = txSheet.getDataRange().getValues();
  const accountValues = accountSheet.getDataRange().getValues();

  if (txValues.length < 2) {
    Logger.log("transactions にデータがありません");
    return;
  }

  if (accountValues.length < 2) {
    throw new Error("accounts にデータがありません");
  }

  const txHeaders = txValues[0];
  const txIdx = {};
  txHeaders.forEach((h, i) => {
    txIdx[String(h).trim()] = i;
  });

  if (txIdx["account_name"] === undefined) {
    throw new Error("transactions に account_name 列がありません");
  }

  const accountHeaders = accountValues[0];
  const accountIdx = {};
  accountHeaders.forEach((h, i) => {
    accountIdx[String(h).trim()] = i;
  });

  if (accountIdx["account_name"] === undefined) {
    throw new Error("accounts に account_name 列がありません");
  }

  const validAccounts = new Set();

  for (const row of accountValues.slice(1)) {
    const accountName = String(row[accountIdx["account_name"]] || "").trim();

    if (accountName) {
      validAccounts.add(accountName);
    }
  }

  const unknownMap = new Map();

  for (const row of txValues.slice(1)) {
    const accountName = String(row[txIdx["account_name"]] || "").trim();

    if (!accountName) {
      unknownMap.set("(空欄)", (unknownMap.get("(空欄)") || 0) + 1);
      continue;
    }

    if (!validAccounts.has(accountName)) {
      unknownMap.set(accountName, (unknownMap.get(accountName) || 0) + 1);
    }
  }

  if (unknownMap.size === 0) {
    Logger.log("全ての account_name が accounts マスタに登録されています");
    return;
  }

  Logger.log("未登録の account_name:");

  for (const [accountName, count] of unknownMap.entries()) {
    Logger.log(`${accountName}: ${count}件`);
  }

  throw new Error(`未登録の account_name が ${unknownMap.size}種類あります`);
}

// ============================================================
// PayPay legacy reclassification maintenance
// ============================================================

// ============================================================
// Neru Nexus - PayPay既存取引 再分類メンテナンス
//
// 目的:
//   過去にCSV_PayPayとして取り込んだ取引を、現在のPayPay分類仕様で
//   一括再分類する。
//
// 対象:
//   source_type === "CSV_PayPay"
//
// 主な修正:
//   ・通常の「支払い」       → 支出
//   ・ポイント併用支払い     → 支出（商品総額）
//   ・チャージ               → 銀行 → PayPay の移動
//   ・送った金額             → 確定ルール優先、未確定なら支出
//   ・受け取った金額         → 確定ルール優先、未確定なら収入
//
// 注意:
//   ポイント獲得・ポイント運用・期限切れ等の行は、
//   既に削除済み/今後のCSV取込で除外される前提。
// ============================================================

function reclassifyExistingPayPayTransactions() {
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    Logger.log("PayPay再分類: 取引データなし");
    return;
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    [
      "transaction_date",
      "source_type",
      "merchant",
      "item_name",
      "amount",
      "note",
      "raw_text",
      "type",
      "major_category",
      "sub_category",
      "purpose_type",
      "expense_ratio",
      "status",
      "wallet",
      "intent",
      "account_name",
      "from_account",
      "to_account",
      "settlement_status",
      "settlement_id",
    ],
    SHEETS.TRANSACTIONS,
  );

  const rules = getRules();

  let changedCount = 0;
  let paymentCount = 0;
  let chargeCount = 0;
  let sentCount = 0;
  let receivedCount = 0;
  let otherCount = 0;

  const changedMonths = new Set();

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const sourceType = String(row[index["source_type"]] || "").trim();

    if (sourceType !== "CSV_PayPay") {
      continue;
    }

    const merchant = String(row[index["merchant"]] || "").trim();
    const itemName = String(row[index["item_name"]] || "").trim();
    const note = String(row[index["note"]] || "").trim();
    const rawText = String(row[index["raw_text"]] || "").trim();
    const amount = Number(row[index["amount"]] || 0);
    const accountName = String(row[index["account_name"]] || "").trim();

    const normalizedItem = itemName.normalize("NFKC").trim();

    /*
     * 既存T_Transactionsには元CSVの「取引内容」列そのものはないため、
     * item_nameの先頭から取引種別を復元する。
     */
    const isPayment = normalizedItem.startsWith("支払い");
    const isCharge = normalizedItem.startsWith("チャージ");
    const isSent = normalizedItem.startsWith("送った金額");
    const isReceived = normalizedItem.startsWith("受け取った金額");

    const txBaseForRule = {
      merchant,
      item_name: itemName,
      // ポイント併用支払いの誤分類を避けるため、
      // PayPay分類では取引方法(note)をルール判定から外す
      note: "",
    };

    const classified = classifyTransaction(txBaseForRule, rules);
    const isRuleConfirmed = String(classified.status || "").trim() === "確定";

    let next = {
      ...classified,
    };

    if (isPayment) {
      next.type = "支出";
      paymentCount++;
    } else if (isCharge) {
      next = {
        ...classified,
        type: "移動",
        major_category: "移動",
        sub_category: "電子マネーチャージ",
        purpose_type: "私用",
        expense_ratio: 0,
        status: "確定",
        wallet: "生活",
        intent: "移動",
      };
      chargeCount++;
    } else if (isReceived) {
      if (!isRuleConfirmed) {
        next.type = "収入";
      }
      receivedCount++;
    } else if (isSent) {
      if (!isRuleConfirmed) {
        next.type = "支出";
      }
      sentCount++;
    } else {
      /*
       * 想定外のPayPay行。
       * 既存分類を大きく壊さないよう、確定ルールがあれば採用し、
       * なければ現在のtypeを維持する。
       */
      if (!isRuleConfirmed) {
        next.type = String(row[index["type"]] || "").trim() || "支出";
      }

      otherCount++;

      Logger.log(
        [
          "【PayPayその他】",
          `日付=${row[index["transaction_date"]]}`,
          `内容=${itemName}`,
          `取引先=${merchant}`,
          `金額=${amount}`,
          `取引方法=${note}`,
          `raw=${rawText}`,
        ].join(" / "),
      );
    }

    row[index["type"]] = next.type || "";
    row[index["major_category"]] = next.major_category || "";
    row[index["sub_category"]] = next.sub_category || "";
    row[index["purpose_type"]] = next.purpose_type || "私用";
    row[index["expense_ratio"]] = Number(next.expense_ratio || 0);
    row[index["status"]] = next.status || "要確認";
    row[index["wallet"]] = next.wallet || "生活";
    row[index["intent"]] = next.intent || "その他";

    // transfer metadataを再構築
    const txForTransfer = {
      source_type: sourceType,
      account_name: accountName,
      merchant,
      item_name: itemName,
      note,
      raw_text: rawText,
      type: row[index["type"]],
      sub_category: row[index["sub_category"]],
      from_account: "",
      to_account: "",
      settlement_status: "",
      settlement_id: "",
    };

    applyTransferMetadata_(txForTransfer);

    row[index["from_account"]] = txForTransfer.from_account || "";
    row[index["to_account"]] = txForTransfer.to_account || "";
    row[index["settlement_status"]] = txForTransfer.settlement_status || "";
    row[index["settlement_id"]] = txForTransfer.settlement_id || "";

    const yearMonth = normalizeYearMonth(row[index["transaction_date"]]);

    if (yearMonth) {
      changedMonths.add(yearMonth);
    }

    changedCount++;
  }

  if (changedCount === 0) {
    Logger.log("PayPay再分類: 対象なし");
    return;
  }

  sheet
    .getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));

  for (const yearMonth of changedMonths) {
    markSummaryDirty_(yearMonth);
  }

  clearTableCache(SHEETS.TRANSACTIONS);
  clearAccountBalanceCache_();
  clearHomeRecentTransactionsCache_();

  // Summary / Viewを最新状態にする
  rebuildAllViews();

  Logger.log(
    [
      `PayPay再分類完了: ${changedCount}件`,
      `支払い=${paymentCount}`,
      `チャージ=${chargeCount}`,
      `送金=${sentCount}`,
      `受取=${receivedCount}`,
      `その他=${otherCount}`,
    ].join(" / "),
  );
}

// Legacy one-time spreadsheet cleanup migrations (Cleanup 1-6) were retired on 2026-08-27 after the post-cleanup workbook became the canonical source.
