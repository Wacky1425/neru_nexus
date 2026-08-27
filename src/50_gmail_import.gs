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

  results.push(
    ...testParseGmailMessages_(
      'from:statement@vpass.ne.jp subject:"ご利用のお知らせ【三井住友カード】" newer_than:2d',
      "olive_card",
      100,
    ),
  );

  results.push(
    ...testParseGmailMessages_(
      'from:SMBC_service@dn.smbc.co.jp subject:"振込入金のお知らせ" newer_than:2d',
      "smbc_deposit",
      100,
    ),
  );

  results.push(
    ...testParseGmailMessages_(
      'from:SMBC_service@dn.smbc.co.jp subject:"口座出金のお知らせ" newer_than:2d',
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
  const startedAt = Date.now();

  try {
    // ==========================================================
    // Gmail候補取得
    // ==========================================================

    const result = getGmailTransactionCandidates_();

    const items = result && Array.isArray(result.items) ? result.items : [];

    // ==========================================================
    // Olive / SMBC 件数
    // ==========================================================

    let oliveCount = 0;
    let smbcCount = 0;

    for (const item of items) {
      const sourceKind = String(item.sourceKind || "").trim();

      if (sourceKind === "olive_card") {
        oliveCount++;
      } else if (
        sourceKind === "smbc_deposit" ||
        sourceKind === "smbc_withdrawal"
      ) {
        smbcCount++;
      }
    }

    // ==========================================================
    // Gmailが0件
    // ==========================================================

    if (items.length === 0) {
      const response = {
        foundCount: 0,
        candidateCount: 0,
        addedCount: 0,
        skippedCount: 0,
      };

      saveGmailImportStatus_({
        status: "success",

        gmailFoundCount: 0,

        convertedCount: 0,

        importCandidateCount: 0,

        skippedCount: 0,

        addedCount: 0,

        oliveCount: 0,

        smbcCount: 0,

        durationMs: Date.now() - startedAt,

        errorMessage: "",
      });

      return response;
    }

    // ==========================================================
    // 分類ルールはここで1回だけ取得
    // ==========================================================

    const rules = getRules();

    const transactions = [];

    for (const item of items) {
      const tx = buildTransactionFromGmailItem_(item, rules);

      if (!tx) {
        continue;
      }

      transactions.push(tx);
    }

    // ==========================================================
    // 正式CSV存在済み・source_id既登録などを除外
    // ==========================================================

    const filteredTransactions =
      filterGmailTransactionsForImport_(transactions);

    // ==========================================================
    // 新規候補0件
    // ==========================================================

    if (filteredTransactions.length === 0) {
      const skippedCount = transactions.length;

      const response = {
        foundCount: items.length,

        candidateCount: transactions.length,

        addedCount: 0,

        skippedCount,
      };

      saveGmailImportStatus_({
        status: "success",

        gmailFoundCount: items.length,

        convertedCount: transactions.length,

        importCandidateCount: 0,

        skippedCount,

        addedCount: 0,

        oliveCount,

        smbcCount,

        durationMs: Date.now() - startedAt,

        errorMessage: "",
      });

      return response;
    }

    // ==========================================================
    // Transactionsへ追加
    // ==========================================================

    const addResult = addTransactions(filteredTransactions, {
      skipDuplicateCheck: false,
    });

    clearTableCache(SHEETS.TRANSACTIONS);

    clearAccountBalanceCache_();

    clearHomeRecentTransactionsCache_();

    // ==========================================================
    // Summary dirty
    // ==========================================================

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

    // ==========================================================
    // 結果
    // ==========================================================

    const skippedCount =
      transactions.length -
      filteredTransactions.length +
      addResult.skippedCount;

    const response = {
      foundCount: items.length,

      candidateCount: transactions.length,

      addedCount: addResult.addedCount,

      skippedCount,
    };

    // ==========================================================
    // 成功状態保存
    // ==========================================================

    saveGmailImportStatus_({
      status: "success",

      gmailFoundCount: items.length,

      convertedCount: transactions.length,

      importCandidateCount: filteredTransactions.length,

      skippedCount,

      addedCount: addResult.addedCount,

      oliveCount,

      smbcCount,

      durationMs: Date.now() - startedAt,

      errorMessage: "",
    });

    return response;
  } catch (error) {
    // ==========================================================
    // 失敗状態保存
    // ==========================================================

    const message =
      error && error.message
        ? String(error.message)
        : String(error || "Unknown error");

    saveGmailImportStatus_({
      status: "error",

      gmailFoundCount: 0,

      convertedCount: 0,

      importCandidateCount: 0,

      skippedCount: 0,

      addedCount: 0,

      oliveCount: 0,

      smbcCount: 0,

      durationMs: Date.now() - startedAt,

      errorMessage: message,
    });

    // Apps Scriptの実行履歴も「失敗」にしたいので再throw
    throw error;
  }
}

/**
 * Gmail解析結果1件をTransactions用データへ変換する。
 */
function buildTransactionFromGmailItem_(item, rules) {
  const sourceKind = String(item.sourceKind || "").trim();

  if (!Array.isArray(rules)) {
    throw new Error(
      "buildTransactionFromGmailItem_: rulesが指定されていません",
    );
  }

  // ============================================================
  // Oliveクレジット利用通知
  // ============================================================

  if (sourceKind === "olive_card") {
    const merchant = normalizeMerchant(String(item.merchant || "").trim());

    const txBase = {
      transaction_date: item.transactionDate || "",

      type: "支出",

      source_type: "Gmail_Olive",

      payment_method: "Oliveクレカ",

      account_name: "三井住友カードOlive",

      merchant,

      item_name: merchant,

      raw_text: [
        item.cardName || "",
        item.transactionType || "",
        item.merchant || "",
      ]
        .filter(Boolean)
        .join(" / "),

      amount: Number(item.amount || 0),

      note: "Gmail速報",

      evidence_url: "",

      original_image_url: "",

      import_batch:
        "gmail_" +
        Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd_HHmmss"),

      source_id: String(item.messageId || "").trim(),

      source_status: "preliminary",

      source_received_at: String(item.receivedAt || "").trim(),

      money_direction: "out",
    };

    const classified = classifyTransaction(txBase, rules);

    const tx = {
      ...txBase,
      ...classified,

      type: classified.type || "支出",

      major_category: classified.major_category || "その他",

      sub_category: classified.sub_category || "要確認",

      purpose_type: classified.purpose_type || "私用",

      expense_ratio: Number(classified.expense_ratio || 0),

      status: classified.status || "要確認",

      wallet: classified.wallet || "生活",

      intent: classified.intent || "その他",

      from_account: "",

      to_account: "",

      settlement_status: "",

      settlement_id: "",
    };

    applyTransferMetadata_(tx);

    return tx;
  }

  // ============================================================
  // SMBC 振込入金
  // ============================================================

  if (sourceKind === "smbc_deposit") {
    return buildSmbcGmailTransaction_(item, rules, "in");
  }

  // ============================================================
  // SMBC 口座出金
  // ============================================================

  if (sourceKind === "smbc_withdrawal") {
    return buildSmbcGmailTransaction_(item, rules, "out");
  }

  return null;
}

/**
 * SMBC Gmail速報をTransactionへ変換する。
 *
 * direction:
 *   in  = 三井住友銀行への入金
 *   out = 三井住友銀行からの出金
 */
function buildSmbcGmailTransaction_(item, rules, direction) {
  const merchant = normalizeMerchant(String(item.content || "").trim());

  const defaultType = direction === "in" ? "収入" : "支出";

  const txBase = {
    transaction_date: item.transactionDate || "",

    type: defaultType,

    source_type: "Gmail_SMBC",

    payment_method: "三井住友銀行",

    account_name: "三井住友銀行",

    merchant,

    item_name: merchant,

    raw_text: String(item.content || ""),

    amount: Number(item.amount || 0),

    note: "Gmail速報",

    evidence_url: "",

    original_image_url: "",

    import_batch:
      "gmail_" +
      Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd_HHmmss"),

    source_id: String(item.messageId || "").trim(),

    source_status: "preliminary",

    source_received_at: String(item.receivedAt || "").trim(),

    money_direction: direction,
  };

  // ============================================================
  // 銀行への特殊入金
  // ============================================================

  const bankDeposit =
    direction === "in" ? detectBankDepositType_(txBase) : null;

  // ------------------------------------------------------------
  // 給与
  // ------------------------------------------------------------

  if (bankDeposit && bankDeposit.kind === "salary") {
    return {
      ...txBase,

      type: "収入",

      major_category: "収入",

      sub_category: "給与",

      purpose_type: "私用",

      expense_ratio: 0,

      status: "確定",

      wallet: "生活",

      intent: "収入",

      from_account: "",

      to_account: "",

      settlement_status: "",

      settlement_id: "",
    };
  }

  // ------------------------------------------------------------
  // 自分の別口座 → 三井住友銀行
  // ------------------------------------------------------------

  if (bankDeposit && bankDeposit.kind === "transfer") {
    return {
      ...txBase,

      type: "移動",

      major_category: "移動",

      sub_category: "口座移動",

      purpose_type: "私用",

      expense_ratio: 0,

      // 移動元口座がまだ分からないので要確認
      status: "要確認",

      wallet: "生活",

      intent: "移動",

      from_account: "",

      to_account: resolveCanonicalAccountName_("三井住友銀行"),

      settlement_status: "review",

      settlement_id: "",
    };
  }

  // ============================================================
  // 銀行 → 電子マネーチャージ
  // ============================================================

  const electronicMoneyCharge =
    direction === "out" ? detectBankElectronicMoneyCharge_(txBase) : null;

  if (electronicMoneyCharge) {
    const destinationAccount = resolveCanonicalAccountName_(
      electronicMoneyCharge.accountName,
    );

    return {
      ...txBase,

      type: "移動",

      major_category: "移動",

      sub_category: "電子マネーチャージ",

      purpose_type: "私用",

      expense_ratio: 0,

      status: "確定",

      wallet: "生活",

      intent: "移動",

      from_account: resolveCanonicalAccountName_("三井住友銀行"),

      to_account: destinationAccount,

      settlement_status: destinationAccount ? "none" : "review",

      settlement_id: "",
    };
  }

  // ============================================================
  // 通常分類
  // ============================================================

  const classified = classifyTransaction(txBase, rules);

  const classifiedType = String(classified.type || "").trim();

  const majorCategory = String(classified.major_category || "").trim();

  const subCategory = String(classified.sub_category || "").trim();

  const intent = String(classified.intent || "").trim();

  const transferSubCategories = [
    "口座移動",
    "電子マネーチャージ",
    "クレカ引落",
    "証券口座移動",
    "現金引出",
    "個人間送金",
  ];

  const isTransfer =
    classifiedType === "移動" ||
    classifiedType === "振替" ||
    majorCategory === "移動" ||
    intent === "移動" ||
    transferSubCategories.includes(subCategory);

  let type = defaultType;

  if (isTransfer) {
    type = "移動";
  } else if (classified.status === "確定" && classifiedType) {
    type = classifiedType;
  }

  const tx = {
    ...txBase,
    ...classified,

    type,

    major_category: isTransfer
      ? "移動"
      : classified.major_category || (direction === "in" ? "収入" : "その他"),

    sub_category: classified.sub_category || "要確認",

    purpose_type: classified.purpose_type || "私用",

    expense_ratio: Number(classified.expense_ratio || 0),

    status: classified.status || "要確認",

    wallet: classified.wallet || "生活",

    intent: isTransfer ? "移動" : classified.intent || "その他",

    from_account: "",

    to_account: "",

    settlement_status: "",

    settlement_id: "",
  };

  applyTransferMetadata_(tx);

  return tx;
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

  // 分類ルールは1回だけ
  const rules = getRules();

  for (const item of items) {
    const tx = buildTransactionFromGmailItem_(item, rules);

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

      majorCategory: tx.major_category,

      subCategory: tx.sub_category,

      fromAccount: tx.from_account || "",

      toAccount: tx.to_account || "",

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

  // 分類ルールは1回だけ
  const rules = getRules();

  for (const item of items) {
    const tx = buildTransactionFromGmailItem_(item, rules);

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

  return {
    gmailFoundCount: items.length,

    convertedCount: transactions.length,

    skippedCount: transactions.length - candidates.length,

    importCandidateCount: candidates.length,

    candidateBreakdown: summary,
  };
}

function normalizeMerchantForReconcile_(value) {
  return String(value || "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[・･\/／\\\-‐-‒–—―_.]/g, "")
    .trim();
}

function merchantSimilarityScore_(a, b) {
  const x = normalizeMerchantForReconcile_(a);
  const y = normalizeMerchantForReconcile_(b);

  if (!x || !y) {
    return 0;
  }

  if (x === y) {
    return 100;
  }

  if (x.includes(y) || y.includes(x)) {
    return 80;
  }

  /*
   * Gmail側が Visa加盟店 のような
   * 情報不足表記の場合は、
   * merchant一致を要求しすぎない。
   */
  if (x === "VISA加盟店" || y === "VISA加盟店") {
    return 20;
  }

  return 0;
}

/**
 * ============================================================
 * 正式CSV取引 ↔ Gmail速報 照合
 *
 * dryRun=true:
 *   検出だけ。Transactionsは変更しない。
 *
 * dryRun=false:
 *   一致したGmail速報を削除し、
 *   CSV正式行へGmail由来情報を引き継ぐ。
 *
 * 対応:
 *   CSV_クレカ ↔ Gmail_Olive
 *   CSV_銀行   ↔ Gmail_SMBC
 * ============================================================
 */
function reconcileGmailPreliminaryWithFormalCsv_(
  formalTransactionIds,
  formalSourceType,
  dryRun = true,
) {
  if (
    !Array.isArray(formalTransactionIds) ||
    formalTransactionIds.length === 0
  ) {
    return {
      dryRun,
      formalCount: 0,
      gmailCount: 0,
      matchedCount: 0,
      ignoredCount: 0,
      preservedEditedCount: 0,
      matches: [],
    };
  }

  const sourceType = String(formalSourceType || "").trim();

  let gmailSourceType = "";

  if (sourceType === "CSV_クレカ") {
    gmailSourceType = "Gmail_Olive";
  } else if (sourceType === "CSV_銀行") {
    gmailSourceType = "Gmail_SMBC";
  } else {
    return {
      dryRun,
      formalCount: 0,
      gmailCount: 0,
      matchedCount: 0,
      ignoredCount: 0,
      preservedEditedCount: 0,
      matches: [],
    };
  }

  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return {
      dryRun,
      formalCount: 0,
      gmailCount: 0,
      matchedCount: 0,
      ignoredCount: 0,
      preservedEditedCount: 0,
      matches: [],
    };
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
      "item_name",
      "raw_text",
      "amount",
      "type",
      "major_category",
      "sub_category",
      "purpose_type",
      "expense_ratio",
      "expense_amount",
      "note",
      "status",
      "wallet",
      "intent",
      "from_account",
      "to_account",
      "settlement_status",
      "settlement_id",
      "source_id",
      "source_status",
      "source_received_at",
    ],
    SHEETS.TRANSACTIONS,
  );

  const formalIdSet = new Set(
    formalTransactionIds.map((id) => String(id || "").trim()).filter(Boolean),
  );

  const formalRows = [];
  const gmailRows = [];

  // ============================================================
  // 対象行抽出
  // ============================================================

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const id = String(row[index["id"]] || "").trim();

    const rowSourceType = String(row[index["source_type"]] || "").trim();

    // ----------------------------------------------------------
    // 今回追加された正式CSV
    // ----------------------------------------------------------

    if (rowSourceType === sourceType && formalIdSet.has(id)) {
      formalRows.push({
        sheetIndex: i,

        id,

        date: normalizeDuplicateDate_(row[index["transaction_date"]]),

        accountName: resolveCanonicalAccountName_(row[index["account_name"]]),

        merchant: String(row[index["merchant"]] || "").trim(),

        amount: Number(row[index["amount"]] || 0),
      });

      continue;
    }

    // ----------------------------------------------------------
    // Gmail速報
    // ----------------------------------------------------------

    if (rowSourceType !== gmailSourceType) {
      continue;
    }

    const sourceStatus = String(row[index["source_status"]] || "").trim();

    if (
      sourceStatus !== "preliminary" &&
      sourceStatus !== "preliminary_edited"
    ) {
      continue;
    }

    gmailRows.push({
      sheetIndex: i,

      id,

      sourceStatus,

      userEdited: sourceStatus === "preliminary_edited",

      sourceId: String(row[index["source_id"]] || "").trim(),

      sourceReceivedAt: row[index["source_received_at"]] || "",

      date: normalizeDuplicateDate_(row[index["transaction_date"]]),

      accountName: resolveCanonicalAccountName_(row[index["account_name"]]),

      merchant: String(row[index["merchant"]] || "").trim(),

      amount: Number(row[index["amount"]] || 0),
    });
  }

  // ============================================================
  // マッチング
  // ============================================================

  const usedGmailIndexes = new Set();

  const matches = [];

  for (const formal of formalRows) {
    const candidates = [];

    for (let i = 0; i < gmailRows.length; i++) {
      if (usedGmailIndexes.has(i)) {
        continue;
      }

      const gmail = gmailRows[i];

      if (formal.accountName !== gmail.accountName) {
        continue;
      }

      if (formal.amount !== gmail.amount) {
        continue;
      }

      const diffDays = diffDateDays_(formal.date, gmail.date);

      if (diffDays < 0 || diffDays > 7) {
        continue;
      }

      const merchantScore = merchantSimilarityScore_(
        formal.merchant,
        gmail.merchant,
      );

      let score = 0;

      let matchType = "";

      if (diffDays === 0) {
        if (merchantScore === 100) {
          score = 1000;

          matchType = "same_date_amount_merchant_exact";
        } else if (merchantScore >= 80) {
          score = 900;

          matchType = "same_date_amount_merchant_similar";
        } else {
          score = 700;

          matchType = "same_date_amount";
        }
      } else if (merchantScore === 100) {
        score = 600 - diffDays;

        matchType = "amount_merchant_exact_date_diff_" + diffDays;
      } else if (merchantScore >= 80) {
        score = 500 - diffDays;

        matchType = "amount_merchant_similar_date_diff_" + diffDays;
      } else {
        continue;
      }

      candidates.push({
        gmailIndex: i,

        score,

        matchType,

        diffDays,

        merchantScore,
      });
    }

    if (candidates.length === 0) {
      continue;
    }

    candidates.sort((a, b) => b.score - a.score);

    const best = candidates[0];

    const sameBestCount = candidates.filter(
      (candidate) => candidate.score === best.score,
    ).length;

    if (sameBestCount !== 1) {
      continue;
    }

    const gmail = gmailRows[best.gmailIndex];

    usedGmailIndexes.add(best.gmailIndex);

    matches.push({
      formalSheetIndex: formal.sheetIndex,

      gmailSheetIndex: gmail.sheetIndex,

      formalTransactionId: formal.id,

      gmailTransactionId: gmail.id,

      gmailSourceId: gmail.sourceId,

      gmailSourceReceivedAt: gmail.sourceReceivedAt,

      gmailSourceStatus: gmail.sourceStatus,

      userEdited: gmail.userEdited,

      formalDate: formal.date,

      gmailDate: gmail.date,

      amount: formal.amount,

      formalMerchant: formal.merchant,

      gmailMerchant: gmail.merchant,

      matchType: best.matchType,

      score: best.score,

      merchantScore: best.merchantScore,

      dateDiff: best.diffDays,
    });
  }

  const preservedEditedCount = matches.filter(
    (match) => match.userEdited,
  ).length;

  // ============================================================
  // dry-run
  // ============================================================

  if (dryRun) {
    return {
      dryRun: true,

      formalSourceType: sourceType,

      gmailSourceType,

      formalCount: formalRows.length,

      gmailCount: gmailRows.length,

      matchedCount: matches.length,

      ignoredCount: 0,

      preservedEditedCount,

      matches,
    };
  }

  // ============================================================
  // 本番確定
  //
  // Gmail速報行は削除せず ignored にする。
  // ============================================================

  let ignoredCount = 0;

  for (const match of matches) {
    const formalRow = values[match.formalSheetIndex];

    const gmailRow = values[match.gmailSheetIndex];

    // ==========================================================
    // ユーザー編集済みなら分類情報を正式CSVへ引き継ぐ
    // ==========================================================

    if (match.userEdited) {
      preserveEditedGmailFields_(formalRow, gmailRow, index);
    }

    // ==========================================================
    // Gmail由来情報を正式CSVへ引き継ぐ
    // ==========================================================

    formalRow[index["source_id"]] = match.gmailSourceId;

    formalRow[index["source_status"]] = "confirmed";

    formalRow[index["source_received_at"]] = match.gmailSourceReceivedAt;

    // ==========================================================
    // 元Gmail速報は履歴として残しつつ論理除外
    // ==========================================================

    gmailRow[index["source_status"]] = "ignored";

    /*
     * 速報側に照合情報を残しておくと、
     * 後からTransactionsを直接確認したときも
     * 何に吸収されたか追いやすい。
     */
    gmailRow[index["settlement_status"]] = "matched";

    gmailRow[index["settlement_id"]] = match.formalTransactionId;

    ignoredCount++;
  }

  // ============================================================
  // 一括書き戻し
  //
  // 行削除しないので、1回のsetValuesだけで完了。
  // ============================================================

  if (matches.length > 0) {
    sheet
      .getRange(2, 1, values.length - 1, values[0].length)
      .setValues(values.slice(1));

    clearTableCache(SHEETS.TRANSACTIONS);

    clearAccountBalanceCache_();

    clearHomeRecentTransactionsCache_();

    const dirtyMonths = new Set();

    for (const match of matches) {
      const formalYearMonth = normalizeYearMonth(match.formalDate);

      if (formalYearMonth) {
        dirtyMonths.add(formalYearMonth);
      }

      const gmailYearMonth = normalizeYearMonth(match.gmailDate);

      if (gmailYearMonth) {
        dirtyMonths.add(gmailYearMonth);
      }
    }

    for (const yearMonth of dirtyMonths) {
      markSummaryDirty_(yearMonth);
    }
  }

  return {
    dryRun: false,

    formalSourceType: sourceType,

    gmailSourceType,

    formalCount: formalRows.length,

    gmailCount: gmailRows.length,

    matchedCount: matches.length,

    ignoredCount,

    preservedEditedCount,

    matches,
  };
}

/**
 * Gmail速報取込の定期トリガーを作成する。
 *
 * 既存の同名トリガーがあれば一度削除してから作り直す。
 *
 * 実行間隔:
 *   5分
 */
function installGmailImportTrigger() {
  const functionName = "importGmailTransactions";

  // ============================================================
  // 既存トリガー削除
  // ============================================================

  const triggers = ScriptApp.getProjectTriggers();

  let deletedCount = 0;

  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);

      deletedCount++;
    }
  }

  // ============================================================
  // 新規作成
  // ============================================================

  const trigger = ScriptApp.newTrigger(functionName)
    .timeBased()
    .everyMinutes(5)
    .create();

  const result = {
    status: "installed",

    functionName,

    intervalMinutes: 5,

    deletedOldTriggerCount: deletedCount,

    triggerId: trigger.getUniqueId(),
  };

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}

