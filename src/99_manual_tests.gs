// ============================================================
// Manual / Diagnostic Tests
//
// These functions are intentionally NOT included in
// runRegressionTests(). Some read live Gmail data or perform
// write-oriented diagnostics, so run them only when needed.
// ============================================================

function testDoPostCash() {
  const e = {
    postData: {
      contents: JSON.stringify({
        merchant: "ローソン",
        amount: 500,
        mode: "cash",
        memo: "テスト現金",
      }),
    },
  };

  const result = doPost(e);
  Logger.log(result.getContent());
}

function testDoPostMemo() {
  const e = {
    postData: {
      contents: JSON.stringify({
        merchant: "BOOTH",
        amount: 3200,
        mode: "memo",
        memo: "配信素材テスト",
      }),
    },
  };

  const result = doPost(e);
  Logger.log(result.getContent());
}

function testCreateTransactionFromApp() {
  const result = createTransactionFromApp_({
    transactionDate: "2026-07-30",
    type: "支出",
    amount: 380,
    category: "食費",
    title: "アプリ登録テスト",
    paymentMethod: "現金",
    memo: "Flutter接続前のテスト",
  });

  Logger.log(result.getContent());
}

function testCreateCategoryFromApp() {
  const result = createCategoryFromApp_({
    type: "支出",
    majorCategory: "テスト",
    subCategory: "動作確認",
  });

  Logger.log(result.getContent());
}

function testUpdateCategoryFromApp() {
  const result = updateCategoryFromApp_({
    subCategoryId: "sub_001",
    majorCategory: "食費",
    subCategory: "外食",
    active: true,
  });

  Logger.log(result.getContent());
}

function testClearAnalyticsCache() {
  clearAnalyticsSummaryCache_();
}

function testExistingOliveCsvVsGmail() {
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    Logger.log("Transactionsにデータがありません");
    return;
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    [
      "id",
      "transaction_date",
      "source_type",
      "account_name",
      "merchant",
      "amount",
      "source_id",
      "source_status",
    ],
    SHEETS.TRANSACTIONS,
  );

  const csvRows = [];
  const gmailRows = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const sourceType = String(row[index["source_type"]] || "").trim();

    const accountName = resolveCanonicalAccountName_(
      row[index["account_name"]],
    );

    if (accountName !== "三井住友カードOlive") {
      continue;
    }

    if (sourceType === "CSV_クレカ") {
      csvRows.push({
        id: String(row[index["id"]] || "").trim(),

        date: normalizeSettlementDate_(row[index["transaction_date"]]),

        amount: Number(row[index["amount"]] || 0),

        merchant: normalizeMerchant(String(row[index["merchant"]] || "")),
      });

      continue;
    }

    if (sourceType === "Gmail_Olive") {
      const sourceStatus = String(row[index["source_status"]] || "").trim();

      if (sourceStatus && sourceStatus !== "preliminary") {
        continue;
      }

      gmailRows.push({
        id: String(row[index["id"]] || "").trim(),

        sourceId: String(row[index["source_id"]] || "").trim(),

        date: normalizeSettlementDate_(row[index["transaction_date"]]),

        amount: Number(row[index["amount"]] || 0),

        merchant: normalizeMerchant(String(row[index["merchant"]] || "")),
      });
    }
  }

  const usedCsvIndexes = new Set();

  const matches = [];
  const unmatchedGmail = [];

  for (const gmail of gmailRows) {
    let candidateIndex = -1;
    let matchType = "";

    // ==========================================================
    // ① 同日 + 同額
    // ==========================================================

    for (let i = 0; i < csvRows.length; i++) {
      if (usedCsvIndexes.has(i)) {
        continue;
      }

      const csv = csvRows[i];

      if (csv.date === gmail.date && csv.amount === gmail.amount) {
        candidateIndex = i;
        matchType = "same_date_amount";
        break;
      }
    }

    // ==========================================================
    // ② 同額 + 日付±7日
    // ==========================================================

    if (candidateIndex === -1) {
      let bestDiff = Infinity;

      for (let i = 0; i < csvRows.length; i++) {
        if (usedCsvIndexes.has(i)) {
          continue;
        }

        const csv = csvRows[i];

        if (csv.amount !== gmail.amount) {
          continue;
        }

        const diffDays = diffDateDays_(gmail.date, csv.date);

        if (diffDays < 0 || diffDays > 7) {
          continue;
        }

        if (diffDays < bestDiff) {
          bestDiff = diffDays;
          candidateIndex = i;
          matchType = `amount_date_diff_${diffDays}`;
        }
      }
    }

    if (candidateIndex === -1) {
      unmatchedGmail.push({
        gmailTransactionId: gmail.id,
        gmailSourceId: gmail.sourceId,
        date: gmail.date,
        amount: gmail.amount,
        merchant: gmail.merchant,
      });

      continue;
    }

    const csv = csvRows[candidateIndex];

    usedCsvIndexes.add(candidateIndex);

    matches.push({
      matchType,

      gmailTransactionId: gmail.id,

      gmailSourceId: gmail.sourceId,

      gmailDate: gmail.date,

      csvTransactionId: csv.id,

      csvDate: csv.date,

      amount: gmail.amount,

      gmailMerchant: gmail.merchant,

      csvMerchant: csv.merchant,
    });
  }

  const summary = {
    gmailCount: gmailRows.length,

    csvCount: csvRows.length,

    matchedCount: matches.length,

    unmatchedCount: unmatchedGmail.length,

    matchTypeCounts: {},

    matches,

    unmatchedGmail,
  };

  for (const match of matches) {
    summary.matchTypeCounts[match.matchType] =
      Number(summary.matchTypeCounts[match.matchType] || 0) + 1;
  }

  Logger.log(JSON.stringify(summary, null, 2));

  return summary;
}

