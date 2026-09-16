// ============================================================
// Neru Nexus V2.0-1 - Transaction Category IDs
// Safe dual-write migration. Existing category-name columns remain.
// ============================================================

function migrateV201CategoryIds() {
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const lastColumn = sheet.getLastColumn();
  let headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map((value) => String(value || "").trim());

  const addedColumns = [];
  for (const column of ["major_category_id", "sub_category_id"]) {
    if (!headers.includes(column)) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(column);
      addedColumns.push(column);
      headers.push(column);
    }
  }

  const index = createHeaderIndex(headers);
  assertRequiredColumns(
    index,
    [
      "type",
      "major_category",
      "sub_category",
      "major_category_id",
      "sub_category_id",
    ],
    SHEETS.TRANSACTIONS,
  );

  const lastRow = sheet.getLastRow();
  let updatedCount = 0;
  let unresolvedCount = 0;

  if (lastRow >= 2) {
    const values = sheet
      .getRange(2, 1, lastRow - 1, headers.length)
      .getValues();
    const lookup = buildCategoryLookup_();

    for (const row of values) {
      const existingMajorId = String(
        row[index["major_category_id"]] || "",
      ).trim();
      const existingSubId = String(row[index["sub_category_id"]] || "").trim();

      if (existingMajorId && existingSubId) continue;

      const key = [
        String(row[index["type"]] || "").trim(),
        String(row[index["major_category"]] || "").trim(),
        String(row[index["sub_category"]] || "").trim(),
      ].join("|");

      const category = lookup.byName.get(key);
      if (!category) {
        unresolvedCount++;
        continue;
      }

      row[index["major_category_id"]] = category.majorCategoryId;
      row[index["sub_category_id"]] = category.subCategoryId;
      updatedCount++;
    }

    sheet
      .getRange(2, 1, values.length, headers.length)
      .setValues(values);
  }

  clearTableCache(SHEETS.TRANSACTIONS);

  const verification = verifyV201CategoryIds();
  const result = {
    addedColumns,
    updatedCount,
    unresolvedCount,
    verification,
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function repairV201CategoryIdMismatches() {
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const lastColumn = sheet.getLastColumn();
  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map((value) => String(value || "").trim());
  const index = createHeaderIndex(headers);

  assertRequiredColumns(
    index,
    [
      "type",
      "major_category",
      "sub_category",
      "major_category_id",
      "sub_category_id",
    ],
    SHEETS.TRANSACTIONS,
  );

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    const result = {
      scannedCount: 0,
      repairedCount: 0,
      unresolvedByNameCount: 0,
      verification: verifyV201CategoryIds(),
    };
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  const values = sheet
    .getRange(2, 1, lastRow - 1, headers.length)
    .getValues();
  const lookup = buildCategoryLookup_();
  let repairedCount = 0;
  let unresolvedByNameCount = 0;
  const unresolvedSamples = [];

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const type = String(row[index["type"]] || "").trim();
    const majorCategory = String(row[index["major_category"]] || "").trim();
    const subCategory = String(row[index["sub_category"]] || "").trim();
    const key = [type, majorCategory, subCategory].join("|");
    const category = lookup.byName.get(key);

    if (!category) {
      unresolvedByNameCount++;
      if (unresolvedSamples.length < 10) {
        unresolvedSamples.push({
          row: i + 2,
          type,
          majorCategory,
          subCategory,
        });
      }
      continue;
    }

    const expectedMajorId = String(category.majorCategoryId || "").trim();
    const expectedSubId = String(category.subCategoryId || "").trim();
    const currentMajorId = String(row[index["major_category_id"]] || "").trim();
    const currentSubId = String(row[index["sub_category_id"]] || "").trim();

    if (currentMajorId !== expectedMajorId || currentSubId !== expectedSubId) {
      row[index["major_category_id"]] = expectedMajorId;
      row[index["sub_category_id"]] = expectedSubId;
      repairedCount++;
    }
  }

  if (repairedCount > 0) {
    sheet
      .getRange(2, 1, values.length, headers.length)
      .setValues(values);
    clearTableCache(SHEETS.TRANSACTIONS);
  }

  const result = {
    scannedCount: values.length,
    repairedCount,
    unresolvedByNameCount,
    unresolvedSamples,
    verification: verifyV201CategoryIds(),
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyV201CategoryIds() {
  const table = loadTransactions();
  const missingColumns = ["major_category_id", "sub_category_id"].filter(
    (column) => table.index[column] === undefined,
  );

  if (missingColumns.length > 0) {
    return {
      ready: false,
      missingColumns,
      transactionCount: table.rows.length,
      resolvedCount: 0,
      unresolvedCount: table.rows.length,
    };
  }

  let resolvedCount = 0;
  let unresolvedCount = 0;
  let mismatchCount = 0;
  const lookup = buildCategoryLookup_();

  for (const row of table.rows) {
    const majorId = getString(row, table.index, "major_category_id");
    const subId = getString(row, table.index, "sub_category_id");

    if (!majorId || !subId) {
      unresolvedCount++;
      continue;
    }

    resolvedCount++;

    const category = lookup.bySubId.get(subId);
    if (
      !category ||
      String(category.majorCategoryId || "") !== majorId ||
      String(category.majorCategory || "") !==
        getString(row, table.index, "major_category") ||
      String(category.subCategory || "") !==
        getString(row, table.index, "sub_category")
    ) {
      mismatchCount++;
    }
  }

  return {
    ready: unresolvedCount === 0 && mismatchCount === 0,
    missingColumns: [],
    transactionCount: table.rows.length,
    resolvedCount,
    unresolvedCount,
    mismatchCount,
  };
}

function testCategoryIdentityResolver_() {
  const categories = getCategoriesData().items || [];
  if (categories.length === 0) {
    return { assertions: "PASS", skipped: true, reason: "no categories" };
  }

  const sample = categories[0];
  const resolved = resolveCategoryIdentity_(
    sample.type,
    sample.majorCategory,
    sample.subCategory,
  );

  if (
    !resolved.resolved ||
    resolved.majorCategoryId !== sample.majorCategoryId ||
    resolved.subCategoryId !== sample.subCategoryId
  ) {
    throw new Error("Category ID resolver不一致");
  }

  return { assertions: "PASS", resolved };
}
