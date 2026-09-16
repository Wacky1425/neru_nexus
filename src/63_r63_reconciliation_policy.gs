// ============================================================
// Neru Nexus R6.3 - account-type reconciliation policy
// ============================================================

function verifyR63ReconciliationPolicy() {
  const result = getR6FullReconciliationData_();
  const items = result.balanceItems || [];
  const required = items.filter(function(item) { return item.reconciliationRequired !== false; });
  const excluded = items.filter(function(item) { return item.reconciliationRequired === false; });
  const output = {
    ready: true,
    policy: {
      balance: "cash/other: 実残高との残高照合を必須",
      liability: "クレジットカード等: 残高照合から除外しカード照合で検証",
      investment: "証券等: 残高照合から除外し投資評価基盤で検証",
      untrackedCash: "現金: 財布残高は追跡せず、ATM出金時点で原則支出として扱う",
    },
    requiredCount: required.length,
    excludedCount: excluded.length,
    required: required.map(function(item) {
      return {
        accountId: item.accountId,
        accountName: item.accountName,
        assetType: item.assetType,
        checked: item.checked,
        matched: item.matched,
        difference: item.difference,
      };
    }),
    excluded: excluded.map(function(item) {
      return {
        accountId: item.accountId,
        accountName: item.accountName,
        assetType: item.assetType,
        policy: item.reconciliationPolicy,
      };
    }),
    r6: {
      readyForDailyUse: result.readyForDailyUse,
      score: result.score,
      blockers: result.blockers,
      warnings: result.warnings,
    },
  };
  Logger.log("=== R6.3 口座種別別 照合ルール ===");
  Logger.log(JSON.stringify(output, null, 2));
  return output;
}
