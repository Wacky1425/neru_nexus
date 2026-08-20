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

function readCsvRowsFromFile(file) {
  const values = parseCsvFile(file);
  const detected = detectCsvTypeFromRows(values);

  if (detected.csvType === "unknown") {
    throw new Error("CSV種別を判定できません: " + file.getName());
  }

  if (
    detected.csvType === "olive_credit_v1" &&
    detected.headerRowIndex === -1
  ) {
    return {
      csvType: detected.csvType,
      rows: convertOliveRowsWithoutHeader(values.slice(1)),
    };
  }

  if (detected.csvType === "olive_credit_v2") {
    return {
      csvType: detected.csvType,
      rows: convertOliveRowsWithoutHeader(
        values.slice(detected.headerRowIndex),
      ),
    };
  }

  const headers = values[detected.headerRowIndex].map((value) =>
    String(value || "").trim(),
  );

  const rows = values
    .slice(detected.headerRowIndex + 1)
    .filter((row) => row.join("").trim() !== "");

  return {
    csvType: detected.csvType,
    rows: rows.map((row) => rowToObject(headers, row)),
  };
}

function parseCsvFile(file) {
  const blob = file.getBlob();

  // 日本の金融CSVはShift_JISが多いので先に読む
  const sjis = blob.getDataAsString("Shift_JIS");
  const parsedSjis = Utilities.parseCsv(sjis);

  const joined = parsedSjis
    .slice(0, 5)
    .map((r) => r.join("|"))
    .join("|")
    .normalize("NFKC");

  if (
    joined.includes("年月日") ||
    joined.includes("お引出し") ||
    joined.includes("お預入れ") ||
    joined.includes("お取り扱い内容") ||
    joined.includes("Olive") ||
    joined.includes("クレジット")
  ) {
    return parsedSjis;
  }

  const utf8 = blob.getDataAsString("UTF-8");
  return Utilities.parseCsv(utf8);
}

function convertOliveRowsWithoutHeader(rows) {
  return rows
    .filter((row) => row.join("").trim() !== "")
    .filter((row) =>
      /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(String(row[0] || "").trim()),
    )
    .map((row) => {
      const isDetailedFormat =
        row.length >= 8 && String(row[2] || "").trim() === "ご本人";

      const amountIndex = isDetailedFormat ? 6 : 2;
      const billedAmountIndex = isDetailedFormat ? 7 : 5;

      return {
        利用日: String(row[0] || "").trim(),
        加盟店: String(row[1] || "").trim(),
        金額: parseAmount(row[amountIndex]),
        請求額: parseAmount(row[billedAmountIndex]),
      };
    });
}

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

function readImportCsv() {
  return loadObjects(SHEETS.IMPORT_CSV);
}

function shouldImportCsvRow(row, config) {
  const keys = Object.keys(row);

  const dateKey = keys[Number(config.date_col) - 1];
  const amountKey = keys[Number(config.amount_col) - 1];

  const dateValue = String(row[dateKey] || "").trim();
  const amountValue = String(row[amountKey] || "").trim();

  // 日付が空の行は取り込まない
  if (!dateValue) {
    return false;
  }

  // 金額が空の行は取り込まない
  if (!amountValue) {
    return false;
  }

  // 金額として解釈できない行は取り込まない
  const amount = parseAmount(amountValue);

  if (!Number.isFinite(amount)) {
    return false;
  }

  return true;
}

