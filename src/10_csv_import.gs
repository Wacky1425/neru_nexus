// ============================================================
// Neru Nexus - CSV Import
//
// 現行のFlutterアプリ経由CSV取込に必要な処理を集約。
// 旧Import_CSVシート方式 / 旧Google Drive直接取込方式は削除済み。
// 挙動変更は行わず、未使用の旧取込経路のみ整理。
// ============================================================

// ============================================================
// CSV解析・種別判定
// ============================================================

function detectCsvTypeFromRows(values) {
  for (let i = 0; i < values.length; i++) {
    const row = values[i].map((v) => String(v).trim());

    const joined = row.join("|");
    const normalizedJoined = joined.normalize("NFKC");

    const isSmbcBank =
      joined.includes("年月日") &&
      joined.includes("お引出し") &&
      joined.includes("お預入れ") &&
      joined.includes("お取り扱い内容");

    const isPayPay =
      row.includes("取引日") &&
      row.includes("出金金額（円）") &&
      row.includes("入金金額（円）") &&
      row.includes("取引内容");

    const isOliveCard =
      row.includes("利用日") &&
      row.includes("加盟店") &&
      row.includes("金額") &&
      row.includes("請求額");

    const isSaisonCard =
      row.includes("利用日") &&
      row.includes("ご利用店名及び商品名") &&
      row.includes("利用金額") &&
      row.includes("支払区分名称");

    const isOliveCardNoHeader =
      row.length >= 8 &&
      /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(row[0]) &&
      parseAmount(row[6]) > 0;

    const isOliveCreditNoHeader =
      normalizedJoined.includes("Olive") &&
      normalizedJoined.includes("クレジット");

    if (isSmbcBank) {
      return {
        csvType: "smbc_bank_v1",
        headerRowIndex: i,
      };
    }

    if (isPayPay) {
      return {
        csvType: "paypay_v1",
        headerRowIndex: i,
      };
    }

    if (isOliveCard) {
      return {
        csvType: "olive_credit_v1",
        headerRowIndex: i,
      };
    }

    if (isSaisonCard) {
      return {
        csvType: "saison_credit_v1",
        headerRowIndex: i,
      };
    }

    if (isOliveCardNoHeader) {
      return {
        csvType: "olive_credit_v2",
        headerRowIndex: i,
      };
    }

    if (isOliveCreditNoHeader) {
      return {
        csvType: "olive_credit_v1",
        headerRowIndex: -1,
      };
    }
  }

  let fallbackHeaderRowIndex = -1;

  for (let i = 0; i < values.length; i++) {
    const row = values[i].map((value) => String(value || "").trim());

    const nonEmptyCount = row.filter((value) => value !== "").length;

    if (nonEmptyCount < 2) {
      continue;
    }

    const textLikeCount = row.filter((value) => {
      if (!value) {
        return false;
      }

      // 数字だけ・金額だけの行は
      // ヘッダー候補にしにくい
      return !/^[\d,.\-￥¥]+$/.test(value);
    }).length;

    if (textLikeCount >= Math.ceil(nonEmptyCount / 2)) {
      fallbackHeaderRowIndex = i;
      break;
    }
  }

  return {
    csvType: "unknown",
    headerRowIndex: fallbackHeaderRowIndex,
  };
}

function convertOliveRowsWithoutHeader(rows) {
  const result = [];

  for (const rawRow of rows) {
    const row = Array.isArray(rawRow) ? rawRow : [];

    const transactionDate = String(row[0] || "").trim();

    const isTransactionRow = /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(transactionDate);

    // ============================================================
    // 利用明細行
    // ============================================================

    if (isTransactionRow) {
      const isDetailedFormat =
        row.length >= 8 && String(row[2] || "").trim() === "ご本人";

      const amountIndex = isDetailedFormat ? 6 : 2;

      const billedAmountIndex = isDetailedFormat ? 7 : 5;

      /*
       * 今回確認したOliveのヘッダー無しCSVでは、
       *
       * 0 利用日
       * 1 加盟店
       * 2 利用金額
       * 3 支払区分系
       * 4 支払区分系
       * 5 請求額
       * 6 備考
       *
       * という構造。
       */
      const noteIndex = isDetailedFormat ? 8 : 6;

      result.push({
        利用日: transactionDate,

        加盟店: String(row[1] || "").trim(),

        金額: parseAmount(row[amountIndex]),

        請求額: parseAmount(row[billedAmountIndex]),

        備考: String(row[noteIndex] || "").trim(),
      });

      continue;
    }

    // ============================================================
    // 前行にぶら下がる補足行
    //
    // 例：
    //
    // STEAM利用行
    // ↓
    // 空欄,...,７月３１日全額繰上返済
    //
    // というケース。
    // ============================================================

    const continuationText = row
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" / ");

    if (
      continuationText &&
      result.length > 0 &&
      continuationText.includes("全額繰上返済")
    ) {
      const previous = result[result.length - 1];

      const previousNote = String(previous["備考"] || "").trim();

      previous["備考"] = [previousNote, continuationText]
        .filter(Boolean)
        .join(" / ");
    }
  }

  return result;
}

// ============================================================
// Import Config
// ============================================================

function getImportConfig(configName) {
  const targetName = String(configName || "").trim();

  const config = loadObjects(SHEETS.IMPORT_CONFIG).find(
    (row) => String(row.config_name || "").trim() === targetName,
  );

  if (!config) {
    throw new Error("import_config に該当設定がありません: " + targetName);
  }

  const active = String(
    config.active === undefined ? "1" : config.active,
  ).trim();

  if (active !== "1" && active.toUpperCase() !== "TRUE") {
    throw new Error("import_config が inactive です: " + targetName);
  }

  return config;
}

// ============================================================
// クレカ引落照合
// ============================================================

