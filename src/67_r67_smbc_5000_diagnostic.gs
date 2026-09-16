// ============================================================
// Neru Nexus R6.7 - SMBC 5,000円 preliminary 特定診断
// Read-only diagnostic. No data is modified.
// ============================================================

function diagnoseR67Smbc5000Preliminary() {
  const targetAccountId = "smbc_bank";
  const targetAmount = 5000;
  const identityLookup = buildAccountIdentityLookup_();
  const table = loadTransactions();
  const idx = table.index;
  const preliminary = [];
  const formalCandidates = [];

  function val_(row, key) {
    return idx[key] === undefined ? "" : String(row[idx[key]] || "").trim();
  }
  function tx_(row, i) {
    const rowRef = getTransactionAccountReference_(row, idx, "account_name", "account_id", identityLookup);
    const fromRef = getTransactionAccountReference_(row, idx, "from_account", "from_account_id", identityLookup);
    const toRef = getTransactionAccountReference_(row, idx, "to_account", "to_account_id", identityLookup);
    return {
      rowNumber: i + 2,
      id: val_(row, "id"),
      date: formatApiDate_(row[idx["transaction_date"]]),
      type: getString(row, idx, "type"),
      amount: getNumber(row, idx, "amount"),
      merchant: val_(row, "merchant"),
      itemName: val_(row, "item_name"),
      rawText: val_(row, "raw_text"),
      note: val_(row, "note"),
      accountId: rowRef.accountId || "",
      accountName: rowRef.accountName || "",
      fromAccountId: fromRef.accountId || "",
      fromAccount: fromRef.accountName || "",
      toAccountId: toRef.accountId || "",
      toAccount: toRef.accountName || "",
      sourceType: val_(row, "source_type"),
      sourceStatus: val_(row, "source_status"),
      status: val_(row, "status"),
      duplicateKey: val_(row, "duplicate_key"),
      importBatch: val_(row, "import_batch"),
      sourceId: val_(row, "source_id"),
      sourceReceivedAt: val_(row, "source_received_at"),
      ignored: isIgnoredTransactionRow_(row, idx),
    };
  }
  function relates_(tx, accountId) {
    return tx.accountId === accountId || tx.fromAccountId === accountId || tx.toAccountId === accountId;
  }
  function dayDiff_(a, b) {
    if (!a || !b) return 9999;
    return Math.round(Math.abs(new Date(a + "T00:00:00Z").getTime() - new Date(b + "T00:00:00Z").getTime()) / 86400000);
  }

  for (let i = 0; i < table.rows.length; i++) {
    const tx = tx_(table.rows[i], i);
    if (Number(tx.amount || 0) !== targetAmount || !relates_(tx, targetAccountId)) continue;

    if (tx.sourceType === "Gmail_SMBC" && tx.sourceStatus === "preliminary" && !tx.ignored) {
      preliminary.push(tx);
    }
    if (tx.sourceType === "CSV_銀行") formalCandidates.push(tx);
  }

  const findings = preliminary.map((p) => {
    const candidates = formalCandidates
      .filter((c) => dayDiff_(p.date, c.date) <= 5)
      .map((c) => Object.assign({}, c, { dayDifference: dayDiff_(p.date, c.date) }))
      .sort((a, b) => a.dayDifference - b.dayDifference || a.rowNumber - b.rowNumber);
    const text = [p.merchant, p.itemName, p.rawText, p.note, p.toAccount].join(" ");
    return {
      preliminary: p,
      looksLikeSuica: /suica|スイカ|モバイルsuica|jr東日本/i.test(text),
      formalCandidateCount: candidates.length,
      formalCandidates: candidates.slice(0, 10),
    };
  });

  const result = {
    ready: true,
    summary: {
      activePreliminary5000Count: preliminary.length,
      formal5000NearbyCandidateCount: findings.reduce((n, x) => n + x.formalCandidateCount, 0),
      anyLooksLikeSuica: findings.some((x) => x.looksLikeSuica),
    },
    findings,
    nextHint: "preliminaryのmerchant/rawText/toAccountと正式CSV候補を比較してください。Suica判定は文字列ヒントのみで、自動修正はしていません。"
  };

  // Keep the execution log intentionally compact to avoid truncation.
  Logger.log("=== R6.7 SMBC 5,000円 preliminary 特定診断 ===");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
