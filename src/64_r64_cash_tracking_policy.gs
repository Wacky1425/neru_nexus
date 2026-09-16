// ============================================================
// Neru Nexus R6.4 - untracked cash policy
// ============================================================

function verifyR64CashTrackingPolicy() {
  const result = getR6FullReconciliationData_();
  const cashItem = (result.balanceItems || []).find(function(item) {
    return String(item.accountId || "").trim().toLowerCase() === "cash";
  });
  const output = {
    ready: !!cashItem && cashItem.reconciliationRequired === false && cashItem.reconciliationPolicy === "cash_expense_on_withdrawal",
    policy: {
      accountId: "cash",
      trackedAsAsset: false,
      balanceReconciliationRequired: false,
      expenseRecognition: "ATM等で現金を引き出した時点で原則支出として計上",
      laterCorrection: "必要な場合は元の出金取引を分割・再分類し、追加支出は作らない",
    },
    cashItem: cashItem || null,
    r6: {
      readyForDailyUse: result.readyForDailyUse,
      score: result.score,
      blockers: result.blockers,
      warnings: result.warnings,
    },
  };
  Logger.log("=== R6.4 現金 非追跡ポリシー ===");
  Logger.log(JSON.stringify(output, null, 2));
  return output;
}
