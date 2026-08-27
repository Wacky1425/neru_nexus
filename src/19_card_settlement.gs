

// ============================================================
// Card Settlement
// ============================================================

function reconcileCardSettlementForBatch_(importBatch, rawAccountName) {
  // ============================================================
  // ① 繰上返済を先に照合
  // ============================================================

  const earlyRepaymentResult = reconcileOliveEarlyRepayments_(rawAccountName);

  // ============================================================
  // ② 残った通常請求を従来ロジックで照合
  //
  // 繰上返済でmatchedになった明細は、
  // reconcilePendingCardSettlements_() 側で除外される。
  // ============================================================

  const normalResult = reconcilePendingCardSettlements_(rawAccountName);

  return {
    ...normalResult,

    earlyRepaymentResult,
  };
}

function reconcilePendingCardSettlements_(rawAccountName) {
  const cardAccount = resolveCanonicalAccountName_(rawAccountName);

  if (!cardAccount) {
    return {
      matched: false,
      reason: "invalid_card_account",
    };
  }

  const billingSettings = getAccountBillingSettings_(cardAccount);

  if (!billingSettings) {
    return {
      matched: false,
      reason: "billing_settings_not_found",
      cardAccount,
    };
  }

  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return {
      matched: false,
      reason: "no_transactions",
      cardAccount,
    };
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    [
      "id",
      "transaction_date",
      "amount",
      "type",
      "source_type",
      "account_name",
      "merchant",
      "item_name",
      "raw_text",
      "note",
      "sub_category",
      "to_account",
      "settlement_status",
      "settlement_id",
    ],
    SHEETS.TRANSACTIONS,
  );

  // ============================================================
  // ① 対象カードの pending / review 銀行引落を収集
  // ============================================================

  const pendingSettlements = [];

  let changed = false;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const type = String(row[index["type"]] || "").trim();

    if (type !== "移動") {
      continue;
    }

    const subCategory = String(row[index["sub_category"]] || "").trim();

    if (subCategory !== "クレカ引落") {
      continue;
    }

    const status = String(row[index["settlement_status"]] || "").trim();

    /*
     * 確定済みは触らない。
     */
    if (status === "matched" || status === "manual_matched") {
      continue;
    }

    /*
     * 空欄もpending相当として扱えるようにする。
     */
    if (status && status !== "pending" && status !== "review") {
      continue;
    }

    let toAccount = resolveCanonicalAccountName_(row[index["to_account"]]);

    /*
     * to_accountが無い古いデータなどは
     * 銀行明細本文からカードを再判定。
     */
    if (!toAccount) {
      toAccount = resolveAccountFromAliases_([
        row[index["merchant"]],
        row[index["item_name"]],
        row[index["note"]],
        row[index["raw_text"]],
      ]);
    }

    if (toAccount !== cardAccount) {
      continue;
    }

    /*
     * 後からカードを特定できた場合は
     * to_accountも補完する。
     */
    const currentToAccount = String(row[index["to_account"]] || "").trim();

    if (!currentToAccount && toAccount) {
      row[index["to_account"]] = toAccount;

      changed = true;
    }

    const date = normalizeSettlementDate_(row[index["transaction_date"]]);

    if (!date) {
      continue;
    }

    /*
     * 銀行側は実際の引落月を請求月とする。
     */
    const billingYearMonth = date.substring(0, 7);

    const amount = Number(row[index["amount"]] || 0);

    if (amount <= 0) {
      continue;
    }

    pendingSettlements.push({
      sheetIndex: i,
      transactionId: String(row[index["id"]] || "").trim(),
      date,
      billingYearMonth,
      amount,
      previousStatus: status,
    });
  }

  if (pendingSettlements.length === 0) {
    /*
     * to_account補完だけ発生している可能性があるので
     * 必要なら書き戻す。
     */
    if (changed) {
      writeSettlementTransactionValues_(sheet, values);
    }

    return {
      matched: false,
      reason: "no_pending_settlement",
      cardAccount,
      billingSettings,
      matchedCount: 0,
      reviewCount: 0,
      processedCount: 0,
      matches: [],
      reviews: [],
    };
  }

  pendingSettlements.sort((a, b) => a.date.localeCompare(b.date));

  const matchedResults = [];
  const reviewResults = [];

  // ============================================================
  // ② 各銀行引落を再照合
  // ============================================================

  for (const pending of pendingSettlements) {
    const candidates = [];

    let detailTotal = 0;

    for (let i = 1; i < values.length; i++) {
      const row = values[i];

      const sourceType = String(row[index["source_type"]] || "").trim();

      if (sourceType !== "CSV_クレカ") {
        continue;
      }

      const rowAccount = resolveCanonicalAccountName_(
        row[index["account_name"]],
      );

      if (rowAccount !== cardAccount) {
        continue;
      }

      const settlementStatus = String(
        row[index["settlement_status"]] || "",
      ).trim();

      /*
       * すでに別Settlementで確定している明細は
       * 候補に含めない。
       */
      if (
        settlementStatus === "matched" ||
        settlementStatus === "manual_matched"
      ) {
        continue;
      }

      const transactionDate = normalizeSettlementDate_(
        row[index["transaction_date"]],
      );

      if (!transactionDate) {
        continue;
      }

      const merchant = String(row[index["merchant"]] || "")
        .normalize("NFKC")
        .trim();

      const itemName = String(row[index["item_name"]] || "")
        .normalize("NFKC")
        .trim();

      const note = String(row[index["note"]] || "")
        .normalize("NFKC")
        .trim();

      // ----------------------------------------------------------
      // 明細の請求月を現在のカード設定で再計算
      // ----------------------------------------------------------

      const isLateFee =
        merchant.includes("遅延損害金") ||
        itemName.includes("遅延損害金") ||
        note.includes("遅延損害金");

      let detailBillingYearMonth = "";

      if (isLateFee) {
        /*
         * 遅延損害金はtransaction_dateを
         * 実際の支払日としているため、
         * その月の請求に所属。
         */
        detailBillingYearMonth = transactionDate.substring(0, 7);
      } else {
        detailBillingYearMonth = calculateBillingYearMonth_(
          transactionDate,
          cardAccount,
        );
      }

      if (detailBillingYearMonth !== pending.billingYearMonth) {
        continue;
      }

      const amount = Number(row[index["amount"]] || 0);

      if (amount <= 0) {
        continue;
      }

      candidates.push({
        sheetIndex: i,
        transactionId: String(row[index["id"]] || "").trim(),
        date: transactionDate,
        amount,
      });

      detailTotal += amount;
    }

    const difference = pending.amount - detailTotal;

    Logger.log(
      [
        "Settlement再照合",
        `card=${cardAccount}`,
        `引落日=${pending.date}`,
        `請求月=${pending.billingYearMonth}`,
        `引落額=${pending.amount}`,
        `明細合計=${detailTotal}`,
        `差額=${difference}`,
        `件数=${candidates.length}`,
      ].join(" / "),
    );

    // ==========================================================
    // ③ 候補なし → review
    // ==========================================================

    if (candidates.length === 0) {
      if (values[pending.sheetIndex][index["settlement_status"]] !== "review") {
        values[pending.sheetIndex][index["settlement_status"]] = "review";

        changed = true;
      }

      /*
       * 未確定なのでsettlement_idは持たせない。
       */
      if (values[pending.sheetIndex][index["settlement_id"]]) {
        values[pending.sheetIndex][index["settlement_id"]] = "";

        changed = true;
      }

      reviewResults.push({
        transactionId: pending.transactionId,
        settlementDate: pending.date,
        billingYearMonth: pending.billingYearMonth,
        settlementAmount: pending.amount,
        detailTotal: 0,
        difference: pending.amount,
        detailCount: 0,
        reason: "no_candidates",
      });

      continue;
    }

    // ==========================================================
    // ④ 金額不一致 → review
    // ==========================================================

    if (difference !== 0) {
      if (values[pending.sheetIndex][index["settlement_status"]] !== "review") {
        values[pending.sheetIndex][index["settlement_status"]] = "review";

        changed = true;
      }

      if (values[pending.sheetIndex][index["settlement_id"]]) {
        values[pending.sheetIndex][index["settlement_id"]] = "";

        changed = true;
      }

      reviewResults.push({
        transactionId: pending.transactionId,
        settlementDate: pending.date,
        billingYearMonth: pending.billingYearMonth,
        settlementAmount: pending.amount,
        detailTotal,
        difference,
        detailCount: candidates.length,
        reason: "amount_mismatch",
      });

      continue;
    }

    // ==========================================================
    // ⑤ 完全一致 → matched
    // ==========================================================

    const settlementId = "settlement_" + Utilities.getUuid();

    values[pending.sheetIndex][index["settlement_status"]] = "matched";

    values[pending.sheetIndex][index["settlement_id"]] = settlementId;

    for (const candidate of candidates) {
      values[candidate.sheetIndex][index["settlement_status"]] = "matched";

      values[candidate.sheetIndex][index["settlement_id"]] = settlementId;
    }

    changed = true;

    matchedResults.push({
      settlementId,
      transactionId: pending.transactionId,
      settlementDate: pending.date,
      billingYearMonth: pending.billingYearMonth,
      settlementAmount: pending.amount,
      detailTotal,
      difference: 0,
      detailCount: candidates.length,
      detailTransactionIds: candidates
        .map((candidate) => candidate.transactionId)
        .filter(Boolean),
    });
  }

  // ============================================================
  // ⑥ 必要な場合だけ一括書き戻し
  // ============================================================

  if (changed) {
    writeSettlementTransactionValues_(sheet, values);
  }

  return {
    matched: matchedResults.length > 0,

    cardAccount,

    billingSettings,

    processedCount: pendingSettlements.length,

    matchedCount: matchedResults.length,

    reviewCount: reviewResults.length,

    matches: matchedResults,

    reviews: reviewResults,
  };
}

