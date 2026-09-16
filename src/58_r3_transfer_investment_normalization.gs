// ============================================================
// R3 - Transfer / Investment normalization
// Internal asset movements must never inflate household spending.
// ============================================================

function isR3TransferType_(value) {
  const type = String(value || '').trim();
  return type === '移動' || type === '振替';
}

function isR3InvestmentTransferHint_(row, index) {
  const major = getString(row, index, 'major_category');
  const sub = getString(row, index, 'sub_category');
  const intent = getString(row, index, 'intent');
  return major === '移動' || intent === '移動' || [
    '口座移動', '電子マネーチャージ', 'クレカ引落', '証券口座移動',
    '現金引出', '個人間送金'
  ].includes(sub);
}

function getR3TransferNormalizationReport_() {
  const table = loadTransactions();
  const required = ['type','amount','major_category','sub_category','intent',
    'transaction_date','account_name','account_id','from_account','from_account_id','to_account','to_account_id'];
  const missingColumns = required.filter((name) => table.index[name] === undefined);
  if (missingColumns.length) {
    return { ready:false, missingColumns, transferCount:0, malformedTransferCount:0,
      investmentLikeExpenseCount:0, unresolvedAccountCount:0 };
  }

  const lookup = buildAccountIdentityLookup_();
  let transferCount = 0;
  let malformedTransferCount = 0;
  let investmentLikeExpenseCount = 0;
  let unresolvedAccountCount = 0;
  let preBaselineMalformedExcludedCount = 0;
  const accountBaselineById = new Map((getAccountsData_().items || []).map((a) => [String(a.accountId || '').trim(), String(a.openingBalanceDate || '').trim()]));
  const samples = [];

  for (const row of table.rows) {
    if (isIgnoredTransactionRow_(row, table.index)) continue;
    const type = getString(row, table.index, 'type');
    const hinted = isR3InvestmentTransferHint_(row, table.index);
    if (type === '支出' && hinted) investmentLikeExpenseCount++;
    if (!isR3TransferType_(type)) continue;
    transferCount++;

    const from = getTransactionAccountReference_(row, table.index,
      'from_account','from_account_id',lookup);
    const to = getTransactionAccountReference_(row, table.index,
      'to_account','to_account_id',lookup);
    const sameAccount = !!(from.accountId && to.accountId && from.accountId === to.accountId);
    const malformed = !from.resolved || !to.resolved || sameAccount;
    // R6.15: 同一口座として取り込まれた古い資金移動でも、その口座の管理開始日以前なら
    // 現在残高の正確性には影響しない。履歴は保持し、R6 Warning からのみ除外する。
    let preBaselineHistorical = false;
    if (malformed && sameAccount) {
      const baseline = accountBaselineById.get(String(from.accountId || '').trim()) || '';
      const txDate = formatApiDate_(row[table.index['transaction_date']]);
      preBaselineHistorical = !!(baseline && txDate && txDate <= baseline);
    }
    if (preBaselineHistorical) {
      preBaselineMalformedExcludedCount++;
      continue;
    }
    if (malformed) {
      malformedTransferCount++;
      if (!from.resolved || !to.resolved) unresolvedAccountCount++;
      if (samples.length < 10) samples.push({
        id:getString(row, table.index, 'id'),
        fromAccount:getString(row, table.index, 'from_account'),
        toAccount:getString(row, table.index, 'to_account'),
        subCategory:getString(row, table.index, 'sub_category')
      });
    }
  }

  return {
    ready: missingColumns.length === 0 && investmentLikeExpenseCount === 0,
    missingColumns, transferCount, malformedTransferCount,
    investmentLikeExpenseCount, unresolvedAccountCount, preBaselineMalformedExcludedCount, samples,
    note: malformedTransferCount > 0
      ? '移動元/移動先が未確定の取引は要確認として残します。生活支出には含めません。'
      : ''
  };
}

function migrateR3TransferInvestmentNormalization() {
  const table = loadTransactions();
  const required = ['type','major_category','sub_category','intent',
    'from_account','from_account_id','to_account','to_account_id'];
  assertRequiredColumns(table.index, required, SHEETS.TRANSACTIONS);
  const lookup = buildAccountIdentityLookup_();
  let normalizedTypeCount = 0;
  let repairedAccountIdCount = 0;

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    if (isIgnoredTransactionRow_(row, table.index)) continue;
    let changed = false;
    const type = getString(row, table.index, 'type');
    const hinted = isR3InvestmentTransferHint_(row, table.index);

    // Only deterministic legacy rows are changed: rows already classified as
    // transfer by category/intent. Ordinary investment-looking purchases are
    // never guessed automatically.
    if (!isR3TransferType_(type) && hinted) {
      row[table.index['type']] = '移動';
      row[table.index['major_category']] = '移動';
      row[table.index['intent']] = '移動';
      normalizedTypeCount++;
      changed = true;
    }

    if (isR3TransferType_(row[table.index['type']])) {
      for (const pair of [
        ['from_account','from_account_id'], ['to_account','to_account_id']
      ]) {
        const name = getString(row, table.index, pair[0]);
        if (!name) continue;
        const ref = resolveAccountIdentity_(name, '');
        if (ref.resolved) {
          if (getString(row, table.index, pair[0]) !== ref.accountName) {
            row[table.index[pair[0]]] = ref.accountName; changed = true;
          }
          if (getString(row, table.index, pair[1]) !== ref.accountId) {
            row[table.index[pair[1]]] = ref.accountId;
            repairedAccountIdCount++; changed = true;
          }
        }
      }
    }

    if (changed) table.sheet.getRange(i + 2, 1, 1, table.headers.length).setValues([row]);
  }

  const verification = getR3TransferNormalizationReport_();
  const result = { normalizedTypeCount, repairedAccountIdCount, verification };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyR3TransferInvestmentNormalization() {
  const report = getR3TransferNormalizationReport_();
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
