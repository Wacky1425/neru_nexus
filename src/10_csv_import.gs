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

/**
 * 指定カードについて、
 * pending / review の銀行引落を再照合する。
 *
 * matched / manual_matched は絶対に変更しない。
 *
 * カード設定変更後の再照合にも使用する。
 */

/**
 * Settlement再照合結果をTransactionsへ一括反映。
 */


// ============================================================
// 口座エイリアス・振替処理
// ============================================================

let accountAliasCache_ = null;


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

  // 新規追加がない場合は後続の再構築を行わない。
  // ReviewQueue / ReviewSummary は旧スプレッドシート運用のため廃止済み。
  let allViewsFinishedAt = importFinishedAt;

  let allViewsTiming = {
    summariesMs: 0,
    monthlyCheckMs: 0,
    latestMonthMs: 0,
    dashboardMs: 0,
  };

  if (result.addedCount > 0) {
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
      `AllViews: ${allViewsFinishedAt - importFinishedAt}ms`,
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

        // Flutterとの後方互換のため旧計測項目は0で返す。
        reviewQueueMs: 0,

        reviewSummaryMs: 0,

        allViewsMs: allViewsFinishedAt - importFinishedAt,

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

  // ============================================================
  // 設定取得
  // ============================================================

  const configName = getConfigNameByCsvType(parsed.csvType);

  const configNameFinishedAt = Date.now();

  const config = getImportConfig(configName);

  const configFinishedAt = Date.now();

  const rules = getRules();

  const rulesFinishedAt = Date.now();

  // ============================================================
  // Import Batch
  // ============================================================

  const importBatch = Utilities.formatDate(
    new Date(),
    "Asia/Tokyo",
    "yyyyMMdd_HHmmss",
  );

  // ============================================================
  // CSV → Transaction変換
  // ============================================================

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

  // ============================================================
  // Transactionsへ正式CSVを追加
  // ============================================================

  const result = addTransactions(transactions);

  const addFinishedAt = Date.now();

  // ============================================================
  // Gmail速報 → 正式CSV確定
  //
  // 今回「新規追加されたCSV行」だけを対象にする。
  //
  // CSV_クレカ
  //   ↔ Gmail_Olive
  //
  // CSV_銀行
  //   ↔ Gmail_SMBC
  // ============================================================

  let gmailReconcileResult = null;

  if (
    result.addedIds &&
    result.addedIds.length > 0 &&
    (config.source_type === "CSV_クレカ" || config.source_type === "CSV_銀行")
  ) {
    gmailReconcileResult = reconcileGmailPreliminaryWithFormalCsv_(
      result.addedIds,
      config.source_type,

      // false = 本番
      // 一致したGmail速報を ignored にして正式CSVへ確定
      false,
    );
  }

  const gmailReconcileFinishedAt = Date.now();

  // ============================================================
  // クレカSettlement
  //
  // Gmail速報を整理した後に実行。
  // ============================================================

  let settlementResult = null;

  if (config.source_type === "CSV_クレカ") {
    settlementResult = reconcileCardSettlementForBatch_(
      importBatch,
      config.account_name,
    );
  }

  const settlementFinishedAt = Date.now();

  // ============================================================
  // 結果
  // ============================================================

  return {
    ...result,

    importBatch,

    ignoredCount,

    gmailReconcileResult,

    settlementResult,

    debugTiming: {
      configNameMs: configNameFinishedAt - startedAt,

      configMs: configFinishedAt - configNameFinishedAt,

      rulesMs: rulesFinishedAt - configFinishedAt,

      normalizeMs: normalizeFinishedAt - rulesFinishedAt,

      addTransactionsMs: addFinishedAt - normalizeFinishedAt,

      gmailReconcileMs: gmailReconcileFinishedAt - addFinishedAt,

      settlementMs: settlementFinishedAt - gmailReconcileFinishedAt,

      totalMs: settlementFinishedAt - startedAt,
    },
  };
}


/**
 * Olive CSVの繰上返済情報を解析する。
 *
 * 書き込みは一切行わない。
 */

/**
 * Olive CSV正式明細と
 * Gmail_Olive速報を照合する。
 *
 * 現段階では削除・更新しない。
 * 一致候補を検出して返すだけ。
 */

