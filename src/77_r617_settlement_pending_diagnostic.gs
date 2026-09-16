// ============================================================
// Neru Nexus R6.17 - card settlement pending diagnostic
// Manual diagnostic only. No data mutation.
// ============================================================

function diagnoseR617SettlementPendingCompact() {
  const data = getSettlementStatusesData_();
  const items = (data && Array.isArray(data.items) ? data.items : [])
    .filter((item) => String(item.status || '') === 'pending');

  Logger.log('=== R6.17 カード照合 未処理診断 ===');
  Logger.log('pendingCount=' + items.length);

  items.forEach((item, i) => {
    const parts = [
      '#' + (i + 1),
      'date=' + compactR617_(item.settlementDate),
      'card=' + compactR617_(item.cardAccountName || item.accountName || item.account || '-'),
      'amount=' + compactR617_(item.settlementAmount != null ? item.settlementAmount : item.amount),
      'matched=' + compactR617_(item.matchedDetailTotal),
      'unmatched=' + compactR617_(item.unmatchedDetailTotal),
      'matchedN=' + compactR617_(item.matchedDetailCount),
      'unmatchedN=' + compactR617_(item.unmatchedDetailCount),
      'reason=' + compactR617_(item.reason),
      'id=' + compactR617_(item.settlementId || item.id)
    ];
    Logger.log(parts.join(' | '));
  });

  Logger.log('=== END R6.17 pendingCount=' + items.length + ' ===');
  return {
    pendingCount: items.length,
    summary: data && data.summary ? data.summary : {},
    items: items.map((item) => ({
      settlementDate: item.settlementDate || '',
      cardAccountName: item.cardAccountName || item.accountName || item.account || '',
      settlementAmount: item.settlementAmount != null ? item.settlementAmount : item.amount,
      matchedDetailTotal: item.matchedDetailTotal,
      unmatchedDetailTotal: item.unmatchedDetailTotal,
      matchedDetailCount: item.matchedDetailCount,
      unmatchedDetailCount: item.unmatchedDetailCount,
      reason: item.reason || '',
      settlementId: item.settlementId || item.id || ''
    }))
  };
}

function compactR617_(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Tokyo', 'yyyy-MM-dd');
  return String(value).replace(/[\r\n|]+/g, ' ').slice(0, 120);
}
