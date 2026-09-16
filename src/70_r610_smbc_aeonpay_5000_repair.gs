// ============================================================
// Neru Nexus R6.10 - SMBC 5,000円差額修復
// 2026-08-02 の正式SMBC CSV「JD /AEON PAY」5,000円が
// type=移動なのに from/to 未設定で残高寄与0になっている問題を修復する。
// ============================================================
function repairR610SmbcAeonPay5000() {
  const targetId = "a64f41e6-9ebd-4a3c-87f5-77f2a90faa42";
  const smbcId = "smbc_bank";
  const aeonId = "acc_0989d14070cd41d5";
  const table = loadTransactions();
  const idx = table.index;
  const sheet = SS.getSheetByName(SHEETS.TRANSACTIONS);
  if (!sheet) throw new Error("T_Transactions が見つかりません");

  ["id","transaction_date","type","amount","merchant","from_account","from_account_id","to_account","to_account_id","source_type"].forEach(k => {
    if (idx[k] === undefined) throw new Error("T_Transactionsに必要列がありません: " + k);
  });

  let target = null;
  let rowIndex = -1;
  for (let i = 0; i < table.rows.length; i++) {
    if (String(table.rows[i][idx.id] || "") === targetId) { target = table.rows[i]; rowIndex = i; break; }
  }
  if (!target) throw new Error("対象取引が見つかりません: " + targetId);

  const date = formatApiDate_(target[idx.transaction_date]);
  const type = String(target[idx.type] || "");
  const amount = Number(target[idx.amount] || 0);
  const merchant = String(target[idx.merchant] || "");
  const sourceType = String(target[idx.source_type] || "");
  if (date !== "2026-08-02" || type !== "移動" || amount !== 5000 || !/AEON\s*PAY/i.test(merchant) || sourceType !== "CSV_銀行") {
    throw new Error("安全条件不一致のため修復を中止: " + JSON.stringify({date,type,amount,merchant,sourceType}));
  }

  const before = {
    fromAccount: String(target[idx.from_account] || ""),
    fromAccountId: String(target[idx.from_account_id] || ""),
    toAccount: String(target[idx.to_account] || ""),
    toAccountId: String(target[idx.to_account_id] || "")
  };

  target[idx.from_account] = "三井住友銀行";
  target[idx.from_account_id] = smbcId;
  target[idx.to_account] = "AEON Pay";
  target[idx.to_account_id] = aeonId;
  sheet.getRange(rowIndex + 2, 1, 1, target.length).setValues([target]);
  SpreadsheetApp.flush();

  const balances = getAccountBalancesData_();
  const smbc = (balances.items || []).find(x => String(x.accountId || "") === smbcId);
  const result = {
    repaired: true,
    transactionId: targetId,
    transactionDate: date,
    amount: amount,
    merchant: merchant,
    before: before,
    after: {fromAccount:"三井住友銀行",fromAccountId:smbcId,toAccount:"AEON Pay",toAccountId:aeonId},
    smbcCalculatedBalanceAfterRepair: smbc ? Number(smbc.currentBalance || 0) : null,
    expectedSmbcBalance: 104834,
    expectedMatch: smbc ? Number(smbc.currentBalance || 0) === 104834 : null
  };
  Logger.log("=== R6.10 SMBC 5,000円差額修復 ===");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyR610SmbcAeonPay5000() {
  const balances = getAccountBalancesData_();
  const smbc = (balances.items || []).find(x => String(x.accountId || "") === "smbc_bank");
  const result = {
    ready: !!smbc && Number(smbc.currentBalance || 0) === 104834,
    calculatedBalance: smbc ? Number(smbc.currentBalance || 0) : null,
    expectedBalance: 104834,
    difference: smbc ? 104834 - Number(smbc.currentBalance || 0) : null
  };
  Logger.log("=== R6.10 修復検証 ===");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
