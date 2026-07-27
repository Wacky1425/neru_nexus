function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const timestamp = new Date();
    const rules = getRules();

    const mode = String(data.mode || "cash").trim(); // cash / memo
    const merchantInput = String(data.merchant || data.content || "").trim();
    const memo = String(data.memo || "").trim();
    const amount = Number(data.amount || 0);

    if (!merchantInput || !amount) {
      throw new Error("merchant/content と amount は必須です");
    }

    let driveUrl = "";
    const imageUrl = data.image || "";

    try {
      if (imageUrl) {
        const response = UrlFetchApp.fetch(imageUrl);
        const blob = response.getBlob();

        const folder = DriveApp.getFolderById("1Kv0tY7pPD6vcumQH-xcyuZ1Mo_XtH39b");
        const safeName = merchantInput.replace(/[\\\/:*?"<>|]/g, "_");
        const fileName =
          Utilities.formatDate(timestamp, "Asia/Tokyo", "yyyyMMdd_HHmmss") +
          "_" +
          safeName;

        const file = folder.createFile(blob.setName(fileName));
        driveUrl = file.getUrl();
      }
    } catch (err) {
      driveUrl = "";
    }

    const sample = {
      transaction_date: Utilities.formatDate(timestamp, "Asia/Tokyo", "yyyy-MM-dd"),
      merchant: normalizeMerchant(merchantInput),
      item_name: merchantInput,
      amount: amount,
      note: memo,
      source_type: "Discord",
      payment_method: mode === "cash" ? "現金" : "pending",
      account_name: "Discord Manual",
      evidence_url: driveUrl,
      original_image_url: imageUrl,
      import_batch: Utilities.formatDate(timestamp, "Asia/Tokyo", "yyyyMMdd_HHmmss"),
      duplicate_key: "",
    };

    let classified;

    if (mode === "memo") {
      classified = {
        type: "メモ",
        major_category: "その他",
        sub_category: "要確認",
        purpose_type: "私用",
        expense_ratio: 0,
        status: "pending",
        wallet: "生活",
        intent: "その他",
      };
    } else if (data.category && String(data.category).trim() !== "") {
      classified = {
        type: "支出",
        major_category: mapMajorCategory(data.category),
        sub_category: data.category,
        purpose_type: guessPurposeType(data.category),
        expense_ratio: guessExpenseRatio(data.category),
        status: "確定",
        wallet: guessPurposeType(data.category) === "経費" ? "事業" : "生活",
        intent: guessIntent(data.category),
      };
    } else {
      classified = classifyTransaction(sample, rules);
    }

    const tx = {
      ...sample,
      ...classified,
    };

    const added = addTransaction(tx);

    rebuildReviewQueue();
    rebuildReviewSummary();
    rebuildAllViews();

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        added: added,
        mode: mode,
        merchant: tx.merchant,
        amount: tx.amount,
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        ok: false,
        error: error.message,
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}