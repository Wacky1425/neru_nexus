// ============================================================
// Neru Nexus - PayPay既存取引 再分類メンテナンス
//
// 目的:
//   過去にCSV_PayPayとして取り込んだ取引を、現在のPayPay分類仕様で
//   一括再分類する。
//
// 対象:
//   source_type === "CSV_PayPay"
//
// 主な修正:
//   ・通常の「支払い」       → 支出
//   ・ポイント併用支払い     → 支出（商品総額）
//   ・チャージ               → 銀行 → PayPay の移動
//   ・送った金額             → 確定ルール優先、未確定なら支出
//   ・受け取った金額         → 確定ルール優先、未確定なら収入
//
// 注意:
//   ポイント獲得・ポイント運用・期限切れ等の行は、
//   既に削除済み/今後のCSV取込で除外される前提。
// ============================================================

function reclassifyExistingPayPayTransactions() {
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    Logger.log("PayPay再分類: 取引データなし");
    return;
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    [
      "transaction_date",
      "source_type",
      "merchant",
      "item_name",
      "amount",
      "note",
      "raw_text",
      "type",
      "major_category",
      "sub_category",
      "purpose_type",
      "expense_ratio",
      "status",
      "wallet",
      "intent",
      "account_name",
      "from_account",
      "to_account",
      "settlement_status",
      "settlement_id",
    ],
    SHEETS.TRANSACTIONS,
  );

  const rules = getRules();

  let changedCount = 0;
  let paymentCount = 0;
  let chargeCount = 0;
  let sentCount = 0;
  let receivedCount = 0;
  let otherCount = 0;

  const changedMonths = new Set();

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const sourceType = String(row[index["source_type"]] || "").trim();

    if (sourceType !== "CSV_PayPay") {
      continue;
    }

    const merchant = String(row[index["merchant"]] || "").trim();
    const itemName = String(row[index["item_name"]] || "").trim();
    const note = String(row[index["note"]] || "").trim();
    const rawText = String(row[index["raw_text"]] || "").trim();
    const amount = Number(row[index["amount"]] || 0);
    const accountName = String(row[index["account_name"]] || "").trim();

    const normalizedItem = itemName.normalize("NFKC").trim();

    /*
     * 既存T_Transactionsには元CSVの「取引内容」列そのものはないため、
     * item_nameの先頭から取引種別を復元する。
     */
    const isPayment = normalizedItem.startsWith("支払い");
    const isCharge = normalizedItem.startsWith("チャージ");
    const isSent = normalizedItem.startsWith("送った金額");
    const isReceived = normalizedItem.startsWith("受け取った金額");

    const txBaseForRule = {
      merchant,
      item_name: itemName,
      // ポイント併用支払いの誤分類を避けるため、
      // PayPay分類では取引方法(note)をルール判定から外す
      note: "",
    };

    const classified = classifyTransaction(txBaseForRule, rules);
    const isRuleConfirmed = String(classified.status || "").trim() === "確定";

    let next = {
      ...classified,
    };

    if (isPayment) {
      next.type = "支出";
      paymentCount++;
    } else if (isCharge) {
      next = {
        ...classified,
        type: "移動",
        major_category: "移動",
        sub_category: "電子マネーチャージ",
        purpose_type: "私用",
        expense_ratio: 0,
        status: "確定",
        wallet: "生活",
        intent: "移動",
      };
      chargeCount++;
    } else if (isReceived) {
      if (!isRuleConfirmed) {
        next.type = "収入";
      }
      receivedCount++;
    } else if (isSent) {
      if (!isRuleConfirmed) {
        next.type = "支出";
      }
      sentCount++;
    } else {
      /*
       * 想定外のPayPay行。
       * 既存分類を大きく壊さないよう、確定ルールがあれば採用し、
       * なければ現在のtypeを維持する。
       */
      if (!isRuleConfirmed) {
        next.type = String(row[index["type"]] || "").trim() || "支出";
      }

      otherCount++;

      Logger.log(
        [
          "【PayPayその他】",
          `日付=${row[index["transaction_date"]]}`,
          `内容=${itemName}`,
          `取引先=${merchant}`,
          `金額=${amount}`,
          `取引方法=${note}`,
          `raw=${rawText}`,
        ].join(" / "),
      );
    }

    row[index["type"]] = next.type || "";
    row[index["major_category"]] = next.major_category || "";
    row[index["sub_category"]] = next.sub_category || "";
    row[index["purpose_type"]] = next.purpose_type || "私用";
    row[index["expense_ratio"]] = Number(next.expense_ratio || 0);
    row[index["status"]] = next.status || "要確認";
    row[index["wallet"]] = next.wallet || "生活";
    row[index["intent"]] = next.intent || "その他";

    // transfer metadataを再構築
    const txForTransfer = {
      source_type: sourceType,
      account_name: accountName,
      merchant,
      item_name: itemName,
      note,
      raw_text: rawText,
      type: row[index["type"]],
      sub_category: row[index["sub_category"]],
      from_account: "",
      to_account: "",
      settlement_status: "",
      settlement_id: "",
    };

    applyTransferMetadata_(txForTransfer);

    row[index["from_account"]] = txForTransfer.from_account || "";
    row[index["to_account"]] = txForTransfer.to_account || "";
    row[index["settlement_status"]] = txForTransfer.settlement_status || "";
    row[index["settlement_id"]] = txForTransfer.settlement_id || "";

    const yearMonth = normalizeYearMonth(row[index["transaction_date"]]);

    if (yearMonth) {
      changedMonths.add(yearMonth);
    }

    changedCount++;
  }

  if (changedCount === 0) {
    Logger.log("PayPay再分類: 対象なし");
    return;
  }

  sheet
    .getRange(2, 1, values.length - 1, values[0].length)
    .setValues(values.slice(1));

  for (const yearMonth of changedMonths) {
    markSummaryDirty_(yearMonth);
  }

  clearTableCache(SHEETS.TRANSACTIONS);
  clearAccountBalanceCache_();
  clearHomeRecentTransactionsCache_();

  // Review / Summary / Viewも最新状態にする
  rebuildReviewQueue();
  rebuildReviewSummary();
  rebuildAllViews();

  Logger.log(
    [
      `PayPay再分類完了: ${changedCount}件`,
      `支払い=${paymentCount}`,
      `チャージ=${chargeCount}`,
      `送金=${sentCount}`,
      `受取=${receivedCount}`,
      `その他=${otherCount}`,
    ].join(" / "),
  );
}
