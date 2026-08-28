function normalizeBusinessYear_(value) {
  const text = String(value || "").trim();
  if (/^\d{4}$/.test(text)) return text;
  return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy");
}

function businessTransactionToObject_(row, index) {
  const amount = getNumber(row, index, "amount");
  const ratio = Math.max(0, Math.min(1, getNumber(row, index, "expense_ratio")));
  const expenseAmount = getNumber(row, index, "expense_amount") || amount * ratio;
  return {
    id: getString(row, index, "id"),
    transactionDate: formatApiDate_(row[index["transaction_date"]]),
    type: getString(row, index, "type"),
    merchant: getString(row, index, "merchant"),
    itemName: getString(row, index, "item_name"),
    amount,
    majorCategory: getString(row, index, "major_category"),
    subCategory: getString(row, index, "sub_category"),
    purposeType: getString(row, index, "purpose_type"),
    expenseRatio: ratio,
    expenseAmount,
    note: getString(row, index, "note"),
    evidenceUrl: getString(row, index, "evidence_url"),
    accountName: getString(row, index, "account_name"),
  };
}

function getBusinessReportData_(options) {
  const settings = options || {};
  const year = normalizeBusinessYear_(settings.year);
  const yearMonth = settings.yearMonth ? normalizeBudgetYearMonth(settings.yearMonth) : "";
  const table = loadTransactions();

  if (table.rows.length === 0) {
    return {
      year,
      yearMonth,
      income: 0,
      expenseGross: 0,
      deductibleExpense: 0,
      profit: 0,
      effectiveExpenseRatio: 0,
      profitMargin: 0,
      evidenceCoverageRate: 1,
      evidenceAttachedCount: 0,
      evidenceMissingCount: 0,
      transactionCount: 0,
      expenseTransactionCount: 0,
      bestMonth: null,
      worstMonth: null,
      monthly: [],
      categories: [],
      evidenceMissingItems: [],
      items: [],
    };
  }

  assertRequiredColumns(
    table.index,
    [
      "id", "transaction_date", "type", "merchant", "item_name", "amount",
      "major_category", "sub_category", "purpose_type", "expense_ratio",
      "expense_amount", "note", "evidence_url", "wallet", "account_name",
    ],
    SHEETS.TRANSACTIONS,
  );

  const monthlyMap = new Map();
  const categoryMap = new Map();
  const items = [];
  let income = 0;
  let expenseGross = 0;
  let deductibleExpense = 0;
  let evidenceAttachedCount = 0;
  let evidenceMissingCount = 0;

  for (const row of table.rows) {
    if (isIgnoredTransactionRow_(row, table.index)) continue;
    const dateMonth = normalizeYearMonth(row[table.index["transaction_date"]]);
    if (!dateMonth || !dateMonth.startsWith(`${year}-`)) continue;
    if (yearMonth && dateMonth !== yearMonth) continue;

    const wallet = getString(row, table.index, "wallet");
    const purposeType = getString(row, table.index, "purpose_type");
    const type = getString(row, table.index, "type");
    const majorCategory = getString(row, table.index, "major_category");
    const isBusiness =
      wallet === "事業" ||
      purposeType === "経費" ||
      purposeType === "事業収入" ||
      (type === "収入" && majorCategory === "副業");
    if (!isBusiness) continue;

    const tx = businessTransactionToObject_(row, table.index);
    const month = monthlyMap.get(dateMonth) || {
      yearMonth: dateMonth,
      income: 0,
      expenseGross: 0,
      deductibleExpense: 0,
      profit: 0,
      evidenceAttachedCount: 0,
      evidenceMissingCount: 0,
    };

    if (type === "収入") {
      income += tx.amount;
      month.income += tx.amount;
    } else if (type === "支出") {
      expenseGross += tx.amount;
      deductibleExpense += tx.expenseAmount;
      month.expenseGross += tx.amount;
      month.deductibleExpense += tx.expenseAmount;

      const key = `${tx.majorCategory}|${tx.subCategory}`;
      const category = categoryMap.get(key) || {
        majorCategory: tx.majorCategory,
        subCategory: tx.subCategory,
        grossAmount: 0,
        deductibleAmount: 0,
        count: 0,
      };
      category.grossAmount += tx.amount;
      category.deductibleAmount += tx.expenseAmount;
      category.count += 1;
      categoryMap.set(key, category);

      if (tx.evidenceUrl) {
        evidenceAttachedCount += 1;
        month.evidenceAttachedCount += 1;
      } else {
        evidenceMissingCount += 1;
        month.evidenceMissingCount += 1;
      }
    }

    month.profit = month.income - month.deductibleExpense;
    monthlyMap.set(dateMonth, month);
    items.push(tx);
  }

  items.sort((a, b) => String(b.transactionDate).localeCompare(String(a.transactionDate)));
  const monthly = Array.from(monthlyMap.values()).sort((a, b) =>
    String(a.yearMonth).localeCompare(String(b.yearMonth)),
  );
  const categories = Array.from(categoryMap.values()).sort(
    (a, b) => b.deductibleAmount - a.deductibleAmount,
  );

  const profit = income - deductibleExpense;
  const effectiveExpenseRatio =
    expenseGross > 0 ? deductibleExpense / expenseGross : 0;
  const profitMargin = income > 0 ? profit / income : 0;
  const expenseItems = items.filter((item) => item.type === "支出");
  const evidenceMissingItems = expenseItems.filter((item) => !item.evidenceUrl);
  const evidenceCoverageRate =
    expenseItems.length > 0 ? evidenceAttachedCount / expenseItems.length : 1;

  let bestMonth = null;
  let worstMonth = null;
  for (const month of monthly) {
    if (!bestMonth || month.profit > bestMonth.profit) bestMonth = month;
    if (!worstMonth || month.profit < worstMonth.profit) worstMonth = month;
  }

  return {
    year,
    yearMonth,
    income,
    expenseGross,
    deductibleExpense,
    profit,
    effectiveExpenseRatio,
    profitMargin,
    evidenceCoverageRate,
    evidenceAttachedCount,
    evidenceMissingCount,
    transactionCount: items.length,
    expenseTransactionCount: expenseItems.length,
    bestMonth,
    worstMonth,
    monthly,
    categories,
    evidenceMissingItems,
    items,
  };
}

