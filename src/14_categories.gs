// ============================================================
// Neru Nexus - Categories
//
// M_Categories の取得・追加・更新・無効化・ID管理を担当。
// ============================================================

function getCategoriesData() {
  const sheet = SS.getSheetByName(SHEETS.CATEGORIES);

  if (!sheet) {
    throw new Error("categoriesシートがありません");
  }

  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return {
      items: [],
      mapsByType: {},
      mapsByTypeId: {},
      expenseMap: {},
      incomeMap: {},
    };
  }

  const headers = values[0].map((value) => String(value || "").trim());

  const index = {};

  headers.forEach((header, i) => {
    index[header] = i;
  });

  const requiredColumns = [
    "type",
    "major_category_id",
    "major_category",
    "sub_category_id",
    "sub_category",
    "is_expense_target",
    "essential",
    "active",
    "sort_order",
  ];

  for (const column of requiredColumns) {
    if (index[column] === undefined) {
      throw new Error(`categoriesシートに${column}列がありません`);
    }
  }

  const items = [];

  /*
   * 旧Flutter互換:
   * {
   *   支出: {
   *     食費: ["外食", "コンビニ"]
   *   }
   * }
   */
  const mapsByType = {};

  /*
   * ID対応:
   * {
   *   支出: {
   *     major_001: {
   *       majorCategoryId: "major_001",
   *       majorCategory: "食費",
   *       subCategories: [
   *         {
   *           subCategoryId: "sub_001",
   *           subCategory: "外食"
   *         }
   *       ]
   *     }
   *   }
   * }
   */
  const mapsByTypeId = {};

  for (const row of values.slice(1)) {
    const type = String(row[index["type"]] || "").trim();

    const majorCategoryId = String(
      row[index["major_category_id"]] || "",
    ).trim();

    const majorCategory = String(row[index["major_category"]] || "").trim();

    const subCategoryId = String(row[index["sub_category_id"]] || "").trim();

    const subCategory = String(row[index["sub_category"]] || "").trim();

    const expenseTargetValue = row[index["is_expense_target"]];

    const isExpenseTarget =
      expenseTargetValue === true ||
      Number(expenseTargetValue) === 1 ||
      String(expenseTargetValue).trim().toLowerCase() === "true";

    const essentialValue = row[index["essential"]];

    const essential =
      essentialValue === true ||
      Number(essentialValue) === 1 ||
      String(essentialValue).trim().toLowerCase() === "true";

    const activeValue = row[index["active"]];

    const active =
      activeValue === true ||
      Number(activeValue) === 1 ||
      String(activeValue).trim().toLowerCase() === "true";

    const sortOrder = Number(row[index["sort_order"]]) || 999;

    const note =
      index["note"] === undefined
        ? ""
        : String(row[index["note"]] || "").trim();

    if (
      !active ||
      !type ||
      !majorCategoryId ||
      !majorCategory ||
      !subCategoryId ||
      !subCategory
    ) {
      continue;
    }

    items.push({
      type,
      majorCategoryId,
      majorCategory,
      subCategoryId,
      subCategory,
      isExpenseTarget,
      essential,
      active,
      sortOrder,
      note,
    });

    /*
     * 旧形式Map
     */
    if (!mapsByType[type]) {
      mapsByType[type] = {};
    }

    if (!mapsByType[type][majorCategory]) {
      mapsByType[type][majorCategory] = [];
    }

    if (!mapsByType[type][majorCategory].includes(subCategory)) {
      mapsByType[type][majorCategory].push(subCategory);
    }

    /*
     * ID形式Map
     */
    if (!mapsByTypeId[type]) {
      mapsByTypeId[type] = {};
    }

    if (!mapsByTypeId[type][majorCategoryId]) {
      mapsByTypeId[type][majorCategoryId] = {
        majorCategoryId,
        majorCategory,
        sortOrder,
        subCategories: [],
      };
    }

    const subCategories = mapsByTypeId[type][majorCategoryId].subCategories;

    const alreadyExists = subCategories.some(
      (item) => item.subCategoryId === subCategoryId,
    );

    if (!alreadyExists) {
      subCategories.push({
        subCategoryId,
        subCategory,
        sortOrder,
        isExpenseTarget,
        essential,
        note,
      });
    }
  }

  items.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type.localeCompare(b.type, "ja");
    }

    return a.sortOrder - b.sortOrder;
  });

  Object.values(mapsByTypeId).forEach((typeMap) => {
    Object.values(typeMap).forEach((major) => {
      major.subCategories.sort((a, b) => a.sortOrder - b.sortOrder);
    });
  });

  return {
    items,
    mapsByType,
    mapsByTypeId,

    // 移行中のFlutter互換用
    expenseMap: mapsByType["支出"] || {},

    incomeMap: mapsByType["収入"] || {},
  };
}

