/**
 * ============================================================
 * Gmail速報取込
 *
 * 現在は解析テスト専用。
 * Transactionsへの登録は行わない。
 * ============================================================
 */

/**
 * Gmail速報取込の解析テスト。
 *
 * Apps Scriptエディタからこの関数を手動実行する。
 */
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

/**
 * Gmail速報取込候補を取得する。
 *
 * 初回補完も考慮して過去90日を検索する。
 * Transactionsへの書き込みは行わない。
 */
function getGmailTransactionCandidates_() {
  const results = [];

  // Olive クレジット利用通知
  results.push(
    ...testParseGmailMessages_(
      'from:statement@vpass.ne.jp subject:"ご利用のお知らせ【三井住友カード】" newer_than:90d',
      "olive_card",
      100,
    ),
  );

  // 三井住友銀行 振込入金
  results.push(
    ...testParseGmailMessages_(
      'from:SMBC_service@dn.smbc.co.jp subject:"振込入金のお知らせ" newer_than:90d',
      "smbc_deposit",
      100,
    ),
  );

  // 三井住友銀行 口座出金
  results.push(
    ...testParseGmailMessages_(
      'from:SMBC_service@dn.smbc.co.jp subject:"口座出金のお知らせ" newer_than:90d',
      "smbc_withdrawal",
      100,
    ),
  );

  return {
    count: results.length,
    items: results,
  };
}
/**
 * Gmail検索 → メール解析。
 *
 * この段階ではTransactionsへ保存しない。
 */
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

/**
 * メール種別ごとに解析する。
 */
function parseGmailPreliminaryMessage_(message, sourceKind) {
  const subject = message.getSubject();

  const body = normalizeGmailBody_(message.getPlainBody());

  const messageId = message.getId();

  const receivedAt = message.getDate();

  let parsed = null;

  switch (sourceKind) {
    case "olive_card":
      parsed = parseOliveCardMail_(body);
      break;

    case "smbc_deposit":
      parsed = parseSmbcDepositMail_(body);
      break;

    case "smbc_withdrawal":
      parsed = parseSmbcWithdrawalMail_(body);
      break;

    default:
      return null;
  }

  if (!parsed) {
    return null;
  }

  return {
    sourceKind,
    messageId,
    subject,

    receivedAt: Utilities.formatDate(
      receivedAt,
      Session.getScriptTimeZone(),
      "yyyy/MM/dd HH:mm:ss",
    ),

    ...parsed,
  };
}

/**
 * ============================================================
 * Olive クレジット利用通知
 * ============================================================
 */
/**
 * ============================================================
 * Olive クレジット利用通知
 * ============================================================
 */
function parseOliveCardMail_(body) {
  const dateMatch = body.match(
    /◇?利用日[：:\s]*([0-9]{4})[\/\-]([0-9]{1,2})[\/\-]([0-9]{1,2})\s+([0-9]{1,2}):([0-9]{2})/,
  );

  const amountMatch = body.match(/◇?利用金額[：:\s]*([0-9,]+)\s*円/);

  const merchantMatch = body.match(/◇?利用先[：:\s]*([^\n\r]+)/);

  const transactionTypeMatch = body.match(/◇?利用取引[：:\s]*([^\n\r]+)/);

  const cardMatch = body.match(/ご利用カード[：:\s]*([^\n\r]+)/);

  if (!dateMatch || !amountMatch) {
    return null;
  }

  return {
    transactionDate:
      dateMatch[1] +
      "-" +
      String(dateMatch[2]).padStart(2, "0") +
      "-" +
      String(dateMatch[3]).padStart(2, "0"),

    transactionTime: String(dateMatch[4]).padStart(2, "0") + ":" + dateMatch[5],

    amount: parseGmailAmount_(amountMatch[1]),

    merchant: merchantMatch ? merchantMatch[1].trim() : "",

    transactionType: transactionTypeMatch ? transactionTypeMatch[1].trim() : "",

    cardName: cardMatch ? cardMatch[1].trim() : "",
  };
}