function writeSettlementTransactionValues_(sheet, values) {
  if (values.length < 2) {
    return;
  }

  sheet
    .getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));

  clearTableCache(SHEETS.TRANSACTIONS);

  clearAccountBalanceCache_();

  clearHomeRecentTransactionsCache_();
}

function normalizeSettlementDate_(value) {
  if (!value) {
    return "";
  }

  // スプレッドシートからDate型で来た場合
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return "";
    }

    return Utilities.formatDate(value, "Asia/Tokyo", "yyyy-MM-dd");
  }

  const text = String(value).normalize("NFKC").trim();

  if (!text) {
    return "";
  }

  // 2026/6/27
  // 2026/06/27
  // 2026-6-27
  // 2026-06-27
  // 全部対応
  const match = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);

  if (!match) {
    return "";
  }

  const year = match[1];

  const month = String(Number(match[2])).padStart(2, "0");

  const day = String(Number(match[3])).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function confirmSettlementManually_(data) {
  const settlementTransactionId = String(
    data.settlementTransactionId || "",
  ).trim();

  if (!settlementTransactionId) {
    throw new Error("settlementTransactionIdは必須です");
  }

  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("取引データがありません");
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    [
      "id",
      "transaction_date",
      "type",
      "amount",
      "source_type",
      "account_name",
      "merchant",
      "item_name",
      "raw_text",
      "note",
      "sub_category",
      "to_account",
      "settlement_status",
      "settlement_id",
    ],
    SHEETS.TRANSACTIONS,
  );

  // ============================================================
  // 銀行側引落を探す
  // ============================================================

  let settlementRowIndex = -1;

  for (let i = 1; i < values.length; i++) {
    const id = String(values[i][index["id"]] || "").trim();

    if (id === settlementTransactionId) {
      settlementRowIndex = i;
      break;
    }
  }

  if (settlementRowIndex === -1) {
    throw new Error("照合対象の引落が見つかりません");
  }

  const settlementRow = values[settlementRowIndex];

  const type = String(settlementRow[index["type"]] || "").trim();

  const subCategory = String(settlementRow[index["sub_category"]] || "").trim();

  if (type !== "移動" || subCategory !== "クレカ引落") {
    throw new Error("クレジットカード引落取引ではありません");
  }

  const currentStatus = String(
    settlementRow[index["settlement_status"]] || "",
  ).trim();

  if (currentStatus === "matched" || currentStatus === "manual_matched") {
    throw new Error("この引落はすでに照合済みです");
  }

  // ============================================================
  // カード口座特定
  // ============================================================

  let cardAccount = resolveCanonicalAccountName_(
    settlementRow[index["to_account"]],
  );

  if (!cardAccount) {
    cardAccount = resolveAccountFromAliases_([
      settlementRow[index["merchant"]],
      settlementRow[index["item_name"]],
      settlementRow[index["note"]],
      settlementRow[index["raw_text"]],
    ]);
  }

  if (!cardAccount) {
    throw new Error("引落先カードを特定できません");
  }

  // to_accountを補完
  settlementRow[index["to_account"]] = cardAccount;

  const settlementDate = normalizeSettlementDate_(
    settlementRow[index["transaction_date"]],
  );

  if (!settlementDate) {
    throw new Error("引落日を取得できません");
  }

  const billingYearMonth = settlementDate.substring(0, 7);

  const settlementAmount = Number(settlementRow[index["amount"]] || 0);

  // ============================================================
  // 同じ請求月のカード明細を収集
  // ============================================================

  const candidateIndexes = [];

  let detailTotal = 0;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const sourceType = String(row[index["source_type"]] || "").trim();

    if (sourceType !== "CSV_クレカ") {
      continue;
    }

    const rowAccount = resolveCanonicalAccountName_(row[index["account_name"]]);

    if (rowAccount !== cardAccount) {
      continue;
    }

    const status = String(row[index["settlement_status"]] || "").trim();

    if (status === "matched" || status === "manual_matched") {
      continue;
    }

    const transactionDate = normalizeSettlementDate_(
      row[index["transaction_date"]],
    );

    if (!transactionDate) {
      continue;
    }

    const merchant = String(row[index["merchant"]] || "")
      .normalize("NFKC")
      .trim();

    const itemName = String(row[index["item_name"]] || "")
      .normalize("NFKC")
      .trim();

    const note = String(row[index["note"]] || "")
      .normalize("NFKC")
      .trim();

    const isLateFee =
      merchant.includes("遅延損害金") ||
      itemName.includes("遅延損害金") ||
      note.includes("遅延損害金");

    let detailBillingYearMonth = "";

    if (isLateFee) {
      detailBillingYearMonth = transactionDate.substring(0, 7);
    } else {
      detailBillingYearMonth = calculateBillingYearMonth_(
        transactionDate,
        cardAccount,
      );
    }

    if (detailBillingYearMonth !== billingYearMonth) {
      continue;
    }

    const amount = Number(row[index["amount"]] || 0);

    if (amount <= 0) {
      continue;
    }

    candidateIndexes.push(i);

    detailTotal += amount;
  }

  if (candidateIndexes.length === 0) {
    throw new Error("紐付け対象のカード明細がありません");
  }

  const difference = settlementAmount - detailTotal;

  // ============================================================
  // 手動照合
  // ============================================================

  const settlementId = "settlement_" + Utilities.getUuid();

  settlementRow[index["settlement_status"]] = "manual_matched";

  settlementRow[index["settlement_id"]] = settlementId;

  for (const rowIndex of candidateIndexes) {
    values[rowIndex][index["settlement_status"]] = "manual_matched";

    values[rowIndex][index["settlement_id"]] = settlementId;
  }

  // ============================================================
  // 一括書き戻し
  // ============================================================

  sheet
    .getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));

  clearTableCache(SHEETS.TRANSACTIONS);

  clearAccountBalanceCache_();

  rebuildAllViews();

  return createJsonResponse_(
    {
      matched: true,

      manual: true,

      settlementId,

      settlementTransactionId,

      cardAccount,

      settlementDate,

      billingYearMonth,

      settlementAmount,

      detailTotal,

      difference,

      detailCount: candidateIndexes.length,
    },
    "ok",
  );
}

