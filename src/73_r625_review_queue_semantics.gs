// ============================================================
// Neru Nexus R6.25 - review queue cleanup / readiness semantics
// ============================================================

/**
 * 明らかな「要確認ではない」残骸だけを安全に整理する。
 * - 確定済み資金移動なのに settlement_status=review の行 -> none
 * - 正式クレカCSVでカテゴリ判定済みなのに status=要確認 の行 -> 確定
 * 未分類（その他/要確認）や銀行・PayPayの要確認は触らない。
 */
function repairR625ReviewQueueCleanup() {
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const table = loadTransactions();
  const index = table.index;
  const updates = [];
  const summary = { staleSettlementReview: 0, categorizedFormalCard: 0 };

  table.rows.forEach((row, i) => {
    if (isIgnoredTransactionRow_(row, index)) return;
    const next = row.slice();
    const type = getString(row, index, 'type');
    const status = getString(row, index, 'status');
    const settlement = getString(row, index, 'settlement_status');
    const from = getString(row, index, 'from_account');
    const to = getString(row, index, 'to_account');
    const src = getString(row, index, 'source_type');
    const major = getString(row, index, 'major_category');
    const sub = getString(row, index, 'sub_category');
    let changed = false;

    if ((type === '移動' || type === '振替') && status === '確定' && settlement === 'review' && from && to && from !== to) {
      next[index['settlement_status']] = 'none';
      changed = true;
      summary.staleSettlementReview++;
    }

    if (src === 'CSV_クレカ' && status === '要確認' && major && sub && major !== '要確認' && sub !== '要確認' && sub !== 'その他') {
      next[index['status']] = '確定';
      changed = true;
      summary.categorizedFormalCard++;
    }

    if (changed) updates.push({ rowNumber: i + 2, values: next });
  });

  updates.forEach((u) => sheet.getRange(u.rowNumber, 1, 1, u.values.length).setValues([u.values]));
  if (updates.length) {
    clearTableCache(SHEETS.TRANSACTIONS);
    clearAccountBalanceCache_();
    clearHomeRecentTransactionsCache_();
  }

  const verification = verifyR625ReviewQueueCleanup();
  const result = Object.assign({ repairedCount: updates.length }, summary, { verification: verification });
  console.log('=== R6.25 要確認キュー整理 ===');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyR625ReviewQueueCleanup() {
  const review = getReviewTransactionCount();
  const r6 = getR6FullReconciliationData_();
  const result = {
    ready: !!r6.readyForDailyUse,
    reviewQueueCount: Number(review && review.count || 0),
    r6ReadyForDailyUse: !!r6.readyForDailyUse,
    r6Score: Number(r6.score || 0),
    r6Warnings: r6.warnings || [],
    r6Blockers: r6.blockers || [],
    r6Infos: r6.infos || [],
    r6Summary: r6.summary || {}
  };
  console.log('=== R6.25 最終検証 ===');
  console.log(JSON.stringify(result, null, 2));
  return result;
}
