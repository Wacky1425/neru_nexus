/**
 * 対象月の取引金額を指定列ごとに集計する。
 *
 * @param {*} yearMonth 対象年月
 * @param {string} groupColumn 集計軸となる列名
 * @param {{
 *   type?: string,
 *   wallet?: string,
 *   skipBlank?: boolean
 * }=} options
 * @return {Array<Array<*>>} [[名称, 金額], ...]
 */
function summarizeTransactionsByField(
  yearMonth,
  groupColumn,
  options
) {
  const settings = options || {};
  const table = loadTable("transactions");

  if (table.rows.length === 0) {
    return [];
  }

  const requiredColumns = [
    "transaction_date",
    "type",
    "wallet",
    "amount",
    groupColumn
  ];

  assertRequiredColumns(
    table.index,
    requiredColumns,
    "transactions"
  );

  const targetMonth =
    normalizeBudgetYearMonth(yearMonth);

  const targetType =
    String(settings.type || "").trim();

  const targetWallet =
    String(settings.wallet || "").trim();

  const skipBlank =
    settings.skipBlank === true;

  const amountMap = new Map();

  for (const row of table.rows) {
    const transactionMonth = normalizeYearMonth(
      row[table.index["transaction_date"]]
    );

    if (transactionMonth !== targetMonth) {
      continue;
    }

    const type = String(
      row[table.index["type"]] || ""
    ).trim();

    if (targetType && type !== targetType) {
      continue;
    }

    const wallet = String(
      row[table.index["wallet"]] || ""
    ).trim();

    if (targetWallet && wallet !== targetWallet) {
      continue;
    }

    const groupName = String(
      row[table.index[groupColumn]] || ""
    ).trim();

    if (skipBlank && !groupName) {
      continue;
    }

    const amount = Number(
      row[table.index["amount"]] || 0
    );

    if (amount === 0) {
      continue;
    }

    amountMap.set(
      groupName,
      (amountMap.get(groupName) || 0) + amount
    );
  }

  return Array.from(amountMap.entries())
    .sort((a, b) => b[1] - a[1]);
}