function testOliveEarlyRepaymentParsedRows(csvText) {
  /*
   * Apps Scriptエディタから引数なしで直接実行できる自己完結テスト。
   *
   * csvTextを明示的に渡した場合は、そのCSVを診断する従来用途も維持する。
   * 引数なしの場合はテスト用Olive CSVを生成し、実データ/Sheetは変更しない。
   */
  const isSelfContainedTest = !String(csvText || "").trim();

  const testCsvText = [
    "利用日,加盟店,金額,請求額,備考",
    "2026/07/01,コンビニ,1200,1200,",
    "2026/07/02,STEAM,3000,0,",
    "2026/07/03,FOREIGN SHOP,4500,,8月5日全額繰上返済",
    "2026/07/04,AMAZON,2000,2000,8月10日全額繰上返済",
    "2026/07/05,ドラッグストア,800,800,",
  ].join("\n");

  const parsed = readCsvRowsFromText_(
    isSelfContainedTest ? testCsvText : csvText,
  );

  if (
    parsed.csvType !== "olive_credit_v1" &&
    parsed.csvType !== "olive_credit_v2"
  ) {
    throw new Error("Olive CSVではありません: " + parsed.csvType);
  }

  const analysis = analyzeOliveEarlyRepaymentCsv_(parsed);

  const result = {
    mode: isSelfContainedTest ? "self_contained_test" : "provided_csv",
    csvType: parsed.csvType,
    parsedRowCount: analysis.parsedRowCount,
    earlyRepayment: analysis.earlyRepayment,
    normalBilling: analysis.normalBilling,
  };

  if (isSelfContainedTest) {
    const assertEqual = (label, actual, expected) => {
      if (actual !== expected) {
        throw new Error(
          `${label}: expected=${expected}, actual=${actual}`,
        );
      }
    };

    const assertArrayEqual = (label, actual, expected) => {
      const actualJson = JSON.stringify(actual);
      const expectedJson = JSON.stringify(expected);

      if (actualJson !== expectedJson) {
        throw new Error(
          `${label}: expected=${expectedJson}, actual=${actualJson}`,
        );
      }
    };

    assertEqual("parsedRowCount", analysis.parsedRowCount, 5);
    assertEqual("earlyRepayment.count", analysis.earlyRepayment.count, 2);
    assertEqual("earlyRepayment.amount", analysis.earlyRepayment.amount, 6500);
    assertArrayEqual(
      "earlyRepayment.repaymentDates",
      analysis.earlyRepayment.repaymentDates,
      ["8/5", "8/10"],
    );
    assertEqual("normalBilling.count", analysis.normalBilling.count, 3);
    assertEqual("normalBilling.billedAmount", analysis.normalBilling.billedAmount, 2000);
    assertEqual(
      "normalBilling.billedAmountZeroCount",
      analysis.normalBilling.billedAmountZeroCount,
      1,
    );

    result.assertions = "PASS";
  }

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}

// ============================================================
// Gmail Tests (moved from 50_gmail_import.gs)
// ============================================================