/**
 * CSV取込後のカード照合。
 *
 * importBatchは呼び出し元との互換性のため残す。
 * 現在の照合はカード単位でpending/reviewを再評価する。
 */
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
/**
 * ============================================================
 * Olive 全額繰上返済の自動照合
 *
 * CSVカード明細のnoteに
 *
 *   7月31日全額繰上返済
 *
 * のような情報がある明細を返済日単位でまとめ、
 *
 *   三井住友銀行 → Olive
 *
 * のクレカ引落取引と、
 *
 *   返済日
 *   金額
 *   カード口座
 *
 * が一致すれば同一settlementとして確定する。
 * ============================================================
 */
function reconcileOliveEarlyRepayments_(rawAccountName) {
  const cardAccount = resolveCanonicalAccountName_(rawAccountName);

  if (!cardAccount) {
    return {
      matched: false,
      reason: "invalid_card_account",
      matchedCount: 0,
      matches: [],
    };
  }

  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return {
      matched: false,
      reason: "no_transactions",
      matchedCount: 0,
      matches: [],
    };
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    [
      "id",
      "transaction_date",
      "type",
      "source_type",
      "account_name",
      "amount",
      "note",
      "sub_category",
      "to_account",
      "settlement_status",
      "settlement_id",
    ],
    SHEETS.TRANSACTIONS,
  );

  // ============================================================
  // ① 繰上返済マーク付きカード明細を
  //    返済日ごとにグループ化
  //
  // key:
  //   yyyy-MM-dd
  // ============================================================

  const repaymentGroups = new Map();

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

    // 既に照合済みなら触らない
    const settlementStatus = String(
      row[index["settlement_status"]] || "",
    ).trim();

    if (
      settlementStatus === "matched" ||
      settlementStatus === "manual_matched"
    ) {
      continue;
    }

    const note = String(row[index["note"]] || "")
      .normalize("NFKC")
      .trim();

    const repaymentMatch = note.match(/(\d{1,2})月(\d{1,2})日全額繰上返済/);

    if (!repaymentMatch) {
      continue;
    }

    const transactionDate = normalizeSettlementDate_(
      row[index["transaction_date"]],
    );

    if (!transactionDate) {
      continue;
    }

    const repaymentDate = resolveEarlyRepaymentDate_(
      transactionDate,
      Number(repaymentMatch[1]),
      Number(repaymentMatch[2]),
    );

    if (!repaymentDate) {
      continue;
    }

    const amount = Number(row[index["amount"]] || 0);

    if (amount <= 0) {
      continue;
    }

    if (!repaymentGroups.has(repaymentDate)) {
      repaymentGroups.set(repaymentDate, {
        repaymentDate,
        amount: 0,
        details: [],
      });
    }

    const group = repaymentGroups.get(repaymentDate);

    group.amount += amount;

    group.details.push({
      sheetIndex: i,

      transactionId: String(row[index["id"]] || "").trim(),

      transactionDate,

      amount,
    });
  }

  if (repaymentGroups.size === 0) {
    return {
      matched: false,
      reason: "no_early_repayment_details",
      matchedCount: 0,
      matches: [],
    };
  }

  // ============================================================
  // ② 対応する銀行側クレカ引落を探す
  // ============================================================

  const matchedResults = [];

  let changed = false;

  for (const group of repaymentGroups.values()) {
    let bankRowIndex = -1;

    let bankTransactionId = "";

    // ----------------------------------------------------------
    // 同日・同額・同カードの銀行移動を検索
    // ----------------------------------------------------------

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

      const settlementStatus = String(
        row[index["settlement_status"]] || "",
      ).trim();

      if (
        settlementStatus === "matched" ||
        settlementStatus === "manual_matched"
      ) {
        continue;
      }

      const date = normalizeSettlementDate_(row[index["transaction_date"]]);

      if (date !== group.repaymentDate) {
        continue;
      }

      const amount = Number(row[index["amount"]] || 0);

      if (amount !== group.amount) {
        continue;
      }

      // --------------------------------------------------------
      // カード口座確認
      // --------------------------------------------------------

      let toAccount = resolveCanonicalAccountName_(row[index["to_account"]]);

      /*
       * 古い取引等でto_accountが空なら、
       * 銀行取引本文から既存ロジックでカードを特定。
       */
      if (!toAccount) {
        toAccount = resolveAccountFromAliases_([
          row[index["account_name"]],
          row[index["note"]],
        ]);

        /*
         * 上記だけで取れないケースに備えて、
         * Transactionsにmerchant/item_nameが存在するなら
         * 後段で補完できるようにする。
         */
      }

      if (toAccount !== cardAccount) {
        continue;
      }

      bankRowIndex = i;

      bankTransactionId = String(row[index["id"]] || "").trim();

      break;
    }

    // ----------------------------------------------------------
    // 銀行側がまだ無ければ何もしない
    //
    // カードCSVだけ先に入ることもあるので正常。
    // ----------------------------------------------------------

    if (bankRowIndex === -1) {
      continue;
    }

    // ==========================================================
    // ③ 完全一致 → settlement確定
    // ==========================================================

    const settlementId = "settlement_" + Utilities.getUuid();

    values[bankRowIndex][index["settlement_status"]] = "matched";

    values[bankRowIndex][index["settlement_id"]] = settlementId;

    for (const detail of group.details) {
      values[detail.sheetIndex][index["settlement_status"]] = "matched";

      values[detail.sheetIndex][index["settlement_id"]] = settlementId;
    }

    changed = true;

    matchedResults.push({
      settlementId,

      repaymentDate: group.repaymentDate,

      settlementTransactionId: bankTransactionId,

      settlementAmount: group.amount,

      detailTotal: group.amount,

      detailCount: group.details.length,

      detailTransactionIds: group.details
        .map((detail) => detail.transactionId)
        .filter(Boolean),
    });
  }

  // ============================================================
  // ④ 一括保存
  // ============================================================

  if (changed) {
    writeSettlementTransactionValues_(sheet, values);
  }

  return {
    matched: matchedResults.length > 0,

    cardAccount,

    matchedCount: matchedResults.length,

    matches: matchedResults,
  };
}

