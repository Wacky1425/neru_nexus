function rebuildAnalytics() {

  rebuildCategoryTable();

  rebuildMonthlyTable();

  rebuildWalletTable();

  rebuildIntentTable();

}

function rebuildWalletTable() {
  const analytics = getRequiredSheet("analytics");

  analytics
    .getRange("G3:H1000")
    .clearContent();

  analytics
    .getRange("G3:H3")
    .setValues([["Wallet", "金額"]]);

  const result = summarizeTransactionsByField(
    getLatestBudgetMonth(),
    "wallet",
    {
      type: "支出",
      skipBlank: true
    }
  );

  if (result.length === 0) {
    return;
  }

  analytics
    .getRange(4, 7, result.length, 2)
    .setValues(result);
}

function rebuildIntentTable() {
  const analytics = getRequiredSheet("analytics");

  analytics
    .getRange("J3:K1000")
    .clearContent();

  analytics
    .getRange("J3:K3")
    .setValues([["Intent", "金額"]]);

  const result = summarizeTransactionsByField(
    getLatestBudgetMonth(),
    "intent",
    {
      type: "支出",
      skipBlank: false
    }
  );

  if (result.length === 0) {
    return;
  }

  analytics
    .getRange(4, 10, result.length, 2)
    .setValues(result);
}