
/**
 * V1.2-3 Gmail receipt / evidence intake.
 *
 * Safety principle:
 * - Gmail scanning creates candidates only.
 * - It never creates spending transactions.
 * - It never overwrites an existing evidence_url automatically.
 * - The user approves the proposed match in the app.
 */

const GMAIL_EVIDENCE_HEADERS_ = [
  "candidate_id",
  "message_id",
  "received_at",
  "transaction_date",
  "merchant",
  "amount",
  "subject",
  "from_address",
  "gmail_url",
  "attachment_count",
  "proposed_transaction_id",
  "proposed_transaction_label",
  "match_score",
  "status",
  "created_at",
  "updated_at",
];

function ensureGmailEvidenceSheet_() {
  let sheet = SS.getSheetByName(SHEETS.GMAIL_EVIDENCE_CANDIDATES);
  if (!sheet) {
    sheet = SS.insertSheet(SHEETS.GMAIL_EVIDENCE_CANDIDATES);
    sheet.getRange(1, 1, 1, GMAIL_EVIDENCE_HEADERS_.length)
      .setValues([GMAIL_EVIDENCE_HEADERS_]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  if (sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, GMAIL_EVIDENCE_HEADERS_.length)
      .setValues([GMAIL_EVIDENCE_HEADERS_]);
    return sheet;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map((value) => String(value || "").trim());
  const missing = GMAIL_EVIDENCE_HEADERS_.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    const start = headers.length + 1;
    sheet.getRange(1, start, 1, missing.length).setValues([missing]);
  }
  return sheet;
}

function getGmailEvidenceTable_() {
  ensureGmailEvidenceSheet_();
  return loadTable(SHEETS.GMAIL_EVIDENCE_CANDIDATES);
}

function extractReceiptAmount_(body) {
  const text = String(body || "").normalize("NFKC");
  const patterns = [
    /(?:合計|総額|請求額|お支払い金額|支払金額|注文合計|ご利用金額|total)[^0-9]{0,20}(?:¥|￥)?\s*([0-9][0-9,]*)\s*(?:円|JPY)?/i,
    /(?:¥|￥)\s*([0-9][0-9,]*)/,
    /([0-9][0-9,]*)\s*円/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const amount = Number(String(match[1]).replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

function extractReceiptDate_(body, fallbackDate) {
  const text = String(body || "").normalize("NFKC");
  const full = text.match(/(20\d{2})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?/);
  if (full) {
    return `${full[1]}-${String(Number(full[2])).padStart(2, "0")}-${String(Number(full[3])).padStart(2, "0")}`;
  }

  const fallback = fallbackDate instanceof Date ? fallbackDate : new Date(fallbackDate);
  if (!isNaN(fallback.getTime())) {
    return Utilities.formatDate(fallback, "Asia/Tokyo", "yyyy-MM-dd");
  }
  return "";
}

function extractReceiptMerchant_(subject, fromAddress) {
  const rawSubject = String(subject || "")
    .normalize("NFKC")
    .replace(/\[(?:領収書|Receipt|Invoice)\]/gi, " ")
    .replace(/(?:領収書|レシート|receipt|invoice|ご注文|ご購入|注文確認|購入確認)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const subjectMerchant = rawSubject
    .replace(/^(?:Re|Fwd)\s*:\s*/i, "")
    .split(/[｜|:：\-–—]/)[0]
    .trim();

  if (subjectMerchant && subjectMerchant.length >= 2 && subjectMerchant.length <= 60) {
    return normalizeMerchant(subjectMerchant);
  }

  const from = String(fromAddress || "").normalize("NFKC");
  const display = from.match(/^"?([^"<]+)"?\s*</);
  if (display && display[1].trim()) return normalizeMerchant(display[1].trim());

  const email = from.match(/@([A-Za-z0-9.-]+)/);
  return email ? normalizeMerchant(email[1].split(".")[0]) : "";
}

function isReceiptLikeMessage_(subject, body) {
  const text = `${subject || ""}\n${body || ""}`.normalize("NFKC").toLowerCase();
  return [
    "領収書", "レシート", "receipt", "invoice", "注文合計",
    "ご注文", "ご購入", "購入完了", "お支払い", "請求書",
  ].some((keyword) => text.includes(keyword));
}

function buildReceiptCandidateFromMessage_(message, thread) {
  const subject = message.getSubject();
  const body = normalizeGmailBody_(message.getPlainBody());
  if (!isReceiptLikeMessage_(subject, body)) return null;

  const amount = extractReceiptAmount_(body);
  if (!(amount > 0)) return null;

  const receivedAt = message.getDate();
  const transactionDate = extractReceiptDate_(body, receivedAt);
  const fromAddress = message.getFrom();
  const merchant = extractReceiptMerchant_(subject, fromAddress);
  const attachments = message.getAttachments({
    includeInlineImages: false,
    includeAttachments: true,
  });

  return {
    messageId: String(message.getId() || "").trim(),
    receivedAt: Utilities.formatDate(
      receivedAt,
      Session.getScriptTimeZone(),
      "yyyy/MM/dd HH:mm:ss",
    ),
    transactionDate,
    merchant,
    amount,
    subject: String(subject || "").trim(),
    fromAddress: String(fromAddress || "").trim(),
    gmailUrl: thread && typeof thread.getPermalink === "function"
      ? String(thread.getPermalink() || "")
      : "",
    attachmentCount: Array.isArray(attachments) ? attachments.length : 0,
  };
}

function scoreEvidenceTransactionMatch_(candidate, tx) {
  if (Number(candidate.amount || 0) !== Number(tx.amount || 0)) return -1;

  const candidateDate = normalizeDuplicateDate_(candidate.transactionDate);
  const txDate = normalizeDuplicateDate_(tx.transactionDate);
  if (!candidateDate || !txDate) return -1;

  const dayDiff = Math.abs(diffDateDays_(candidateDate, txDate));
  if (dayDiff > 3) return -1;

  const merchantA = normalizeMerchant(candidate.merchant || "");
  const merchantB = normalizeMerchant(tx.merchant || "");
  const merchantScore =
    merchantA && merchantB ? merchantSimilarityScore_(merchantA, merchantB) : 0;

  // Amount is exact by this point. Exact date is strong evidence; merchant raises it.
  let score = dayDiff === 0 ? 0.8 : dayDiff === 1 ? 0.65 : 0.5;
  score += Math.min(0.2, Math.max(0, merchantScore) * 0.2);
  return Math.min(1, score);
}

function findBestEvidenceTransactionMatch_(candidate) {
  const table = loadTransactions();
  if (!table.rows.length) return null;

  assertRequiredColumns(
    table.index,
    ["id", "transaction_date", "merchant", "item_name", "amount", "type", "evidence_url"],
    SHEETS.TRANSACTIONS,
  );

  const matches = [];
  for (const row of table.rows) {
    if (isIgnoredTransactionRow_(row, table.index)) continue;
    if (getString(row, table.index, "type") !== "支出") continue;

    const tx = {
      id: getString(row, table.index, "id"),
      transactionDate: row[table.index["transaction_date"]],
      merchant: getString(row, table.index, "merchant"),
      itemName: getString(row, table.index, "item_name"),
      amount: getNumber(row, table.index, "amount"),
      evidenceUrl: getString(row, table.index, "evidence_url"),
    };
    const score = scoreEvidenceTransactionMatch_(candidate, tx);
    if (score < 0) continue;
    matches.push({ ...tx, score });
  }

  matches.sort((a, b) => b.score - a.score);
  if (!matches.length) return null;

  const best = matches[0];
  const second = matches[1];
  // Avoid pretending a match is reliable when two transactions look equivalent.
  if (second && Math.abs(best.score - second.score) < 0.05) {
    return { ...best, ambiguous: true };
  }
  return { ...best, ambiguous: false };
}

function scanGmailEvidenceCandidates_(options = {}) {
  ensureGmailEvidenceSheet_();
  const days = Math.min(Math.max(Number(options.days || 90), 1), 365);
  const limit = Math.min(Math.max(Number(options.limit || 200), 1), 500);
  const query =
    `newer_than:${days}d {subject:領収書 subject:レシート subject:receipt ` +
    `subject:invoice subject:ご注文 subject:ご購入 subject:お支払い}`;

  const existing = getGmailEvidenceTable_();
  const existingMessageIds = new Set(
    existing.rows
      .map((row) => getString(row, existing.index, "message_id"))
      .filter(Boolean),
  );

  const threads = GmailApp.search(query, 0, limit);
  const candidates = [];
  let inspectedCount = 0;

  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      inspectedCount++;
      const messageId = String(message.getId() || "").trim();
      if (!messageId || existingMessageIds.has(messageId)) continue;

      const candidate = buildReceiptCandidateFromMessage_(message, thread);
      if (!candidate) continue;

      const match = findBestEvidenceTransactionMatch_(candidate);
      candidates.push({
        candidate_id: Utilities.getUuid(),
        message_id: candidate.messageId,
        received_at: candidate.receivedAt,
        transaction_date: candidate.transactionDate,
        merchant: candidate.merchant,
        amount: candidate.amount,
        subject: candidate.subject,
        from_address: candidate.fromAddress,
        gmail_url: candidate.gmailUrl,
        attachment_count: candidate.attachmentCount,
        proposed_transaction_id: match ? match.id : "",
        proposed_transaction_label: match
          ? `${match.transactionDate} ${match.itemName || match.merchant} ¥${match.amount}`
          : "",
        match_score: match && !match.ambiguous ? match.score : match ? Math.min(match.score, 0.74) : 0,
        status: match ? "matched" : "unmatched",
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  }

  if (candidates.length) {
    const sheet = getRequiredSheet(SHEETS.GMAIL_EVIDENCE_CANDIDATES);
    const table = getGmailEvidenceTable_();
    const rows = candidates.map((candidate) =>
      table.headers.map((header) =>
        candidate[String(header || "").trim()] !== undefined
          ? candidate[String(header || "").trim()]
          : "",
      ),
    );
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, table.headers.length)
      .setValues(rows);
    clearTableCache(SHEETS.GMAIL_EVIDENCE_CANDIDATES);
  }

  return {
    query,
    inspectedCount,
    addedCount: candidates.length,
    matchedCount: candidates.filter((item) => item.status === "matched").length,
    unmatchedCount: candidates.filter((item) => item.status === "unmatched").length,
  };
}

function getGmailEvidenceCandidatesData_(options = {}) {
  const table = getGmailEvidenceTable_();
  const includeDone = toBoolean_(options.includeDone, false);

  const items = table.rows
    .map((row) => ({
      candidateId: getString(row, table.index, "candidate_id"),
      messageId: getString(row, table.index, "message_id"),
      receivedAt: formatApiDateTime_(row[table.index["received_at"]]),
      transactionDate: formatApiDate_(row[table.index["transaction_date"]]),
      merchant: getString(row, table.index, "merchant"),
      amount: getNumber(row, table.index, "amount"),
      subject: getString(row, table.index, "subject"),
      fromAddress: getString(row, table.index, "from_address"),
      gmailUrl: getString(row, table.index, "gmail_url"),
      attachmentCount: getNumber(row, table.index, "attachment_count"),
      proposedTransactionId: getString(row, table.index, "proposed_transaction_id"),
      proposedTransactionLabel: getString(row, table.index, "proposed_transaction_label"),
      matchScore: getNumber(row, table.index, "match_score"),
      status: getString(row, table.index, "status"),
    }))
    .filter((item) => item.candidateId)
    .filter((item) => includeDone || !["attached", "ignored"].includes(item.status));

  items.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  return { items };
}

function findGmailEvidenceCandidate_(candidateId) {
  const table = getGmailEvidenceTable_();
  const target = String(candidateId || "").trim();
  for (let index = 0; index < table.rows.length; index++) {
    const row = table.rows[index];
    if (getString(row, table.index, "candidate_id") === target) {
      return { table, row, rowNumber: index + 2 };
    }
  }
  throw new Error("証憑候補が見つかりません");
}

function updateGmailEvidenceCandidateStatus_(found, status) {
  const index = found.table.index;
  if (index["status"] === undefined || index["updated_at"] === undefined) {
    throw new Error("証憑候補シートの列が不足しています");
  }
  const row = found.row.slice();
  row[index["status"]] = status;
  row[index["updated_at"]] = new Date();
  getRequiredSheet(SHEETS.GMAIL_EVIDENCE_CANDIDATES)
    .getRange(found.rowNumber, 1, 1, row.length)
    .setValues([row]);
  clearTableCache(SHEETS.GMAIL_EVIDENCE_CANDIDATES);
}

function attachGmailEvidenceCandidateFromApp_(data) {
  const found = findGmailEvidenceCandidate_(data.candidateId);
  const txId =
    String(data.transactionId || "").trim() ||
    getString(found.row, found.table.index, "proposed_transaction_id");
  if (!txId) throw new Error("紐付け候補の取引がありません");

  const gmailUrl = getString(found.row, found.table.index, "gmail_url");
  if (!gmailUrl) throw new Error("Gmail証憑URLを取得できません");

  const tx = findTransactionById_(txId);
  if (!tx) throw new Error("紐付け対象の取引が見つかりません");

  assertRequiredColumns(tx.index, ["evidence_url"], SHEETS.TRANSACTIONS);
  const currentEvidenceUrl = getString(tx.row, tx.index, "evidence_url");
  if (currentEvidenceUrl && currentEvidenceUrl !== gmailUrl) {
    throw new Error("この取引にはすでに別の証憑が登録されています");
  }

  tx.row[tx.index["evidence_url"]] = gmailUrl;
  tx.sheet.getRange(tx.rowNumber, 1, 1, tx.row.length).setValues([tx.row]);
  clearTableCache(SHEETS.TRANSACTIONS);
  clearHomeRecentTransactionsCache_();

  updateGmailEvidenceCandidateStatus_(found, "attached");
  return createJsonResponse_({ attached: true, transactionId: txId }, "ok");
}

function ignoreGmailEvidenceCandidateFromApp_(data) {
  const found = findGmailEvidenceCandidate_(data.candidateId);
  updateGmailEvidenceCandidateStatus_(found, "ignored");
  return createJsonResponse_({ ignored: true }, "ok");
}

function scanGmailEvidenceFromApp_(data) {
  return createJsonResponse_(
    scanGmailEvidenceCandidates_({
      days: data.days,
      limit: data.limit,
    }),
    "ok",
  );
}

function installDailyGmailEvidenceTrigger_() {
  const functionName = "runDailyGmailEvidenceScan_";
  const exists = ScriptApp.getProjectTriggers().some(
    (trigger) => trigger.getHandlerFunction() === functionName,
  );
  if (!exists) {
    ScriptApp.newTrigger(functionName)
      .timeBased()
      .everyDays(1)
      .atHour(6)
      .create();
  }
  return { installed: true };
}

function runDailyGmailEvidenceScan_() {
  return scanGmailEvidenceCandidates_({ days: 7, limit: 200 });
}

function testGmailEvidenceParsing_() {
  const body = [
    "領収書",
    "購入日: 2026/08/28",
    "注文合計: ￥1,980",
  ].join("\n");
  const amount = extractReceiptAmount_(body);
  const date = extractReceiptDate_(body, new Date("2026-08-29T00:00:00+09:00"));
  if (amount !== 1980) throw new Error(`証憑金額解析失敗: ${amount}`);
  if (date !== "2026-08-28") throw new Error(`証憑日付解析失敗: ${date}`);

  const exact = scoreEvidenceTransactionMatch_(
    { amount: 1980, transactionDate: "2026-08-28", merchant: "Amazon" },
    { amount: 1980, transactionDate: "2026-08-28", merchant: "Amazon" },
  );
  const wrongAmount = scoreEvidenceTransactionMatch_(
    { amount: 1980, transactionDate: "2026-08-28", merchant: "Amazon" },
    { amount: 2000, transactionDate: "2026-08-28", merchant: "Amazon" },
  );
  if (exact < 0.8) throw new Error(`証憑照合スコア失敗: ${exact}`);
  if (wrongAmount !== -1) throw new Error("異なる金額が照合候補になっています");

  return { assertions: "PASS", amount, date, exactScore: exact };
}