/**
 * 利用日と「○月○日全額繰上返済」から
 * yyyy-MM-dd形式の返済日を作る。
 *
 * 通常は利用日と同一年。
 *
 * ただし、
 * 12月利用 → 1月繰上返済
 * のような年跨ぎにも対応する。
 */
function resolveEarlyRepaymentDate_(
  transactionDate,
  repaymentMonth,
  repaymentDay,
) {
  const match = String(transactionDate || "").match(
    /^(\d{4})-(\d{2})-(\d{2})$/,
  );

  if (!match) {
    return "";
  }

  let year = Number(match[1]);

  const transactionMonth = Number(match[2]);

  const transactionDay = Number(match[3]);

  if (!year || !repaymentMonth || !repaymentDay) {
    return "";
  }

  /*
   * 例：
   *
   * 利用日 2026-12-20
   * 返済日 1月10日
   *
   * → 2027-01-10
   */
  if (
    repaymentMonth < transactionMonth ||
    (repaymentMonth === transactionMonth && repaymentDay < transactionDay)
  ) {
    year++;
  }

  const month = String(repaymentMonth).padStart(2, "0");

  const day = String(repaymentDay).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * 指定カードについて、
 * pending / review の銀行引落を再照合する。
 *
 * matched / manual_matched は絶対に変更しない。
 *
 * カード設定変更後の再照合にも使用する。
 */
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

/**
 * Settlement再照合結果をTransactionsへ一括反映。
 */
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

// ============================================================
// 口座エイリアス・振替処理
// ============================================================

let accountAliasCache_ = null;

function getAccountAliases_() {
  if (accountAliasCache_ === null) {
    accountAliasCache_ = loadObjects(SHEETS.ACCOUNT_ALIAS);
  }

  return accountAliasCache_;
}

function clearAccountAliasCache_() {
  accountAliasCache_ = null;
}

function resolveAccountFromAliases_(values) {
  const candidates = (values || [])
    .filter(Boolean)
    .map((value) => String(value).normalize("NFKC").trim())
    .filter(Boolean);

  if (candidates.length === 0) {
    return "";
  }

  const aliases = getAccountAliases_();

  let bestMatch = null;

  for (const candidate of candidates) {
    for (const row of aliases) {
      const raw = String(row.raw_account_name || "")
        .normalize("NFKC")
        .trim();

      const canonical = String(row.canonical_account_name || "").trim();

      if (!raw || !canonical) {
        continue;
      }

      if (!candidate.includes(raw)) {
        continue;
      }

      if (bestMatch === null || raw.length > bestMatch.rawLength) {
        bestMatch = {
          rawLength: raw.length,
          canonical,
        };
      }
    }
  }

  return bestMatch?.canonical || "";
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

function resolveCreditCardAccount_(tx) {
  return resolveAccountFromAliases_([tx.merchant, tx.item_name, tx.note]);
}

function applyTransferMetadata_(tx) {
  const type = String(tx.type || "").trim();

  const subCategory = String(tx.sub_category || "").trim();

  const accountName = resolveCanonicalAccountName_(
    String(tx.account_name || "").trim(),
  );

  const sourceType = String(tx.source_type || "").trim();

  const moneyDirection = String(tx.money_direction || "").trim();

  // ==========================================================
  // 通常の支出・収入
  // ==========================================================

  if (type !== "移動" && type !== "振替") {
    tx.from_account = "";
    tx.to_account = "";

    tx.settlement_status = "";
    tx.settlement_id = "";

    return;
  }

  tx.settlement_id = String(tx.settlement_id || "").trim();

  // ==========================================================
  // PayPayチャージ
  //
  // PayPay CSV上ではPayPayへの「入金」。
  //
  // 銀行 → PayPay
  // ==========================================================

  if (sourceType === "CSV_PayPay" && subCategory === "電子マネーチャージ") {
    const sourceAccount = resolveAccountFromAliases_([tx.note, tx.raw_text]);

    tx.from_account = sourceAccount;

    tx.to_account = accountName;

    tx.settlement_status = tx.from_account && tx.to_account ? "none" : "review";

    return;
  }

  // ==========================================================
  // 銀行CSV
  //
  // CSV元データの「入金 / 出金」を最優先する。
  //
  // out:
  //   CSV対象口座 → 相手
  //
  // in:
  //   相手 → CSV対象口座
  // ==========================================================

  if (
    sourceType === "CSV_銀行" &&
    (moneyDirection === "in" || moneyDirection === "out")
  ) {
    const otherAccount = resolveTransferDestinationAccount_(tx);

    // --------------------------------------------------------
    // 出金
    // --------------------------------------------------------

    if (moneyDirection === "out") {
      tx.from_account = accountName;

      // クレカ引落だけは
      // カード口座を専用ロジックで解決
      if (subCategory === "クレカ引落") {
        tx.to_account = resolveCreditCardAccount_(tx);

        tx.settlement_status = tx.to_account ? "pending" : "review";

        return;
      }

      tx.to_account = otherAccount;

      tx.settlement_status = tx.to_account ? "none" : "review";

      return;
    }

    // --------------------------------------------------------
    // 入金
    // --------------------------------------------------------

    tx.from_account = otherAccount;

    tx.to_account = accountName;

    tx.settlement_status = tx.from_account ? "none" : "review";

    return;
  }

  // ==========================================================
  // その他の通常移動
  //
  // 従来仕様を維持
  // ==========================================================

  tx.from_account = accountName;

  tx.to_account = String(tx.to_account || "").trim();

  if (subCategory === "クレカ引落") {
    tx.to_account = resolveCreditCardAccount_(tx);

    tx.settlement_status = tx.to_account ? "pending" : "review";

    return;
  }

  const destinationAccount = resolveTransferDestinationAccount_(tx);

  tx.to_account = destinationAccount;

  tx.settlement_status = destinationAccount ? "none" : "review";
}

function resolveTransferDestinationAccount_(tx) {
  return resolveAccountFromAliases_([
    tx.merchant,
    tx.item_name,
    tx.note,
    tx.raw_text,
  ]);
}

function getConfigNameByCsvType(csvType) {
  const targetType = String(csvType || "").trim();

  if (!targetType) {
    throw new Error("CSV種別が指定されていません");
  }

  const configs = loadObjects(SHEETS.IMPORT_CONFIG);

  const config = configs.find((row) => {
    const rowCsvType = String(row.csv_type || "").trim();

    const active = String(row.active === undefined ? "1" : row.active).trim();

    const isActive = active === "1" || active.toUpperCase() === "TRUE";

    return rowCsvType === targetType && isActive;
  });

  if (!config) {
    throw new Error(
      "M_ImportConfig に対応するCSV設定がありません: " + targetType,
    );
  }

  const configName = String(config.config_name || "").trim();

  if (!configName) {
    throw new Error("M_ImportConfig の config_name が空です: " + targetType);
  }

  return configName;
}

// ============================================================
// CSV正規化
// ============================================================

function shouldIgnoreCsvRow_(row, txBase, config) {
  if (String(config.config_name || "").trim() !== "paypay_v1") {
    return false;
  }

  const transactionType = String(row["取引内容"] || "")
    .normalize("NFKC")
    .trim();

  const merchant = String(txBase.merchant || "")
    .normalize("NFKC")
    .trim();

  const itemName = String(txBase.item_name || "")
    .normalize("NFKC")
    .trim();

  // ポイント・残高の獲得
  if (transactionType === "ポイント、残高の獲得") {
    return true;
  }

  // PayPayポイント運用への移動
  if (
    transactionType.includes("PayPayポイント運用") ||
    merchant.includes("PayPayポイント運用") ||
    itemName.includes("PayPayポイント運用")
  ) {
    return true;
  }

  // ポイント期限切れ・失効
  if (
    transactionType.includes("ポイントの期限切れ") ||
    transactionType.includes("ポイント失効") ||
    itemName.includes("ポイントの期限切れ") ||
    itemName.includes("ポイント失効")
  ) {
    return true;
  }

  return false;
}

function normalizeCsvRowByHeader(row, config, metadata = {}) {
  let transactionDate = "";
  let merchant = "";
  let itemName = "";
  let amount = 0;
  let note = "";

  let moneyDirection = "";

  // ============================================================
  // セゾン
  // ============================================================

  if (config.config_name === "saison_credit_v1") {
    merchant = String(row["ご利用店名及び商品名"] || "").trim();

    itemName = merchant;

    amount =
      Number(String(row["利用金額"] || "0").replace(/,/g, "")) *
      Number(config.amount_sign || 1);

    transactionDate = String(row["利用日"] || "").trim();

    note = String(row["備考"] || "").trim();

    // ----------------------------------------------------------
    // 遅延損害金
    // ----------------------------------------------------------

    const normalizedMerchant = merchant.normalize("NFKC").trim();

    if (normalizedMerchant.includes("遅延損害金")) {
      const paymentDate = String(metadata.saisonPaymentDate || "").trim();

      if (paymentDate) {
        transactionDate = paymentDate;
      }

      merchant = "遅延損害金";
      itemName = "遅延損害金";

      const originalNote = note;

      note = [
        "セゾンカード",
        paymentDate ? `支払日:${paymentDate}` : "",
        originalNote,
      ]
        .filter(Boolean)
        .join(" / ");
    }

    // ============================================================
    // STACIA JCB
    // ============================================================
  } else if (config.config_name === "stacia_jcb_v1") {
    amount =
      Number(String(row["お支払い金額(￥)"] || "0").replace(/,/g, "")) *
      Number(config.amount_sign || 1);

    transactionDate = String(row["ご利用日"] || "").trim();

    merchant = String(row["ご利用先など"] || "").trim();

    itemName = String(row["ご利用先など"] || "").trim();

    note = String(row["備考"] || "").trim();

    // ============================================================
    // Olive
    // ============================================================
  } else if (config.config_name === "olive_credit_v1") {
    amount =
      Number(String(row["請求額"] || row["金額"] || "0").replace(/,/g, "")) *
      Number(config.amount_sign || 1);

    transactionDate = String(row["利用日"] || "").trim();

    merchant = String(row["加盟店"] || "").trim();

    itemName = String(row["加盟店"] || "").trim();

    /*
     * Olive CSVの備考を保持する。
     *
     * 例：
     * 7月31日全額繰上返済
     *
     * この情報をSettlement照合に使用する。
     */
    const csvNote = String(row["備考"] || "").trim();

    note = ["Oliveクレカ", csvNote].filter(Boolean).join(" / ");

    // ============================================================
    // ゆうちょ
    // ============================================================
  } else if (config.config_name === "jpbank_v1") {
    const inAmount = Number(
      String(row["受入金額（円）"] || "0").replace(/,/g, ""),
    );

    const outAmount = Number(
      String(row["払出金額（円）"] || "0").replace(/,/g, ""),
    );

    if (outAmount > 0) {
      amount = outAmount;
      moneyDirection = "out";
    } else {
      amount = inAmount;
      moneyDirection = "in";
    }

    transactionDate = String(row["取引日"] || "").trim();

    merchant = [row["詳細１"] || "", row["詳細２"] || ""].join(" ").trim();

    itemName = merchant;

    note = String(row["入出金明細ＩＤ"] || "").trim();

    // ============================================================
    // 三井住友銀行
    // ============================================================
  } else if (config.config_name === "smbc_bank_v1") {
    const inAmount = Number(String(row["お預入れ"] || "0").replace(/,/g, ""));

    const outAmount = Number(String(row["お引出し"] || "0").replace(/,/g, ""));

    if (outAmount > 0) {
      amount = outAmount;
      moneyDirection = "out";
    } else {
      amount = inAmount;
      moneyDirection = "in";
    }

    transactionDate = String(row["年月日"] || "").trim();

    merchant = String(row["お取り扱い内容"] || "").trim();

    itemName = merchant;

    note = String(row["メモ"] || "").trim();

    // ============================================================
    // PayPay
    // ============================================================
  } else if (config.config_name === "paypay_v1") {
    const outAmount = Number(
      String(row["出金金額（円）"] || "0")
        .replace(/,/g, "")
        .replace(/-/g, "0"),
    );

    const inAmount = Number(
      String(row["入金金額（円）"] || "0")
        .replace(/,/g, "")
        .replace(/-/g, "0"),
    );

    if (outAmount > 0) {
      amount = outAmount;
      moneyDirection = "out";
    } else {
      amount = inAmount;
      moneyDirection = "in";
    }

    transactionDate = String(row["取引日"] || "").trim();

    merchant = String(row["取引先"] || "").trim();

    itemName = [row["取引内容"] || "", row["取引先"] || ""].join(" ").trim();

    note = String(row["取引方法"] || "").trim();

    // ============================================================
    // 汎用
    // ============================================================
  } else {
    const values = Object.values(row);

    const dateValue = values[Number(config.date_col) - 1];

    const merchantValue = values[Number(config.merchant_col) - 1];

    const itemValue = values[Number(config.item_col) - 1];

    const amountValue = values[Number(config.amount_col) - 1];

    const noteValue = values[Number(config.note_col) - 1];

    amount =
      Number(String(amountValue || "0").replace(/,/g, "")) *
      Number(config.amount_sign || 1);

    transactionDate = dateValue || "";

    merchant = merchantValue || "";

    itemName = itemValue || "";

    note = noteValue || "";
  }

  const rawText = [merchant, itemName, note]
    .filter((value) => String(value || "").trim() !== "")
    .join(" / ");

  return {
    transaction_date: transactionDate,

    merchant,

    item_name: itemName,

    amount,

    raw_text: rawText,

    note,

    source_type: config.source_type || "CSV",

    payment_method: config.payment_method || "",

    account_name: config.account_name || "",

    money_direction: moneyDirection,

    evidence_url: "",

    original_image_url: "",

    import_batch: Utilities.formatDate(
      new Date(),
      "Asia/Tokyo",
      "yyyyMMdd_HHmmss",
    ),

    duplicate_key: "",
  };
}

// ============================================================
// CSV取込履歴
// ============================================================

function addImportHistory_(data) {
  const sheet = getRequiredSheet(SHEETS.IMPORT_HISTORY);

  const row = [
    String(data.importBatch || ""),
    data.importedAt || new Date(),
    String(data.csvType || ""),
    String(data.configName || ""),
    String(data.accountName || ""),
    String(data.fileName || ""),
    String(data.targetYearMonth || ""),
    String(data.periodStart || ""),
    String(data.periodEnd || ""),
    Number(data.rowCount || 0),
    Number(data.addedCount || 0),
    Number(data.skippedCount || 0),
    Number(data.ignoredCount || 0),
    String(data.status || "completed"),
    String(data.billingYearMonth || ""),
    String((data.billingYearMonths || []).join(",")),
  ];

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

// ============================================================
// FlutterアプリからのCSV取込 API
// ============================================================

function importCsvFromApp_(data) {
  const csvText = String(data.csvText || "");

  if (!csvText.trim()) {
    throw new Error("csvTextは必須です");
  }

  const fileName = String(data.fileName || "").trim();

  const parsed = readCsvRowsFromText_(csvText);

  if (parsed.csvType === "unknown") {
    return createJsonResponse_(
      {
        status: "unknown_csv",
        csvType: "unknown",
        headerRowIndex: parsed.headerRowIndex,
        headers: parsed.headers || [],
        sampleRows: parsed.sampleRows || [],
      },
      "ok",
    );
  }

  const importStartedAt = Date.now();

  const configName = getConfigNameByCsvType(parsed.csvType);

  const config = getImportConfig(configName);

  // ============================================================
  // Dry Run
  //
  // CSVを解析するだけでTransactionsには登録しない。
  // Oliveの繰上返済CSV確認用。
  // ============================================================

  if (data.dryRun === true) {
    if (
      parsed.csvType === "olive_credit_v1" ||
      parsed.csvType === "olive_credit_v2"
    ) {
      const analysis = analyzeOliveEarlyRepaymentCsv_(parsed);

      return createJsonResponse_(
        {
          status: "dry_run",

          csvType: parsed.csvType,

          fileName,

          analysis,
        },
        "ok",
      );
    }

    return createJsonResponse_(
      {
        status: "dry_run",

        csvType: parsed.csvType,

        fileName,

        message: "このCSV種別には専用のDry Run解析はありません",
      },
      "ok",
    );
  }

  const result = importParsedCsvRows_(parsed);

  const importFinishedAt = Date.now();

  const importPeriod = getImportPeriod_(parsed.rows, config);

  const billingYearMonths = getImportBillingYearMonths_(parsed.rows, config);

  const billingYearMonth =
    billingYearMonths.length === 1 ? billingYearMonths[0] : "";

  // 新規追加がない場合は後続の再構築を行わない
  let reviewQueueFinishedAt = importFinishedAt;
  let reviewSummaryFinishedAt = importFinishedAt;
  let allViewsFinishedAt = importFinishedAt;

  let allViewsTiming = {
    summariesMs: 0,
    monthlyCheckMs: 0,
    latestMonthMs: 0,
    dashboardMs: 0,
  };

  if (result.addedCount > 0) {
    rebuildReviewQueue();

    reviewQueueFinishedAt = Date.now();

    rebuildReviewSummary();

    reviewSummaryFinishedAt = Date.now();

    allViewsTiming = rebuildAllViews();

    allViewsFinishedAt = Date.now();
  }
  addImportHistory_({
    importBatch: result.importBatch,
    importedAt: new Date(),
    csvType: parsed.csvType,
    configName,
    accountName: config.account_name,
    fileName,

    targetYearMonth: importPeriod.targetYearMonth,

    periodStart: importPeriod.periodStart,

    periodEnd: importPeriod.periodEnd,

    billingYearMonth,
    billingYearMonths,

    rowCount: parsed.rows.length,
    addedCount: result.addedCount,
    skippedCount: result.skippedCount,
    ignoredCount: result.ignoredCount || 0,
    status: "completed",
  });

  Logger.log(
    [
      `CSV本体: ${importFinishedAt - importStartedAt}ms`,
      `ReviewQueue: ${reviewQueueFinishedAt - importFinishedAt}ms`,
      `ReviewSummary: ${reviewSummaryFinishedAt - reviewQueueFinishedAt}ms`,
      `AllViews: ${allViewsFinishedAt - reviewSummaryFinishedAt}ms`,
      `合計: ${allViewsFinishedAt - importStartedAt}ms`,
    ].join(" / "),
  );

  return createJsonResponse_(
    {
      status: "imported",

      csvType: parsed.csvType,

      importBatch: result.importBatch,

      addedCount: result.addedCount,

      skippedCount: result.skippedCount,

      ignoredCount: result.ignoredCount || 0,

      settlementResult: result.settlementResult || null,

      debugTiming: {
        importMs: importFinishedAt - importStartedAt,

        configNameMs: result.debugTiming?.configNameMs || 0,

        configMs: result.debugTiming?.configMs || 0,

        rulesMs: result.debugTiming?.rulesMs || 0,

        normalizeMs: result.debugTiming?.normalizeMs || 0,

        addTransactionsMs: result.debugTiming?.addTransactionsMs || 0,

        settlementMs: result.debugTiming?.settlementMs || 0,

        reviewQueueMs: reviewQueueFinishedAt - importFinishedAt,

        reviewSummaryMs: reviewSummaryFinishedAt - reviewQueueFinishedAt,

        allViewsMs: allViewsFinishedAt - reviewSummaryFinishedAt,

        allViewsSummariesMs: allViewsTiming?.summariesMs || 0,

        allViewsMonthlyCheckMs: allViewsTiming?.monthlyCheckMs || 0,

        allViewsLatestMonthMs: allViewsTiming?.latestMonthMs || 0,

        allViewsDashboardMs: allViewsTiming?.dashboardMs || 0,

        totalMs: allViewsFinishedAt - importStartedAt,
      },
    },
    "ok",
  );
}

// ============================================================
// 取込期間・日付ユーティリティ
// ============================================================

function getImportPeriod_(rows, config) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      targetYearMonth: "",
      periodStart: "",
      periodEnd: "",
    };
  }

  const dateHeader = String(config.date_header || "").trim();

  const dates = [];

  for (const row of rows) {
    let rawDate = "";

    if (dateHeader && row[dateHeader] !== undefined) {
      rawDate = row[dateHeader];
    } else {
      const keys = Object.keys(row);

      const dateKey = keys[Number(config.date_col) - 1];

      rawDate = row[dateKey];
    }

    const normalizedDate = normalizeImportDate_(rawDate);

    if (normalizedDate) {
      dates.push(normalizedDate);
    }
  }

  if (dates.length === 0) {
    return {
      targetYearMonth: "",
      periodStart: "",
      periodEnd: "",
    };
  }

  dates.sort();

  const periodStart = dates[0];
  const periodEnd = dates[dates.length - 1];

  // 現状は「最後に利用があった月」を代表月として扱う
  const targetYearMonth = periodEnd.substring(0, 7);

  return {
    targetYearMonth,
    periodStart,
    periodEnd,
  };
}

