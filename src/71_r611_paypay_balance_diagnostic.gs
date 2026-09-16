// ============================================================
// Neru Nexus R6.11 - PayPay 残高差額診断
// Read-only diagnostic. No data is modified.
// ============================================================

function diagnoseR611PayPayBalanceMismatch() {
  const result = diagnoseR65AccountBalanceMismatch_("paypay", 2115);
  result.r611 = {
    purpose: "PayPayの残高差額を、基準残高以降の全残高寄与取引・ignored取引・差額一致候補から診断",
    readOnly: true,
    note: "R6.8でSMBC↔PayPay重複を正規化した後のデータを対象にします。"
  };
  Logger.log("=== R6.11 PayPay 残高差額診断 ===");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
