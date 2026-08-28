

// ============================================================
// Gmail / Formal CSV Reconciliation
// ============================================================

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

function preserveEditedGmailFields_(formalRow, gmailRow, index) {
  const preservedColumns = [
    "item_name",
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