function normalizeImportDate_(value) {
  if (!value) {
    return "";
  }

  // Google Sheetsから取得したDate型
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

  // yyyy/MM/dd または yyyy-MM-dd
  const match = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);

  if (match) {
    const year = match[1];

    const month = String(Number(match[2])).padStart(2, "0");

    const day = String(Number(match[3])).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  // その他Dateとして解釈可能な形式の保険
  const parsed = new Date(text);

  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, "Asia/Tokyo", "yyyy-MM-dd");
  }

  return "";
}

function getImportHistoryData_(options = {}) {
  const requestedLimit = Number(options.limit || 50);
  const limit = Math.min(Math.max(requestedLimit, 1), 200);

  const rows = loadObjects(SHEETS.IMPORT_HISTORY);

  const items = rows
    .filter((row) => String(row.import_batch || "").trim())
    .map((row) => ({
      importBatch: String(row.import_batch || "").trim(),

      importedAt: formatApiDateTime_(row.imported_at),

      csvType: String(row.csv_type || "").trim(),

      configName: String(row.config_name || "").trim(),

      accountName: String(row.account_name || "").trim(),

      fileName: String(row.file_name || "").trim(),

      targetYearMonth: normalizeYearMonth(row.target_year_month),

      periodStart: formatApiDate_(row.period_start),

      periodEnd: formatApiDate_(row.period_end),

      rowCount: Number(row.row_count || 0),

      addedCount: Number(row.added_count || 0),

      skippedCount: Number(row.skipped_count || 0),

      ignoredCount: Number(row.ignored_count || 0),

      billingYearMonth: normalizeYearMonth(row.billing_year_month),

      billingYearMonths: (() => {
        const value = row.billing_year_months;

        if (!value) {
          return [];
        }

        // Sheetsが「2026-07」を日付として保持している場合
        if (value instanceof Date) {
          const normalized = normalizeYearMonth(value);

          return normalized ? [normalized] : [];
        }

        // 複数月 "2026-07,2026-08" の場合
        return String(value)
          .split(",")
          .map((item) => normalizeYearMonth(item.trim()))
          .filter((item) => /^\d{4}-\d{2}$/.test(item));
      })(),

      status: String(row.status || "").trim(),
    }))
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    .slice(0, limit);
  const configs = loadObjects(SHEETS.IMPORT_CONFIG)
    .filter((row) => {
      const active = String(row.active === undefined ? "1" : row.active)
        .trim()
        .toUpperCase();

      return active === "1" || active === "TRUE";
    })
    .map((row) => ({
      configName: String(row.config_name || "").trim(),

      accountName: String(row.account_name || "").trim(),

      sourceType: String(row.source_type || "").trim(),
    }))
    .filter((row) => row.configName && row.accountName);
  return {
    items,
    total: rows.length,
    configs,
  };
}

