function resetTransactionsForProduction() {
  const transactionSheet = getRequiredSheet(
    SHEETS.TRANSACTIONS
  );

  const lastRow =
    transactionSheet.getLastRow();

  const lastColumn =
    transactionSheet.getLastColumn();

  if (lastRow > 1) {
    transactionSheet
      .getRange(
        2,
        1,
        lastRow - 1,
        lastColumn
      )
      .clearContent();
  }

  clearTableCache(
    SHEETS.TRANSACTIONS
  );

  clearGeneratedSheetRows_(
    SHEETS.REVIEW_QUEUE
  );

  clearGeneratedSheetRows_(
    SHEETS.REVIEW_SUMMARY
  );

  clearGeneratedSheetRows_(
    SHEETS.BULK_REVIEW
  );

  clearGeneratedSheetRows_(
    SHEETS.RECURRING_CANDIDATES
  );

  clearGeneratedSheetRows_(
    SHEETS.MONTHLY_SUMMARY
  );

  clearGeneratedSheetRows_(
    SHEETS.CATEGORY_SUMMARY
  );

  clearGeneratedSheetRows_(
    SHEETS.ANALYTICS
  );

  clearGeneratedSheetRows_(
    SHEETS.HOME
  );

  clearGeneratedSheetRows_(
    SHEETS.DASHBOARD
  );

  rebuildAllViews();

  Logger.log(
    "本番取引データを初期化しました"
  );
}

function clearGeneratedSheetRows_(
  sheetName
) {
  const sheet =
    SS.getSheetByName(sheetName);

  if (!sheet) {
    return;
  }

  const lastRow = sheet.getLastRow();
  const lastColumn =
    sheet.getLastColumn();

  if (lastRow > 1) {
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        lastColumn
      )
      .clearContent();
  }

  clearTableCache(sheetName);
}