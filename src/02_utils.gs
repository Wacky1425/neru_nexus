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