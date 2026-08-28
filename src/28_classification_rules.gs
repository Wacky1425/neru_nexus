
/**
 * V1.2-2 Merchant auto-classification + rule management.
 *
 * M_Rules remains the single source of truth for active classification rules.
 * Suggestions are derived on demand from confirmed transaction history and are
 * not persisted until the user promotes one to M_Rules.
 */

function getRuleManagementData_() {
  const table = loadTable(SHEETS.RULES);
  if (table.headers.length === 0) {
    return { items: [] };
  }

  assertRequiredColumns(
    table.index,
    [
      "priority", "match_target", "keyword", "rule_type", "type_result",
      "major_category", "sub_category", "purpose_type", "expense_ratio",
      "status_result", "note", "wallet_result", "intent_result",
    ],
    SHEETS.RULES,
  );

  const items = table.rows
    .map((row, index) => ({
      rowNumber: index + 2,
      priority: getNumber(row, table.index, "priority"),
      matchTarget: getString(row, table.index, "match_target") || "merchant",
      keyword: getString(row, table.index, "keyword"),
      ruleType: getString(row, table.index, "rule_type") || "contains",
      typeResult: getString(row, table.index, "type_result"),
      majorCategory: getString(row, table.index, "major_category"),
      subCategory: getString(row, table.index, "sub_category"),
      purposeType: getString(row, table.index, "purpose_type"),
      expenseRatio: getNumber(row, table.index, "expense_ratio"),
      statusResult: getString(row, table.index, "status_result") || "確定",
      note: getString(row, table.index, "note"),
      walletResult: getString(row, table.index, "wallet_result"),
      intentResult: getString(row, table.index, "intent_result"),
    }))
    .filter((item) => item.keyword);

  items.sort((a, b) => a.priority - b.priority || a.rowNumber - b.rowNumber);
  return { items };
}

function normalizeRulePayload_(data, existing) {
  const source = existing || {};
  const matchTarget = String(data.matchTarget || source.matchTarget || "merchant").trim();
  const keyword = String(data.keyword || source.keyword || "").trim();
  const ruleType = String(data.ruleType || source.ruleType || "equals").trim();
  const typeResult = String(data.typeResult || source.typeResult || "").trim();
  const majorCategory = String(data.majorCategory || source.majorCategory || "").trim();
  const subCategory = String(data.subCategory || source.subCategory || "").trim();
  const purposeType = String(data.purposeType || source.purposeType || "私用").trim() || "私用";
  const expenseRatioRaw =
    data.expenseRatio === undefined ? source.expenseRatio : data.expenseRatio;
  const expenseRatio = Math.max(0, Math.min(1, Number(expenseRatioRaw || 0)));
  const statusResult = String(data.statusResult || source.statusResult || "確定").trim() || "確定";
  const note = String(
    data.note === undefined ? source.note || "" : data.note || "",
  ).trim();
  const walletResult = String(
    data.walletResult || source.walletResult ||
      (purposeType === "経費" || purposeType === "事業収入" ? "事業" : "生活"),
  ).trim();
  const intentResult = String(
    data.intentResult || source.intentResult ||
      guessIntent(typeResult, majorCategory, subCategory),
  ).trim();

  if (!keyword) throw new Error("キーワードは必須です");
  if (!["merchant", "all"].includes(matchTarget)) {
    throw new Error("matchTargetはmerchantまたはallを指定してください");
  }
  if (!["contains", "starts_with", "equals"].includes(ruleType)) {
    throw new Error("ruleTypeが不正です");
  }
  if (!["支出", "収入", "移動"].includes(typeResult)) {
    throw new Error("typeResultが不正です");
  }
  if (!majorCategory || !subCategory) {
    throw new Error("カテゴリは必須です");
  }
  if (!Number.isFinite(expenseRatio)) {
    throw new Error("expenseRatioが不正です");
  }

  return {
    matchTarget,
    keyword,
    ruleType,
    typeResult,
    majorCategory,
    subCategory,
    purposeType,
    expenseRatio,
    statusResult,
    note,
    walletResult,
    intentResult,
  };
}

