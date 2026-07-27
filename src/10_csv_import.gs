function detectCsvTypeFromRows(values) {
  for (let i = 0; i < values.length; i++) {
    const row = values[i].map(v => String(v).trim());

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

    if (isOliveCardNoHeader) {
      return {
        csvType: "olive_credit_v2",
        headerRowIndex: i
      };
    }

    if (isOliveCreditNoHeader) {
      return {
        csvType: "olive_credit_v1",
        headerRowIndex: -1,
      };
    }
  }

  return {
    csvType: "unknown",
    headerRowIndex: -1,
  };
}

function readCsvRowsFromFile(file) {
  const values = parseCsvFile(file);
  const detected = detectCsvTypeFromRows(values);

  if (detected.csvType === "unknown") {
    throw new Error(
      "CSV種別を判定できません: " +
      file.getName()
    );
  }

  if (
    detected.csvType === "olive_credit_v1" &&
    detected.headerRowIndex === -1
  ) {
    return {
      csvType: detected.csvType,
      rows: convertOliveRowsWithoutHeader(
        values.slice(1)
      )
    };
  }

  if (detected.csvType === "olive_credit_v2") {
    return {
      csvType: detected.csvType,
      rows: convertOliveRowsWithoutHeader(
        values.slice(detected.headerRowIndex)
      )
    };
  }

  const headers = values[
    detected.headerRowIndex
  ].map(value =>
    String(value || "").trim()
  );

  const rows = values
    .slice(detected.headerRowIndex + 1)
    .filter(row =>
      row.join("").trim() !== ""
    );

  return {
    csvType: detected.csvType,
    rows: rows.map(row =>
      rowToObject(headers, row)
    )
  };
}

function parseCsvFile(file) {
  const blob = file.getBlob();

  // 日本の金融CSVはShift_JISが多いので先に読む
  const sjis = blob.getDataAsString("Shift_JIS");
  const parsedSjis = Utilities.parseCsv(sjis);

  const joined = parsedSjis.slice(0, 5)
    .map(r => r.join("|"))
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
    .filter(row =>
      row.join("").trim() !== ""
    )
    .filter(row =>
      /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(
        String(row[0] || "").trim()
      )
    )
    .map(row => {
      const isDetailedFormat =
        row.length >= 8 &&
        String(row[2] || "").trim() === "ご本人";

      const amountIndex = isDetailedFormat ? 6 : 2;
      const billedAmountIndex = isDetailedFormat ? 7 : 5;

      return {
        "利用日": String(row[0] || "").trim(),
        "加盟店": String(row[1] || "").trim(),
        "金額": parseAmount(row[amountIndex]),
        "請求額": parseAmount(row[billedAmountIndex])
      };
    });
}

function getImportConfig(configName) {
  const targetName = String(
    configName || ""
  ).trim();

  const config = loadObjects("import_config")
    .find(row =>
      String(row.config_name || "").trim() ===
      targetName
    );

  if (!config) {
    throw new Error(
      "import_config に該当設定がありません: " +
      targetName
    );
  }

  const active = String(
    config.active === undefined
      ? "1"
      : config.active
  ).trim();

  if (
    active !== "1" &&
    active.toUpperCase() !== "TRUE"
  ) {
    throw new Error(
      "import_config が inactive です: " +
      targetName
    );
  }

  return config;
}

function readImportCsv() {
  return loadObjects("import_csv");
}

function normalizeCsvRow(row, config) {
  const dateValue = row[Object.keys(row)[Number(config.date_col) - 1]];
  const merchantValue = row[Object.keys(row)[Number(config.merchant_col) - 1]];
  const itemValue = row[Object.keys(row)[Number(config.item_col) - 1]];
  const amountValue = row[Object.keys(row)[Number(config.amount_col) - 1]];
  const noteValue = row[Object.keys(row)[Number(config.note_col) - 1]];

  const amount = Number(amountValue) * Number(config.amount_sign || 1);

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
    import_batch: Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd_HHmmss"),
    duplicate_key: "",
  };
}

function importCsvToTransactions(configName) {
  const config = getImportConfig(configName);
  const rows = readImportCsv();
  const rules = getRules();

  let addedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    const txBase = normalizeCsvRow(row, config);
    const classified = classifyTransaction(txBase, rules);

    const tx = {
      ...txBase,
      ...classified,
    };

    const added = addTransaction(tx);

    if (added) {
      addedCount++;
    } else {
      skippedCount++;
    }
  }

  Logger.log(`追加: ${addedCount}件 / 重複スキップ: ${skippedCount}件`);
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
  const configMap = {
    smbc_bank_v1: "smbc_bank_v1",
    paypay_v1: "paypay_v1",
    olive_credit_v1: "olive_credit_v1",
    olive_credit_v2: "olive_credit_v1"
  };

  const configName = configMap[csvType];

  if (!configName) {
    throw new Error(
      "対応していないCSV種別です: " + csvType
    );
  }

  return configName;
}

