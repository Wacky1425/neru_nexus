// ============================================================
// R6.14 - malformed transfer compact diagnostic (manual only)
// Prints every malformed transfer in compact one-line form so
// Apps Script logging does not truncate the useful tail.
// ============================================================
function diagnoseR614MalformedTransfersCompact() {
  const table = loadTransactions();
  const required = ['id','transaction_date','type','amount','merchant','sub_category','intent',
    'account_name','account_id','from_account','from_account_id','to_account','to_account_id',
    'source_type','source_status','status','note'];
  assertRequiredColumns(table.index, required, SHEETS.TRANSACTIONS);

  const lookup = buildAccountIdentityLookup_();
  const items = [];

  table.rows.forEach((row, i) => {
    if (isIgnoredTransactionRow_(row, table.index)) return;
    if (!isR3TransferType_(getString(row, table.index, 'type'))) return;

    const from = getTransactionAccountReference_(row, table.index, 'from_account', 'from_account_id', lookup);
    const to = getTransactionAccountReference_(row, table.index, 'to_account', 'to_account_id', lookup);
    const reasons = [];
    if (!from.resolved) reasons.push('FROM?');
    if (!to.resolved) reasons.push('TO?');
    if (from.accountId && to.accountId && from.accountId === to.accountId) reasons.push('SAME');
    if (!reasons.length) return;

    items.push({
      n: items.length + 1,
      row: i + 2,
      id: getString(row, table.index, 'id'),
      date: formatR614Date_(row[table.index.transaction_date]),
      amount: Number(getString(row, table.index, 'amount') || 0),
      merchant: getString(row, table.index, 'merchant'),
      sub: getString(row, table.index, 'sub_category'),
      intent: getString(row, table.index, 'intent'),
      account: getString(row, table.index, 'account_name'),
      from: getString(row, table.index, 'from_account'),
      fromId: getString(row, table.index, 'from_account_id'),
      to: getString(row, table.index, 'to_account'),
      toId: getString(row, table.index, 'to_account_id'),
      source: getString(row, table.index, 'source_type'),
      status: getString(row, table.index, 'status'),
      note: getString(row, table.index, 'note'),
      reason: reasons.join('+')
    });
  });

  Logger.log('=== R6.14 未確定資金移動 全件コンパクト診断 ===');
  Logger.log('count=' + items.length);
  items.forEach(x => {
    Logger.log(
      '#' + x.n + ' row=' + x.row +
      ' | ' + x.date + ' | ¥' + x.amount +
      ' | ' + r614Clip_(x.merchant, 34) +
      ' | sub=' + r614Clip_(x.sub, 14) +
      ' | acct=' + r614Clip_(x.account, 18) +
      ' | from=' + r614Clip_(x.from || '-', 18) +
      ' | to=' + r614Clip_(x.to || '-', 18) +
      ' | src=' + r614Clip_(x.source, 12) +
      ' | stat=' + r614Clip_(x.status, 8) +
      ' | reason=' + x.reason +
      ' | note=' + r614Clip_(x.note || '-', 48) +
      ' | id=' + x.id
    );
  });
  Logger.log('=== END R6.14 count=' + items.length + ' ===');
  return { count: items.length, items: items };
}

function formatR614Date_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  }
  const s = String(value == null ? '' : value).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  }
  return s;
}

function r614Clip_(value, maxLen) {
  const s = String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim();
  return s.length <= maxLen ? s : s.slice(0, Math.max(0, maxLen - 1)) + '…';
}