function createCategoryFromApp_(data) {
  const type = String(data.type || "").trim();

  const majorCategory = String(data.majorCategory || "").trim();

  const subCategory = String(data.subCategory || "").trim();

  if (!type) {
    throw new Error("typeは必須です");
  }

  if (!majorCategory) {
    throw new Error("majorCategoryは必須です");
  }

  if (!subCategory) {
    throw new Error("subCategoryは必須です");
  }

  const sheet = SS.getSheetByName(SHEETS.CATEGORIES);

  if (!sheet) {
    throw new Error("categoriesシートがありません");
  }

  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    throw new Error("categoriesシートにヘッダーがありません");
  }

  const headers = values[0].map((value) => String(value || "").trim());

  const index = {};

  headers.forEach((header, columnIndex) => {
    index[header] = columnIndex;
  });

  const requiredColumns = [
    "type",
    "major_category_id",
    "major_category",
    "sub_category_id",
    "sub_category",
    "is_expense_target",
    "active",
    "sort_order",
    "note",
  ];

  for (const column of requiredColumns) {
    if (index[column] === undefined) {
      throw new Error(`categoriesシートに${column}列がありません`);
    }
  }

  const existingRows = values.slice(1);

  const sameCategoryIndex = existingRows.findIndex((row) => {
    return (
      String(row[index["type"]] || "").trim() === type &&
      String(row[index["major_category"]] || "").trim() === majorCategory &&
      String(row[index["sub_category"]] || "").trim() === subCategory
    );
  });

  if (sameCategoryIndex !== -1) {
    const existingRow = existingRows[sameCategoryIndex];

    const activeValue = existingRow[index["active"]];

    const isActive =
      activeValue === true ||
      Number(activeValue) === 1 ||
      String(activeValue).trim().toLowerCase() === "true";

    if (isActive) {
      throw new Error("同じカテゴリがすでに存在します");
    }

    const sheetRowNumber = sameCategoryIndex + 2;

    sheet.getRange(sheetRowNumber, index["active"] + 1).setValue(1);

    if (index["note"] !== undefined) {
      sheet
        .getRange(sheetRowNumber, index["note"] + 1)
        .setValue("アプリで再有効化");
    }

    clearTableCache(SHEETS.CATEGORIES);

    return createJsonResponse_(
      {
        type,
        majorCategoryId: String(
          existingRow[index["major_category_id"]] || "",
        ).trim(),
        majorCategory,
        subCategoryId: String(
          existingRow[index["sub_category_id"]] || "",
        ).trim(),
        subCategory,
        reactivated: true,
      },
      "ok",
    );
  }

  const sameMajorRow = existingRows.find((row) => {
    return (
      String(row[index["type"]] || "").trim() === type &&
      String(row[index["major_category"]] || "").trim() === majorCategory
    );
  });

  let majorCategoryId = "";

  if (sameMajorRow) {
    majorCategoryId = String(
      sameMajorRow[index["major_category_id"]] || "",
    ).trim();
  }

  if (!majorCategoryId) {
    majorCategoryId = createNextCategoryId_(
      existingRows,
      index["major_category_id"],
      "major",
    );
  }

  const subCategoryId = createNextCategoryId_(
    existingRows,
    index["sub_category_id"],
    "sub",
  );

  const maxSortOrder = existingRows.reduce((maximum, row) => {
    const value = Number(row[index["sort_order"]] || 0);

    return value > maximum ? value : maximum;
  }, 0);

  const row = new Array(headers.length).fill("");

  row[index["type"]] = type;
  row[index["major_category_id"]] = majorCategoryId;
  row[index["major_category"]] = majorCategory;
  row[index["sub_category_id"]] = subCategoryId;
  row[index["sub_category"]] = subCategory;
  row[index["is_expense_target"]] = type === "支出" ? 1 : 0;
  row[index["active"]] = 1;
  row[index["sort_order"]] = maxSortOrder + 1;
  row[index["note"]] = "アプリ追加";

  sheet.appendRow(row);

  clearTableCache(SHEETS.CATEGORIES);

  return createJsonResponse_(
    {
      type,
      majorCategoryId,
      majorCategory,
      subCategoryId,
      subCategory,
    },
    "ok",
  );
}