function runImportAllCsv() {
  const folderId = "1igN1iH0nFHOqf45uGUBIXe7oBPZIE_Hq";
  const folder = DriveApp.getFolderById(folderId);
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
    const row = values[i].map(v => String(v).trim());

    const isSaison = row.includes("利用日") && row.includes("利用金額");
    const isStacia = row.includes("ご利用日") && row.includes("ご利用先など") && row.includes("お支払い金額(￥)");
    const isJpbank = row.includes("取引日") && row.includes("受入金額（円）") && row.includes("払出金額（円）");
    const isSmbc = row.includes("年月日") && row.includes("お引出し") && row.includes("お預入れ") && row.includes("お取り扱い内容");
    const isPayPay = row.includes("取引日") && row.includes("出金金額（円）") && row.includes("入金金額（円）") && row.includes("取引内容");

    if (isSaison || isStacia || isJpbank || isSmbc || isPayPay) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("明細ヘッダ行が見つかりません");
  }

  const headers = values[headerRowIndex].map(v => String(v).trim());
  const rows = values
    .slice(headerRowIndex + 1)
    .filter(row => row.join("").trim() !== "");

  return rows.map(row => {
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
    amount = Number(String(row["お支払い金額(￥)"] || "0").replace(/,/g, "")) * Number(config.amount_sign || 1);
    transactionDate = String(row["ご利用日"] || "").trim();
    merchant = String(row["ご利用先など"] || "").trim();
    itemName = String(row["ご利用先など"] || "").trim();
    note = String(row["備考"] || "").trim();

    } else if (config.config_name === "olive_credit_v1") {
      amount = Number(String(row["請求額"] || row["金額"] || "0").replace(/,/g, "")) * Number(config.amount_sign || 1);
      transactionDate = String(row["利用日"] || "").trim();
      merchant = String(row["加盟店"] || "").trim();
      itemName = String(row["加盟店"] || "").trim();
      note = "Oliveクレカ";  

  } else if (config.config_name === "jpbank_v1") {
    const inAmount = Number(String(row["受入金額（円）"] || "0").replace(/,/g, ""));
    const outAmount = Number(String(row["払出金額（円）"] || "0").replace(/,/g, ""));

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
    const outAmount = Number(String(row["出金金額（円）"] || "0").replace(/,/g, "").replace(/-/g, "0"));
    const inAmount = Number(String(row["入金金額（円）"] || "0").replace(/,/g, "").replace(/-/g, "0"));

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

    amount = Number(String(amountValue || "0").replace(/,/g, "")) * Number(config.amount_sign || 1);
    transactionDate = dateValue || "";
    merchant = merchantValue || "";
    itemName = itemValue || "";
    note = noteValue || "";
  }

  return {
    transaction_date: transactionDate,
    merchant: merchant,
    item_name: itemName,
    amount: amount,
    note: note,
    source_type: config.source_type || "CSV",
    payment_method: config.payment_method || "",
    account_name: config.account_name || "",
    evidence_url: "",
    original_image_url: "",
    import_batch: Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd_HHmmss"),
    duplicate_key: "",
  };
}

function importLatestCsvFromDrive(folderId, configName) {
  const config = getImportConfig(configName);
  const rows = readCsvRowsFromDrive(folderId);
  const rules = getRules();

  let addedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    const txBase = normalizeCsvRowByHeader(row, config);

    txBase.merchant = normalizeMerchant(txBase.merchant);

    if (!txBase.transaction_date || !txBase.merchant || Number(txBase.amount) === 0) {
      continue;
    }

    let classified;

    if (
      config.config_name === "jpbank_v1" ||
      config.config_name === "smbc_bank_v1" ||
      config.config_name === "paypay_v1"
    ) {
      classified = classifyMoneyTransaction(row, txBase, rules, config.config_name);
    } else {
      classified = classifyTransaction(txBase, rules);
    }

    const tx = {
      ...txBase,
      ...classified,
    };

    const added = addTransaction(tx);

    if (added) {
      addedCount++;
    } else {
      skippedCount++;
    }
  }

  Logger.log(`追加: ${addedCount}件 / 重複スキップ: ${skippedCount}件`);
}

function importCsvFileAuto(file) {
  const parsed = readCsvRowsFromFile(file);
  const configName = getConfigNameByCsvType(parsed.csvType);
  const config = getImportConfig(configName);
  const rules = getRules();

  let addedCount = 0;
  let skippedCount = 0;

  for (const row of parsed.rows) {
    const txBase = normalizeCsvRowByHeader(row, config);
    txBase.merchant = normalizeMerchant(txBase.merchant);

    if (!txBase.transaction_date || !txBase.merchant || Number(txBase.amount) === 0) {
      continue;
    }

    let classified;

    if (
      config.config_name === "smbc_bank_v1" ||
      config.config_name === "paypay_v1"
    ) {
      classified = classifyMoneyTransaction(row, txBase, rules, config.config_name);
    } else {
      classified = classifyTransaction(txBase, rules);
    }

    const tx = {
      ...txBase,
      ...classified,
    };

    const added = addTransaction(tx);

    if (added) addedCount++;
    else skippedCount++;
  }

  Logger.log(
    `${file.getName()} / ${parsed.csvType} / 追加: ${addedCount}件 / 重複スキップ: ${skippedCount}件`
  );
}

function runImportTest() {
  importCsvToTransactions("credit_default");
}

function runSaisonImportFromDrive() {
  importLatestCsvFromDrive("1igN1iH0nFHOqf45uGUBIXe7oBPZIE_Hq", "saison_card_v1");
}

function runStaciaImportFromDrive() {
  importLatestCsvFromDrive("1igN1iH0nFHOqf45uGUBIXe7oBPZIE_Hq", "stacia_jcb_v1");
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