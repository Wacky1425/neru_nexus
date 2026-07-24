function getSheet(name) {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(name);

  if (!sheet) {
    throw new Error(`${name} シートがありません`);
  }

  return sheet;
}

function getValues(sheetName) {
  return getSheet(sheetName)
    .getDataRange()
    .getValues();
}

function getHeaderIndex(headers) {

  const idx = {};

  headers.forEach((h, i) => {
    idx[String(h).trim()] = i;
  });

  return idx;

}

function getHeaderIndexFromSheet(sheetName) {

  const values = getValues(sheetName);

  if (values.length === 0) {
    return {};
  }

  return getHeaderIndex(values[0]);

}