/**
 * ============================================================
 * SMBC 振込入金
 * ============================================================
 */
function parseSmbcDepositMail_(body) {
  const dateMatch = body.match(
    /入金日[：:\s]*([0-9]{4})年([0-9]{1,2})月([0-9]{1,2})日/,
  );

  const amountMatch = body.match(/金額[：:\s]*([0-9,]+)\s*円/);

  const contentMatch = body.match(/内容[：:\s]*([^\n\r]+)/);

  if (!dateMatch || !amountMatch) {
    return null;
  }

  return {
    transactionDate:
      dateMatch[1] +
      "-" +
      String(dateMatch[2]).padStart(2, "0") +
      "-" +
      String(dateMatch[3]).padStart(2, "0"),

    amount: parseGmailAmount_(amountMatch[1]),

    content: contentMatch ? contentMatch[1].trim() : "",
  };
}

/**
 * ============================================================
 * SMBC 口座出金
 * ============================================================
 */
function parseSmbcWithdrawalMail_(body) {
  const dateMatch = body.match(
    /出金日[：:\s]*([0-9]{4})年([0-9]{1,2})月([0-9]{1,2})日/,
  );

  const amountMatch = body.match(/出金額[：:\s]*([0-9,]+)\s*円/);

  const contentMatch = body.match(/内容[：:\s]*([^\n\r]+)/);

  if (!dateMatch || !amountMatch) {
    return null;
  }

  return {
    transactionDate:
      dateMatch[1] +
      "-" +
      String(dateMatch[2]).padStart(2, "0") +
      "-" +
      String(dateMatch[3]).padStart(2, "0"),

    amount: parseGmailAmount_(amountMatch[1]),

    content: contentMatch ? contentMatch[1].trim() : "",
  };
}

/**
 * Gmail本文を解析しやすい形に整える。
 */
function normalizeGmailBody_(body) {
  return String(body || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u3000/g, " ");
}

/**
 * "61,131" → 61131
 */
function parseGmailAmount_(value) {
  return Number(
    String(value || "")
      .replace(/,/g, "")
      .trim(),
  );
}

/**
 * 三井住友カード系メールの
 * 実際の送信元・件名を確認するためのテスト。
 */
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

/**
 * Olive利用通知メールの本文形式を確認する。
 *
 * Transactionsへの書き込みは行わない。
 */
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

/**
 * ============================================================
 * Gmail速報 Transaction登録テスト
 *
 * 架空の1件だけTransactionsへ登録する。
 * Gmail自体は読み込まない。
 *
 * テスト後、この行は手動削除する。
 * ============================================================
 */
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
 * Gmailから取得した速報取引をTransactionsへ登録する。
 *
 * 想定:
 *   getGmailTransactionCandidates_()
 * が
 *
 * {
 *   count: 25,
 *   items: [...]
 * }
 *
 * の形を返す。
 */
function importGmailTransactions() {
  const result = getGmailTransactionCandidates_();

  const items = result && Array.isArray(result.items) ? result.items : [];

  if (items.length === 0) {
    return {
      foundCount: 0,
      addedCount: 0,
      skippedCount: 0,
    };
  }

  const transactions = [];

  for (const item of items) {
    const tx = buildTransactionFromGmailItem_(item);

    if (!tx) {
      continue;
    }

    transactions.push(tx);
  }

  const filteredTransactions = filterGmailTransactionsForImport_(transactions);

  if (filteredTransactions.length === 0) {
    return {
      foundCount: items.length,
      addedCount: 0,
      skippedCount: transactions.length,
    };
  }

  const addResult = addTransactions(filteredTransactions, {
    skipDuplicateCheck: false,
  });

  clearTableCache(SHEETS.TRANSACTIONS);
  clearAccountBalanceCache_();
  clearHomeRecentTransactionsCache_();

  const dirtyYearMonths = new Set();

  for (const tx of filteredTransactions) {
    const yearMonth = normalizeYearMonth(tx.transaction_date);

    if (yearMonth) {
      dirtyYearMonths.add(yearMonth);
    }
  }

  for (const yearMonth of dirtyYearMonths) {
    markSummaryDirty_(yearMonth);
  }

  return {
    foundCount: items.length,
    candidateCount: transactions.length,
    addedCount: addResult.addedCount,
    skippedCount:
      transactions.length -
      filteredTransactions.length +
      addResult.skippedCount,
  };
}

