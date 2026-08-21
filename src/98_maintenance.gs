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
