function createDiscordTransaction_(data) {
  try {
    const timestamp = new Date();
    const rules = getRules();

    const mode = String(
      data.mode || "cash"
    ).trim();

    const merchantInput = String(
      data.merchant ||
      data.content ||
      ""
    ).trim();

    const memo = String(
      data.memo || ""
    ).trim();

    const amount = Number(
      data.amount || 0
    );

    if (!merchantInput || !amount) {
      throw new Error(
        "merchant/content と amount は必須です"
      );
    }

    let driveUrl = "";

    const imageUrl = String(
      data.image || ""
    ).trim();

    try {
      if (imageUrl) {
        const response =
          UrlFetchApp.fetch(imageUrl);

        const blob =
          response.getBlob();

        const folder =
          DriveApp.getFolderById(
            FOLDERS.EVIDENCE_IMAGES
          );

        const safeName =
          merchantInput.replace(
            /[\\\/:*?"<>|]/g,
            "_"
          );

        const fileName =
          Utilities.formatDate(
            timestamp,
            "Asia/Tokyo",
            "yyyyMMdd_HHmmss"
          ) +
          "_" +
          safeName;

        const file = folder.createFile(
          blob.setName(fileName)
        );

        driveUrl = file.getUrl();
      }
    } catch (error) {
      console.error(error);
      driveUrl = "";
    }

    const sample = {
      transaction_date:
        Utilities.formatDate(
          timestamp,
          "Asia/Tokyo",
          "yyyy-MM-dd"
        ),

      merchant:
        normalizeMerchant(
          merchantInput
        ),

      item_name:
        merchantInput,

      amount,

      note:
        memo,

      source_type:
        "Discord",

      payment_method:
        mode === "cash"
          ? "現金"
          : "pending",

      account_name:
        "Discord Manual",

      evidence_url:
        driveUrl,

      original_image_url:
        imageUrl,

      import_batch:
        Utilities.formatDate(
          timestamp,
          "Asia/Tokyo",
          "yyyyMMdd_HHmmss"
        ),

      duplicate_key:
        "",
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

    } else if (
      data.category &&
      String(data.category).trim() !== ""
    ) {
      const category =
        String(data.category).trim();

      const purposeType =
        guessPurposeType(category);

      classified = {
        type: "支出",
        major_category:
          mapMajorCategory(category),
        sub_category:
          category,
        purpose_type:
          purposeType,
        expense_ratio:
          guessExpenseRatio(category),
        status:
          "確定",
        wallet:
          purposeType === "経費"
            ? "事業"
            : "生活",
        intent:
          guessIntent(category),
      };

    } else {
      classified =
        classifyTransaction(
          sample,
          rules
        );
    }

    const tx = {
      ...sample,
      ...classified,
    };

    const result =
      addTransactions([tx]);

    rebuildReviewQueue();
    rebuildReviewSummary();
    rebuildAllViews();

    return createJsonResponse_(
      {
        addedCount:
        result.addedCount,

        skippedCount:
          result.skippedCount,
        source: "discord",
        merchant: tx.merchant,
        amount: tx.amount,
      },
      "ok"
    );

  } catch (error) {
    return createJsonErrorResponse_(
      error && error.message
        ? error.message
        : String(error)
    );
  }
}

