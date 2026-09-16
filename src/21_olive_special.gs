

// ============================================================
// Olive-specific Processing
// ============================================================

function reconcileOliveEarlyRepayments_(rawAccountName) {
  const cardAccount = resolveCanonicalAccountName_(rawAccountName);

  if (!cardAccount) {
    return { matched: false, reason: "invalid_card_account", matchedCount: 0, matches: [] };
  }

  // Olive CSV の「○月○日全額繰上返済」はカード会社の正式明細に載る
  // 確定情報として扱う。銀行側に同日・同額の別取引が存在することは要求しない。
  // これにより、繰上返済済み明細を先に settlement 済みにし、残った明細だけを
  // 通常の口座引落照合へ回せる。複数回の繰上返済にも返済日単位で対応する。
  if (cardAccount !== "三井住友カードOlive") {
    return { matched: false, reason: "not_olive_account", cardAccount, matchedCount: 0, matches: [] };
  }

  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return { matched: false, reason: "no_transactions", cardAccount, matchedCount: 0, matches: [] };
  }

  const index = createHeaderIndex(values[0]);
  assertRequiredColumns(index, [
    "id", "transaction_date", "source_type", "account_name", "amount", "note",
    "settlement_status", "settlement_id"
  ], SHEETS.TRANSACTIONS);

  const groups = new Map();

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[index["source_type"]] || "").trim() !== "CSV_クレカ") continue;
    if (resolveCanonicalAccountName_(row[index["account_name"]]) !== cardAccount) continue;

    const note = String(row[index["note"]] || "").normalize("NFKC").trim();
    const m = note.match(/(\d{1,2})月(\d{1,2})日全額繰上返済/);
    if (!m) continue;

    const transactionDate = normalizeSettlementDate_(row[index["transaction_date"]]);
    if (!transactionDate) continue;
    const repaymentDate = resolveEarlyRepaymentDate_(transactionDate, Number(m[1]), Number(m[2]));
    if (!repaymentDate) continue;

    const amount = Number(row[index["amount"]] || 0);
    if (amount <= 0) continue;

    if (!groups.has(repaymentDate)) {
      groups.set(repaymentDate, { repaymentDate, amount: 0, details: [] });
    }
    const group = groups.get(repaymentDate);
    group.amount += amount;
    group.details.push({
      sheetIndex: i,
      transactionId: String(row[index["id"]] || "").trim(),
      amount,
      status: String(row[index["settlement_status"]] || "").trim(),
      settlementId: String(row[index["settlement_id"]] || "").trim()
    });
  }

  if (groups.size === 0) {
    return { matched: false, reason: "no_early_repayment_details", cardAccount, matchedCount: 0, matches: [] };
  }

  let changed = false;
  const results = [];

  for (const group of groups.values()) {
    // 同じ返済日の既存IDがあれば再利用。なければ返済日ベースの安定IDを使う。
    const existingIds = Array.from(new Set(group.details
      .map(d => d.settlementId)
      .filter(Boolean)));
    const settlementId = existingIds.length === 1
      ? existingIds[0]
      : "early_repayment_olive_" + group.repaymentDate.replace(/-/g, "");

    let newlyMatchedCount = 0;
    let alreadyMatchedCount = 0;
    let conflictCount = 0;

    for (const detail of group.details) {
      const alreadyMatched = detail.status === "matched" || detail.status === "manual_matched" || Boolean(detail.settlementId);
      if (alreadyMatched) {
        alreadyMatchedCount++;
        // 別 settlement に確定済みの明細は上書きしない。
        if (detail.settlementId && existingIds.length > 1 && detail.settlementId !== settlementId) conflictCount++;
        continue;
      }

      values[detail.sheetIndex][index["settlement_status"]] = "matched";
      values[detail.sheetIndex][index["settlement_id"]] = settlementId;
      newlyMatchedCount++;
      changed = true;
    }

    results.push({
      settlementId,
      repaymentDate: group.repaymentDate,
      settlementAmount: group.amount,
      detailCount: group.details.length,
      newlyMatchedCount,
      alreadyMatchedCount,
      conflictCount,
      detailTransactionIds: group.details.map(d => d.transactionId).filter(Boolean)
    });
  }

  if (changed) writeSettlementTransactionValues_(sheet, values);

  return {
    matched: results.some(r => r.newlyMatchedCount > 0),
    cardAccount,
    matchedCount: results.reduce((s, r) => s + r.newlyMatchedCount, 0),
    groupCount: results.length,
    matches: results
  };
}

