// ============================================================
// R6.2 - Mid-stream account management start / baseline reset
// A new baseline means: history on/before the baseline date remains as
// historical evidence, but does not participate in this account's balance.
// ============================================================

function getR62YoutubeRevenueAccount_() {
  const targetId = 'acc_bbba546d6291422e';
  const accounts = getAccountsData_().items || [];
  const account = accounts.find((item) => String(item.accountId || '') === targetId);
  if (!account) throw new Error('ゆうちょ銀行YouTube収益用口座が見つかりません');
  return account;
}

function getR62PreBaselineCounterpartReport_(accountId, baselineDate) {
  const table = loadTransactions();
  const lookup = buildAccountIdentityLookup_();
  const items = [];
  let transferCount = 0;

  for (const row of table.rows) {
    if (isIgnoredTransactionRow_(row, table.index)) continue;
    if (!isR3TransferType_(getString(row, table.index, 'type'))) continue;

    const date = formatApiDate_(row[table.index['transaction_date']]);
    if (!date || date > baselineDate) continue;

    const from = getTransactionAccountReference_(row, table.index,
      'from_account', 'from_account_id', lookup);
    const to = getTransactionAccountReference_(row, table.index,
      'to_account', 'to_account_id', lookup);
    if (from.accountId !== accountId && to.accountId !== accountId) continue;

    transferCount++;
    if (items.length < 50) {
      items.push({
        id: getString(row, table.index, 'id'),
        transactionDate: date,
        amount: getNumber(row, table.index, 'amount'),
        fromAccount: from.accountName || getString(row, table.index, 'from_account'),
        toAccount: to.accountName || getString(row, table.index, 'to_account'),
        treatment: 'pre_baseline_history',
        note: '履歴として保持。基準残高に織り込み済みのため、この口座の残高計算には再加算しません。'
      });
    }
  }

  return { transferCount, items };
}

function startYoutubeRevenueAccountFromCurrentBalance(actualBalance, asOfDate) {
  const amount = Number(actualBalance);
  const date = String(asOfDate || '').trim() || formatApiDate_(new Date());
  if (!Number.isFinite(amount)) throw new Error('actualBalanceは数値で指定してください');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('asOfDateはYYYY-MM-DDで指定してください');
  }

  const account = getR62YoutubeRevenueAccount_();
  const accountId = String(account.accountId || '');
  const before = {
    openingBalance: Number(account.openingBalance || 0),
    openingBalanceDate: String(account.openingBalanceDate || '')
  };

  // Existing account API helper is the single source of truth for baseline update.
  updateAccountOpeningBalanceFromApp_({
    accountId: accountId,
    openingBalance: amount,
    openingBalanceDate: date
  });

  // Record a fresh reconciliation immediately. Since transactions on/before the
  // baseline date are intentionally excluded, calculated balance should equal
  // the new baseline unless there are later transactions already present.
  saveR2BalanceReconciliationFromApp_({
    accountId: accountId,
    actualBalance: amount,
    asOfDate: date,
    note: 'R6.2 管理開始基準を再設定。基準日以前の履歴は保持し、残高計算には含めない。'
  });

  clearTableCache(SHEETS.ACCOUNTS);
  clearTableCache(SHEETS.BALANCE_RECONCILIATION);
  clearAccountBalanceCache_();

  const r2 = getR2BalanceReconciliationData_();
  const after = (r2.items || []).find((item) => String(item.accountId || '') === accountId);
  const counterpart = getR62PreBaselineCounterpartReport_(accountId, date);
  const result = {
    ready: !!(after && after.latestReconciliation && after.latestReconciliation.matched),
    accountId: accountId,
    accountName: account.accountName,
    before: before,
    after: after ? {
      openingBalance: Number(after.openingBalance || 0),
      openingBalanceDate: String(after.openingBalanceDate || ''),
      calculatedBalance: Number(after.calculatedBalance || 0),
      actualBalance: after.latestReconciliation ? Number(after.latestReconciliation.actualBalance || 0) : null,
      difference: after.latestReconciliation ? Number(after.latestReconciliation.difference || 0) : null,
      matched: !!(after.latestReconciliation && after.latestReconciliation.matched)
    } : null,
    preBaselineCounterparts: counterpart,
    policy: '基準日以前の取引は削除・架空マッチせず履歴として保持し、基準残高に織り込み済みとして残高計算から除外します。'
  };
  Logger.log('=== R6.2 YouTube収益用口座 管理開始基準更新 ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyR62YoutubeRevenueManagementStart() {
  const account = getR62YoutubeRevenueAccount_();
  const r2 = getR2BalanceReconciliationData_();
  const item = (r2.items || []).find((x) => String(x.accountId || '') === String(account.accountId || ''));
  const baselineDate = item ? String(item.openingBalanceDate || '') : '';
  const counterpart = baselineDate
    ? getR62PreBaselineCounterpartReport_(String(account.accountId || ''), baselineDate)
    : { transferCount: 0, items: [] };
  const result = {
    ready: !!(item && item.baselineReady && item.latestReconciliation && item.latestReconciliation.matched),
    account: item ? {
      accountId: item.accountId,
      accountName: item.accountName,
      openingBalance: Number(item.openingBalance || 0),
      openingBalanceDate: baselineDate,
      calculatedBalance: Number(item.calculatedBalance || 0),
      latestReconciliation: item.latestReconciliation
    } : null,
    preBaselineCounterparts: counterpart
  };
  Logger.log('=== R6.2 管理開始基準チェック ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