/**
 * Gmail解析結果1件をTransactions用データへ変換する。
 */
function buildTransactionFromGmailItem_(item) {
  const sourceKind = String(item.sourceKind || "").trim();

  // ------------------------------------------
  // Oliveクレジット利用通知
  // ------------------------------------------

  if (sourceKind === "olive_card") {
    const merchant = normalizeMerchant(String(item.merchant || "").trim());

    return {
      transaction_date: item.transactionDate || "",

      type: "支出",

      source_type: "Gmail_Olive",

      payment_method: "Oliveクレカ",

      account_name: "三井住友カードOlive",

      merchant: merchant,

      item_name: merchant,

      raw_text: [
        item.cardName || "",
        item.transactionType || "",
        item.merchant || "",
      ]
        .filter(Boolean)
        .join(" / "),

      amount: Number(item.amount || 0),

      major_category: "その他",

      sub_category: "要確認",

      purpose_type: "私用",

      expense_ratio: 0,

      note: "Gmail速報",

      evidence_url: "",

      original_image_url: "",

      import_batch:
        "gmail_" +
        Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd_HHmmss"),

      status: "要確認",

      wallet: "生活",

      intent: "その他",

      from_account: "",

      to_account: "",

      settlement_status: "",

      settlement_id: "",

      source_id: String(item.messageId || "").trim(),

      source_status: "preliminary",

      source_received_at: String(item.receivedAt || "").trim(),
    };
  }

  // ------------------------------------------
  // 三井住友銀行 入金通知
  // ------------------------------------------

  if (sourceKind === "smbc_deposit") {
    const merchant = normalizeMerchant(String(item.content || "").trim());

    return {
      transaction_date: item.transactionDate || "",

      type: "収入",

      source_type: "Gmail_SMBC",

      payment_method: "三井住友銀行",

      account_name: "三井住友銀行",

      merchant: merchant,

      item_name: merchant,

      raw_text: String(item.content || ""),

      amount: Number(item.amount || 0),

      major_category: "収入",

      sub_category: "要確認",

      purpose_type: "私用",

      expense_ratio: 0,

      note: "Gmail速報",

      evidence_url: "",

      original_image_url: "",

      import_batch:
        "gmail_" +
        Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd_HHmmss"),

      status: "要確認",

      wallet: "生活",

      intent: "その他",

      from_account: "",

      to_account: "",

      settlement_status: "",

      settlement_id: "",

      source_id: String(item.messageId || "").trim(),

      source_status: "preliminary",

      source_received_at: String(item.receivedAt || "").trim(),
    };
  }

  // ------------------------------------------
  // 三井住友銀行 出金通知
  // ------------------------------------------

  if (sourceKind === "smbc_withdrawal") {
    const merchant = normalizeMerchant(String(item.content || "").trim());

    return {
      transaction_date: item.transactionDate || "",

      type: "支出",

      source_type: "Gmail_SMBC",

      payment_method: "三井住友銀行",

      account_name: "三井住友銀行",

      merchant: merchant,

      item_name: merchant,

      raw_text: String(item.content || ""),

      amount: Number(item.amount || 0),

      major_category: "その他",

      sub_category: "要確認",

      purpose_type: "私用",

      expense_ratio: 0,

      note: "Gmail速報",

      evidence_url: "",

      original_image_url: "",

      import_batch:
        "gmail_" +
        Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd_HHmmss"),

      status: "要確認",

      wallet: "生活",

      intent: "その他",

      from_account: "",

      to_account: "",

      settlement_status: "",

      settlement_id: "",

      source_id: String(item.messageId || "").trim(),

      source_status: "preliminary",

      source_received_at: String(item.receivedAt || "").trim(),
    };
  }

  return null;
}

