function toText(value) {
  return String(value || "").trim();
}

function getString(row, index, columnName) {
  return String(
    row[index[columnName]] || ""
  ).trim();
}

function getNumber(row, index, columnName) {
  return Number(
    row[index[columnName]] || 0
  );
}

/**
 * カンマやハイフンを含む金額を数値へ変換する。
 *
 * @param {*} value
 * @return {number}
 */
function parseAmount(value) {
  const text = String(
    value === undefined || value === null
      ? ""
      : value
  )
    .replace(/,/g, "")
    .trim();

  if (
    text === "" ||
    text === "-"
  ) {
    return 0;
  }

  const amount = Number(text);

  return isNaN(amount) ? 0 : amount;
}