function testGmailPreliminaryImport() {
  const results = [];

  // ----------------------------------------------------------
  // 1. 三井住友カード 利用通知
  // ----------------------------------------------------------

  results.push(
    ...testParseGmailMessages_(
      'subject:"ご利用のお知らせ【三井住友カード】" newer_than:30d',
      "olive_card",
      10,
    ),
  );

  // ----------------------------------------------------------
  // 2. 三井住友銀行 振込入金
  // ----------------------------------------------------------

  results.push(
    ...testParseGmailMessages_(
      'from:SMBC_service@dn.smbc.co.jp subject:"振込入金のお知らせ" newer_than:30d',
      "smbc_deposit",
      10,
    ),
  );

  // ----------------------------------------------------------
  // 3. 三井住友銀行 口座出金
  // ----------------------------------------------------------

  results.push(
    ...testParseGmailMessages_(
      'from:SMBC_service@dn.smbc.co.jp subject:"口座出金のお知らせ" newer_than:30d',
      "smbc_withdrawal",
      10,
    ),
  );

  Logger.log(
    JSON.stringify(
      {
        count: results.length,
        items: results,
      },
      null,
      2,
    ),
  );
}

function testParseGmailMessages_(query, sourceKind, limit) {
  const threads = GmailApp.search(query, 0, limit);

  const results = [];

  for (const thread of threads) {
    const messages = thread.getMessages();

    for (const message of messages) {
      const parsed = parseGmailPreliminaryMessage_(message, sourceKind);

      if (parsed) {
        results.push(parsed);
      }
    }
  }

  return results;
}

function testListVpassMails() {
  const threads = GmailApp.search('newer_than:30d "三井住友カード"', 0, 30);

  const results = [];

  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      results.push({
        from: message.getFrom(),
        subject: message.getSubject(),
        receivedAt: Utilities.formatDate(
          message.getDate(),
          Session.getScriptTimeZone(),
          "yyyy/MM/dd HH:mm:ss",
        ),
      });
    }
  }

  Logger.log(JSON.stringify(results, null, 2));
}

function testShowOliveMailBody() {
  const threads = GmailApp.search(
    'from:statement@vpass.ne.jp subject:"ご利用のお知らせ【三井住友カード】" newer_than:30d',
    0,
    1,
  );

  if (threads.length === 0) {
    Logger.log("対象メールが見つかりませんでした。");
    return;
  }

  const messages = threads[0].getMessages();

  for (const message of messages) {
    Logger.log("===== FROM =====");
    Logger.log(message.getFrom());

    Logger.log("===== SUBJECT =====");
    Logger.log(message.getSubject());

    Logger.log("===== RECEIVED AT =====");
    Logger.log(
      Utilities.formatDate(
        message.getDate(),
        Session.getScriptTimeZone(),
        "yyyy/MM/dd HH:mm:ss",
      ),
    );

    Logger.log("===== BODY =====");
    Logger.log(message.getPlainBody());
  }
}

function testAddGmailPreliminaryTransaction() {
  const now = new Date();

  const receivedAt = Utilities.formatDate(
    now,
    "Asia/Tokyo",
    "yyyy/MM/dd HH:mm:ss",
  );

  const tx = {
    // --------------------------------------------------------
    // 基本情報
    // --------------------------------------------------------

    transaction_date: "2026-08-25",

    type: "支出",

    amount: 123,

    merchant: "GMAIL速報テスト",

    item_name: "GMAIL速報テスト",

    raw_text: "Gmail速報取込の登録テスト",

    // --------------------------------------------------------
    // データソース
    // --------------------------------------------------------

    source_type: "Gmail_Olive",

    source_id: "gmail_test_" + Utilities.getUuid(),

    source_status: "preliminary",

    source_received_at: receivedAt,

    import_batch:
      "gmail_test_" +
      Utilities.formatDate(now, "Asia/Tokyo", "yyyyMMdd_HHmmss"),

    // --------------------------------------------------------
    // 支払元
    // --------------------------------------------------------

    payment_method: "三井住友カードOlive",

    account_name: "三井住友カードOlive",

    // --------------------------------------------------------
    // 分類
    //
    // 今回は登録テストなので仮値。
    // 本番では既存の自動分類を通す。
    // --------------------------------------------------------

    major_category: "その他",

    sub_category: "その他",

    purpose_type: "私用",

    expense_ratio: 0,

    wallet: "生活",

    intent: "その他",

    status: "要確認",

    // --------------------------------------------------------
    // その他
    // --------------------------------------------------------

    note: "Gmail速報登録テスト",

    evidence_url: "",

    original_image_url: "",

    from_account: "",

    to_account: "",

    settlement_status: "",

    settlement_id: "",
  };

  const result = addTransactions([tx], {
    // テストなので既存duplicate_key判定は使わない
    skipDuplicateCheck: true,
  });

  // ----------------------------------------------------------
  // キャッシュ更新
  // ----------------------------------------------------------

  clearTableCache(SHEETS.TRANSACTIONS);

  clearAccountBalanceCache_();

  clearHomeRecentTransactionsCache_();

  const yearMonth = normalizeYearMonth(tx.transaction_date);

  if (yearMonth) {
    markSummaryDirty_(yearMonth);
  }

  Logger.log(
    JSON.stringify(
      {
        result,
        transaction: tx,
      },
      null,
      2,
    ),
  );
}

