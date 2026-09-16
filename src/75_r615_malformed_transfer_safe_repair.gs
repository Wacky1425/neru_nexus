// ============================================================
// R6.15 - Safe malformed-transfer cleanup
// 1) Repair two confirmed SMBC -> AEON Pay 5,000 transfers.
// 2) Pre-baseline same-account legacy transfers are retained as history and
//    excluded from the R6 malformed warning by R3 report policy.
// ============================================================

function repairR615MalformedTransfersSafe() {
  const table = loadTransactions();
  const required = ['id','transaction_date','amount','merchant','type','sub_category',
    'account_name','account_id','from_account','from_account_id','to_account','to_account_id','source_type'];
  assertRequiredColumns(table.index, required, SHEETS.TRANSACTIONS);

  const targets = new Set([
    '62a8763d-5198-4562-af9d-3d883356e21f', // 2026-08-25 JD /AEON PAY 5000
    '2353688d-ccb5-4055-a3f3-40994bf3619e'  // 2026-08-10 JD /AEON PAY 5000
  ]);
  const aeonId = 'acc_0989d14070cd41d5';
  let repairedCount = 0;
  const repairedIds = [];

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const id = getString(row, table.index, 'id');
    if (!targets.has(id)) continue;
    if (isIgnoredTransactionRow_(row, table.index)) throw new Error('対象取引がignoredです: ' + id);

    const amount = Number(row[table.index['amount']] || 0);
    const merchant = getString(row, table.index, 'merchant').replace(/\s+/g, '').toUpperCase();
    const source = getString(row, table.index, 'source_type');
    const fromId = getString(row, table.index, 'from_account_id');
    if (amount !== 5000 || merchant.indexOf('AEONPAY') < 0 || source !== 'CSV_銀行' || fromId !== 'smbc_bank') {
      throw new Error('R6.15安全条件に一致しません: ' + id);
    }

    const currentToId = getString(row, table.index, 'to_account_id');
    if (currentToId === aeonId) continue; // idempotent
    if (currentToId) throw new Error('移動先が既に別口座です: ' + id + ' -> ' + currentToId);

    row[table.index['to_account']] = 'AEON Pay';
    row[table.index['to_account_id']] = aeonId;
    table.sheet.getRange(i + 2, 1, 1, table.headers.length).setValues([row]);
    repairedCount++;
    repairedIds.push(id);
  }

  const verification = verifyR615MalformedTransfersSafe_();
  const result = { repairedCount, repairedIds, verification };
  Logger.log('=== R6.15 安全修復 ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyR615MalformedTransfersSafe_() {
  const table = loadTransactions();
  const targetIds = new Set(['62a8763d-5198-4562-af9d-3d883356e21f','2353688d-ccb5-4055-a3f3-40994bf3619e']);
  const targetItems = table.rows.filter((r) => targetIds.has(getString(r, table.index, 'id'))).map((r) => ({
    id:getString(r,table.index,'id'), fromId:getString(r,table.index,'from_account_id'),
    toId:getString(r,table.index,'to_account_id'), amount:Number(r[table.index['amount']]||0)
  }));
  const r3 = getR3TransferNormalizationReport_();
  return {
    ready: targetItems.length === 2 && targetItems.every((x) => x.fromId === 'smbc_bank' && x.toId === 'acc_0989d14070cd41d5') && r3.malformedTransferCount === 5,
    targetItems,
    malformedTransferCount: r3.malformedTransferCount,
    preBaselineMalformedExcludedCount: Number(r3.preBaselineMalformedExcludedCount || 0),
    remainingSamples: r3.samples || []
  };
}

function verifyR615MalformedTransfersSafe() {
  const result = verifyR615MalformedTransfersSafe_();
  Logger.log('=== R6.15 修復検証 ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
