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

/**
 * メール種別ごとに解析する。
 */

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

/**
 * ============================================================
 * SMBC 振込入金
 * ============================================================
 */

/**
 * ============================================================
 * SMBC 口座出金
 * ============================================================
 */

/**
 * Gmail本文を解析しやすい形に整える。
 */

/**
 * "61,131" → 61131
 */

/**
 * 三井住友カード系メールの
 * 実際の送信元・件名を確認するためのテスト。
 */

/**
 * Olive利用通知メールの本文形式を確認する。
 *
 * Transactionsへの書き込みは行わない。
 */

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

  const classified = classifyTransaction(txBase, rules, defaultType);

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
/**
 * Gmail速報ドライランの件数だけ集計する。
 *
 * Transactionsへの書き込みは行わない。
 */


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


const GMAIL_IMPORT_STATUS_PROPERTY_KEY = "NERU_NEXUS_GMAIL_IMPORT_STATUS";


