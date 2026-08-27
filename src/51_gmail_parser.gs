

// ============================================================
// Gmail Parsers
// ============================================================

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

function normalizeGmailBody_(body) {
  return String(body || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u3000/g, " ");
}

function parseGmailAmount_(value) {
  return Number(
    String(value || "")
      .replace(/,/g, "")
      .trim(),
  );
}