function deactivateCategoryFromApp_(data) {
  const subCategoryId = String(data.subCategoryId || "").trim();

  if (!subCategoryId) {
    throw new Error("subCategoryIdは必須です");
  }

  const sheet = getRequiredSheet(SHEETS.CATEGORIES);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("カテゴリデータがありません");
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    ["sub_category_id", "active"],
    SHEETS.CATEGORIES,
  );

  let targetRow = -1;

  for (let i = 1; i < values.length; i++) {
    const rowSubCategoryId = String(
      values[i][index["sub_category_id"]] || "",
    ).trim();

    if (rowSubCategoryId === subCategoryId) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) {
    throw new Error("対象のカテゴリが見つかりません");
  }

  sheet.getRange(targetRow, index["active"] + 1).setValue(0);

  clearTableCache(SHEETS.CATEGORIES);

  return createJsonResponse_(
    {
      deactivated: true,
      subCategoryId,
    },
    "ok",
  );
}

function updateCategoryFromApp_(data) {
  const subCategoryId = String(data.subCategoryId || "").trim();

  const majorCategory = String(data.majorCategory || "").trim();

  const subCategory = String(data.subCategory || "").trim();

  const active = toBoolean_(data.active, true);

  if (!subCategoryId) {
    throw new Error("subCategoryIdは必須です");
  }

  if (!majorCategory) {
    throw new Error("majorCategoryは必須です");
  }

  if (!subCategory) {
    throw new Error("subCategoryは必須です");
  }

  const sheet = SS.getSheetByName(SHEETS.CATEGORIES);

  if (!sheet) {
    throw new Error("categoriesシートがありません");
  }

  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    throw new Error("更新対象のカテゴリがありません");
  }

  const headers = values[0].map((value) => String(value || "").trim());

  const index = {};

  headers.forEach((header, columnIndex) => {
    index[header] = columnIndex;
  });

  const requiredColumns = [
    "type",
    "major_category_id",
    "major_category",
    "sub_category_id",
    "sub_category",
    "active",
  ];

  for (const column of requiredColumns) {
    if (index[column] === undefined) {
      throw new Error(`categoriesシートに${column}列がありません`);
    }
  }

  let targetRowIndex = -1;

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const rowSubCategoryId = String(
      values[rowIndex][index["sub_category_id"]] || "",
    ).trim();

    if (rowSubCategoryId === subCategoryId) {
      targetRowIndex = rowIndex;
      break;
    }
  }

  if (targetRowIndex === -1) {
    throw new Error("更新対象のカテゴリが見つかりません");
  }

  const type = String(values[targetRowIndex][index["type"]] || "").trim();
  const oldMajorCategory = String(
    values[targetRowIndex][index["major_category"]] || "",
  ).trim();

  const oldSubCategory = String(
    values[targetRowIndex][index["sub_category"]] || "",
  ).trim();

  const majorCategoryId = String(
    values[targetRowIndex][index["major_category_id"]] || "",
  ).trim();

  if (!majorCategoryId) {
    throw new Error("更新対象の大カテゴリIDがありません");
  }

  const duplicateExists = values.slice(1).some((row, indexInSlice) => {
    const actualRowIndex = indexInSlice + 1;

    if (actualRowIndex === targetRowIndex) {
      return false;
    }

    return (
      String(row[index["type"]] || "").trim() === type &&
      String(row[index["major_category"]] || "").trim() === majorCategory &&
      String(row[index["sub_category"]] || "").trim() === subCategory
    );
  });

  if (duplicateExists) {
    throw new Error("同じカテゴリがすでに存在します");
  }

  // 同じ大カテゴリIDを持つ全行の大カテゴリ名を更新
  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const rowMajorCategoryId = String(
      values[rowIndex][index["major_category_id"]] || "",
    ).trim();

    if (rowMajorCategoryId === majorCategoryId) {
      values[rowIndex][index["major_category"]] = majorCategory;
    }
  }

  // 小カテゴリ固有の項目は対象行だけ更新
  values[targetRowIndex][index["sub_category"]] = subCategory;

  values[targetRowIndex][index["active"]] = active ? 1 : 0;

  // 大カテゴリ名変更が複数行に及ぶのでまとめて書き戻す
  sheet
    .getRange(2, 1, values.length - 1, headers.length)
    .setValues(values.slice(1));

  if (oldMajorCategory !== majorCategory || oldSubCategory !== subCategory) {
    renameCategoryInTransactions_({
      type,
      oldMajorCategory,
      newMajorCategory: majorCategory,
      oldSubCategory,
      newSubCategory: subCategory,
    });
  }

  clearTableCache(SHEETS.CATEGORIES);

  return createJsonResponse_(
    {
      subCategoryId,
      majorCategory,
      subCategory,
      active,
    },
    "ok",
  );
}