function cancelSettlementManualMatch_(data) {
  const settlementTransactionId = String(
    data.settlementTransactionId || "",
  ).trim();

  if (!settlementTransactionId) {
    throw new Error("settlementTransactionIdは必須です");
  }

  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("取引データがありません");
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    ["id", "type", "sub_category", "settlement_status", "settlement_id"],
    SHEETS.TRANSACTIONS,
  );

  // ============================================================
  // ① 銀行側のクレカ引落を探す
  // ============================================================

  let settlementRowIndex = -1;

  for (let i = 1; i < values.length; i++) {
    const id = String(values[i][index["id"]] || "").trim();

    if (id === settlementTransactionId) {
      settlementRowIndex = i;
      break;
    }
  }

  if (settlementRowIndex === -1) {
    throw new Error("解除対象の引落が見つかりません");
  }

  const settlementRow = values[settlementRowIndex];

  // ============================================================
  // ② クレカ引落であることを確認
  // ============================================================

  const type = String(settlementRow[index["type"]] || "").trim();

  const subCategory = String(settlementRow[index["sub_category"]] || "").trim();

  if (type !== "移動" || subCategory !== "クレカ引落") {
    throw new Error("クレジットカード引落取引ではありません");
  }

  // ============================================================
  // ③ 手動照合済みであることを確認
  // ============================================================

  const currentStatus = String(
    settlementRow[index["settlement_status"]] || "",
  ).trim();

  if (currentStatus !== "manual_matched") {
    throw new Error("手動照合された引落ではありません");
  }

  // ============================================================
  // ④ settlement_id取得
  // ============================================================

  const settlementId = String(
    settlementRow[index["settlement_id"]] || "",
  ).trim();

  if (!settlementId) {
    throw new Error("settlement_idが設定されていません");
  }

  // ============================================================
  // ⑤ 同じsettlement_idの取引を解除
  //
  // 銀行引落
  //   → review
  //
  // カード明細
  //   → 未照合状態
  // ============================================================

  let releasedDetailCount = 0;
  let releasedSettlementCount = 0;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const rowSettlementId = String(row[index["settlement_id"]] || "").trim();

    if (rowSettlementId !== settlementId) {
      continue;
    }

    const rowStatus = String(row[index["settlement_status"]] || "").trim();

    // 念のためmanual_matchedだけ解除する
    if (rowStatus !== "manual_matched") {
      continue;
    }

    const rowType = String(row[index["type"]] || "").trim();

    const rowSubCategory = String(row[index["sub_category"]] || "").trim();

    // ----------------------------------------------------------
    // 銀行側引落
    // ----------------------------------------------------------

    if (rowType === "移動" && rowSubCategory === "クレカ引落") {
      row[index["settlement_status"]] = "review";
      row[index["settlement_id"]] = "";

      releasedSettlementCount++;

      continue;
    }

    // ----------------------------------------------------------
    // カード明細
    //
    // 再度自動照合・手動照合の候補にできるよう
    // status / settlement_idを空に戻す
    // ----------------------------------------------------------

    row[index["settlement_status"]] = "";
    row[index["settlement_id"]] = "";

    releasedDetailCount++;
  }

  // ============================================================
  // ⑥ 最低限、銀行引落が解除されたことを確認
  // ============================================================

  if (releasedSettlementCount === 0) {
    throw new Error("解除対象の銀行引落が見つかりませんでした");
  }

  // ============================================================
  // ⑦ 一括書き戻し
  // ============================================================

  sheet
    .getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));

  // ============================================================
  // ⑧ キャッシュ・View更新
  // ============================================================

  clearTableCache(SHEETS.TRANSACTIONS);

  clearAccountBalanceCache_();

  rebuildAllViews();

  // ============================================================
  // ⑨ Response
  // ============================================================

  return createJsonResponse_(
    {
      cancelled: true,

      settlementTransactionId,

      settlementId,

      releasedSettlementCount,

      releasedDetailCount,
    },
    "ok",
  );
}