/**
 * Gmail速報取込の定期トリガーを削除する。
 */
function removeGmailImportTrigger() {
  const functionName = "importGmailTransactions";

  const triggers = ScriptApp.getProjectTriggers();

  let deletedCount = 0;

  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);

      deletedCount++;
    }
  }

  const result = {
    status: "removed",

    functionName,

    deletedCount,
  };

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}

function preserveEditedGmailFields_(formalRow, gmailRow, index) {
  const preservedColumns = [
    "type",
    "major_category",
    "sub_category",
    "purpose_type",
    "expense_ratio",
    "expense_amount",
    "note",
    "status",
    "wallet",
    "intent",
    "from_account",
    "to_account",
    "settlement_status",
    "settlement_id",
  ];

  for (const column of preservedColumns) {
    formalRow[index[column]] = gmailRow[index[column]];
  }
}

function confirmPreliminaryTransactionFromApp_(data) {
  const id = String(data.id || "").trim();

  if (!id) {
    throw new Error("idは必須です");
  }

  const found = findTransactionById_(id);

  if (!found) {
    throw new Error("対象の取引が見つかりません");
  }

  assertRequiredColumns(
    found.index,
    ["id", "transaction_date", "source_type", "source_status"],
    SHEETS.TRANSACTIONS,
  );

  const row = found.row;
  const index = found.index;

  const sourceType = getString(row, index, "source_type");

  const sourceStatus = getString(row, index, "source_status");

  if (sourceType !== "Gmail_Olive" && sourceType !== "Gmail_SMBC") {
    throw new Error("Gmail速報以外の取引は手動確定できません");
  }

  if (sourceStatus !== "preliminary" && sourceStatus !== "preliminary_edited") {
    throw new Error("この取引は速報状態ではありません");
  }

  row[index["source_status"]] = "manual_confirmed";

  found.sheet.getRange(found.rowNumber, 1, 1, row.length).setValues([row]);

  clearTableCache(SHEETS.TRANSACTIONS);

  clearAccountBalanceCache_();

  clearHomeRecentTransactionsCache_();

  const yearMonth = normalizeYearMonth(row[index["transaction_date"]]);

  if (yearMonth) {
    markSummaryDirty_(yearMonth);
  }

  return createJsonResponse_(
    {
      confirmed: true,
      id,
      sourceStatus: "manual_confirmed",
    },
    "ok",
  );
}