function renameCategoryInTransactions_(options) {
  const {
    type,
    oldMajorCategory,
    newMajorCategory,
    oldSubCategory,
    newSubCategory,
  } = options;

  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return;
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    ["transaction_date", "type", "major_category", "sub_category"],
    SHEETS.TRANSACTIONS,
  );

  let changed = false;

  const changedMonths = new Set();

  for (let i = 1; i < values.length; i++) {
    const rowType = String(values[i][index["type"]] || "").trim();

    const rowMajor = String(values[i][index["major_category"]] || "").trim();

    const rowSub = String(values[i][index["sub_category"]] || "").trim();

    if (rowType !== type) {
      continue;
    }

    // 元の大カテゴリに属していた取引だけ対象
    if (rowMajor !== oldMajorCategory) {
      continue;
    }

    // 大カテゴリ名は、その大カテゴリ配下の全取引を変更
    let rowChanged = false;

    if (oldMajorCategory !== newMajorCategory) {
      values[i][index["major_category"]] = newMajorCategory;

      rowChanged = true;
    }

    if (oldSubCategory !== newSubCategory && rowSub === oldSubCategory) {
      values[i][index["sub_category"]] = newSubCategory;

      rowChanged = true;
    }

    if (rowChanged) {
      changed = true;

      const yearMonth = normalizeYearMonth(
        values[i][index["transaction_date"]],
      );

      if (yearMonth) {
        changedMonths.add(yearMonth);
      }
    }
  }

  if (!changed) {
    return;
  }

  sheet
    .getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));
  for (const yearMonth of changedMonths) {
    markSummaryDirty_(yearMonth);
  }
  clearTableCache(SHEETS.TRANSACTIONS);
  clearAccountBalanceCache_();
  clearHomeRecentTransactionsCache_();
}

