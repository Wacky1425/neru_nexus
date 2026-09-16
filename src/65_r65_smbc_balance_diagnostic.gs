// ============================================================
// Neru Nexus R6.5 - 三井住友銀行 残高差額診断
// Read-only diagnostic. No data is modified.
// ============================================================

function diagnoseR65SmbcBalanceMismatch() {
  return diagnoseR65AccountBalanceMismatch_("smbc_bank", 63000);
}

function diagnoseR65AccountBalanceMismatch_(targetAccountId, expectedDifference) {
  const accounts = getAccountsData_().items || [];
  const account = accounts.find((item) => String(item.accountId || "").trim() === String(targetAccountId || "").trim());
  if (!account) throw new Error("対象口座が見つかりません: " + targetAccountId);

  const accountId = String(account.accountId || "").trim();
  const openingDate = String(account.openingBalanceDate || "").trim();
  const openingBalance = Number(account.openingBalance || 0);
  const identityLookup = buildAccountIdentityLookup_();
  const table = loadTransactions();
  const idx = table.index;
  const contributions = [];
  const ignoredRelated = [];
  const preBaselineRelated = [];
  let calculated = openingBalance;

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const txDate = formatApiDate_(row[idx["transaction_date"]]);
    const type = getString(row, idx, "type");
    const amount = getNumber(row, idx, "amount");
    const rowRef = getTransactionAccountReference_(row, idx, "account_name", "account_id", identityLookup);
    const fromRef = getTransactionAccountReference_(row, idx, "from_account", "from_account_id", identityLookup);
    const toRef = getTransactionAccountReference_(row, idx, "to_account", "to_account_id", identityLookup);
    const related = rowRef.accountId === accountId || fromRef.accountId === accountId || toRef.accountId === accountId;
    if (!related) continue;

    const base = {
      rowNumber: i + 2,
      id: idx["id"] === undefined ? "" : String(row[idx["id"]] || "").trim(),
      transactionDate: txDate,
      type,
      amount,
      merchant: idx["merchant"] === undefined ? "" : String(row[idx["merchant"]] || "").trim(),
      accountName: rowRef.accountName || "",
      fromAccount: fromRef.accountName || "",
      toAccount: toRef.accountName || "",
      sourceType: idx["source_type"] === undefined ? "" : String(row[idx["source_type"]] || "").trim(),
      sourceStatus: idx["source_status"] === undefined ? "" : String(row[idx["source_status"]] || "").trim(),
      status: idx["status"] === undefined ? "" : String(row[idx["status"]] || "").trim(),
      duplicateKey: idx["duplicate_key"] === undefined ? "" : String(row[idx["duplicate_key"]] || "").trim(),
      importBatch: idx["import_batch"] === undefined ? "" : String(row[idx["import_batch"]] || "").trim(),
    };

    if (isIgnoredTransactionRow_(row, idx)) {
      ignoredRelated.push(Object.assign({}, base, { reason: "source_status=ignored" }));
      continue;
    }
    if (openingDate && txDate && txDate <= openingDate) {
      preBaselineRelated.push(base);
      continue;
    }

    let delta = 0;
    if (type === "収入" && rowRef.accountId === accountId) delta += amount;
    if (type === "支出" && rowRef.accountId === accountId) delta -= amount;
    if (type === "移動" || type === "振替") {
      if (fromRef.accountId === accountId) delta -= amount;
      if (toRef.accountId === accountId) delta += amount;
    }
    if (delta === 0) continue;
    calculated += delta;
    contributions.push(Object.assign({}, base, { delta, runningBalance: calculated }));
  }

  const latest = getLatestR2ReconciliationByAccount_().get(accountId) || null;
  const official = (getAccountBalancesData_().items || []).find((item) => String(item.accountId || "") === accountId) || null;
  const targetDifference = latest ? Number(latest.difference || 0) : Number(expectedDifference || 0);
  const absTarget = Math.abs(targetDifference);

  const exactAmountCandidates = contributions.filter((item) => Math.abs(Number(item.delta || 0)) === absTarget);
  const ignoredExactCandidates = ignoredRelated.filter((item) => Number(item.amount || 0) === absTarget);
  const pairCandidates = [];
  const recent = contributions.slice(-120);
  for (let a = 0; a < recent.length && pairCandidates.length < 30; a++) {
    for (let b = a + 1; b < recent.length && pairCandidates.length < 30; b++) {
      const da = Number(recent[a].delta || 0);
      const db = Number(recent[b].delta || 0);
      if (Math.abs(da + db) === absTarget || da + db === targetDifference || -(da + db) === targetDifference) {
        pairCandidates.push({ sum: da + db, items: [recent[a], recent[b]] });
      }
    }
  }

  const sourceSummaryMap = new Map();
  contributions.forEach((item) => {
    const key = (item.sourceType || "(blank)") + " / " + (item.sourceStatus || "(blank)");
    const cur = sourceSummaryMap.get(key) || { key, count: 0, deltaTotal: 0 };
    cur.count++;
    cur.deltaTotal += Number(item.delta || 0);
    sourceSummaryMap.set(key, cur);
  });

  const result = {
    target: {
      accountId,
      accountName: account.accountName,
      openingBalance,
      openingBalanceDate: openingDate,
      calculatedFromTrace: calculated,
      calculatedFromApp: official ? Number(official.currentBalance || 0) : null,
    },
    latestReconciliation: latest,
    differenceToExplain: targetDifference,
    contributionCount: contributions.length,
    contributionTotal: contributions.reduce((sum, item) => sum + Number(item.delta || 0), 0),
    sourceSummary: Array.from(sourceSummaryMap.values()),
    exactAmountCandidates,
    pairCandidates,
    ignoredRelatedCount: ignoredRelated.length,
    ignoredExactCandidates,
    preBaselineRelatedCount: preBaselineRelated.length,
    recentContributions: contributions.slice(-80),
    hints: [
      "differenceは actualBalance - calculatedBalance。プラスなら実残高の方が多く、Neru Nexus側で出金過多または入金不足の可能性があります。",
      "exactAmountCandidatesは差額と同額の残高寄与取引、pairCandidatesは2取引の組み合わせ候補です。",
      "ignoredExactCandidatesはignoredになった関連取引のうち差額と同額のものです。",
      "この診断は読み取り専用で、シートを変更しません。"
    ]
  };
  Logger.log("=== R6.5 三井住友銀行 残高差額診断 ===");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
