function resetTransactionsForProduction() {
  const transactionSheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const lastRow = transactionSheet.getLastRow();

  const lastColumn = transactionSheet.getLastColumn();

  if (lastRow > 1) {
    transactionSheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
  }

  clearTableCache(SHEETS.TRANSACTIONS);

  clearGeneratedSheetRows_(SHEETS.REVIEW_QUEUE);

  clearGeneratedSheetRows_(SHEETS.REVIEW_SUMMARY);

  clearGeneratedSheetRows_(SHEETS.BULK_REVIEW);

  clearGeneratedSheetRows_(SHEETS.RECURRING_CANDIDATES);

  clearGeneratedSheetRows_(SHEETS.MONTHLY_SUMMARY);

  clearGeneratedSheetRows_(SHEETS.CATEGORY_SUMMARY);

  clearGeneratedSheetRows_(SHEETS.ANALYTICS);

  clearGeneratedSheetRows_(SHEETS.HOME);

  clearGeneratedSheetRows_(SHEETS.DASHBOARD);

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
  rebuildReviewQueue();
  rebuildReviewSummary();
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
function deleteFailedOliveImport20260825() {
  const targetImportBatch = "20260825_171712";

  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    Logger.log("Transactionsにデータがありません");
    return;
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    ["import_batch", "source_type"],
    SHEETS.TRANSACTIONS,
  );

  const deleteRowNumbers = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const importBatch = String(row[index["import_batch"]] || "").trim();

    const sourceType = String(row[index["source_type"]] || "").trim();

    if (importBatch === targetImportBatch && sourceType === "CSV_クレカ") {
      /*
       * 配列indexは0始まり、
       * Sheets行番号は1始まり。
       */
      deleteRowNumbers.push(i + 1);
    }
  }

  Logger.log(`削除対象: ${deleteRowNumbers.length}件`);

  /*
   * 下から消す。
   *
   * 上から消すと行番号がずれてしまうため。
   */
  for (let i = deleteRowNumbers.length - 1; i >= 0; i--) {
    sheet.deleteRow(deleteRowNumbers[i]);
  }

  clearTableCache(SHEETS.TRANSACTIONS);

  clearAccountBalanceCache_();

  clearHomeRecentTransactionsCache_();

  Logger.log(`削除完了: ${deleteRowNumbers.length}件`);
}