function toBoolean_(value, defaultValue) {
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  const text = String(value).trim().toLowerCase();

  if (text === "true" || text === "1") {
    return true;
  }

  if (text === "false" || text === "0") {
    return false;
  }

  return defaultValue;
}

function createNextCategoryId_(rows, columnIndex, prefix) {
  let maximum = 0;

  for (const row of rows) {
    const value = String(row[columnIndex] || "").trim();

    const match = value.match(new RegExp(`^${prefix}_(\\d+)$`));

    if (!match) {
      continue;
    }

    const number = Number(match[1]);

    if (number > maximum) {
      maximum = number;
    }
  }

  return `${prefix}_${String(maximum + 1).padStart(3, "0")}`;
}

function initializeCategoryIds() {
  const sheet = SS.getSheetByName(SHEETS.CATEGORIES);

  if (!sheet) {
    throw new Error("categoriesシートがありません");
  }

  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return;
  }

  const headers = values[0].map((value) => String(value || "").trim());

  const requiredHeaders = [
    "type",
    "major_category_id",
    "major_category",
    "sub_category_id",
    "sub_category",
    "is_expense_target",
    "active",
    "sort_order",
    "note",
  ];

  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`categoriesシートに${header}列がありません`);
    }
  }

  const index = {};

  headers.forEach((header, columnIndex) => {
    index[header] = columnIndex;
  });

  const majorIdMap = new Map();
  const usedMajorIds = new Set();
  const usedSubIds = new Set();

  let nextMajorNumber = 1;
  let nextSubNumber = 1;

  // 既に入っているIDを先に記憶
  for (const row of values.slice(1)) {
    const type = String(row[index["type"]] || "").trim();

    const majorCategory = String(row[index["major_category"]] || "").trim();

    const majorCategoryId = String(
      row[index["major_category_id"]] || "",
    ).trim();

    const subCategoryId = String(row[index["sub_category_id"]] || "").trim();

    if (type && majorCategory && majorCategoryId) {
      majorIdMap.set(`${type}|${majorCategory}`, majorCategoryId);

      usedMajorIds.add(majorCategoryId);
    }

    if (subCategoryId) {
      usedSubIds.add(subCategoryId);
    }
  }

  function createMajorId() {
    let id;

    do {
      id = `major_${String(nextMajorNumber++).padStart(3, "0")}`;
    } while (usedMajorIds.has(id));

    usedMajorIds.add(id);

    return id;
  }

  function createSubId() {
    let id;

    do {
      id = `sub_${String(nextSubNumber++).padStart(3, "0")}`;
    } while (usedSubIds.has(id));

    usedSubIds.add(id);

    return id;
  }

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex];

    const type = String(row[index["type"]] || "").trim();

    const majorCategory = String(row[index["major_category"]] || "").trim();

    const subCategory = String(row[index["sub_category"]] || "").trim();

    if (!type || !majorCategory || !subCategory) {
      continue;
    }

    const majorKey = `${type}|${majorCategory}`;

    let majorCategoryId = String(row[index["major_category_id"]] || "").trim();

    if (!majorCategoryId) {
      majorCategoryId = majorIdMap.get(majorKey) || createMajorId();

      majorIdMap.set(majorKey, majorCategoryId);

      row[index["major_category_id"]] = majorCategoryId;
    }

    let subCategoryId = String(row[index["sub_category_id"]] || "").trim();

    if (!subCategoryId) {
      subCategoryId = createSubId();

      row[index["sub_category_id"]] = subCategoryId;
    }

    const activeValue = row[index["active"]];

    if (activeValue === "" || activeValue === null) {
      row[index["active"]] = 1;
    }

    const sortOrderValue = row[index["sort_order"]];

    if (sortOrderValue === "" || sortOrderValue === null) {
      row[index["sort_order"]] = rowIndex;
    }
  }

  sheet.getRange(1, 1, values.length, headers.length).setValues(values);

  clearTableCache(SHEETS.CATEGORIES);
}