/**
 * Gmail速報のうち、登録してよいものだけ残す。
 *
 * 1. 同じsource_idのGmail速報が既にある
 *    → スキップ
 *
 * 2. 同じ取引が正式CSVですでに存在する
 *    → スキップ
 *
 * 3. それ以外
 *    → 登録
 */
/**
 * Gmail速報のうち、登録してよいものだけ残す。
 *
 * 判定：
 *
 * 1. source_id が既に存在
 *    → 取込済みなのでスキップ
 *
 * 2. 正式CSVに
 *    同一口座 + 同一日 + 同一金額
 *    の取引が存在
 *    → 件数分だけスキップ
 *
 * 3. 正式CSVの件数を超えた分
 *    → Gmail速報として登録
 *
 * 例：
 *
 * CSV
 * 8/10 500円 × 1件
 *
 * Gmail
 * 8/10 500円 × 2件
 *
 * → Gmailの1件を既存扱い
 * → 残り1件を速報登録
 */
function filterGmailTransactionsForImport_(transactions) {
  const table = loadTransactions();

  if (!table || !Array.isArray(table.rows)) {
    return transactions;
  }

  const index = table.index;

  const requiredColumns = [
    "transaction_date",
    "source_type",
    "account_name",
    "amount",
    "source_id",
  ];

  for (const column of requiredColumns) {
    if (index[column] === undefined) {
      throw new Error("Transactionsに必要な列がありません: " + column);
    }
  }

  // ============================================================
  // 既に処理済みのGmail Message ID
  // ============================================================

  const existingSourceIds = new Set();

  // ============================================================
  // 正式CSVの件数
  //
  // key:
  // sourceGroup | account | date | amount
  //
  // Gmail_Olive
  //   → CSV_クレカ
  //
  // Gmail_SMBC
  //   → CSV_銀行
  // ============================================================

  const formalCounts = new Map();

  for (const row of table.rows) {
    const sourceId = String(row[index["source_id"]] || "").trim();

    if (sourceId) {
      existingSourceIds.add(sourceId);
    }

    const sourceType = String(row[index["source_type"]] || "").trim();

    let sourceGroup = "";

    if (sourceType === "CSV_クレカ") {
      sourceGroup = "olive";
    } else if (sourceType === "CSV_銀行") {
      sourceGroup = "smbc";
    } else {
      continue;
    }

    const accountName = resolveCanonicalAccountName_(
      String(row[index["account_name"]] || ""),
    );

    const transactionDate = normalizeDuplicateDate_(
      row[index["transaction_date"]],
    );

    const amount = Number(row[index["amount"]] || 0);

    const key = [sourceGroup, accountName, transactionDate, amount].join("|");

    formalCounts.set(key, Number(formalCounts.get(key) || 0) + 1);
  }

  // ============================================================
  // 今回のGmail群で
  // 正式CSV何件分まで消費したか
  // ============================================================

  const matchedCounts = new Map();

  const result = [];

  for (const tx of transactions) {
    const sourceId = String(tx.source_id || "").trim();

    // ----------------------------------------------------------
    // Gmail Message IDが既に登録済み
    // ----------------------------------------------------------

    if (sourceId && existingSourceIds.has(sourceId)) {
      continue;
    }

    // ----------------------------------------------------------
    // Gmail種別
    // ----------------------------------------------------------

    const sourceType = String(tx.source_type || "").trim();

    let sourceGroup = "";

    if (sourceType === "Gmail_Olive") {
      sourceGroup = "olive";
    } else if (sourceType === "Gmail_SMBC") {
      sourceGroup = "smbc";
    } else {
      result.push(tx);
      continue;
    }

    const accountName = resolveCanonicalAccountName_(tx.account_name);

    const transactionDate = normalizeDuplicateDate_(tx.transaction_date);

    const amount = Number(tx.amount || 0);

    const key = [sourceGroup, accountName, transactionDate, amount].join("|");

    const formalCount = Number(formalCounts.get(key) || 0);

    const alreadyMatchedCount = Number(matchedCounts.get(key) || 0);

    // ----------------------------------------------------------
    // CSV側にまだ対応できる正式取引が残っている
    // ----------------------------------------------------------

    if (alreadyMatchedCount < formalCount) {
      matchedCounts.set(key, alreadyMatchedCount + 1);

      continue;
    }

    // ----------------------------------------------------------
    // CSVに対応取引なし
    // → Gmail速報として追加候補
    // ----------------------------------------------------------

    result.push(tx);
  }

  return result;
}
/**
 * ============================================================
 * Gmail速報取込 ドライラン
 *
 * 実際にはTransactionsへ登録しない。
 *
 * ・Gmailで見つかった件数
 * ・Transactionへ変換できた件数
 * ・既存CSV等と照合してスキップされる件数
 * ・新規登録候補になる件数
 *
 * を確認する。
 * ============================================================
 */