function normalizeCsvRow(row, config) {
  const dateValue = row[Object.keys(row)[Number(config.date_col) - 1]];
  const merchantValue = row[Object.keys(row)[Number(config.merchant_col) - 1]];
  const itemValue = row[Object.keys(row)[Number(config.item_col) - 1]];
  const amountValue = row[Object.keys(row)[Number(config.amount_col) - 1]];
  const noteValue = row[Object.keys(row)[Number(config.note_col) - 1]];

  const amount = parseAmount(amountValue) * Number(config.amount_sign || 1);

  return {
    transaction_date: dateValue,
    merchant: merchantValue || "",
    item_name: itemValue || "",
    amount: amount,
    note: noteValue || "",
    source_type: config.source_type || "CSV",
    payment_method: config.payment_method || "",
    account_name: config.account_name || "",
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

function importCsvToTransactions(configName) {
  const config = getImportConfig(configName);

  const rows = readImportCsv();
  const rules = getRules();

  const importBatch = Utilities.formatDate(
    new Date(),
    "Asia/Tokyo",
    "yyyyMMdd_HHmmss",
  );

  let addedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    if (!shouldImportCsvRow(row, config)) {
      skippedCount++;
      continue;
    }

    const txBase = normalizeCsvRow(row, config);

    txBase.import_batch = importBatch;

    const classified = classifyTransaction(txBase, rules);

    const tx = {
      ...txBase,
      ...classified,
    };

    applyTransferMetadata_(tx);

    const added = addTransaction(tx);

    if (added) {
      addedCount++;
    } else {
      skippedCount++;
    }
  }

  // 今回のCSVがカード明細なら
  // pendingの銀行引落と照合を試す
  const settlementResult = reconcileCardSettlementForBatch_(
    importBatch,
    config.account_name,
  );

  Logger.log(`追加: ${addedCount}件 / ` + `重複スキップ: ${skippedCount}件`);

  return {
    addedCount,
    skippedCount,
    settlementResult,
  };
}

function reconcileCardSettlementForBatch_(importBatch, rawAccountName) {
  const cardAccount = resolveCanonicalAccountName_(rawAccountName);

  if (!importBatch || !cardAccount) {
    return {
      matched: false,
      reason: "invalid_input",
    };
  }

  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return {
      matched: false,
      reason: "no_transactions",
    };
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    [
      "id",
      "amount",
      "type",
      "account_name",
      "import_batch",
      "to_account",
      "settlement_status",
      "settlement_id",
    ],
    SHEETS.TRANSACTIONS,
  );

  const batchRows = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const rowBatch = String(row[index["import_batch"]] || "").trim();

    const rowAccount = resolveCanonicalAccountName_(row[index["account_name"]]);

    const settlementStatus = String(
      row[index["settlement_status"]] || "",
    ).trim();

    if (
      rowBatch === importBatch &&
      rowAccount === cardAccount &&
      settlementStatus !== "matched"
    ) {
      batchRows.push({
        sheetIndex: i,
        row,
      });
    }
  }

  if (batchRows.length === 0) {
    return {
      matched: false,
      reason: "no_card_rows",
    };
  }

  const batchTotal = batchRows.reduce((sum, item) => {
    const amount = Number(item.row[index["amount"]] || 0);

    return sum + amount;
  }, 0);

  const pendingRows = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const status = String(row[index["settlement_status"]] || "").trim();

    const toAccount = resolveCanonicalAccountName_(row[index["to_account"]]);

    const type = String(row[index["type"]] || "").trim();

    if (type === "移動" && status === "pending" && toAccount === cardAccount) {
      pendingRows.push({
        sheetIndex: i,
        row,
      });
    }
  }

  const amountMatches = pendingRows.filter(
    (item) => Number(item.row[index["amount"]] || 0) === batchTotal,
  );

  // 1件に確定できない場合は自動照合しない
  if (amountMatches.length !== 1) {
    // 同額候補が複数ある場合だけ要確認にする
    if (amountMatches.length > 1) {
      const statusColumn = index["settlement_status"] + 1;

      for (const candidate of amountMatches) {
        // values配列のindexは0始まり、
        // Spreadsheetの行番号は1始まり＋ヘッダー分
        const sheetRow = candidate.sheetIndex + 1;

        sheet.getRange(sheetRow, statusColumn).setValue("review");
      }

      clearTableCache(SHEETS.TRANSACTIONS);
      clearAccountBalanceCache_();
    }

    let candidateAmount = null;
    let difference = null;

    if (pendingRows.length === 1) {
      candidateAmount = Number(pendingRows[0].row[index["amount"]] || 0);

      difference = candidateAmount - batchTotal;
    }

    return {
      matched: false,
      reason:
        amountMatches.length === 0 ? "no_amount_match" : "multiple_candidates",
      cardAccount,
      batchTotal,
      candidateCount: pendingRows.length,
      amountMatchCount: amountMatches.length,
      candidateAmount,
      difference,
    };
  }

  const pending = amountMatches[0];

  const settlementId = "settlement_" + Utilities.getUuid();

  const statusColumn = index["settlement_status"] + 1;

  const settlementIdColumn = index["settlement_id"] + 1;

  // -------------------------
  // 銀行側を更新
  // -------------------------

  const pendingSheetRow = pending.sheetIndex + 1;

  sheet.getRange(pendingSheetRow, statusColumn).setValue("matched");

  sheet.getRange(pendingSheetRow, settlementIdColumn).setValue(settlementId);

  // -------------------------
  // 今回のカード明細だけ更新
  // -------------------------

  for (const item of batchRows) {
    const sheetRow = item.sheetIndex + 1;

    sheet.getRange(sheetRow, statusColumn).setValue("matched");

    sheet.getRange(sheetRow, settlementIdColumn).setValue(settlementId);
  }

  clearTableCache(SHEETS.TRANSACTIONS);
  clearAccountBalanceCache_();

  return {
    matched: true,
    settlementId,
    cardAccount,
    batchTotal,
    detailCount: batchRows.length,
  };
}

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

  const importBatch = String(data.importBatch || "").trim();

  if (!settlementTransactionId) {
    throw new Error("settlementTransactionIdは必須です");
  }

  if (!importBatch) {
    throw new Error("importBatchは必須です");
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
      "type",
      "amount",
      "account_name",
      "to_account",
      "import_batch",
      "settlement_status",
      "settlement_id",
    ],
    SHEETS.TRANSACTIONS,
  );

  let settlementRow = null;

  // まず引落取引を探す
  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const id = String(row[index["id"]] || "").trim();

    if (id === settlementTransactionId) {
      settlementRow = row;
      break;
    }
  }

  if (!settlementRow) {
    throw new Error("照合対象の引落が見つかりません");
  }

  const currentSettlementStatus = String(
    settlementRow[index["settlement_status"]] || "",
  ).trim();

  if (currentSettlementStatus === "matched") {
    throw new Error("この引落取引はすでに照合済みです");
  }

  // 引落の移動先カードを特定
  const cardAccount = resolveCanonicalAccountName_(
    settlementRow[index["to_account"]],
  );

  if (!cardAccount) {
    throw new Error("引落先のカード口座を特定できません");
  }

  // 同じ取込バッチ ＋ 同じカード口座の明細だけ集める
  const batchRows = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const rowBatch = String(row[index["import_batch"]] || "").trim();

    const type = String(row[index["type"]] || "").trim();

    const rowAccount = resolveCanonicalAccountName_(row[index["account_name"]]);

    if (
      rowBatch === importBatch &&
      type !== "移動" &&
      rowAccount === cardAccount
    ) {
      batchRows.push(row);
    }
  }

  if (batchRows.length === 0) {
    throw new Error("紐付け対象のカード明細がありません");
  }

  // すでに照合済みのカード明細が混ざっていないか確認
  const alreadyMatchedDetail = batchRows.some((row) => {
    return String(row[index["settlement_status"]] || "").trim() === "matched";
  });

  if (alreadyMatchedDetail) {
    throw new Error("カード明細にすでに照合済みの取引が含まれています");
  }

  const settlementAmount = Number(settlementRow[index["amount"]] || 0);

  const detailTotal = batchRows.reduce((sum, row) => {
    return sum + Number(row[index["amount"]] || 0);
  }, 0);

  const difference = settlementAmount - detailTotal;

  const settlementId = "settlement_" + Utilities.getUuid();

  settlementRow[index["settlement_status"]] = "matched";

  settlementRow[index["settlement_id"]] = settlementId;

  for (const row of batchRows) {
    row[index["settlement_status"]] = "matched";

    row[index["settlement_id"]] = settlementId;
  }

  sheet
    .getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));

  clearTableCache(SHEETS.TRANSACTIONS);
  clearAccountBalanceCache_();

  rebuildAllViews();

  return createJsonResponse_(
    {
      matched: true,
      settlementId,
      settlementTransactionId,
      importBatch,
      detailCount: batchRows.length,

      settlementAmount,
      detailTotal,
      difference,
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

  const accountName = String(tx.account_name || "").trim();

  // 通常の支出・収入
  if (type !== "移動") {
    tx.from_account = "";
    tx.to_account = "";
    tx.settlement_status = "";
    tx.settlement_id = "";
    return;
  }

  // CSVを取り込んだ口座を移動元として扱う
  tx.from_account = resolveCanonicalAccountName_(accountName);

  tx.to_account = String(tx.to_account || "").trim();

  tx.settlement_id = String(tx.settlement_id || "").trim();

  if (subCategory === "クレカ引落") {
    tx.to_account = resolveCreditCardAccount_(tx);

    // カードを特定できたら明細待ち
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

function getLatestCsvFileFromDrive(folderId) {
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();

  let latestFile = null;
  let latestTime = 0;

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName().toLowerCase();

    if (!name.endsWith(".csv")) continue;

    const updatedTime = file.getLastUpdated().getTime();
    if (updatedTime > latestTime) {
      latestTime = updatedTime;
      latestFile = file;
    }
  }

  if (!latestFile) {
    throw new Error("CSVファイルが見つかりません");
  }

  return latestFile;
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

function runImportAllCsv() {
  const folder = DriveApp.getFolderById(FOLDERS.CSV_IMPORT);
  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName().toLowerCase();

    if (!name.endsWith(".csv")) continue;

    try {
      importCsvFileAuto(file);
    } catch (error) {
      Logger.log("取込失敗: " + file.getName() + " / " + error.message);
    }
  }

  reclassifyAllTransactions();
  rebuildReviewQueue();
  rebuildReviewSummary();
  rebuildAllViews();
}

function readCsvRowsFromDrive(folderId) {
  const file = getLatestCsvFileFromDrive(folderId);
  const values = parseCsvFile(file);

  if (values.length < 2) {
    throw new Error("CSVの中身が空です");
  }

  let headerRowIndex = -1;

  for (let i = 0; i < values.length; i++) {
    const row = values[i].map((v) => String(v).trim());

    const isSaison = row.includes("利用日") && row.includes("利用金額");
    const isStacia =
      row.includes("ご利用日") &&
      row.includes("ご利用先など") &&
      row.includes("お支払い金額(￥)");
    const isJpbank =
      row.includes("取引日") &&
      row.includes("受入金額（円）") &&
      row.includes("払出金額（円）");
    const isSmbc =
      row.includes("年月日") &&
      row.includes("お引出し") &&
      row.includes("お預入れ") &&
      row.includes("お取り扱い内容");
    const isPayPay =
      row.includes("取引日") &&
      row.includes("出金金額（円）") &&
      row.includes("入金金額（円）") &&
      row.includes("取引内容");

    if (isSaison || isStacia || isJpbank || isSmbc || isPayPay) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("明細ヘッダ行が見つかりません");
  }

  const headers = values[headerRowIndex].map((v) => String(v).trim());
  const rows = values
    .slice(headerRowIndex + 1)
    .filter((row) => row.join("").trim() !== "");

  return rows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });
}