function formatApiDateTime_(value) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (isNaN(date.getTime())) {
    return "";
  }

  return Utilities.formatDate(date, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss");
}

// ============================================================
// CSV本文解析
// ============================================================

function readCsvRowsFromText_(csvText) {
  const normalizedText = String(csvText || "")
    .replace(/^\uFEFF/, "")
    .trim();

  if (!normalizedText) {
    throw new Error("CSVが空です");
  }

  const values = Utilities.parseCsv(normalizedText);

  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("CSVを解析できませんでした");
  }

  const detection = detectCsvTypeFromRows(values);

  const csvType = detection.csvType;
  const headerRowIndex = detection.headerRowIndex;

  // ============================================================
  // セゾンCSV固有メタ情報
  // ============================================================

  let saisonPaymentDate = "";
  let saisonClaimAmount = 0;
  let saisonCardName = "";

  if (csvType === "saison_credit_v1") {
    for (const row of values) {
      const label = String(row[0] || "")
        .normalize("NFKC")
        .trim();

      if (label === "カード名称") {
        saisonCardName = String(row[1] || "").trim();
        continue;
      }

      if (label === "お支払日") {
        saisonPaymentDate = String(row[1] || "").trim();
        continue;
      }

      if (label === "今回ご請求額") {
        saisonClaimAmount = parseAmount(row[1]);
      }
    }
  }

  if (!csvType || csvType === "unknown") {
    if (headerRowIndex < 0) {
      return {
        csvType: "unknown",
        headerRowIndex: -1,
        headers: [],
        sampleRows: values
          .filter((row) =>
            row.some((value) => String(value || "").trim() !== ""),
          )
          .slice(0, 5),
      };
    }

    const headers = values[headerRowIndex].map((value) =>
      String(value || "").trim(),
    );

    const sampleRows = values
      .slice(headerRowIndex + 1)
      .filter((row) => row.some((value) => String(value || "").trim() !== ""))
      .slice(0, 5);

    return {
      csvType: "unknown",
      headerRowIndex,
      headers,
      sampleRows,
    };
  }

  /*
   * ヘッダーなしのOlive明細
   */
  if (csvType === "olive_credit_v2" || headerRowIndex === -1) {
    const sourceRows = values
      .slice(Math.max(headerRowIndex, 0))
      .filter((row) => row.some((value) => String(value || "").trim() !== ""));

    const rows = convertOliveRowsWithoutHeader(sourceRows);

    return {
      csvType,
      rows,

      saisonPaymentDate,
      saisonClaimAmount,
      saisonCardName,
    };
  }

  if (headerRowIndex < 0) {
    throw new Error("CSVのヘッダー行を特定できませんでした");
  }

  const header = values[headerRowIndex].map((value) =>
    String(value || "").trim(),
  );

  const rows = values
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((value) => String(value || "").trim() !== ""))
    .map((row) => {
      const object = {};

      header.forEach((columnName, index) => {
        if (!columnName) {
          return;
        }

        object[columnName] = row[index] ?? "";
      });

      return object;
    });

  return {
    csvType,
    rows,

    // セゾン以外なら空/0
    saisonPaymentDate,
    saisonClaimAmount,
    saisonCardName,
  };
}

