// ============================================================
// Neru Nexus R6.24 - review transaction deep diagnostic
// Diagnostic only. No mutation.
// ============================================================

function diagnoseR624ReviewTransactions() {
  const table = loadTransactions();
  if (!table.rows.length) {
    console.log('=== R6.24 要確認42件 診断 ===');
    console.log('reviewCount=0');
    return { reviewCount: 0, groups: [] };
  }

  const items = [];
  table.rows.forEach((row, i) => {
    if (isIgnoredTransactionRow_(row, table.index)) return;
    if (isAwaitingFormalDetailRow_(row, table.index)) return;
    const status = getString(row, table.index, 'status');
    const settlementStatus = getString(row, table.index, 'settlement_status');
    if (status !== '要確認' && settlementStatus !== 'review') return;
    items.push({
      row: i + 2,
      id: getString(row, table.index, 'id'),
      date: formatApiDate_(row[table.index['transaction_date']]),
      amount: getNumber(row, table.index, 'amount'),
      merchant: getString(row, table.index, 'merchant'),
      type: getString(row, table.index, 'type'),
      major: getString(row, table.index, 'major_category'),
      sub: getString(row, table.index, 'sub_category'),
      status: status,
      settlement: settlementStatus,
      account: getString(row, table.index, 'account_name'),
      from: getString(row, table.index, 'from_account'),
      to: getString(row, table.index, 'to_account'),
      src: getString(row, table.index, 'source_type'),
      sourceStatus: getString(row, table.index, 'source_status'),
      note: getString(row, table.index, 'note')
    });
  });

  const groupMap = {};
  items.forEach((x) => {
    const key = [x.src || '-', x.type || '-', x.major || '-', x.sub || '-', x.status || '-', x.settlement || '-'].join(' | ');
    if (!groupMap[key]) groupMap[key] = { key: key, count: 0, total: 0, samples: [] };
    const g = groupMap[key];
    g.count++;
    g.total += Number(x.amount || 0);
    if (g.samples.length < 8) g.samples.push(x);
  });
  const groups = Object.keys(groupMap).map((k) => groupMap[k]).sort((a,b) => b.count-a.count || b.total-a.total);

  console.log('=== R6.24 要確認42件 診断 ===');
  console.log('reviewCount=' + items.length + ' groupCount=' + groups.length);
  groups.forEach((g, gi) => {
    console.log('GROUP#' + (gi+1) + ' count=' + g.count + ' total=' + g.total + ' :: ' + g.key);
    g.samples.forEach((x, si) => {
      console.log('  #' + (si+1) + ' row=' + x.row + ' date=' + x.date + ' ¥' + x.amount + ' merchant=' + (x.merchant||'-') + ' acct=' + (x.account||'-') + ' from=' + (x.from||'-') + ' to=' + (x.to||'-') + ' src=' + (x.src||'-') + ' sourceStatus=' + (x.sourceStatus||'-') + ' note=' + (x.note||'-') + ' id=' + x.id);
    });
    if (g.count > g.samples.length) console.log('  ... +' + (g.count - g.samples.length));
  });
  console.log('=== END R6.24 ===');
  return { reviewCount: items.length, groupCount: groups.length, groups: groups };
}