function restoreIgnoredTransactionFromApp_(data) {
  const id = String(data.id || "").trim();

  if (!id) {
    throw new Error("idは必須です");
  }

  const found = findTransactionById_(id);

  if (!found) {
    throw new Error("対象の取引が見つかりません");
  }

  assertRequiredColumns(
    found.index,
    [
      "id",
      "transaction_date",
      "source_type",
      "source_status",
      "settlement_status",
      "settlement_id",
    ],
    SHEETS.TRANSACTIONS,
  );

  const row = found.row;
  const index = found.index;

  const sourceType = getString(row, index, "source_type");

  const sourceStatus = getString(row, index, "source_status");

  if (sourceType !== "Gmail_Olive" && sourceType !== "Gmail_SMBC") {
    throw new Error("Gmail速報以外の取引は復元できません");
  }

  if (sourceStatus !== "ignored") {
    throw new Error("この取引は除外済みではありません");
  }

  row[index["source_status"]] = "preliminary";

  // CSV突合によるignoredではなく、
  // ユーザー操作による除外を戻す想定なので
  // 照合情報もクリアする。
  row[index["settlement_status"]] = "";
  row[index["settlement_id"]] = "";

  found.sheet.getRange(found.rowNumber, 1, 1, row.length).setValues([row]);

  clearTableCache(SHEETS.TRANSACTIONS);

  clearAccountBalanceCache_();

  clearHomeRecentTransactionsCache_();

  const yearMonth = normalizeYearMonth(row[index["transaction_date"]]);

  if (yearMonth) {
    rebuildSummariesForMonth_(yearMonth);

    markSummaryDirty_(yearMonth);
  }

  return createJsonResponse_(
    {
      restored: true,
      id,
      sourceStatus: "preliminary",
    },
    "ok",
  );
}

