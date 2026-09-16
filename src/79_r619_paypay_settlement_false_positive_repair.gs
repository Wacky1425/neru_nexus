// ============================================================
// R6.19 - PayPay charge false-positive settlement repair
// Bank-side PayPay transfers are electronic-money charges, not card settlements.
// ============================================================

function getR619PayPayTargetIds_() {
  return [
    '65b91d0b-b98a-439a-9990-324097adc3a1',
    '8cbc62b7-744a-4bf5-91b8-b4bcaa235392',
    '5e198ada-e287-4a24-9286-2f270f22373a',
    'bd309080-fe9e-4bb7-a383-59d9b6b6bd6a',
    '2e699ada-f229-4c04-a18b-423111d77d97',
    '96111ba8-1e06-4692-a9a6-23fc1ddf2e49',
    '15cf21bd-ed99-455a-b4e0-510a0da6f9fe',
    'd473193a-c3e9-45a9-8124-c8998dfb9ddb',
    '173c2393-cf79-499b-9054-6064485678e1',
    '256cd93a-b92b-43f2-b9b5-33a3aaa49780',
    '50a74b6a-4c5e-4b27-a264-e1eada1cbc9b'
  ];
}

function repairR619PayPaySettlementFalsePositives() {
  const table = loadTransactions();
  const required = ['id','merchant','type','major_category','sub_category','intent','account_name','account_id',
    'from_account','from_account_id','to_account','to_account_id','source_type','status','settlement_status','settlement_id'];
  assertRequiredColumns(table.index, required, SHEETS.TRANSACTIONS);

  const target = new Set(getR619PayPayTargetIds_());
  const repaired = [];
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const id = getString(row, table.index, 'id');
    if (!target.has(id)) continue;
    if (isIgnoredTransactionRow_(row, table.index)) throw new Error('R6.19対象がignored: ' + id);
    if (getString(row, table.index, 'source_type') !== 'CSV_銀行') throw new Error('R6.19 source_type不一致: ' + id);
    if (getString(row, table.index, 'merchant').toLowerCase() !== 'paypay') throw new Error('R6.19 merchant不一致: ' + id);
    if (getString(row, table.index, 'account_id') !== 'smbc_bank') throw new Error('R6.19 account不一致: ' + id);
    const toId = getString(row, table.index, 'to_account_id');
    if (toId && toId.toLowerCase() !== 'paypay') throw new Error('R6.19 to_account不一致: ' + id + ' -> ' + toId);

    row[table.index['type']] = '移動';
    row[table.index['major_category']] = '移動';
    row[table.index['sub_category']] = '電子マネーチャージ';
    if (table.index['major_category_id'] !== undefined && table.index['sub_category_id'] !== undefined) {
      const categoryLookup = buildCategoryLookup_();
      const category = categoryLookup.byName.get('移動|移動|電子マネーチャージ');
      if (!category) throw new Error('R6.19 カテゴリ定義が見つかりません: 移動|移動|電子マネーチャージ');
      row[table.index['major_category_id']] = category.majorCategoryId;
      row[table.index['sub_category_id']] = category.subCategoryId;
    }
    row[table.index['intent']] = '移動';
    row[table.index['from_account']] = '三井住友銀行';
    row[table.index['from_account_id']] = 'smbc_bank';
    row[table.index['to_account']] = 'PayPay';
    row[table.index['to_account_id']] = 'paypay';
    row[table.index['settlement_status']] = 'none';
    row[table.index['settlement_id']] = '';
    row[table.index['status']] = '確定';
    table.sheet.getRange(i + 2, 1, 1, table.headers.length).setValues([row]);
    repaired.push(id);
  }
  if (repaired.length !== target.size) throw new Error('R6.19対象件数不一致: ' + repaired.length + '/' + target.size);
  const verification = verifyR619PayPaySettlementFalsePositives_();
  const result = { repairedCount: repaired.length, verification: verification };
  Logger.log('=== R6.19 PayPayカード照合誤検出 修復 ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyR619PayPaySettlementFalsePositives_() {
  const table = loadTransactions();
  const target = new Set(getR619PayPayTargetIds_());
  let validTargetCount = 0;
  const invalid = [];
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const id = getString(row, table.index, 'id');
    if (!target.has(id)) continue;
    const ok = getString(row, table.index, 'sub_category') === '電子マネーチャージ' &&
      getString(row, table.index, 'from_account_id') === 'smbc_bank' &&
      getString(row, table.index, 'to_account_id').toLowerCase() === 'paypay' &&
      getString(row, table.index, 'settlement_status') === 'none';
    if (ok) validTargetCount++; else invalid.push(id);
  }
  const settlement = getSettlementStatusesData_();
  const pending = (settlement.items || []).filter(function(x){ return x.status === 'pending'; });
  const payPayPending = pending.filter(function(x){ return String(x.cardAccountName || x.cardName || '').toLowerCase().indexOf('paypay') >= 0; });
  const r6 = getR6FullReconciliationData_();
  return {
    ready: validTargetCount === target.size && payPayPending.length === 0,
    validTargetCount: validTargetCount,
    invalidTargetIds: invalid,
    settlementPendingCount: pending.length,
    payPaySettlementPendingCount: payPayPending.length,
    r6ReadyForDailyUse: r6.readyForDailyUse === true,
    r6Score: Number(r6.score || 0),
    r6Warnings: r6.warnings || []
  };
}

function verifyR619PayPaySettlementFalsePositives() {
  const result = verifyR619PayPaySettlementFalsePositives_();
  Logger.log('=== R6.19 修復検証 ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
