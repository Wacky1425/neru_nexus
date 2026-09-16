// ============================================================
// R6.13 - malformed transfer diagnostic (manual only)
// ============================================================
function diagnoseR613MalformedTransfers() {
  const table = loadTransactions();
  const required = ['id','transaction_date','type','amount','merchant','major_category','sub_category','intent',
    'account_name','account_id','from_account','from_account_id','to_account','to_account_id','source_type','source_status','status','note'];
  assertRequiredColumns(table.index, required, SHEETS.TRANSACTIONS);
  const lookup = buildAccountIdentityLookup_();
  const items = [];
  const reasonSummary = {};
  const subCategorySummary = {};
  const sourceSummary = {};
  const statusSummary = {};

  table.rows.forEach((row, i) => {
    if (isIgnoredTransactionRow_(row, table.index)) return;
    if (!isR3TransferType_(getString(row, table.index, 'type'))) return;
    const from = getTransactionAccountReference_(row, table.index, 'from_account','from_account_id',lookup);
    const to = getTransactionAccountReference_(row, table.index, 'to_account','to_account_id',lookup);
    const reasons = [];
    if (!from.resolved) reasons.push('from_unresolved');
    if (!to.resolved) reasons.push('to_unresolved');
    if (from.accountId && to.accountId && from.accountId === to.accountId) reasons.push('same_account');
    if (!reasons.length) return;
    reasons.forEach(k => reasonSummary[k] = (reasonSummary[k] || 0) + 1);
    const sub = getString(row, table.index, 'sub_category') || '(blank)';
    const src = getString(row, table.index, 'source_type') || '(blank)';
    const stat = getString(row, table.index, 'status') || '(blank)';
    subCategorySummary[sub] = (subCategorySummary[sub] || 0) + 1;
    sourceSummary[src] = (sourceSummary[src] || 0) + 1;
    statusSummary[stat] = (statusSummary[stat] || 0) + 1;
    items.push({
      rowNumber:i + 2,
      id:getString(row, table.index, 'id'),
      transactionDate:getString(row, table.index, 'transaction_date'),
      amount:Number(getString(row, table.index, 'amount') || 0),
      merchant:getString(row, table.index, 'merchant'),
      majorCategory:getString(row, table.index, 'major_category'),
      subCategory:sub,
      intent:getString(row, table.index, 'intent'),
      accountName:getString(row, table.index, 'account_name'),
      accountId:getString(row, table.index, 'account_id'),
      fromAccount:getString(row, table.index, 'from_account'),
      fromAccountId:getString(row, table.index, 'from_account_id'),
      toAccount:getString(row, table.index, 'to_account'),
      toAccountId:getString(row, table.index, 'to_account_id'),
      sourceType:src,
      sourceStatus:getString(row, table.index, 'source_status'),
      status:stat,
      note:getString(row, table.index, 'note'),
      reasons:reasons
    });
  });
  const result = { malformedTransferCount:items.length, reasonSummary, subCategorySummary, sourceSummary, statusSummary, items };
  Logger.log('=== R6.13 未確定資金移動診断 ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
