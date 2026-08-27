

// ============================================================
// Recurring Payment Candidates
// ============================================================

function buildRecurringCandidateMap_(transactionTable) {
  const candidateMap = new Map();

  assertRequiredColumns(
    transactionTable.index,
    [
      "transaction_date",
      "type",
      "merchant",
      "amount",
      "major_category",
      "sub_category",
    ],
    "transactions",
  );

  for (const row of transactionTable.rows) {
    const type = getString(row, transactionTable.index, "type");

    if (type !== "支出") {
      continue;
    }

    const merchant = getString(row, transactionTable.index, "merchant");

    const amount = getNumber(row, transactionTable.index, "amount");

    const yearMonth = normalizeYearMonth(
      row[transactionTable.index["transaction_date"]],
    );

    if (!merchant || !amount || !yearMonth) {
      continue;
    }

    const major = getString(row, transactionTable.index, "major_category");

    const sub = getString(row, transactionTable.index, "sub_category");

    const amountBucket = Math.round(amount / 100) * 100;

    const key = `${merchant}|${amountBucket}`;

    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        merchant,
        amountBucket,
        months: new Set(),
        amounts: [],
        category: `${major} / ${sub}`,
      });
    }

    const candidate = candidateMap.get(key);

    candidate.months.add(yearMonth);
    candidate.amounts.push(amount);
  }

  return candidateMap;
}

function buildRecurringCandidateRows_(candidateMap) {
  return Array.from(candidateMap.values())
    .filter((candidate) => candidate.months.size >= 2)
    .map((candidate) => {
      const months = Array.from(candidate.months).sort();

      const totalAmount = candidate.amounts.reduce(
        (total, amount) => total + amount,
        0,
      );

      const averageAmount = Math.round(totalAmount / candidate.amounts.length);

      return [
        candidate.merchant,
        candidate.amountBucket,
        months.length,
        months[0],
        months[months.length - 1],
        averageAmount,
        candidate.category,
        "候補",
        "",
      ];
    })
    .sort((a, b) => {
      if (b[2] !== a[2]) {
        return b[2] - a[2];
      }

      return b[5] - a[5];
    });
}

function rebuildRecurringCandidates() {
  const transactionTable = loadTransactions();

  if (
    !transactionTable ||
    !Array.isArray(transactionTable.rows) ||
    transactionTable.rows.length === 0
  ) {
    writeTable(
      getRequiredSheet(SHEETS.RECURRING_CANDIDATES),
      1,
      1,
      [
        "merchant",
        "amount",
        "month_count",
        "first_month",
        "last_month",
        "avg_amount",
        "category",
        "status",
        "note",
      ],
      [],
    );

    Logger.log("定期支払い候補: 0件");

    return;
  }

  assertRequiredColumns(
    transactionTable.index,
    ["source_status"],
    SHEETS.TRANSACTIONS,
  );

  // ============================================================
  // ignoredは定期支払い候補の判定対象から除外
  // ============================================================

  const activeTransactionTable = {
    ...transactionTable,

    rows: transactionTable.rows.filter(
      (row) => !isIgnoredTransactionRow_(row, transactionTable.index),
    ),
  };

  const candidateMap = buildRecurringCandidateMap_(activeTransactionTable);

  const rows = buildRecurringCandidateRows_(candidateMap);

  writeTable(
    getRequiredSheet(SHEETS.RECURRING_CANDIDATES),
    1,
    1,
    [
      "merchant",
      "amount",
      "month_count",
      "first_month",
      "last_month",
      "avg_amount",
      "category",
      "status",
      "note",
    ],
    rows,
  );

  Logger.log(`定期支払い候補: ${rows.length}件`);
}