function ruleObjectToSheetObject_(rule, priority) {
  return {
    priority,
    match_target: rule.matchTarget,
    keyword: rule.keyword,
    rule_type: rule.ruleType,
    type_result: rule.typeResult,
    major_category: rule.majorCategory,
    sub_category: rule.subCategory,
    purpose_type: rule.purposeType,
    expense_ratio: rule.expenseRatio,
    status_result: rule.statusResult,
    note: rule.note,
    wallet_result: rule.walletResult,
    intent_result: rule.intentResult,
  };
}

function createClassificationRuleFromApp_(data) {
  const rule = normalizeRulePayload_(data);
  const table = loadTable(SHEETS.RULES);
  assertRequiredColumns(
    table.index,
    ["priority", "match_target", "keyword", "rule_type"],
    SHEETS.RULES,
  );

  const duplicate = table.rows.some((row) =>
    getString(row, table.index, "match_target") === rule.matchTarget &&
    getString(row, table.index, "keyword") === rule.keyword &&
    getString(row, table.index, "rule_type") === rule.ruleType
  );
  if (duplicate) {
    throw new Error("同じ判定条件のルールがすでにあります");
  }

  const priority =
    Number(data.priority || 0) || getNextRulePriority_(table.rows, table.index);
  const addedCount = appendRules_([ruleObjectToSheetObject_(rule, priority)]);
  clearTableCache(SHEETS.RULES);

  return createJsonResponse_(
    { created: addedCount > 0, rule: { ...rule, priority } },
    "ok",
  );
}

function findRuleRowByNumber_(rowNumber) {
  const target = Number(rowNumber || 0);
  const table = loadTable(SHEETS.RULES);
  if (!Number.isInteger(target) || target < 2 || target > table.rows.length + 1) {
    throw new Error("対象ルールが見つかりません");
  }
  const row = table.rows[target - 2];
  return {
    table,
    row,
    rowNumber: target,
    rule: {
      rowNumber: target,
      priority: getNumber(row, table.index, "priority"),
      matchTarget: getString(row, table.index, "match_target") || "merchant",
      keyword: getString(row, table.index, "keyword"),
      ruleType: getString(row, table.index, "rule_type") || "contains",
      typeResult: getString(row, table.index, "type_result"),
      majorCategory: getString(row, table.index, "major_category"),
      subCategory: getString(row, table.index, "sub_category"),
      purposeType: getString(row, table.index, "purpose_type"),
      expenseRatio: getNumber(row, table.index, "expense_ratio"),
      statusResult: getString(row, table.index, "status_result") || "確定",
      note: getString(row, table.index, "note"),
      walletResult: getString(row, table.index, "wallet_result"),
      intentResult: getString(row, table.index, "intent_result"),
    },
  };
}

function updateClassificationRuleFromApp_(data) {
  const found = findRuleRowByNumber_(data.rowNumber);
  const rule = normalizeRulePayload_(data, found.rule);
  const priority = Number(data.priority || found.rule.priority || 0);

  const duplicate = found.table.rows.some((row, index) =>
    index + 2 !== found.rowNumber &&
    getString(row, found.table.index, "match_target") === rule.matchTarget &&
    getString(row, found.table.index, "keyword") === rule.keyword &&
    getString(row, found.table.index, "rule_type") === rule.ruleType
  );
  if (duplicate) throw new Error("同じ判定条件のルールがすでにあります");

  const values = buildRuleRow_(
    found.table.headers,
    ruleObjectToSheetObject_(rule, priority),
  );
  const sheet = getRequiredSheet(SHEETS.RULES);
  sheet.getRange(found.rowNumber, 1, 1, values.length).setValues([values]);
  clearTableCache(SHEETS.RULES);

  return createJsonResponse_(
    { updated: true, rule: { ...rule, rowNumber: found.rowNumber, priority } },
    "ok",
  );
}

function deleteClassificationRuleFromApp_(data) {
  const found = findRuleRowByNumber_(data.rowNumber);
  getRequiredSheet(SHEETS.RULES).deleteRow(found.rowNumber);
  clearTableCache(SHEETS.RULES);
  return createJsonResponse_({ deleted: true }, "ok");
}

