/**
 * R6.1 Gmail速報「明細待ち」整理。
 *
 * VISA加盟店のように速報時点では加盟店名を特定できない取引は、
 * ユーザーに分類を要求せず正式CSVとの自動照合を待つ。
 * source_status は preliminary のまま維持し、既存のCSV照合ロジックを利用する。
 */
function normalizePreliminaryMerchant_(value) {
  return String(value || "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[・･]/g, "")
    .trim();
}

function isGenericPreliminaryMerchant_(value) {
  const merchant = normalizePreliminaryMerchant_(value);
  return merchant === "VISA加盟店" || merchant === "ＶＩＳＡ加盟店";
}

function isAwaitingFormalDetailRow_(row, index) {
  const sourceType = getString(row, index, "source_type");
  const sourceStatus = getString(row, index, "source_status").toLowerCase();
  const merchant = getString(row, index, "merchant");

  // Gmail速報は加盟店名が具体的でも、正式CSV到着前は「ユーザー要確認」ではなく
  // 明細待ちとして扱う。preliminary_edited も正式明細との照合対象のまま維持する。
  return sourceType === "Gmail_Olive" &&
    (sourceStatus === "preliminary" || sourceStatus === "preliminary_edited");
}

/**
 * 過去分を確認する公開マイグレーション。
 * データ自体は書き換えない。既存速報を「明細待ち」として扱える件数を返す。
 * source_status を変えないことで正式CSV自動照合との互換性を維持する。
 */
function migrateR61PreliminaryDetailWaiting() {
  return verifyR61PreliminaryDetailWaiting();
}

/** 公開検証関数。 */
function verifyR61PreliminaryDetailWaiting() {
  const table = loadTransactions();
  let waitingCount = 0;
  let reviewLeakCount = 0;

  for (const row of table.rows) {
    if (!isAwaitingFormalDetailRow_(row, table.index)) continue;
    waitingCount++;

    // getReviewTransactions/getReviewTransactionCount 側で除外されるべき行。
    const status = getString(row, table.index, "status");
    const settlementStatus = getString(row, table.index, "settlement_status");
    if (status !== "要確認" && settlementStatus !== "review") continue;
    // ここでの「leak」はデータ状態ではなく、分類対象候補だった件数の参考値。
    reviewLeakCount++;
  }

  const result = {
    ready: true,
    waitingCount,
    formerlyReviewCandidateCount: reviewLeakCount,
    message: `${waitingCount}件をユーザー要確認ではなく正式明細待ちとして扱います。`,
  };

  console.log("=== R6.1 速報明細待ちチェック ===");
  console.log(`明細待ち対象: ${waitingCount}件`);
  console.log(`従来の要確認候補: ${reviewLeakCount}件`);
  console.log(`ready: ${result.ready}`);
  console.log(result.message);
  console.log(JSON.stringify(result, null, 2));

  return result;
}

/**
 * R6.1 診断: 要確認に残っている「VISA加盟店」系取引を広めに洗い出す。
 * 読み取り専用。データは変更しない。
 */
function diagnoseR61VisaMerchantReviewRows() {
  const table = loadTransactions();
  const groups = {};
  const samples = [];
  let visaLikeCount = 0;
  let reviewVisaLikeCount = 0;
  let currentWaitingRuleCount = 0;
  let rawTextOnlyCount = 0;

  const hasVisaMerchantText = (value) => {
    const normalized = normalizePreliminaryMerchant_(value);
    return normalized.indexOf("VISA加盟店") >= 0 || normalized.indexOf("VISA") >= 0 && normalized.indexOf("加盟店") >= 0;
  };

  for (const row of table.rows) {
    const merchant = getString(row, table.index, "merchant");
    const rawText = getString(row, table.index, "raw_text");
    const itemName = getString(row, table.index, "item_name");
    const note = getString(row, table.index, "note");
    const merchantHit = hasVisaMerchantText(merchant);
    const otherHit = !merchantHit && [rawText, itemName, note].some(hasVisaMerchantText);
    if (!merchantHit && !otherHit) continue;

    visaLikeCount++;
    if (otherHit) rawTextOnlyCount++;

    const status = getString(row, table.index, "status");
    const settlementStatus = getString(row, table.index, "settlement_status");
    const isReview = status === "要確認" || settlementStatus === "review";
    if (isReview) reviewVisaLikeCount++;
    if (isAwaitingFormalDetailRow_(row, table.index)) currentWaitingRuleCount++;

    const sourceType = getString(row, table.index, "source_type") || "(blank)";
    const sourceStatus = getString(row, table.index, "source_status") || "(blank)";
    const accountName = getString(row, table.index, "account_name") || "(blank)";
    const key = [sourceType, sourceStatus, status || "(blank)", settlementStatus || "(blank)"].join(" | ");
    groups[key] = (groups[key] || 0) + 1;

    if (samples.length < 30) {
      samples.push({
        id: getString(row, table.index, "id"),
        date: formatApiDate_(row[table.index["transaction_date"]]),
        merchant,
        accountName,
        sourceType,
        sourceStatus,
        status,
        settlementStatus,
        detectedIn: merchantHit ? "merchant" : "raw/item/note",
        currentWaitingRule: isAwaitingFormalDetailRow_(row, table.index),
      });
    }
  }

  console.log("=== R6.1 VISA加盟店 要確認漏れ診断 ===");
  console.log(`VISA加盟店系 全件: ${visaLikeCount}件`);
  console.log(`うち要確認状態: ${reviewVisaLikeCount}件`);
  console.log(`現行R6.1明細待ち判定に一致: ${currentWaitingRuleCount}件`);
  console.log(`merchant以外(raw_text/item_name/note)のみで検出: ${rawTextOnlyCount}件`);
  console.log("--- source/status 内訳 ---");
  Object.keys(groups).sort().forEach((key) => console.log(`${key}: ${groups[key]}件`));
  console.log("--- サンプル（最大30件） ---");
  console.log(JSON.stringify(samples, null, 2));

  return {
    ready: true,
    visaLikeCount,
    reviewVisaLikeCount,
    currentWaitingRuleCount,
    rawTextOnlyCount,
    groups,
    samples,
  };
}

/**
 * R6.1 診断: CSV突合済みの汎用加盟店速報と、その吸収先の正式取引をペア表示する。
 * 読み取り専用。ignored + matched の速報では settlement_id に正式取引IDが保存される。
 */
function diagnoseR61MatchedVisaFormalPairs() {
  const table = loadTransactions();
  const byId = {};
  for (const row of table.rows) {
    const id = getString(row, table.index, "id");
    if (id) byId[id] = row;
  }

  const pairs = [];
  let matchedVisaCount = 0;
  let resolvedPairCount = 0;
  let missingFormalCount = 0;

  for (const row of table.rows) {
    const sourceType = getString(row, table.index, "source_type");
    const sourceStatus = getString(row, table.index, "source_status").toLowerCase();
    const settlementStatus = getString(row, table.index, "settlement_status").toLowerCase();
    const merchant = getString(row, table.index, "merchant");
    if (sourceType !== "Gmail_Olive" || sourceStatus !== "ignored" || settlementStatus !== "matched" || !isGenericPreliminaryMerchant_(merchant)) continue;

    matchedVisaCount++;
    const formalId = getString(row, table.index, "settlement_id");
    const formalRow = formalId ? byId[formalId] : null;
    if (formalRow) resolvedPairCount++; else missingFormalCount++;

    pairs.push({
      preliminary: {
        id: getString(row, table.index, "id"),
        date: formatApiDate_(row[table.index["transaction_date"]]),
        merchant,
        amount: Number(row[table.index["amount"]] || 0),
        status: getString(row, table.index, "status"),
        sourceStatus: getString(row, table.index, "source_status"),
      },
      formal: formalRow ? {
        id: formalId,
        date: formatApiDate_(formalRow[table.index["transaction_date"]]),
        merchant: getString(formalRow, table.index, "merchant"),
        amount: Number(formalRow[table.index["amount"]] || 0),
        status: getString(formalRow, table.index, "status"),
        sourceType: getString(formalRow, table.index, "source_type"),
        sourceStatus: getString(formalRow, table.index, "source_status"),
      } : null,
    });
  }

  const result = {
    ready: missingFormalCount === 0,
    matchedVisaCount,
    resolvedPairCount,
    missingFormalCount,
    pairs,
  };

  console.log("=== R6.1 VISA加盟店 → 正式明細 ペア診断 ===");
  console.log(`照合済みVISA加盟店速報: ${matchedVisaCount}件`);
  console.log(`正式取引を解決できた: ${resolvedPairCount}件`);
  console.log(`正式取引が見つからない: ${missingFormalCount}件`);
  console.log(`ready: ${result.ready}`);
  console.log("--- 速報 → 正式明細 ---");
  console.log(JSON.stringify(pairs, null, 2));
  return result;
}

/**
 * R6.1 final guard: matched generic Olive preliminaries must stay internal-only.
 * Read-only verification; does not mutate transaction data.
 */
function verifyR61MatchedPreliminaryVisibility() {
  const table = loadTransactions();
  let matchedGenericCount = 0;
  let resolvedFormalCount = 0;
  let invalidVisibilityStateCount = 0;
  const invalidRows = [];

  const byId = {};
  for (const row of table.rows) {
    const id = getString(row, table.index, "id");
    if (id) byId[id] = row;
  }

  for (const row of table.rows) {
    const sourceType = getString(row, table.index, "source_type");
    const sourceStatus = getString(row, table.index, "source_status").toLowerCase();
    const settlementStatus = getString(row, table.index, "settlement_status").toLowerCase();
    const merchant = getString(row, table.index, "merchant");
    if (sourceType !== "Gmail_Olive" || sourceStatus !== "ignored" || settlementStatus !== "matched" || !isGenericPreliminaryMerchant_(merchant)) continue;

    matchedGenericCount++;
    const settlementId = getString(row, table.index, "settlement_id");
    const formalRow = settlementId ? byId[settlementId] : null;
    if (formalRow && !isIgnoredTransactionRow_(formalRow, table.index)) {
      resolvedFormalCount++;
    }

    // Both normal transaction list and review list use isIgnoredTransactionRow_.
    // If this ever stops being true, the preliminary could leak back into UI.
    if (!isIgnoredTransactionRow_(row, table.index)) {
      invalidVisibilityStateCount++;
      invalidRows.push({
        id: getString(row, table.index, "id"),
        merchant,
        sourceStatus,
        settlementStatus,
        settlementId,
      });
    }
  }

  const result = {
    ready: invalidVisibilityStateCount === 0 && resolvedFormalCount === matchedGenericCount,
    matchedGenericCount,
    hiddenPreliminaryCount: matchedGenericCount - invalidVisibilityStateCount,
    resolvedFormalCount,
    invalidVisibilityStateCount,
    invalidRows: invalidRows.slice(0, 20),
    behavior: "照合済み速報は通常一覧・要確認から除外し、settlement_id先の正式明細を表示対象にします。",
  };

  console.log("=== R6.1 照合済み速報 表示ガード ===");
  console.log(`照合済みVISA加盟店速報: ${matchedGenericCount}件`);
  console.log(`通常一覧・要確認から非表示: ${result.hiddenPreliminaryCount}件`);
  console.log(`正式明細を解決: ${resolvedFormalCount}件`);
  console.log(`表示状態異常: ${invalidVisibilityStateCount}件`);
  console.log(`ready: ${result.ready}`);
  console.log(JSON.stringify(result, null, 2));
  return result;
}