function getSettlementStatusesData_() {
  const perfStart = Date.now();
  let perfLast = perfStart;

  const performance = {};

  function perfMark_(name) {
    const now = Date.now();

    performance[name] = now - perfLast;

    perfLast = now;
  }

  // ============================================================
  // ① Transactions読込
  // ============================================================

  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();

  perfMark_("transactionsRead");

  if (values.length < 2) {
    return {
      items: [],

      summary: {
        totalCount: 0,
        matchedCount: 0,
        manualMatchedCount: 0,
        reviewCount: 0,
        pendingCount: 0,
      },

      performance: {
        ...performance,
        total: Date.now() - perfStart,
      },
    };
  }

  // ============================================================
  // ② Header
  // ============================================================

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    [
      "id",
      "transaction_date",
      "type",
      "amount",
      "major_category",
      "sub_category",
      "account_name",
      "merchant",
      "item_name",
      "raw_text",
      "note",
      "to_account",
      "source_type",
      "settlement_status",
      "settlement_id",
    ],
    SHEETS.TRANSACTIONS,
  );

  perfMark_("header");

  // ============================================================
  // ③ カード請求設定
  //
  // M_Accountsを最初に1回だけ読む
  // ============================================================

  const billingSettingsMap = buildAccountBillingSettingsMap_();

  perfMark_("billingSettings");

  // ============================================================
  // ④ カード明細集計
  //
  // cardAccount + billingYearMonth
  // ============================================================

  const detailMap = new Map();

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const sourceType = String(row[index["source_type"]] || "").trim();

    if (sourceType !== "CSV_クレカ") {
      continue;
    }

    // ----------------------------------------------------------
    // カード口座
    // ----------------------------------------------------------

    const cardAccount = resolveCanonicalAccountName_(
      row[index["account_name"]],
    );

    if (!cardAccount) {
      continue;
    }

    // ----------------------------------------------------------
    // 利用日
    // ----------------------------------------------------------

    const transactionDate = normalizeSettlementDate_(
      row[index["transaction_date"]],
    );

    if (!transactionDate) {
      continue;
    }

    // ----------------------------------------------------------
    // 遅延損害金判定
    // ----------------------------------------------------------

    const merchant = String(row[index["merchant"]] || "")
      .normalize("NFKC")
      .trim();

    const itemName = String(row[index["item_name"]] || "")
      .normalize("NFKC")
      .trim();

    const note = String(row[index["note"]] || "")
      .normalize("NFKC")
      .trim();

    const isLateFee =
      merchant.includes("遅延損害金") ||
      itemName.includes("遅延損害金") ||
      note.includes("遅延損害金");

    // ----------------------------------------------------------
    // 請求月
    // ----------------------------------------------------------

    let billingYearMonth = "";

    if (isLateFee) {
      /*
       * 遅延損害金は
       * transaction_dateの月を
       * そのまま請求月とする。
       */
      billingYearMonth = transactionDate.substring(0, 7);
    } else {
      /*
       * 通常カード明細。
       *
       * ここではM_Accountsを
       * 再読込しない。
       */
      billingYearMonth = calculateBillingYearMonthFromSettings_(
        transactionDate,
        cardAccount,
        billingSettingsMap,
      );
    }

    if (!billingYearMonth) {
      continue;
    }

    // ----------------------------------------------------------
    // 金額
    // ----------------------------------------------------------

    const amount = Number(row[index["amount"]] || 0);

    if (amount <= 0) {
      continue;
    }

    // ----------------------------------------------------------
    // ID
    // ----------------------------------------------------------

    const detailId = String(row[index["id"]] || "").trim();

    // ----------------------------------------------------------
    // 既存照合状態
    // ----------------------------------------------------------

    const settlementStatus = String(
      row[index["settlement_status"]] || "",
    ).trim();

    const settlementId = String(row[index["settlement_id"]] || "").trim();

    // ----------------------------------------------------------
    // 集計キー
    // ----------------------------------------------------------

    const key = `${cardAccount}|` + `${billingYearMonth}`;

    if (!detailMap.has(key)) {
      detailMap.set(key, {
        cardAccount,

        billingYearMonth,

        detailTotal: 0,

        detailCount: 0,

        detailTransactionIds: [],
        detailItems: [],

        matchedDetailTotal: 0,

        unmatchedDetailTotal: 0,

        matchedDetailCount: 0,

        unmatchedDetailCount: 0,
      });
    }

    const group = detailMap.get(key);

    group.detailTotal += amount;

    group.detailCount++;

    if (detailId) {
      group.detailTransactionIds.push(detailId);
    }

    group.detailItems.push({
      id: detailId,

      transactionDate,

      merchant,

      itemName,

      amount,

      majorCategory: String(row[index["major_category"]] || "").trim(),

      subCategory: String(row[index["sub_category"]] || "").trim(),

      settlementStatus,

      settlementId,
    });

    // ----------------------------------------------------------
    // 照合済み / 未照合
    // ----------------------------------------------------------

    if (
      settlementStatus === "matched" ||
      settlementStatus === "manual_matched" ||
      settlementId
    ) {
      group.matchedDetailTotal += amount;

      group.matchedDetailCount++;
    } else {
      group.unmatchedDetailTotal += amount;

      group.unmatchedDetailCount++;
    }
  }

  perfMark_("cardDetails");

  // ============================================================
  // ⑤ 銀行側クレカ引落
  // ============================================================

  const items = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    // ----------------------------------------------------------
    // 移動のみ
    // ----------------------------------------------------------

    const type = String(row[index["type"]] || "").trim();

    if (type !== "移動") {
      continue;
    }

    // ----------------------------------------------------------
    // クレカ引落のみ
    // ----------------------------------------------------------

    const subCategory = String(row[index["sub_category"]] || "").trim();

    if (subCategory !== "クレカ引落") {
      continue;
    }

    // ----------------------------------------------------------
    // Transaction ID
    // ----------------------------------------------------------

    const transactionId = String(row[index["id"]] || "").trim();

    // ----------------------------------------------------------
    // 引落日
    // ----------------------------------------------------------

    const settlementDate = normalizeSettlementDate_(
      row[index["transaction_date"]],
    );

    if (!settlementDate) {
      continue;
    }

    /*
     * 銀行側は
     * 実際に引き落とされた月を
     * 請求月として扱う。
     */
    const billingYearMonth = settlementDate.substring(0, 7);

    // ----------------------------------------------------------
    // 引落金額
    // ----------------------------------------------------------

    const settlementAmount = Number(row[index["amount"]] || 0);

    // ==========================================================
    // カード口座判定
    // ==========================================================

    let cardAccount = resolveCanonicalAccountName_(row[index["to_account"]]);

    /*
     * to_accountで分からない場合は
     * merchant等からAlias判定。
     */
    if (!cardAccount) {
      cardAccount = resolveAccountFromAliases_([
        row[index["merchant"]],

        row[index["item_name"]],

        row[index["note"]],

        row[index["raw_text"]],
      ]);
    }

    // ----------------------------------------------------------
    // 既存status
    // ----------------------------------------------------------

    const status = String(row[index["settlement_status"]] || "").trim();

    const settlementId = String(row[index["settlement_id"]] || "").trim();

    // ==========================================================
    // カード口座を特定できない
    // ==========================================================

    if (!cardAccount) {
      items.push({
        transactionId,

        cardAccount: "",

        settlementDate,

        billingYearMonth,

        settlementAmount,

        detailTotal: 0,

        difference: settlementAmount,

        detailCount: 0,

        matchedDetailTotal: 0,

        unmatchedDetailTotal: 0,

        matchedDetailCount: 0,

        unmatchedDetailCount: 0,

        status: status || "review",

        settlementId,

        detailTransactionIds: [],

        detailItems: [],

        canManualMatch: false,

        reason: "card_account_unresolved",
      });

      continue;
    }

    // ==========================================================
    // カード明細集計取得
    // ==========================================================

    const key = `${cardAccount}|` + `${billingYearMonth}`;

    const detailGroup = detailMap.get(key);

    const detailTotal = Number(detailGroup?.detailTotal || 0);

    const detailCount = Number(detailGroup?.detailCount || 0);

    const matchedDetailTotal = Number(detailGroup?.matchedDetailTotal || 0);

    const unmatchedDetailTotal = Number(detailGroup?.unmatchedDetailTotal || 0);

    const matchedDetailCount = Number(detailGroup?.matchedDetailCount || 0);

    const unmatchedDetailCount = Number(detailGroup?.unmatchedDetailCount || 0);

    const detailTransactionIds = detailGroup?.detailTransactionIds || [];

    const detailItems = detailGroup?.detailItems || [];

    // ==========================================================
    // 差額
    // ==========================================================

    const difference = settlementAmount - detailTotal;

    // ==========================================================
    // 表示Status
    // ==========================================================

    let displayStatus = status;

    /*
     * DB上にstatusがない場合のみ
     * 金額から暫定判定。
     */
    if (!displayStatus) {
      displayStatus = difference === 0 ? "matched" : "review";
    }

    // ==========================================================
    // 手動照合可能か
    // ==========================================================

    const canManualMatch =
      detailCount > 0 &&
      difference !== 0 &&
      displayStatus !== "matched" &&
      displayStatus !== "manual_matched";

    // ==========================================================
    // reason
    // ==========================================================

    let reason = "";

    if (detailCount === 0) {
      reason = "no_candidates";
    } else if (difference !== 0) {
      reason = "amount_mismatch";
    }

    // ==========================================================
    // 結果追加
    // ==========================================================

    items.push({
      transactionId,

      cardAccount,

      settlementDate,

      billingYearMonth,

      settlementAmount,

      detailTotal,

      difference,

      detailCount,

      matchedDetailTotal,

      unmatchedDetailTotal,

      matchedDetailCount,

      unmatchedDetailCount,

      status: displayStatus,

      settlementId,

      detailTransactionIds,

      detailItems,

      canManualMatch,

      reason,
    });
  }

  perfMark_("bankSettlements");

  // ============================================================
  // ⑥ 新しい引落を上へ
  // ============================================================

  items.sort((a, b) => b.settlementDate.localeCompare(a.settlementDate));

  perfMark_("sort");

  // ============================================================
  // ⑦ Summary
  // ============================================================

  let matchedCount = 0;

  let manualMatchedCount = 0;

  let reviewCount = 0;

  let pendingCount = 0;

  for (const item of items) {
    switch (item.status) {
      case "matched":
        matchedCount++;
        break;

      case "manual_matched":
        manualMatchedCount++;
        break;

      case "review":
        reviewCount++;
        break;

      case "pending":
        pendingCount++;
        break;
    }
  }

  perfMark_("summary");

  // ============================================================
  // ⑧ 計測結果をレスポンスに含める
  // ============================================================

  performance.total = Date.now() - perfStart;

  return {
    items,

    summary: {
      totalCount: items.length,

      matchedCount,

      manualMatchedCount,

      reviewCount,

      pendingCount,
    },

    /*
     * 一時的な性能計測用。
     * 原因特定後に消してOK。
     */
    performance,
  };
}

