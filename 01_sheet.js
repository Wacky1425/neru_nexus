const TABLE_CACHE = {};

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
 * 指定したシートの全データを取得する。
 *
 * @param {string} sheetName
 * @return {Array<Array<*>>}
 */
function getValues(sheetName) {
  return getRequiredSheet(sheetName)
    .getDataRange()
    .getValues();
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
function assertRequiredColumns(
  index,
  requiredColumns,
  sheetName) {
  for (const columnName of requiredColumns) {
    if (index[columnName] === undefined) {
      throw new Error(
        `${sheetName} に ${columnName} 列がありません`
      );
    }
  }
}

/**
 * シートを表形式で読み込む。
 *
 * @param {string} sheetName
 * @return {{
 *   sheet: GoogleAppsScript.Spreadsheet.Sheet,
 *   values: Array<Array<*>>,
 *   headers: Array<*>,
 *   rows: Array<Array<*>>,
 *   index: Object<string, number>
 * }}
 */
function loadTable(sheetName) {
  if (TABLE_CACHE[sheetName]) {
    return TABLE_CACHE[sheetName];
  }

  const sheet = getRequiredSheet(sheetName);
  const values = sheet.getDataRange().getValues();

  const table = values.length === 0
    ? {
        sheet,
        values: [],
        headers: [],
        rows: [],
        index: {}
      }
    : {
        sheet,
        values,
        headers: values[0],
        rows: values.slice(1),
        index: createHeaderIndex(values[0])
      };

  TABLE_CACHE[sheetName] = table;

  return table;
}

/**
 * 1行の配列を、ヘッダー名をキーにしたオブジェクトへ変換する。
 *
 * @param {Array<*>} headers
 * @param {Array<*>} row
 * @return {Object<string, *>}
 */
function rowToObject(headers, row) {
  const result = {};

  headers.forEach((header, columnIndex) => {
    const name = String(header || "").trim();

    if (name) {
      result[name] = row[columnIndex];
    }
  });

  return result;
}

/**
 * 表形式のデータをオブジェクト配列へ変換する。
 * 1行目をヘッダーとして扱う。
 *
 * @param {Array<Array<*>>} values
 * @return {Array<Object<string, *>>}
 */
function tableValuesToObjects(values) {
  if (!Array.isArray(values) || values.length < 2) {
    return [];
  }

  const headers = values[0];

  return values
    .slice(1)
    .map(row => rowToObject(headers, row));
}

/**
 * 指定シートをオブジェクト配列として読み込む。
 *
 * @param {string} sheetName
 * @return {Array<Object<string, *>>}
 */
function loadObjects(sheetName) {
  return tableValuesToObjects(
    getValues(sheetName)
  );
}

/**
 * 指定範囲を消去し、ヘッダーとデータ行を書き込む。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} startRow 1始まり
 * @param {number} startColumn 1始まり
 * @param {Array<*>} headers
 * @param {Array<Array<*>>} rows
 * @param {number=} clearRowCount
 */
function writeTable(
  sheet,
  startRow,
  startColumn,
  headers,
  rows,
  clearRowCount
    ) {
  const dataRows = Array.isArray(rows) ? rows : [];
  const columnCount = headers.length;
  const rowsToClear = clearRowCount || 1000;

  if (columnCount === 0) {
    throw new Error("headers が空です");
  }

  sheet
    .getRange(
      startRow,
      startColumn,
      rowsToClear,
      columnCount
    )
    .clearContent();

  sheet
    .getRange(
      startRow,
      startColumn,
      1,
      columnCount
    )
    .setValues([headers]);

    clearTableCache(sheet.getName());

  if (dataRows.length === 0) {
    return;
  }

  const invalidRow = dataRows.find(
    row => !Array.isArray(row) ||
      row.length !== columnCount
  );

  if (invalidRow) {
    throw new Error(
      `書込みデータの列数がヘッダーと一致しません。` +
      ` expected=${columnCount}`
    );
  }

  sheet
    .getRange(
      startRow + 1,
      startColumn,
      dataRows.length,
      columnCount
    )
    .setValues(dataRows);

    clearTableCache();
}

function clearTableCache(sheetName) {
  if (sheetName) {
    delete TABLE_CACHE[sheetName];
    return;
  }

  Object.keys(TABLE_CACHE).forEach(name => {
    delete TABLE_CACHE[name];
  });
}