// ============================================================
// Recurring / 固定費候補
// ============================================================

const RECURRING_HEADERS = [
  "candidate_key",
  "merchant",
  "month_count",
  "first_month",
  "last_month",
  "avg_amount",
  "min_amount",
  "max_amount",
  "category",
  "status",
  "recurring_type",
  "suggested_type",
  "expected_day",
  "yearly_estimate",
  "note",
];

function normalizeRecurringMerchant_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[‐‑‒–—―ー−]/g, "-");
}

function buildRecurringCandidateKey_(merchant) {
  return normalizeRecurringMerchant_(merchant);
}

function inferRecurringSuggestedType_(majorCategory, subCategory, amountStable) {
  const major = String(majorCategory || "").trim();
  const sub = String(subCategory || "").trim();

  if (
    major === "住居" ||
    major === "通信" ||
    major === "水道光熱" ||
    (major === "金融" && ["税金", "保険"].includes(sub))
  ) {
    return "固定費";
  }

  if (amountStable) {
    return "サブスク";
  }

  return "固定費";
}

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
    SHEETS.TRANSACTIONS,
  );

  for (const row of transactionTable.rows) {
    if (isIgnoredTransactionRow_(row, transactionTable.index)) {
      continue;
    }

    const type = getString(row, transactionTable.index, "type");
    if (type !== "支出") {
      continue;
    }

    const merchant = getString(row, transactionTable.index, "merchant");
    const amount = Math.max(0, getNumber(row, transactionTable.index, "amount"));
    const yearMonth = normalizeYearMonth(
      row[transactionTable.index["transaction_date"]],
    );

    if (!merchant || amount <= 0 || !yearMonth) {
      continue;
    }

    const key = buildRecurringCandidateKey_(merchant);
    if (!key) {
      continue;
    }

    const major = getString(row, transactionTable.index, "major_category");
    const sub = getString(row, transactionTable.index, "sub_category");

    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        candidateKey: key,
        merchant,
        months: new Map(),
        amounts: [],
        days: [],
        majorCategory: major,
        subCategory: sub,
      });
    }

    const candidate = candidateMap.get(key);
    candidate.amounts.push(amount);
    const txDate = new Date(row[transactionTable.index["transaction_date"]]);
    if (!Number.isNaN(txDate.getTime())) {
      candidate.days.push(txDate.getDate());
    }
    candidate.months.set(yearMonth, (candidate.months.get(yearMonth) || 0) + 1);
  }

  return candidateMap;
}

function buildRecurringCandidateObjects_(candidateMap) {
  return Array.from(candidateMap.values())
    .map((candidate) => {
      const months = Array.from(candidate.months.keys()).sort();
      const monthCount = months.length;
      const transactionCount = candidate.amounts.length;
      const avgTransactionsPerMonth =
        monthCount > 0 ? transactionCount / monthCount : 0;

      const totalAmount = candidate.amounts.reduce(
        (total, amount) => total + amount,
        0,
      );
      const averageAmount =
        transactionCount > 0 ? Math.round(totalAmount / transactionCount) : 0;
      const minAmount =
        transactionCount > 0 ? Math.min.apply(null, candidate.amounts) : 0;
      const maxAmount =
        transactionCount > 0 ? Math.max.apply(null, candidate.amounts) : 0;

      const stableTolerance = Math.max(500, averageAmount * 0.15);
      const amountStable = maxAmount - minAmount <= stableTolerance;

      const sortedDays = candidate.days.slice().sort((a, b) => a - b);
      const expectedDay = sortedDays.length > 0
        ? sortedDays[Math.floor(sortedDays.length / 2)]
        : 0;

      const knownFixedCategory =
        candidate.majorCategory === "住居" ||
        candidate.majorCategory === "通信" ||
        candidate.majorCategory === "水道光熱" ||
        (candidate.majorCategory === "金融" &&
          ["税金", "保険"].includes(candidate.subCategory));

      return {
        candidateKey: candidate.candidateKey,
        merchant: candidate.merchant,
        monthCount,
        firstMonth: months[0] || "",
        lastMonth: months[months.length - 1] || "",
        avgAmount: averageAmount,
        minAmount,
        maxAmount,
        category: `${candidate.majorCategory} / ${candidate.subCategory}`,
        suggestedType: inferRecurringSuggestedType_(
          candidate.majorCategory,
          candidate.subCategory,
          amountStable,
        ),
        amountStable,
        avgTransactionsPerMonth,
        knownFixedCategory,
        expectedDay,
        yearlyEstimate: averageAmount * 12,
      };
    })
    .filter((candidate) => {
      if (candidate.monthCount < 2) {
        return false;
      }

      // スーパーやECなど「毎月使うだけ」の店を候補にしにくくする。
      if (candidate.avgTransactionsPerMonth > 1.5) {
        return false;
      }

      return candidate.amountStable || candidate.knownFixedCategory;
    })
    .sort((a, b) => {
      if (b.monthCount !== a.monthCount) {
        return b.monthCount - a.monthCount;
      }
      return b.avgAmount - a.avgAmount;
    });
}