function buildAccountBillingSettingsMap_() {
  const accounts = loadObjects(SHEETS.ACCOUNTS);

  const map = new Map();

  for (const account of accounts) {
    const accountName = resolveCanonicalAccountName_(
      account.account_name || account.accountName || "",
    );

    if (!accountName) {
      continue;
    }

    const closingDay = Number(account.closing_day ?? account.closingDay ?? 0);

    const paymentDay = Number(account.payment_day ?? account.paymentDay ?? 0);

    const paymentMonthOffset = Number(
      account.payment_month_offset ?? account.paymentMonthOffset ?? 0,
    );

    map.set(accountName, {
      closingDay,
      paymentDay,
      paymentMonthOffset,
    });
  }

  return map;
}

function calculateBillingYearMonthFromSettings_(
  transactionDate,
  cardAccount,
  billingSettingsMap,
) {
  const settings = billingSettingsMap.get(cardAccount);

  if (!settings) {
    return "";
  }

  const closingDay = Number(settings.closingDay || 0);

  const paymentMonthOffset = Number(settings.paymentMonthOffset || 0);

  if (closingDay <= 0) {
    return "";
  }

  const parts = transactionDate.split("-");

  if (parts.length !== 3) {
    return "";
  }

  const year = Number(parts[0]);

  const month = Number(parts[1]);

  const day = Number(parts[2]);

  if (!year || !month || !day) {
    return "";
  }

  /*
   * 利用日が締め日を超えていたら、
   * 次の締め月に属する。
   *
   * 例：
   * 10日締め
   *
   * 3/10 → 3月締め
   * 3/11 → 4月締め
   */

  let closingMonthOffset = day > closingDay ? 1 : 0;

  /*
   * 締め月
   * +
   * 支払月offset
   *
   * 例：
   * 10日締め・翌月4日払い
   *
   * 3/10
   * → 3月締め
   * → 4月請求
   *
   * 3/11
   * → 4月締め
   * → 5月請求
   */

  const billingDate = new Date(
    year,
    month - 1 + closingMonthOffset + paymentMonthOffset,
    1,
  );

  const billingYear = billingDate.getFullYear();

  const billingMonth = String(billingDate.getMonth() + 1).padStart(2, "0");

  return billingYear + "-" + billingMonth;
}