function escapeBusinessCsv_(value) {
  const text = String(value == null ? "" : value);
  return `"${text.replace(/"/g, '""')}"`;
}

function buildBusinessTaxCsv_(year) {
  const report = getBusinessReportData_({ year });
  const rows = [[
    "日付", "区分", "取引先", "内容", "金額", "大カテゴリ", "小カテゴリ",
    "経費率", "経費算入額", "口座", "メモ", "証憑URL",
  ]];

  for (const item of report.items) {
    rows.push([
      item.transactionDate,
      item.type,
      item.merchant,
      item.itemName,
      item.amount,
      item.majorCategory,
      item.subCategory,
      item.expenseRatio,
      item.expenseAmount,
      item.accountName,
      item.note,
      item.evidenceUrl,
    ]);
  }

  return rows.map((row) => row.map(escapeBusinessCsv_).join(",")).join("\r\n");
}

function getOrCreateBusinessExportFolder_() {
  const name = "Neru Nexus Exports";
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function createBusinessTaxExportFromApp_(data) {
  const year = normalizeBusinessYear_(data.year);
  const csv = buildBusinessTaxCsv_(year);
  const folder = getOrCreateBusinessExportFolder_();
  const filename = `Neru_Nexus_business_${year}_${Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd_HHmmss")}.csv`;
  const blob = Utilities.newBlob("\uFEFF" + csv, "text/csv;charset=utf-8", filename);
  const file = folder.createFile(blob);
  return createJsonResponse_(
    {
      year,
      filename,
      fileUrl: file.getUrl(),
      rowCount: Math.max(0, csv.split("\r\n").length - 1),
    },
    "ok",
  );
}

function testBusinessReportHelpers() {
  const escaped = escapeBusinessCsv_('a"b');
  if (escaped !== '"a""b"') throw new Error("CSV escape failed");
  const year = normalizeBusinessYear_("2026");
  if (year !== "2026") throw new Error("year normalize failed");
  Logger.log(JSON.stringify({ assertions: "PASS" }));
  return { assertions: "PASS" };
}

function testGetBusinessReportData() {
  const year = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy");
  const report = getBusinessReportData_({ year });
  if (report.profit !== report.income - report.deductibleExpense) {
    throw new Error("副業利益の計算が一致しません");
  }
  if (report.evidenceAttachedCount + report.evidenceMissingCount < 0) {
    throw new Error("証憑件数が不正です");
  }
  if (report.effectiveExpenseRatio < 0 || report.effectiveExpenseRatio > 1) {
    throw new Error("実効経費率が不正です");
  }
  if (report.evidenceCoverageRate < 0 || report.evidenceCoverageRate > 1) {
    throw new Error("証憑カバー率が不正です");
  }
  if (report.evidenceMissingItems.length !== report.evidenceMissingCount) {
    throw new Error("証憑不足一覧と件数が一致しません");
  }
  Logger.log(JSON.stringify({
    assertions: "PASS",
    year,
    transactionCount: report.transactionCount,
  }));
  return { assertions: "PASS", year, transactionCount: report.transactionCount };
}
