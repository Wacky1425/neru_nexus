// ============================================================
// Neru Nexus R6.18 - card settlement source/candidate diagnostic
// Manual diagnostic only. No data mutation.
// ============================================================

function diagnoseR618SettlementSourcesCompact() {
  const data = getSettlementStatusesData_();
  const pending = (data && Array.isArray(data.items) ? data.items : [])
    .filter(function(item) { return String(item.status || '') === 'pending'; });

  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const values = sheet.getDataRange().getValues();
  const index = createHeaderIndex(values[0] || []);
  const byId = new Map();
  for (let i = 1; i < values.length; i++) {
    const id = String(values[i][index['id']] || '').trim();
    if (id) byId.set(id, { row: values[i], rowNumber: i + 1 });
  }

  Logger.log('=== R6.18 カード照合 元取引/候補診断 ===');
  Logger.log('pendingCount=' + pending.length);

  pending.forEach(function(item, n) {
    const hit = byId.get(String(item.transactionId || '').trim());
    const row = hit ? hit.row : null;
    const get = function(name) {
      return row && index[name] !== undefined ? row[index[name]] : '';
    };
    Logger.log([
      '#' + (n + 1),
      'row=' + (hit ? hit.rowNumber : '-'),
      'date=' + compactR618_(item.settlementDate),
      'amount=' + compactR618_(item.settlementAmount),
      'acct=' + compactR618_(get('account_name')),
      'to=' + compactR618_(get('to_account')),
      'merchant=' + compactR618_(get('merchant')),
      'item=' + compactR618_(get('item_name')),
      'src=' + compactR618_(get('source_type')),
      'sub=' + compactR618_(get('sub_category')),
      'settle=' + compactR618_(get('settlement_status')),
      'reason=' + compactR618_(item.reason),
      'card=' + compactR618_(item.cardAccount),
      'bill=' + compactR618_(item.billingYearMonth),
      'detail=' + compactR618_(item.detailTotal),
      'diff=' + compactR618_(item.difference),
      'id=' + compactR618_(item.transactionId)
    ].join(' | '));

    const details = Array.isArray(item.detailItems) ? item.detailItems : [];
    if (details.length) {
      const unmatched = details.filter(function(d) {
        return String(d.settlementStatus || '') !== 'matched' &&
          String(d.settlementStatus || '') !== 'manual_matched' &&
          !String(d.settlementId || '').trim();
      });
      Logger.log('  candidates=' + details.length +
        ' matched=' + (details.length - unmatched.length) +
        ' unmatched=' + unmatched.length +
        ' unmatchedTotal=' + unmatched.reduce(function(s, d) { return s + Number(d.amount || 0); }, 0));
      unmatched.slice(0, 12).forEach(function(d, j) {
        Logger.log('    U' + (j + 1) +
          ' ' + compactR618_(d.transactionDate) +
          ' ¥' + compactR618_(d.amount) +
          ' ' + compactR618_(d.merchant || d.itemName) +
          ' [' + compactR618_(d.subCategory) + ']' +
          ' id=' + compactR618_(d.id));
      });
      if (unmatched.length > 12) Logger.log('    ... +' + (unmatched.length - 12) + ' unmatched');
    }
  });

  Logger.log('=== END R6.18 pendingCount=' + pending.length + ' ===');
  return {
    pendingCount: pending.length,
    items: pending.map(function(item) {
      const hit = byId.get(String(item.transactionId || '').trim());
      const row = hit ? hit.row : null;
      const get = function(name) { return row && index[name] !== undefined ? row[index[name]] : ''; };
      return {
        rowNumber: hit ? hit.rowNumber : null,
        transactionId: item.transactionId || '',
        settlementDate: item.settlementDate || '',
        settlementAmount: item.settlementAmount || 0,
        accountName: get('account_name'),
        toAccount: get('to_account'),
        merchant: get('merchant'),
        itemName: get('item_name'),
        sourceType: get('source_type'),
        subCategory: get('sub_category'),
        settlementStatus: get('settlement_status'),
        cardAccount: item.cardAccount || '',
        billingYearMonth: item.billingYearMonth || '',
        detailTotal: item.detailTotal || 0,
        difference: item.difference || 0,
        detailCount: item.detailCount || 0,
        reason: item.reason || ''
      };
    })
  };
}

function compactR618_(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Tokyo', 'yyyy-MM-dd');
  return String(value).replace(/[\r\n|]+/g, ' ').slice(0, 100);
}
