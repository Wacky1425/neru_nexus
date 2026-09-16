// ============================================================
// Neru Nexus R6.9 - SMBC 残り5,000円差額診断
// R6.8後のSMBC残高を再計算し、直近の5,000円候補と取込状況だけを出す。
// Read-only. No data is modified.
// ============================================================
function diagnoseR69SmbcRemaining5000() {
  const accountId = "smbc_bank";
  const accounts = getAccountsData_().items || [];
  const account = accounts.find(x => String(x.accountId || "") === accountId);
  if (!account) throw new Error("三井住友銀行口座が見つかりません");

  const openingDate = String(account.openingBalanceDate || "");
  const openingBalance = Number(account.openingBalance || 0);
  const identity = buildAccountIdentityLookup_();
  const table = loadTransactions();
  const idx = table.index;
  let calculated = openingBalance;
  const active5000 = [], ignored5000 = [], recent = [];

  function ref(row, nk, ik) { return getTransactionAccountReference_(row, idx, nk, ik, identity); }
  function pick(row, i, delta, ignored) {
    return {
      rowNumber: i + 2,
      id: idx.id === undefined ? "" : String(row[idx.id] || ""),
      date: formatApiDate_(row[idx.transaction_date]),
      type: getString(row, idx, "type"), amount: getNumber(row, idx, "amount"),
      merchant: idx.merchant === undefined ? "" : String(row[idx.merchant] || ""),
      from: ref(row,"from_account","from_account_id").accountName || "",
      to: ref(row,"to_account","to_account_id").accountName || "",
      sourceType: idx.source_type === undefined ? "" : String(row[idx.source_type] || ""),
      sourceStatus: idx.source_status === undefined ? "" : String(row[idx.source_status] || ""),
      note: idx.note === undefined ? "" : String(row[idx.note] || ""),
      delta: delta, ignored: ignored
    };
  }

  for (let i=0;i<table.rows.length;i++) {
    const row=table.rows[i], date=formatApiDate_(row[idx.transaction_date]);
    const a=ref(row,"account_name","account_id"), f=ref(row,"from_account","from_account_id"), t=ref(row,"to_account","to_account_id");
    if (a.accountId!==accountId && f.accountId!==accountId && t.accountId!==accountId) continue;
    const type=getString(row,idx,"type"), amount=getNumber(row,idx,"amount");
    let delta=0;
    if (type==="収入" && a.accountId===accountId) delta+=amount;
    if (type==="支出" && a.accountId===accountId) delta-=amount;
    if (type==="移動" || type==="振替") { if(f.accountId===accountId) delta-=amount; if(t.accountId===accountId) delta+=amount; }
    const ignored=isIgnoredTransactionRow_(row,idx);
    const item=pick(row,i,delta,ignored);
    if (amount===5000) (ignored ? ignored5000 : active5000).push(item);
    if (date >= "2026-09-01") recent.push(item);
    if (ignored || (openingDate && date && date<=openingDate)) continue;
    calculated += delta;
  }

  const latest=getLatestR2ReconciliationByAccount_().get(accountId)||null;
  const actual=latest ? Number(latest.actualBalance||0) : null;
  const difference=actual===null ? null : actual-calculated;
  const history=(getImportHistoryData_({limit:200}).items||[])
    .filter(x => /三井住友|smbc|銀行/i.test(String(x.accountName||"")+" "+String(x.csvType||"")+" "+String(x.configName||"")))
    .slice(0,12)
    .map(x => ({importedAt:x.importedAt,csvType:x.csvType,accountName:x.accountName,fileName:x.fileName,periodStart:x.periodStart,periodEnd:x.periodEnd,rowCount:x.rowCount,addedCount:x.addedCount,status:x.status}));

  const result={
    ready:true,
    balance:{openingBalance,openingBalanceDate:openingDate,calculatedAfterR68:calculated,actualBalance:actual,difference:difference},
    active5000Transactions:active5000,
    ignored5000Transactions:ignored5000,
    septemberRelatedTransactions:recent,
    recentSmbcImportHistory:history,
    interpretation: difference===-5000
      ? "R6.8後はNeru Nexus計算残高が実残高より5,000円高い。未取込/誤除外の5,000円出金を探す段階。"
      : "差額は-5,000円ではありません。balance.differenceを基準に再診断してください。"
  };
  Logger.log("=== R6.9 SMBC 残り5,000円差額診断 ===");
  Logger.log(JSON.stringify(result,null,2));
  return result;
}
