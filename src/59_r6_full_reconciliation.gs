// ============================================================
// Neru Nexus R6 - full data reconciliation / go-live audit
// ============================================================

function getR6FullReconciliationData_() {
  const integrity = runDataIntegrityCheck_();
  const categoryIds = verifyV201CategoryIds();
  const accountIds = verifyV202AccountIds();
  const r2All = getR2BalanceReconciliationData_();
  // R6.3: 残高照合は「その時点の残高を直接確認できる口座」だけを必須対象にする。
  // クレジットカード(liability)はカード照合、証券(investment)は投資評価基盤で検証する。
  const r2Items = (r2All.items || []).map((item) => {
    const type = String(item.assetType || "").trim().toLowerCase();
    const accountId = String(item.accountId || "").trim().toLowerCase();
    const isUntrackedCash = accountId === "cash";
    const reconciliationRequired = type !== "liability" && type !== "investment" && !isUntrackedCash;
    const reconciliationPolicy = type === "liability"
      ? "card_settlement"
      : type === "investment"
        ? "investment_valuation"
        : isUntrackedCash
          ? "cash_expense_on_withdrawal"
          : "balance";
    return Object.assign({}, item, { reconciliationRequired, reconciliationPolicy });
  });
  const requiredBalanceItems = r2Items.filter((item) => item.reconciliationRequired);
  const r2 = {
    items: r2Items,
    totalCount: requiredBalanceItems.length,
    allAccountCount: r2Items.length,
    excludedCount: r2Items.length - requiredBalanceItems.length,
    baselineReadyCount: requiredBalanceItems.filter((item) => item.baselineReady).length,
    baselinePendingCount: requiredBalanceItems.filter((item) => !item.baselineReady).length,
    checkedCount: requiredBalanceItems.filter((item) => item.latestReconciliation).length,
    uncheckedCount: requiredBalanceItems.filter((item) => !item.latestReconciliation).length,
    matchedCount: requiredBalanceItems.filter((item) => item.latestReconciliation && item.latestReconciliation.matched).length,
    mismatchCount: requiredBalanceItems.filter((item) => item.latestReconciliation && !item.latestReconciliation.matched).length,
  };
  const r3 = getR3TransferNormalizationReport_();
  const reviewCountResult = getReviewTransactionCount();
  const reviewCount = Number((reviewCountResult && reviewCountResult.count) || 0);
  const imports = getImportHistoryData_({ limit: 200 });
  const settlement = getSettlementStatusesData_();

  const txSheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const transactionCount = Math.max(0, txSheet.getLastRow() - 1);
  const importCount = Array.isArray(imports.items) ? imports.items.length : 0;
  const importConfigCount = Array.isArray(imports.configs) ? imports.configs.length : 0;
  const settlementSummary = settlement && settlement.summary ? settlement.summary : {};
  const settlementReviewCount = Number(settlementSummary.reviewCount || 0);
  const settlementPendingCount = Number(settlementSummary.pendingCount || 0);

  const blockers = [];
  const warnings = [];
  const infos = [];
  const passes = [];

  function addPass_(code, title, detail) {
    passes.push({ code, title, detail: String(detail || '') });
  }
  function addWarning_(code, title, detail) {
    warnings.push({ code, title, detail: String(detail || '') });
  }
  function addBlocker_(code, title, detail) {
    blockers.push({ code, title, detail: String(detail || '') });
  }
  function addInfo_(code, title, detail) {
    infos.push({ code, title, detail: String(detail || '') });
  }

  if (integrity.ok) {
    addPass_('integrity', 'データ整合性', '基本整合性チェックOK');
  } else {
    addBlocker_('integrity', 'データ整合性エラー', (integrity.errors || []).join(' / '));
  }

  if (categoryIds.ready) {
    addPass_('category_ids', 'カテゴリID', '全取引のカテゴリID整合性OK');
  } else {
    addBlocker_('category_ids', 'カテゴリID不整合', JSON.stringify(categoryIds));
  }

  if (accountIds.ready) {
    addPass_('account_ids', '口座ID', '口座ID整合性OK');
  } else {
    addBlocker_('account_ids', '口座ID不整合', JSON.stringify(accountIds));
  }

  if (r2.baselinePendingCount > 0) {
    addBlocker_('baseline_pending', '基準残高未設定', `${r2.baselinePendingCount}口座`);
  } else {
    addPass_('baseline', '基準残高', `${r2.totalCount}口座すべて設定済み`);
  }

  if (r2.uncheckedCount > 0) {
    addBlocker_('balance_unchecked', '残高未照合', `${r2.uncheckedCount}口座`);
  } else {
    addPass_('balance_checked', '残高照合', `${r2.checkedCount}口座すべて確認済み`);
  }

  if (r2.mismatchCount > 0) {
    addBlocker_('balance_mismatch', '残高不一致', `${r2.mismatchCount}口座`);
  } else if (r2.checkedCount > 0) {
    addPass_('balance_matched', '残高一致', `${r2.matchedCount}口座一致`);
  }

  // 通常のカテゴリ要確認は日常運用で解消していく作業キューであり、
  // 残高・ID・資金移動・カード照合の整合性とは分離する。
  // したがって運用開始 blocker にはしない。
  if (reviewCount > 0) {
    addInfo_('review_transactions', '要確認キュー', `${reviewCount}件（運用中に分類）`);
  } else {
    addPass_('review_transactions', '要確認キュー', '0件');
  }

  if (!r3.ready) {
    addBlocker_('transfer_investment', '資金移動・投資の正規化', `${r3.investmentLikeExpenseCount || 0}件の投資類似支出`);
  } else {
    addPass_('transfer_investment', '資金移動・投資', '生活支出への混入なし');
  }

  if (r3.malformedTransferCount > 0) {
    addWarning_('malformed_transfers', '未確定の資金移動', `${r3.malformedTransferCount}件（要確認に残る取引を含む）`);
  }

  if (settlementReviewCount > 0) {
    addWarning_('settlement_review', 'カード照合 要確認', `${settlementReviewCount}件`);
  } else {
    addPass_('settlement_review', 'カード照合', '要確認0件');
  }
  if (settlementPendingCount > 0) {
    addWarning_('settlement_pending', 'カード照合 未処理', `${settlementPendingCount}件`);
  }

  if (importCount === 0) {
    addWarning_('import_history', 'CSV取込履歴', '取込履歴がありません');
  } else {
    addPass_('import_history', 'CSV取込履歴', `${importCount}件の履歴を確認`);
  }
  if (importConfigCount === 0) {
    addWarning_('import_configs', 'CSV取込設定', '有効な取込設定がありません');
  }

  const scoreDenominator = passes.length + warnings.length + blockers.length;
  const score = scoreDenominator === 0
    ? 0
    : Math.round(((passes.length + warnings.length * 0.5) / scoreDenominator) * 100);

  return {
    readyForDailyUse: blockers.length === 0,
    score,
    summary: {
      blockerCount: blockers.length,
      warningCount: warnings.length,
      passCount: passes.length,
      transactionCount,
      reviewCount,
      trackedAccountCount: r2.totalCount,
      allTrackedAccountCount: r2.allAccountCount,
      balanceReconciliationExcludedCount: r2.excludedCount,
      baselinePendingCount: r2.baselinePendingCount,
      uncheckedBalanceCount: r2.uncheckedCount,
      mismatchBalanceCount: r2.mismatchCount,
      malformedTransferCount: Number(r3.malformedTransferCount || 0),
      settlementReviewCount,
      settlementPendingCount,
      importHistoryCount: importCount,
      importConfigCount,
    },
    blockers,
    warnings,
    infos,
    passes,
    balanceItems: (r2.items || []).map((item) => ({
      accountId: item.accountId,
      accountName: item.accountName,
      baselineReady: item.baselineReady,
      checked: !!item.latestReconciliation,
      matched: !!(item.latestReconciliation && item.latestReconciliation.matched),
      difference: item.latestReconciliation
        ? Number(item.latestReconciliation.difference || 0)
        : null,
      assetType: item.assetType || '',
      reconciliationRequired: item.reconciliationRequired !== false,
      reconciliationPolicy: item.reconciliationPolicy || 'balance',
    })),
    generatedAt: new Date().toISOString(),
  };
}

function verifyR6FullReconciliation() {
  const result = getR6FullReconciliationData_();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
