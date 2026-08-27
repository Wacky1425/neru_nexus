

// ============================================================
// Goal API / Domain
// ============================================================

function createGoalFromApp_(data) {
  const goalName = String(data.goalName || "").trim();

  if (!goalName) {
    throw new Error("goalNameは必須です");
  }

  const sheet = getRequiredSheet(SHEETS.GOALS);

  const goalId = Utilities.getUuid();

  const row = [
    goalId,
    goalName,
    String(data.goalType || "").trim(),
    Number(data.targetAmount || 0),
    normalizeGoalDate_(data.targetDate),
    String(data.certainty || "").trim(),
    Number(data.reservedCash || 0),
    Number(data.priority || 0),
    1,
    String(data.note || "").trim(),
  ];

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);

  clearTableCache(SHEETS.GOALS);

  return createJsonResponse_(
    {
      goalId,
      status: "created",
    },
    "ok",
  );
}

function updateGoalFromApp_(data) {
  const goalId = String(data.goalId || "").trim();

  if (!goalId) {
    throw new Error("goalIdは必須です");
  }

  const sheet = getRequiredSheet(SHEETS.GOALS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("Goalが見つかりません");
  }

  const index = createHeaderIndex(values[0]);

  const rowIndex = values.findIndex(
    (row, i) => i > 0 && String(row[index["goal_id"]] || "").trim() === goalId,
  );

  if (rowIndex === -1) {
    throw new Error(`Goalが見つかりません: ${goalId}`);
  }

  const row = values[rowIndex];

  row[index["goal_name"]] = String(data.goalName || "").trim();

  row[index["goal_type"]] = String(data.goalType || "").trim();

  row[index["target_amount"]] = Number(data.targetAmount || 0);

  row[index["target_date"]] = normalizeGoalDate_(data.targetDate);

  row[index["certainty"]] = String(data.certainty || "").trim();

  row[index["reserved_cash"]] = Number(data.reservedCash || 0);

  row[index["priority"]] = Number(data.priority || 0);

  row[index["note"]] = String(data.note || "").trim();

  sheet.getRange(rowIndex + 1, 1, 1, row.length).setValues([row]);

  clearTableCache(SHEETS.GOALS);

  return createJsonResponse_(
    {
      goalId,
      status: "updated",
    },
    "ok",
  );
}

function deactivateGoalFromApp_(data) {
  const goalId = String(data.goalId || "").trim();

  if (!goalId) {
    throw new Error("goalIdは必須です");
  }

  const sheet = getRequiredSheet(SHEETS.GOALS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("Goalが見つかりません");
  }

  const index = createHeaderIndex(values[0]);

  const rowIndex = values.findIndex(
    (row, i) => i > 0 && String(row[index["goal_id"]] || "").trim() === goalId,
  );

  if (rowIndex === -1) {
    throw new Error(`Goalが見つかりません: ${goalId}`);
  }

  sheet.getRange(rowIndex + 1, index["active"] + 1).setValue(0);

  clearTableCache(SHEETS.GOALS);

  return createJsonResponse_(
    {
      goalId,
      status: "deactivated",
    },
    "ok",
  );
}

function normalizeGoalDate_(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return Utilities.formatDate(value, "Asia/Tokyo", "yyyy-MM-dd");
  }

  const text = String(value).normalize("NFKC").trim();

  if (!text) {
    return "";
  }

  const match = text.match(/^(\d{4})[\/\-](\d{1,2})(?:[\/\-](\d{1,2}))?$/);

  if (!match) {
    throw new Error("targetDateの形式が正しくありません");
  }

  const year = match[1];

  const month = String(Number(match[2])).padStart(2, "0");

  const day = String(Number(match[3] || 1)).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// ============================================================
// Goal Read API
// ============================================================

function getGoalsData() {
  const rows = loadObjects(SHEETS.GOALS);

  const items = rows
    .filter((row) => {
      const active = String(row.active === undefined ? "1" : row.active)
        .trim()
        .toUpperCase();

      return active === "1" || active === "TRUE";
    })
    .map((row) => ({
      goalId: String(row.goal_id || "").trim(),

      goalName: String(row.goal_name || "").trim(),

      goalType: String(row.goal_type || "").trim(),

      targetAmount: Number(row.target_amount || 0),

      targetDate: formatApiDate_(row.target_date),

      certainty: String(row.certainty || "").trim(),

      reservedCash: Number(row.reserved_cash || 0),

      priority: Number(row.priority || 0),

      note: String(row.note || "").trim(),
    }))
    .filter((item) => item.goalId && item.goalName)
    .sort((a, b) => {
      const priorityDifference = b.priority - a.priority;

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return a.targetDate.localeCompare(b.targetDate);
    });

  return {
    items,
    total: items.length,
  };
}

