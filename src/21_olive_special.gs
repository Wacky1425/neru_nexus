

// ============================================================
// Olive-specific Processing
// ============================================================

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

function diffDateDays_(date1, date2) {
  if (!date1 || !date2) {
    return -1;
  }

  const d1 = new Date(`${date1}T00:00:00+09:00`);

  const d2 = new Date(`${date2}T00:00:00+09:00`);

  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
    return -1;
  }

  return Math.abs(Math.round((d2.getTime() - d1.getTime()) / 86400000));
}