/**
 * Phase 1 diagnostic: inspect live Olive Gmail preliminary rows against
 * formal CSV rows without writing anything.
 *
 * Focuses on 2026-08 by default. Change targetYearMonth when needed.
 */
function diagnoseOliveGmailVsCsv202608() {
  return diagnoseOliveGmailVsCsv_("2026-08");
}

function diagnoseOliveGmailVsCsv_(targetYearMonth) {
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    Logger.log("Transactionsにデータがありません");
    return null;
  }

  const index = createHeaderIndex(values[0]);
  assertRequiredColumns(
    index,
    [
      "id",
      "transaction_date",
      "year_month",
      "source_type",
      "account_name",
      "merchant",
      "item_name",
      "amount",
      "import_batch",
      "source_id",
      "source_status",
    ],
    SHEETS.TRANSACTIONS,
  );

  const targetYm = normalizeYearMonth(targetYearMonth);
  const sourceTypeCounts = {};
  const oliveAccountCounts = {};
  const gmailRows = [];
  const csvRows = [];
  const oliveLikeRows = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const date = normalizeSettlementDate_(row[index["transaction_date"]]);
    const ym = normalizeYearMonth(row[index["year_month"]] || date.slice(0, 7));
    if (ym !== targetYm) continue;

    const sourceType = String(row[index["source_type"]] || "").trim();
    const rawAccountName = String(row[index["account_name"]] || "").trim();
    const accountName = resolveCanonicalAccountName_(rawAccountName);
    const merchant = normalizeMerchant(String(row[index["merchant"]] || ""));
    const amount = Number(row[index["amount"]] || 0);

    sourceTypeCounts[sourceType || "(blank)"] =
      Number(sourceTypeCounts[sourceType || "(blank)"] || 0) + 1;

    if (accountName === "三井住友カードOlive" || /olive/i.test(rawAccountName)) {
      oliveAccountCounts[`${sourceType || "(blank)"} | ${rawAccountName || "(blank)"}`] =
        Number(oliveAccountCounts[`${sourceType || "(blank)"} | ${rawAccountName || "(blank)"}`] || 0) + 1;

      oliveLikeRows.push({
        id: String(row[index["id"]] || "").trim(),
        date,
        sourceType,
        rawAccountName,
        canonicalAccountName: accountName,
        merchant,
        itemName: String(row[index["item_name"]] || "").trim(),
        amount,
        importBatch: String(row[index["import_batch"]] || "").trim(),
        sourceStatus: String(row[index["source_status"]] || "").trim(),
      });
    }

    if (sourceType === "Gmail_Olive" && accountName === "三井住友カードOlive") {
      gmailRows.push({
        id: String(row[index["id"]] || "").trim(),
        sourceId: String(row[index["source_id"]] || "").trim(),
        sourceStatus: String(row[index["source_status"]] || "").trim(),
        date,
        merchant,
        amount,
      });
    }

    if (sourceType === "CSV_クレカ" && accountName === "三井住友カードOlive") {
      csvRows.push({
        id: String(row[index["id"]] || "").trim(),
        date,
        merchant,
        amount,
        importBatch: String(row[index["import_batch"]] || "").trim(),
      });
    }
  }

  const gmailDiagnostics = gmailRows.map((gmail) => {
    const sameAmount = csvRows
      .map((csv) => ({
        csvTransactionId: csv.id,
        csvDate: csv.date,
        csvAmount: csv.amount,
        csvMerchant: csv.merchant,
        importBatch: csv.importBatch,
        diffDays: diffDateDays_(gmail.date, csv.date),
        merchantScore: merchantSimilarityScore_(gmail.merchant, csv.merchant),
      }))
      .filter((candidate) => candidate.csvAmount === gmail.amount)
      .sort((a, b) => a.diffDays - b.diffDays || b.merchantScore - a.merchantScore);

    return {
      gmailTransactionId: gmail.id,
      gmailSourceId: gmail.sourceId,
      sourceStatus: gmail.sourceStatus,
      date: gmail.date,
      amount: gmail.amount,
      merchant: gmail.merchant,
      sameAmountCandidateCount: sameAmount.length,
      nearestSameAmountCandidates: sameAmount.slice(0, 5),
    };
  });

  const result = {
    targetYearMonth: targetYm,
    sourceTypeCounts,
    oliveAccountCounts,
    gmailCount: gmailRows.length,
    csvCount: csvRows.length,
    oliveLikeRowCount: oliveLikeRows.length,
    gmailDiagnostics,
    csvRows,
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
