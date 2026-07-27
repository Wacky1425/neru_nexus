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