/**
 * 指定した名前のシートを取得する。
 * 存在しない場合は例外を投げる。
 *
 * @param {string} sheetName
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getRequiredSheet(sheetName) {
  const name = String(sheetName || "").trim();

  if (!name) {
    throw new Error("シート名が指定されていません");
  }

  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(name);

  if (!sheet) {
    throw new Error(`${name} シートがありません`);
  }

  return sheet;
}

/**
 * ヘッダー配列から、列名と列番号の対応表を作る。
 * 列番号は0始まり。
 *
 * @param {Array<*>} headers
 * @return {Object<string, number>}
 */
function createHeaderIndex(headers) {
  if (!Array.isArray(headers)) {
    throw new Error("headers は配列で指定してください");
  }

  const index = {};

  headers.forEach((header, columnIndex) => {
    const name = String(header || "").trim();

    if (name) {
      index[name] = columnIndex;
    }
  });

  return index;
}

/**
 * 必須列が存在するか確認する。
 *
 * @param {Object<string, number>} index
 * @param {string[]} requiredColumns
 * @param {string} sheetName
 */
function assertRequiredColumns(index, requiredColumns, sheetName) {
  for (const columnName of requiredColumns) {
    if (index[columnName] === undefined) {
      throw new Error(
        `${sheetName} に ${columnName} 列がありません`
      );
    }
  }
}