// ============================================================
// Settlement API Handler
// ============================================================

function getSettlementCandidatesData(options) {
  const settings = options || {};

  const transactionId = String(settings.transactionId || "").trim();

  if (!transactionId) {
    throw new Error("transactionIdは必須です");
  }

  const table = loadTransactions();

  if (table.rows.length === 0) {
    return {
      items: [],
    };
  }

  assertRequiredColumns(
    table.index,
    [
      "id",
      "transaction_date",
      "amount",
      "type",
      "account_name",
      "import_batch",
      "to_account",
      "settlement_status",
      "settlement_id",
      "source_status",
    ],
    SHEETS.TRANSACTIONS,
  );

  const targetRow = table.rows.find((row) => {
    if (isIgnoredTransactionRow_(row, table.index)) {
      return false;
    }

    return String(row[table.index["id"]] || "").trim() === transactionId;
  });

  if (!targetRow) {
    throw new Error("クレカ引落取引が見つかりません");
  }

  const targetType = getString(targetRow, table.index, "type");

  if (targetType !== "移動") {
    throw new Error("移動取引ではありません");
  }

  const cardAccount = resolveCanonicalAccountName_(
    getString(targetRow, table.index, "to_account"),
  );

  if (!cardAccount) {
    return {
      items: [],
    };
  }

  const settlementAmount = getNumber(targetRow, table.index, "amount");

  const groups = {};

  for (const row of table.rows) {
    // ignoredはクレカ照合候補の金額にも含めない
    if (isIgnoredTransactionRow_(row, table.index)) {
      continue;
    }

    const type = getString(row, table.index, "type");

    // 銀行引落などの移動行は除外
    if (type === "移動") {
      continue;
    }

    const importBatch = getString(row, table.index, "import_batch");

    if (!importBatch) {
      continue;
    }

    // すでに別の引落と照合済みなら除外
    const settlementId = getString(row, table.index, "settlement_id");

    if (settlementId) {
      continue;
    }

    const rowAccount = resolveCanonicalAccountName_(
      getString(row, table.index, "account_name"),
    );

    if (rowAccount !== cardAccount) {
      continue;
    }

    if (!groups[importBatch]) {
      groups[importBatch] = {
        importBatch,
        cardAccount,
        totalAmount: 0,
        detailCount: 0,
        firstDate: "",
        lastDate: "",
      };
    }

    const group = groups[importBatch];

    group.totalAmount += getNumber(row, table.index, "amount");

    group.detailCount++;

    const date = formatApiDate_(row[table.index["transaction_date"]]);

    if (!group.firstDate || date < group.firstDate) {
      group.firstDate = date;
    }

    if (!group.lastDate || date > group.lastDate) {
      group.lastDate = date;
    }
  }

  const items = Object.values(groups)
    .map((group) => ({
      ...group,

      settlementAmount,

      difference: settlementAmount - group.totalAmount,
    }))
    .sort((a, b) => {
      return Math.abs(a.difference) - Math.abs(b.difference);
    });

  return {
    transactionId,
    cardAccount,
    settlementAmount,
    items,
  };
}