// ============================================================
// CSV取込メイン処理
// ============================================================

function importParsedCsvRows_(parsed) {
  const startedAt = Date.now();

  const configName = getConfigNameByCsvType(parsed.csvType);

  const configNameFinishedAt = Date.now();

  const config = getImportConfig(configName);

  const configFinishedAt = Date.now();

  const rules = getRules();

  const rulesFinishedAt = Date.now();

  const importBatch = Utilities.formatDate(
    new Date(),
    "Asia/Tokyo",
    "yyyyMMdd_HHmmss",
  );

  const transactions = [];
  let ignoredCount = 0;

  for (const row of parsed.rows) {
    const txBase = normalizeCsvRowByHeader(row, config, parsed);

    txBase.import_batch = importBatch;

    txBase.merchant = normalizeMerchant(txBase.merchant);

    if (
      !txBase.transaction_date ||
      !txBase.merchant ||
      Number(txBase.amount) === 0
    ) {
      continue;
    }

    if (shouldIgnoreCsvRow_(row, txBase, config)) {
      ignoredCount++;
      continue;
    }

    let classified;

    if (
      config.config_name === "smbc_bank_v1" ||
      config.config_name === "paypay_v1" ||
      config.config_name === "jpbank_v1"
    ) {
      classified = classifyMoneyTransaction(
        row,
        txBase,
        rules,
        config.config_name,
      );
    } else {
      classified = classifyTransaction(txBase, rules);
    }

    const tx = {
      ...txBase,
      ...classified,
    };

    applyTransferMetadata_(tx);

    transactions.push(tx);
  }

  const normalizeFinishedAt = Date.now();

  const result = addTransactions(transactions);

  const addFinishedAt = Date.now();

  let settlementResult = null;

  if (config.source_type === "CSV_クレカ") {
    settlementResult = reconcileCardSettlementForBatch_(
      importBatch,
      config.account_name,
    );
  }

  const settlementFinishedAt = Date.now();

  return {
    ...result,
    importBatch,
    ignoredCount,
    settlementResult,

    debugTiming: {
      configNameMs: configNameFinishedAt - startedAt,

      configMs: configFinishedAt - configNameFinishedAt,

      rulesMs: rulesFinishedAt - configFinishedAt,

      normalizeMs: normalizeFinishedAt - rulesFinishedAt,

      addTransactionsMs: addFinishedAt - normalizeFinishedAt,

      settlementMs: settlementFinishedAt - addFinishedAt,

      totalMs: settlementFinishedAt - startedAt,
    },
  };
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

function testOliveEarlyRepaymentParsedRows(csvText) {
  const parsed = readCsvRowsFromText_(csvText);

  if (
    parsed.csvType !== "olive_credit_v1" &&
    parsed.csvType !== "olive_credit_v2"
  ) {
    throw new Error("Olive CSVではありません: " + parsed.csvType);
  }

  let earlyRepaymentCount = 0;
  let earlyRepaymentAmount = 0;

  let normalCount = 0;
  let normalBilledAmount = 0;

  const earlyRepaymentDates = new Set();

  const earlyRepaymentItems = [];

  const normalItems = [];

  for (const row of parsed.rows) {
    const date = String(row["利用日"] || "").trim();

    const merchant = String(row["加盟店"] || "").trim();

    const amount = Number(row["金額"] || 0);

    const billedAmount = Number(row["請求額"] || 0);

    const note = String(row["備考"] || "")
      .normalize("NFKC")
      .trim();

    if (!date || !merchant || amount <= 0) {
      continue;
    }

    const repaymentMatch = note.match(/(\d{1,2})月(\d{1,2})日全額繰上返済/);

    if (repaymentMatch) {
      earlyRepaymentCount++;

      /*
       * 繰上返済額は「請求額」ではなく
       * 実際の利用金額を使う。
       *
       * 外貨利用などで請求額欄が空でも、
       * 繰上返済対象額には含めるため。
       */
      earlyRepaymentAmount += amount;

      earlyRepaymentDates.add(
        `${Number(repaymentMatch[1])}/${Number(repaymentMatch[2])}`,
      );

      earlyRepaymentItems.push({
        date,
        merchant,
        amount,
        billedAmount,
        note,
      });

      continue;
    }

    normalCount++;

    /*
     * 通常請求側は請求額を使う。
     *
     * 今回のSTEAMのように
     * 利用額はあるが請求額0の場合は
     * 8/26請求額には含めない。
     */
    normalBilledAmount += billedAmount;

    normalItems.push({
      date,
      merchant,
      amount,
      billedAmount,
      note,
    });
  }

  const result = {
    csvType: parsed.csvType,

    parsedRowCount: parsed.rows.length,

    earlyRepayment: {
      count: earlyRepaymentCount,
      amount: earlyRepaymentAmount,
      repaymentDates: Array.from(earlyRepaymentDates),
      items: earlyRepaymentItems,
    },

    normalBilling: {
      count: normalCount,
      billedAmount: normalBilledAmount,
      items: normalItems,
    },
  };

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}

/**
 * Olive CSVの繰上返済情報を解析する。
 *
 * 書き込みは一切行わない。
 */
function analyzeOliveEarlyRepaymentCsv_(parsed) {
  let earlyRepaymentCount = 0;
  let earlyRepaymentAmount = 0;

  let normalCount = 0;
  let normalBilledAmount = 0;

  let billedAmountZeroCount = 0;

  const repaymentDates = new Set();

  const earlyRepaymentItems = [];
  const normalItems = [];

  for (const row of parsed.rows || []) {
    const date = String(row["利用日"] || "").trim();

    const merchant = String(row["加盟店"] || "").trim();

    const amount = Number(row["金額"] || 0);

    const billedAmount = Number(row["請求額"] || 0);

    const note = String(row["備考"] || "")
      .normalize("NFKC")
      .trim();

    if (!date || !merchant || amount <= 0) {
      continue;
    }

    const repaymentMatch = note.match(/(\d{1,2})月(\d{1,2})日全額繰上返済/);

    // ==========================================================
    // 繰上返済済み明細
    // ==========================================================

    if (repaymentMatch) {
      earlyRepaymentCount++;

      earlyRepaymentAmount += amount;

      repaymentDates.add(
        `${Number(repaymentMatch[1])}/${Number(repaymentMatch[2])}`,
      );

      earlyRepaymentItems.push({
        date,
        merchant,
        amount,
        billedAmount,
        note,
      });

      continue;
    }

    // ==========================================================
    // 通常請求候補
    // ==========================================================

    normalCount++;

    if (billedAmount > 0) {
      normalBilledAmount += billedAmount;
    } else {
      billedAmountZeroCount++;
    }

    normalItems.push({
      date,
      merchant,
      amount,
      billedAmount,
      note,
    });
  }

  return {
    parsedRowCount: (parsed.rows || []).length,

    earlyRepayment: {
      count: earlyRepaymentCount,
      amount: earlyRepaymentAmount,
      repaymentDates: Array.from(repaymentDates),
      items: earlyRepaymentItems,
    },

    normalBilling: {
      count: normalCount,
      billedAmount: normalBilledAmount,
      billedAmountZeroCount,
      items: normalItems,
    },
  };
}