function normalizeCsvRowByHeader(row, config) {
  let transactionDate = "";
  let merchant = "";
  let itemName = "";
  let amount = 0;
  let note = "";

  if (config.config_name === "saison_card_v1") {
    amount = Number(row["利用金額"] || 0) * Number(config.amount_sign || 1);
    transactionDate = row["利用日"] || "";
    merchant = row["ご利用店名及び商品名"] || "";
    itemName = row["ご利用店名及び商品名"] || "";
    note = row["備考"] || "";
  } else if (config.config_name === "stacia_jcb_v1") {
    amount =
      Number(String(row["お支払い金額(￥)"] || "0").replace(/,/g, "")) *
      Number(config.amount_sign || 1);
    transactionDate = String(row["ご利用日"] || "").trim();
    merchant = String(row["ご利用先など"] || "").trim();
    itemName = String(row["ご利用先など"] || "").trim();
    note = String(row["備考"] || "").trim();
  } else if (config.config_name === "olive_credit_v1") {
    amount =
      Number(String(row["請求額"] || row["金額"] || "0").replace(/,/g, "")) *
      Number(config.amount_sign || 1);
    transactionDate = String(row["利用日"] || "").trim();
    merchant = String(row["加盟店"] || "").trim();
    itemName = String(row["加盟店"] || "").trim();
    note = "Oliveクレカ";
  } else if (config.config_name === "jpbank_v1") {
    const inAmount = Number(
      String(row["受入金額（円）"] || "0").replace(/,/g, ""),
    );
    const outAmount = Number(
      String(row["払出金額（円）"] || "0").replace(/,/g, ""),
    );

    amount = outAmount > 0 ? outAmount : inAmount;
    transactionDate = String(row["取引日"] || "").trim();
    merchant = [row["詳細１"] || "", row["詳細２"] || ""].join(" ").trim();
    itemName = merchant;
    note = String(row["入出金明細ＩＤ"] || "").trim();
  } else if (config.config_name === "smbc_bank_v1") {
    const inAmount = Number(String(row["お預入れ"] || "0").replace(/,/g, ""));
    const outAmount = Number(String(row["お引出し"] || "0").replace(/,/g, ""));

    amount = outAmount > 0 ? outAmount : inAmount;
    transactionDate = String(row["年月日"] || "").trim();
    merchant = String(row["お取り扱い内容"] || "").trim();
    itemName = merchant;
    note = String(row["メモ"] || "").trim();
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

    amount = outAmount > 0 ? outAmount : inAmount;
    transactionDate = String(row["取引日"] || "").trim();
    merchant = String(row["取引先"] || "").trim();
    itemName = [row["取引内容"] || "", row["取引先"] || ""].join(" ").trim();
    note = String(row["取引方法"] || "").trim();
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
    merchant: merchant,
    item_name: itemName,
    amount: amount,
    raw_text: rawText,
    note: note,
    source_type: config.source_type || "CSV",
    payment_method: config.payment_method || "",
    account_name: config.account_name || "",
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

function importLatestCsvFromDrive(folderId, configName) {
  const config = getImportConfig(configName);
  const rows = readCsvRowsFromDrive(folderId);
  const rules = getRules();

  const transactions = [];

  for (const row of rows) {
    const txBase = normalizeCsvRowByHeader(row, config);

    txBase.merchant = normalizeMerchant(txBase.merchant);

    if (
      !txBase.transaction_date ||
      !txBase.merchant ||
      Number(txBase.amount) === 0
    ) {
      continue;
    }

    let classified;

    if (
      config.config_name === "jpbank_v1" ||
      config.config_name === "smbc_bank_v1" ||
      config.config_name === "paypay_v1"
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

    transactions.push({
      ...txBase,
      ...classified,
    });
  }

  const result = addTransactions(transactions);

  Logger.log(
    `追加: ${result.addedCount}件 / ` +
      `重複スキップ: ${result.skippedCount}件`,
  );

  return result;
}

function importCsvFileAuto(file) {
  const parsed = readCsvRowsFromFile(file);

  const result = importParsedCsvRows_(parsed);

  Logger.log(
    [
      file.getName(),
      parsed.csvType,
      `追加: ${result.addedCount}件`,
      `重複スキップ: ${result.skippedCount}件`,
    ].join(" / "),
  );

  return result;
}

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
    String(data.status || "completed"),
    String(data.billingYearMonth || ""),
    String((data.billingYearMonths || []).join(",")),
  ];

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

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
   * ヘッダーなしのOlive明細。
   * 既存の変換関数で、ヘッダー付きの
   * オブジェクト配列へ変換する。
   */
  if (csvType === "olive_credit_v2" || headerRowIndex === -1) {
    const sourceRows = values
      .slice(Math.max(headerRowIndex, 0))
      .filter((row) => row.some((value) => String(value || "").trim() !== ""));

    const rows = convertOliveRowsWithoutHeader(sourceRows);

    return {
      csvType,
      rows,
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
  };
}

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

  for (const row of parsed.rows) {
    const txBase = normalizeCsvRowByHeader(row, config);

    txBase.import_batch = importBatch;

    txBase.merchant = normalizeMerchant(txBase.merchant);

    if (
      !txBase.transaction_date ||
      !txBase.merchant ||
      Number(txBase.amount) === 0
    ) {
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

function runImportTest() {
  importCsvToTransactions("credit_default");
}

function runSaisonImportFromDrive() {
  importLatestCsvFromDrive(
    "1igN1iH0nFHOqf45uGUBIXe7oBPZIE_Hq",
    "saison_card_v1",
  );
}

function runStaciaImportFromDrive() {
  importLatestCsvFromDrive(
    "1igN1iH0nFHOqf45uGUBIXe7oBPZIE_Hq",
    "stacia_jcb_v1",
  );
}

function runJpbankImportFromDrive() {
  importLatestCsvFromDrive("1igN1iH0nFHOqf45uGUBIXe7oBPZIE_Hq", "jpbank_v1");
}

function runSmbcImportFromDrive() {
  importLatestCsvFromDrive("1igN1iH0nFHOqf45uGUBIXe7oBPZIE_Hq", "smbc_bank_v1");
}

function runPayPayImportFromDrive() {
  importLatestCsvFromDrive("1igN1iH0nFHOqf45uGUBIXe7oBPZIE_Hq", "paypay_v1");
}
