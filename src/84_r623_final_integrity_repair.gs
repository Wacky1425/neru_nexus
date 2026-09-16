// ============================================================
// R6.23 - Final integrity repair
// Repairs category IDs after R6 normalization and verifies all R6 gates.
// ============================================================

function repairR623FinalIntegrity() {
  Logger.log('=== R6.23 最終整合性修復 ===');
  const before = verifyV201CategoryIds();
  const categoryRepair = repairV201CategoryIdMismatches();
  const after = verifyV201CategoryIds();
  const r6 = getR6FullReconciliationData_();

  const result = {
    ready: after.ready === true && r6.readyForDailyUse === true,
    categoryBefore: before,
    categoryRepair: {
      repairedCount: Number(categoryRepair.repairedCount || 0),
      unresolvedByNameCount: Number(categoryRepair.unresolvedByNameCount || 0)
    },
    categoryAfter: after,
    r6ReadyForDailyUse: r6.readyForDailyUse === true,
    r6Score: Number(r6.score || 0),
    r6Warnings: r6.warnings || [],
    r6Blockers: r6.blockers || [],
    r6Summary: r6.summary || null
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyR623FinalIntegrity() {
  Logger.log('=== R6.23 最終検証 ===');
  const category = verifyV201CategoryIds();
  const r6 = getR6FullReconciliationData_();
  const result = {
    ready: category.ready === true && r6.readyForDailyUse === true,
    category: category,
    r6ReadyForDailyUse: r6.readyForDailyUse === true,
    r6Score: Number(r6.score || 0),
    r6Warnings: r6.warnings || [],
    r6Blockers: r6.blockers || [],
    r6Summary: r6.summary || null
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