function testGmailImportDryRun() {
  const result = getGmailTransactionCandidates_();

  const items = result && Array.isArray(result.items) ? result.items : [];

  const transactions = [];

  for (const item of items) {
    const tx = buildTransactionFromGmailItem_(item);

    if (tx) {
      transactions.push(tx);
    }
  }

  const importCandidates = filterGmailTransactionsForImport_(transactions);

  const candidateSourceIds = new Set(
    importCandidates.map((tx) => String(tx.source_id || "").trim()),
  );

  const skippedTransactions = transactions.filter(
    (tx) => !candidateSourceIds.has(String(tx.source_id || "").trim()),
  );

  const summary = {
    gmailFoundCount: items.length,

    convertedCount: transactions.length,

    skippedCount: skippedTransactions.length,

    importCandidateCount: importCandidates.length,

    importCandidates: importCandidates.map((tx) => ({
      date: tx.transaction_date,
      type: tx.type,
      sourceType: tx.source_type,
      accountName: tx.account_name,
      merchant: tx.merchant,
      amount: tx.amount,
      sourceId: tx.source_id,
    })),

    skippedTransactions: skippedTransactions.map((tx) => ({
      date: tx.transaction_date,
      type: tx.type,
      sourceType: tx.source_type,
      accountName: tx.account_name,
      merchant: tx.merchant,
      amount: tx.amount,
      sourceId: tx.source_id,
    })),
  };

  Logger.log(JSON.stringify(summary, null, 2));

  return summary;
}
/**
 * Gmail速報ドライランの件数だけ集計する。
 *
 * Transactionsへの書き込みは行わない。
 */
function testGmailImportDryRunSummary() {
  const result = getGmailTransactionCandidates_();

  const items = result && Array.isArray(result.items) ? result.items : [];

  const transactions = [];

  for (const item of items) {
    const tx = buildTransactionFromGmailItem_(item);

    if (tx) {
      transactions.push(tx);
    }
  }

  const candidates = filterGmailTransactionsForImport_(transactions);

  const summary = {};

  for (const tx of candidates) {
    const yearMonth = normalizeYearMonth(tx.transaction_date) || "unknown";

    const sourceType = String(tx.source_type || "unknown");

    const key = yearMonth + " / " + sourceType;

    summary[key] = Number(summary[key] || 0) + 1;
  }

  Logger.log(
    JSON.stringify(
      {
        gmailFoundCount: items.length,
        convertedCount: transactions.length,
        skippedCount: transactions.length - candidates.length,
        importCandidateCount: candidates.length,
        candidateBreakdown: summary,
      },
      null,
      2,
    ),
  );
}