function loadRecurringDecisionMap_() {
  const sheet = getRequiredSheet(SHEETS.RECURRING_CANDIDATES);
  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return new Map();
  }

  const headers = values[0];
  const index = createHeaderIndex(headers);
  const result = new Map();

  for (const row of values.slice(1)) {
    const merchant =
      index["merchant"] !== undefined ? String(row[index["merchant"]] || "") : "";
    const candidateKey =
      index["candidate_key"] !== undefined
        ? String(row[index["candidate_key"]] || "")
        : buildRecurringCandidateKey_(merchant);

    if (!candidateKey) {
      continue;
    }

    result.set(candidateKey, {
      status:
        index["status"] !== undefined
          ? String(row[index["status"]] || "候補").trim() || "候補"
          : "候補",
      recurringType:
        index["recurring_type"] !== undefined
          ? String(row[index["recurring_type"]] || "").trim()
          : "",
      note:
        index["note"] !== undefined
          ? String(row[index["note"]] || "").trim()
          : "",
    });
  }

  return result;
}

function rebuildRecurringCandidates() {
  const transactionTable = loadTransactions();
  const decisions = loadRecurringDecisionMap_();

  const candidateMap = buildRecurringCandidateMap_(transactionTable);
  const candidates = buildRecurringCandidateObjects_(candidateMap);

  const rows = candidates.map((candidate) => {
    const previous = decisions.get(candidate.candidateKey) || {};
    const status = previous.status || "候補";
    const recurringType =
      previous.recurringType ||
      (status === "承認" ? candidate.suggestedType : "");

    return [
      candidate.candidateKey,
      candidate.merchant,
      candidate.monthCount,
      candidate.firstMonth,
      candidate.lastMonth,
      candidate.avgAmount,
      candidate.minAmount,
      candidate.maxAmount,
      candidate.category,
      status,
      recurringType,
      candidate.suggestedType,
      candidate.expectedDay,
      candidate.yearlyEstimate,
      previous.note || "",
    ];
  });

  writeTable(
    getRequiredSheet(SHEETS.RECURRING_CANDIDATES),
    1,
    1,
    RECURRING_HEADERS,
    rows,
  );

  Logger.log(`定期支払い候補: ${rows.length}件`);
  return { count: rows.length };
}

function getRecurringCandidatesData_() {
  rebuildRecurringCandidates();

  const rows = loadObjects(SHEETS.RECURRING_CANDIDATES);
  const items = rows.map((row) => ({
    candidateKey: String(row.candidate_key || ""),
    merchant: String(row.merchant || ""),
    monthCount: Number(row.month_count || 0),
    firstMonth: String(row.first_month || ""),
    lastMonth: String(row.last_month || ""),
    avgAmount: Number(row.avg_amount || 0),
    minAmount: Number(row.min_amount || 0),
    maxAmount: Number(row.max_amount || 0),
    category: String(row.category || ""),
    status: String(row.status || "候補"),
    recurringType: String(row.recurring_type || ""),
    suggestedType: String(row.suggested_type || ""),
    expectedDay: Number(row.expected_day || 0),
    yearlyEstimate: Number(row.yearly_estimate || 0),
    note: String(row.note || ""),
  }));

  const approvedItems = items.filter((item) => item.status === "承認");
  const monthlyTotal = approvedItems.reduce(
    (sum, item) => sum + Math.max(0, Number(item.avgAmount || 0)),
    0,
  );
  const currentYearMonth = normalizeYearMonth(new Date());
  const forecast = getApprovedRecurringForecast_(currentYearMonth);

  return {
    items,
    candidateCount: items.filter((item) => item.status === "候補").length,
    approvedCount: approvedItems.length,
    ignoredCount: items.filter((item) => item.status === "無視").length,
    monthlyTotal,
    yearlyEstimate: monthlyTotal * 12,
    currentMonthRemaining: forecast.remainingTotal,
    currentMonthRemainingCount: forecast.items.filter((item) => !item.occurred).length,
    currentMonthOverdueCount: forecast.items.filter((item) => item.overdue).length,
  };
}