function getIgnoredTransactionsData(options) {
  const settings = options || {};

  const requestedLimit = Number(settings.limit || 100);
  const requestedOffset = Number(settings.offset || 0);

  const limit = Math.min(Math.max(requestedLimit, 1), 200);
  const offset = Math.max(requestedOffset, 0);

  const table = loadTransactions();

  if (table.rows.length === 0) {
    return {
      items: [],
      total: 0,
      limit,
      offset,
      hasMore: false,
    };
  }

  assertRequiredColumns(
    table.index,
    [
      "id",
      "transaction_date",
      "recorded_at",
      "merchant",
      "item_name",
      "amount",
      "type",
      "major_category",
      "sub_category",
      "status",
      "wallet",
      "intent",
      "payment_method",
      "account_name",
      "raw_text",
      "note",
      "from_account",
      "to_account",
      "settlement_status",
      "settlement_id",
      "import_batch",
      "source_id",
      "source_status",
      "source_received_at",
    ],
    SHEETS.TRANSACTIONS,
  );

  const filteredRows = table.rows.filter((row) => {
    const sourceStatus = getString(row, table.index, "source_status");

    return sourceStatus === "ignored";
  });

  filteredRows.sort((a, b) => {
    const dateA = new Date(a[table.index["transaction_date"]]);

    const dateB = new Date(b[table.index["transaction_date"]]);

    const dateDifference = dateB.getTime() - dateA.getTime();

    if (dateDifference !== 0) {
      return dateDifference;
    }

    const recordedAtA = new Date(a[table.index["recorded_at"]]);

    const recordedAtB = new Date(b[table.index["recorded_at"]]);

    return recordedAtB.getTime() - recordedAtA.getTime();
  });

  const total = filteredRows.length;

  const items = filteredRows.slice(offset, offset + limit).map((row) => ({
    id: getString(row, table.index, "id"),

    transactionDate: formatApiDate_(row[table.index["transaction_date"]]),

    merchant: getString(row, table.index, "merchant"),

    itemName: getString(row, table.index, "item_name"),

    amount: getNumber(row, table.index, "amount"),

    type: getString(row, table.index, "type"),

    majorCategory: getString(row, table.index, "major_category"),

    subCategory: getString(row, table.index, "sub_category"),

    status: getString(row, table.index, "status"),

    wallet: getString(row, table.index, "wallet"),

    intent: getString(row, table.index, "intent"),

    paymentMethod: getString(row, table.index, "payment_method"),

    accountName: getString(row, table.index, "account_name"),

    rawText: getString(row, table.index, "raw_text"),

    note: getString(row, table.index, "note"),

    fromAccount: getString(row, table.index, "from_account"),

    toAccount: getString(row, table.index, "to_account"),

    settlementStatus: getString(row, table.index, "settlement_status"),

    settlementId: getString(row, table.index, "settlement_id"),

    importBatch: getString(row, table.index, "import_batch"),

    sourceId: getString(row, table.index, "source_id"),

    sourceStatus: getString(row, table.index, "source_status"),

    sourceReceivedAt: formatApiDateTime_(
      row[table.index["source_received_at"]],
    ),
  }));

  return {
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}

const GMAIL_IMPORT_STATUS_PROPERTY_KEY = "NERU_NEXUS_GMAIL_IMPORT_STATUS";

function saveGmailImportStatus_(status) {
  const properties = PropertiesService.getScriptProperties();

  const now = new Date();

  const payload = {
    ...status,

    updatedAt: Utilities.formatDate(now, "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss"),
  };

  properties.setProperty(
    GMAIL_IMPORT_STATUS_PROPERTY_KEY,
    JSON.stringify(payload),
  );

  return payload;
}

function getGmailImportStatus_() {
  const properties = PropertiesService.getScriptProperties();

  const value = properties.getProperty(GMAIL_IMPORT_STATUS_PROPERTY_KEY);

  if (!value) {
    return {
      hasStatus: false,
      status: "not_run",
      updatedAt: "",
      gmailFoundCount: 0,
      convertedCount: 0,
      skippedCount: 0,
      importCandidateCount: 0,
      oliveCount: 0,
      smbcCount: 0,
      addedCount: 0,
      errorMessage: "",
    };
  }

  try {
    const parsed = JSON.parse(value);

    return {
      hasStatus: true,
      status: String(parsed.status || ""),
      updatedAt: String(parsed.updatedAt || ""),
      gmailFoundCount: Number(parsed.gmailFoundCount || 0),
      convertedCount: Number(parsed.convertedCount || 0),
      skippedCount: Number(parsed.skippedCount || 0),
      importCandidateCount: Number(parsed.importCandidateCount || 0),
      oliveCount: Number(parsed.oliveCount || 0),
      smbcCount: Number(parsed.smbcCount || 0),
      addedCount: Number(parsed.addedCount || 0),
      errorMessage: String(parsed.errorMessage || ""),
    };
  } catch (error) {
    return {
      hasStatus: false,
      status: "invalid",
      updatedAt: "",
      gmailFoundCount: 0,
      convertedCount: 0,
      skippedCount: 0,
      importCandidateCount: 0,
      oliveCount: 0,
      smbcCount: 0,
      addedCount: 0,
      errorMessage: "保存済みステータスを読み込めませんでした",
    };
  }
}