function resolveEarlyRepaymentDate_(
  transactionDate,
  repaymentMonth,
  repaymentDay,
) {
  const match = String(transactionDate || "").match(
    /^(\d{4})-(\d{2})-(\d{2})$/,
  );

  if (!match) {
    return "";
  }

  let year = Number(match[1]);

  const transactionMonth = Number(match[2]);

  const transactionDay = Number(match[3]);

  if (!year || !repaymentMonth || !repaymentDay) {
    return "";
  }

  /*
   * 例：
   *
   * 利用日 2026-12-20
   * 返済日 1月10日
   *
   * → 2027-01-10
   */
  if (
    repaymentMonth < transactionMonth ||
    (repaymentMonth === transactionMonth && repaymentDay < transactionDay)
  ) {
    year++;
  }

  const month = String(repaymentMonth).padStart(2, "0");

  const day = String(repaymentDay).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function analyzeOliveEarlyRepaymentCsv_(parsed) {
  let earlyRepaymentCount = 0;
  let earlyRepaymentAmount = 0;

  let normalCount = 0;
  let normalBilledAmount = 0;

  let billedAmountZeroCount = 0;

  const repaymentDates = new Set();

  const earlyRepaymentItems = [];
  const normalItems = [];

  for (const row of parsed.rows || []) {
    const date = String(row["利用日"] || "").trim();

    const merchant = String(row["加盟店"] || "").trim();

    const amount = Number(row["金額"] || 0);

    const billedAmount = Number(row["請求額"] || 0);

    const note = String(row["備考"] || "")
      .normalize("NFKC")
      .trim();

    if (!date || !merchant || amount <= 0) {
      continue;
    }

    const repaymentMatch = note.match(/(\d{1,2})月(\d{1,2})日全額繰上返済/);

    // ==========================================================
    // 繰上返済済み明細
    // ==========================================================

    if (repaymentMatch) {
      earlyRepaymentCount++;

      earlyRepaymentAmount += amount;

      repaymentDates.add(
        `${Number(repaymentMatch[1])}/${Number(repaymentMatch[2])}`,
      );

      earlyRepaymentItems.push({
        date,
        merchant,
        amount,
        billedAmount,
        note,
      });

      continue;
    }

    // ==========================================================
    // 通常請求候補
    // ==========================================================

    normalCount++;

    if (billedAmount > 0) {
      normalBilledAmount += billedAmount;
    } else {
      billedAmountZeroCount++;
    }

    normalItems.push({
      date,
      merchant,
      amount,
      billedAmount,
      note,
    });
  }

  return {
    parsedRowCount: (parsed.rows || []).length,

    earlyRepayment: {
      count: earlyRepaymentCount,
      amount: earlyRepaymentAmount,
      repaymentDates: Array.from(repaymentDates),
      items: earlyRepaymentItems,
    },

    normalBilling: {
      count: normalCount,
      billedAmount: normalBilledAmount,
      billedAmountZeroCount,
      items: normalItems,
    },
  };
}

function diffDateDays_(date1, date2) {
  if (!date1 || !date2) {
    return -1;
  }

  const d1 = new Date(`${date1}T00:00:00+09:00`);

  const d2 = new Date(`${date2}T00:00:00+09:00`);

  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
    return -1;
  }

  return Math.abs(Math.round((d2.getTime() - d1.getTime()) / 86400000));
}