function updateRecurringCandidateFromApp_(data) {
  const candidateKey = String(data.candidateKey || "").trim();
  const status = String(data.status || "").trim();
  const recurringType = String(data.recurringType || "").trim();
  const note = String(data.note || "").trim();

  if (!candidateKey) {
    throw new Error("candidateKey が指定されていません");
  }
  if (!["候補", "承認", "無視"].includes(status)) {
    throw new Error(`不正なstatusです: ${status}`);
  }
  if (status === "承認" && !["固定費", "サブスク"].includes(recurringType)) {
    throw new Error("承認時は固定費またはサブスクを選択してください");
  }

  const table = loadTable(SHEETS.RECURRING_CANDIDATES);
  assertRequiredColumns(
    table.index,
    ["candidate_key", "status", "recurring_type", "note"],
    SHEETS.RECURRING_CANDIDATES,
  );

  const rowIndex = table.rows.findIndex(
    (row) => String(row[table.index["candidate_key"]] || "") === candidateKey,
  );
  if (rowIndex < 0) {
    throw new Error("定期支払い候補が見つかりません");
  }

  const sheetRow = rowIndex + 2;
  table.sheet.getRange(sheetRow, table.index["status"] + 1).setValue(status);
  table.sheet
    .getRange(sheetRow, table.index["recurring_type"] + 1)
    .setValue(status === "承認" ? recurringType : "");
  table.sheet.getRange(sheetRow, table.index["note"] + 1).setValue(note);
  clearTableCache(SHEETS.RECURRING_CANDIDATES);

  return {
    candidateKey,
    status,
    recurringType: status === "承認" ? recurringType : "",
    note,
  };
}

function getApprovedRecurringForecast_(yearMonth) {
  const approved = loadObjects(SHEETS.RECURRING_CANDIDATES).filter(
    (row) => String(row.status || "").trim() === "承認",
  );

  if (approved.length === 0) {
    return { expectedTotal: 0, remainingTotal: 0, items: [] };
  }

  const transactionTable = loadTransactions();
  const seenMerchantKeys = new Set();

  if (transactionTable.rows.length > 0) {
    for (const row of transactionTable.rows) {
      if (isIgnoredTransactionRow_(row, transactionTable.index)) {
        continue;
      }
      if (
        normalizeYearMonth(row[transactionTable.index["transaction_date"]]) !==
        yearMonth
      ) {
        continue;
      }
      if (getString(row, transactionTable.index, "type") !== "支出") {
        continue;
      }
      seenMerchantKeys.add(
        buildRecurringCandidateKey_(
          getString(row, transactionTable.index, "merchant"),
        ),
      );
    }
  }

  const items = approved.map((row) => {
    const key = String(row.candidate_key || "") || buildRecurringCandidateKey_(row.merchant);
    const amount = Math.max(0, Number(row.avg_amount || 0));
    const occurred = seenMerchantKeys.has(key);
    const expectedDay = Math.max(0, Math.min(31, Number(row.expected_day || 0)));
    const now = new Date();
    const isCurrentMonth = normalizeYearMonth(now) === yearMonth;
    const overdue = !occurred && isCurrentMonth && expectedDay > 0 && now.getDate() > expectedDay;
    return {
      candidateKey: key,
      merchant: String(row.merchant || ""),
      recurringType: String(row.recurring_type || "固定費"),
      amount,
      expectedDay,
      yearlyEstimate: Math.max(0, Number(row.yearly_estimate || amount * 12)),
      occurred,
      overdue,
      remainingAmount: occurred ? 0 : amount,
    };
  });

  return {
    expectedTotal: items.reduce((sum, item) => sum + item.amount, 0),
    remainingTotal: items.reduce((sum, item) => sum + item.remainingAmount, 0),
    items,
  };
}