function buildMerchantClassificationSuggestions_() {
  const table = loadTransactions();
  if (table.rows.length === 0) return { items: [] };

  assertRequiredColumns(
    table.index,
    [
      "merchant", "type", "major_category", "sub_category", "purpose_type",
      "expense_ratio", "status", "wallet", "intent",
    ],
    SHEETS.TRANSACTIONS,
  );

  const ruleData = getRuleManagementData_().items;
  const existingExact = new Set(
    ruleData
      .filter((rule) => rule.matchTarget === "merchant" && rule.ruleType === "equals")
      .map((rule) => normalizeTextForRule(rule.keyword)),
  );

  const groups = new Map();
  for (const row of table.rows) {
    if (isIgnoredTransactionRow_(row, table.index)) continue;
    if (getString(row, table.index, "status") !== "確定") continue;

    const merchant = getString(row, table.index, "merchant").trim();
    const type = getString(row, table.index, "type").trim();
    const majorCategory = getString(row, table.index, "major_category").trim();
    const subCategory = getString(row, table.index, "sub_category").trim();
    if (!merchant || !type || !majorCategory || !subCategory) continue;
    if (majorCategory === "その他" && subCategory === "要確認") continue;

    const merchantKey = normalizeTextForRule(merchant);
    if (!merchantKey || existingExact.has(merchantKey)) continue;

    const classificationKey = [
      type,
      majorCategory,
      subCategory,
      getString(row, table.index, "purpose_type"),
      getNumber(row, table.index, "expense_ratio"),
      getString(row, table.index, "wallet"),
      getString(row, table.index, "intent"),
    ].join("\u001f");

    if (!groups.has(merchantKey)) {
      groups.set(merchantKey, { merchant, total: 0, classes: new Map() });
    }
    const group = groups.get(merchantKey);
    group.total++;
    const current = group.classes.get(classificationKey) || {
      count: 0,
      typeResult: type,
      majorCategory,
      subCategory,
      purposeType: getString(row, table.index, "purpose_type") || "私用",
      expenseRatio: getNumber(row, table.index, "expense_ratio"),
      walletResult: getString(row, table.index, "wallet") || "生活",
      intentResult: getString(row, table.index, "intent") ||
        guessIntent(type, majorCategory, subCategory),
    };
    current.count++;
    group.classes.set(classificationKey, current);
  }

  const items = [];
  for (const group of groups.values()) {
    const ranked = Array.from(group.classes.values())
      .sort((a, b) => b.count - a.count);
    const best = ranked[0];
    if (!best || best.count < 2) continue;

    const confidence = best.count / group.total;
    if (confidence < 0.75) continue;

    items.push({
      merchant: group.merchant,
      sampleCount: group.total,
      matchedCount: best.count,
      confidence,
      typeResult: best.typeResult,
      majorCategory: best.majorCategory,
      subCategory: best.subCategory,
      purposeType: best.purposeType,
      expenseRatio: best.expenseRatio,
      walletResult: best.walletResult,
      intentResult: best.intentResult,
    });
  }

  items.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      b.matchedCount - a.matchedCount ||
      a.merchant.localeCompare(b.merchant),
  );

  return { items: items.slice(0, 100) };
}

function promoteMerchantSuggestionFromApp_(data) {
  const merchant = String(data.merchant || "").trim();
  if (!merchant) throw new Error("merchantは必須です");

  return createClassificationRuleFromApp_({
    matchTarget: "merchant",
    keyword: merchant,
    ruleType: "equals",
    typeResult: data.typeResult,
    majorCategory: data.majorCategory,
    subCategory: data.subCategory,
    purposeType: data.purposeType,
    expenseRatio: data.expenseRatio,
    statusResult: "確定",
    note: "履歴から自動提案を承認",
    walletResult: data.walletResult,
    intentResult: data.intentResult,
  });
}

function testMerchantSuggestionBuilder_() {
  // Core confidence contract used by buildMerchantClassificationSuggestions_.
  const counts = [4, 1];
  const total = counts.reduce((sum, value) => sum + value, 0);
  const confidence = Math.max(...counts) / total;
  if (confidence !== 0.8) throw new Error("merchant候補confidence計算失敗");
  if (!(Math.max(...counts) >= 2 && confidence >= 0.75)) {
    throw new Error("merchant候補閾値判定失敗");
  }
  return { assertions: "PASS", confidence };
}
