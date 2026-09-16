// ============================================================
// R6.16 - User-confirmed legacy transfer repair
// 2026-05-07 35,000: ゆうちょSTACIA -> SMBC (ことら送金)
// 2026-04-01 15,000: ゆうちょYouTube収益用 -> SMBC (ことら送金)
// 2026-03-13 20,000: 現金 -> SMBC (ゆうちょで出金後、現金をSMBCへ入金)
// ============================================================

function findR616AccountByNameHint_(hints) {
  const items = (getAccountsData_().items || []);
  const normalizedHints = hints.map(function(x) { return String(x || '').toLowerCase(); });
  const matches = items.filter(function(a) {
    const text = [a.accountName, a.institution, a.wallet].join(' ').toLowerCase();
    return normalizedHints.every(function(h) { return text.indexOf(h) >= 0; });
  });
  if (matches.length !== 1) {
    throw new Error('R6.16口座特定失敗: hints=' + hints.join(',') + ' matches=' + matches.map(function(x){return x.accountName + ':' + x.accountId;}).join('|'));
  }
  return matches[0];
}

function repairR616ConfirmedLegacyTransfers() {
  const table = loadTransactions();
  const required = ['id','transaction_date','amount','merchant','type','major_category','sub_category','intent',
    'account_name','account_id','from_account','from_account_id','to_account','to_account_id','status'];
  assertRequiredColumns(table.index, required, SHEETS.TRANSACTIONS);

  // STACIA文字列は『ゆうちょ銀行STACIA用』と『STACIAPiTaPaカード』の2口座に一致するため、
  // 資金移動元はユーザー確認済みの預金口座名で厳密に特定する。
  const accounts = (getAccountsData_().items || []);
  const stacia = accounts.find(function(a) { return String(a.accountName || '').trim() === 'ゆうちょ銀行STACIA用'; });
  if (!stacia) throw new Error('ゆうちょ銀行STACIA用 が見つかりません');
  const youtube = accounts.find(function(a) { return String(a.accountName || '').trim() === 'ゆうちょ銀行YouTube収益用'; });
  if (!youtube) throw new Error('ゆうちょ銀行YouTube収益用 が見つかりません');
  const cash = (getAccountsData_().items || []).find(function(a){ return String(a.accountId || '').trim().toLowerCase() === 'cash'; });
  if (!cash) throw new Error('現金口座(account_id=cash)が見つかりません');

  const specs = {
    'c7f1ef22-6bcc-4a07-b3ca-932d2a14d95f': { amount:35000, from:stacia, sub:'口座移動' },
    '6c289722-07d2-46bb-8c08-d566fe76049a': { amount:15000, from:youtube, sub:'口座移動' },
    'cf41b85e-c465-4f3c-83c1-12bf065d629f': { amount:20000, from:cash, sub:'口座移動' }
  };
  let repairedCount = 0;
  const repaired = [];

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const id = getString(row, table.index, 'id');
    const spec = specs[id];
    if (!spec) continue;
    if (isIgnoredTransactionRow_(row, table.index)) throw new Error('対象取引がignoredです: ' + id);
    if (Number(row[table.index['amount']] || 0) !== spec.amount) throw new Error('金額不一致: ' + id);
    const toId = getString(row, table.index, 'to_account_id');
    if (toId && toId !== 'smbc_bank') throw new Error('移動先がSMBCではありません: ' + id + ' -> ' + toId);

    row[table.index['type']] = '移動';
    row[table.index['major_category']] = '移動';
    row[table.index['sub_category']] = spec.sub;
    row[table.index['intent']] = '移動';
    row[table.index['from_account']] = spec.from.accountName;
    row[table.index['from_account_id']] = spec.from.accountId;
    row[table.index['to_account']] = '三井住友銀行';
    row[table.index['to_account_id']] = 'smbc_bank';
    row[table.index['status']] = '確定';
    table.sheet.getRange(i + 2, 1, 1, table.headers.length).setValues([row]);
    repairedCount++;
    repaired.push({id:id, amount:spec.amount, from:spec.from.accountName, fromId:spec.from.accountId, to:'三井住友銀行'});
  }

  if (repaired.length !== 3) throw new Error('R6.16対象3件を全て確認できませんでした: ' + repaired.length);
  const verification = verifyR616ConfirmedLegacyTransfers_();
  const result = {repairedCount:repairedCount, repaired:repaired, verification:verification};
  Logger.log('=== R6.16 確定済み旧資金移動 修復 ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyR616ConfirmedLegacyTransfers_() {
  const r3 = getR3TransferNormalizationReport_();
  const r6 = getR6FullReconciliationData_();
  const mismatches = (r6.balanceItems || []).filter(function(x){
    return x.reconciliationRequired === true && Number(x.difference || 0) !== 0;
  }).map(function(x){ return {accountId:x.accountId, accountName:x.accountName, difference:Number(x.difference || 0)}; });
  return {
    ready: Number(r3.malformedTransferCount || 0) === 0 && mismatches.length === 0,
    malformedTransferCount: Number(r3.malformedTransferCount || 0),
    preBaselineMalformedExcludedCount: Number(r3.preBaselineMalformedExcludedCount || 0),
    requiredBalanceMismatchCount: mismatches.length,
    requiredBalanceMismatches: mismatches,
    r6ReadyForDailyUse: r6.readyForDailyUse === true,
    r6Score: Number(r6.score || 0),
    r6Warnings: r6.warnings || []
  };
}

function verifyR616ConfirmedLegacyTransfers() {
  const result = verifyR616ConfirmedLegacyTransfers_();
  Logger.log('=== R6.16 修復検証 ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
