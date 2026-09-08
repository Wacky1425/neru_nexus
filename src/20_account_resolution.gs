// ============================================================
// Account / Transfer Resolution
// ============================================================

function getAccountAliases_() {
  if (accountAliasCache_ === null) {
    accountAliasCache_ = loadObjects(SHEETS.ACCOUNT_ALIAS);
  }

  return accountAliasCache_;
}

function resolveAccountFromAliases_(values) {
  const candidates = (values || [])
    .filter(Boolean)
    .map((value) => String(value).normalize("NFKC").trim())
    .filter(Boolean);

  if (candidates.length === 0) {
    return "";
  }

  const aliases = getAccountAliases_();

  let bestMatch = null;

  for (const candidate of candidates) {
    for (const row of aliases) {
      const raw = String(row.raw_account_name || "")
        .normalize("NFKC")
        .trim();

      const canonical = String(row.canonical_account_name || "").trim();

      if (!raw || !canonical) {
        continue;
      }

      if (!candidate.includes(raw)) {
        continue;
      }

      if (bestMatch === null || raw.length > bestMatch.rawLength) {
        bestMatch = {
          rawLength: raw.length,
          canonical,
        };
      }
    }
  }

  return bestMatch?.canonical || "";
}

function resolveCreditCardAccount_(tx) {
  return resolveAccountFromAliases_([tx.merchant, tx.item_name, tx.note]);
}

function applyTransferMetadata_(tx) {
  const type = String(tx.type || "").trim();

  const subCategory = String(tx.sub_category || "").trim();

  const accountName = resolveCanonicalAccountName_(
    String(tx.account_name || "").trim(),
  );

  const sourceType = String(tx.source_type || "").trim();

  const moneyDirection = String(tx.money_direction || "").trim();

  // ==========================================================
  // 通常の支出・収入
  // ==========================================================

  if (type !== "移動" && type !== "振替") {
    tx.from_account = "";
    tx.to_account = "";

    tx.settlement_status = "";
    tx.settlement_id = "";

    return;
  }

  tx.settlement_id = String(tx.settlement_id || "").trim();

  // ==========================================================
  // PayPayチャージ
  //
  // PayPay CSV上ではPayPayへの「入金」。
  //
  // 銀行 → PayPay
  // ==========================================================

  if (sourceType === "CSV_PayPay" && subCategory === "電子マネーチャージ") {
    const sourceAccount = resolveAccountFromAliases_([tx.note, tx.raw_text]);

    tx.from_account = sourceAccount;

    tx.to_account = accountName;

    tx.settlement_status = tx.from_account && tx.to_account ? "none" : "review";

    return;
  }

  // ==========================================================
  // 銀行CSV
  //
  // CSV元データの「入金 / 出金」を最優先する。
  //
  // out:
  //   CSV対象口座 → 相手
  //
  // in:
  //   相手 → CSV対象口座
  // ==========================================================

  const isBankSource = sourceType === "CSV_銀行" || sourceType === "Gmail_SMBC";

  if (isBankSource && (moneyDirection === "in" || moneyDirection === "out")) {
    const otherAccount = resolveTransferDestinationAccount_(tx);

    // --------------------------------------------------------
    // 出金
    // --------------------------------------------------------

    if (moneyDirection === "out") {
      tx.from_account = accountName;

      // クレカ引落だけは
      // カード口座を専用ロジックで解決
      if (subCategory === "クレカ引落") {
        tx.to_account = resolveCreditCardAccount_(tx);

        tx.settlement_status = tx.to_account ? "pending" : "review";

        return;
      }

      tx.to_account = otherAccount;

      tx.settlement_status = tx.to_account ? "none" : "review";

      return;
    }

    // --------------------------------------------------------
    // 入金
    // --------------------------------------------------------

    tx.from_account = otherAccount;

    tx.to_account = accountName;

    tx.settlement_status = tx.from_account ? "none" : "review";

    return;
  }

  // ==========================================================
  // その他の通常移動
  //
  // 従来仕様を維持
  // ==========================================================

  tx.from_account = accountName;

  tx.to_account = String(tx.to_account || "").trim();

  if (subCategory === "クレカ引落") {
    tx.to_account = resolveCreditCardAccount_(tx);

    tx.settlement_status = tx.to_account ? "pending" : "review";

    return;
  }

  const destinationAccount = resolveTransferDestinationAccount_(tx);

  tx.to_account = destinationAccount;

  tx.settlement_status = destinationAccount ? "none" : "review";
}

function resolveTransferDestinationAccount_(tx) {
  return resolveAccountFromAliases_([
    tx.merchant,
    tx.item_name,
    tx.note,
    tx.raw_text,
  ]);
}

function resolveCanonicalAccountName_(rawName) {
  const target = String(rawName || "")
    .normalize("NFKC")
    .trim();

  if (!target) {
    return "";
  }

  // 毎回シートを読まず、既に作ったキャッシュを使う
  const rows = getAccountAliases_();

  for (const row of rows) {
    const raw = String(row.raw_account_name || "")
      .normalize("NFKC")
      .trim();

    if (raw === target) {
      return String(row.canonical_account_name || "").trim();
    }
  }

  // マスタに無ければ元の名前を返す
  return target;
}


function buildAccountIdentityLookup_() {
  const sheet = getRequiredSheet(SHEETS.ACCOUNTS);
  const values = sheet.getDataRange().getValues();
  const byId = new Map();
  const byName = new Map();

  if (values.length < 2) {
    return { byId, byName };
  }

  const index = createHeaderIndex(values[0]);

  assertRequiredColumns(
    index,
    ["account_id", "account_name"],
    SHEETS.ACCOUNTS,
  );

  for (const row of values.slice(1)) {
    const accountId = String(row[index["account_id"]] || "").trim();
    const rawAccountName = String(row[index["account_name"]] || "").trim();

    if (!accountId || !rawAccountName) continue;

    const accountName = resolveCanonicalAccountName_(rawAccountName);

    const account = {
      accountId,
      accountName,
    };

    if (byId.has(accountId)) {
      throw new Error(`M_Accountsに重複account_idがあります: ${accountId}`);
    }

    if (byName.has(accountName)) {
      throw new Error(`M_Accountsに重複account_nameがあります: ${accountName}`);
    }

    byId.set(accountId, account);
    byName.set(accountName, account);
  }

  return { byId, byName };
}

function resolveAccountIdentity_(rawName, lookup) {
  const accountName = resolveCanonicalAccountName_(rawName);

  if (!accountName) {
    return {
      accountId: "",
      accountName: "",
      resolved: false,
    };
  }

  const identityLookup = lookup || buildAccountIdentityLookup_();
  const account = identityLookup.byName.get(accountName);

  return {
    accountId: account ? String(account.accountId || "").trim() : "",
    accountName,
    resolved: Boolean(account),
  };
}

function validateRequestedAccountIdentity_(
  requestedId,
  rawName,
  label,
  options,
) {
  const settings = options || {};
  const allowBlank = settings.allowBlank === true;
  const lookup = settings.lookup || null;
  const normalizedRequestedId = String(requestedId || "").trim();
  const normalizedName = resolveCanonicalAccountName_(rawName);

  if (!normalizedName) {
    if (allowBlank) {
      return {
        accountId: "",
        accountName: "",
        resolved: false,
      };
    }

    throw new Error(`${label || "口座"}は必須です`);
  }

  const identity = resolveAccountIdentity_(normalizedName, lookup);

  if (!identity.resolved) {
    throw new Error(
      `${label || "口座"}「${normalizedName}」をM_Accountsから解決できません`,
    );
  }

  if (normalizedRequestedId && normalizedRequestedId !== identity.accountId) {
    throw new Error(`${label || "口座"}IDと口座名が一致しません`);
  }

  return identity;
}


function getTransactionAccountReference_(
  row,
  index,
  nameColumn,
  idColumn,
  lookup,
) {
  const accountName = getString(row, index, nameColumn);
  const accountId =
    index[idColumn] === undefined ? "" : getString(row, index, idColumn);

  const identityLookup = lookup || buildAccountIdentityLookup_();

  if (accountId) {
    const account = identityLookup.byId.get(accountId);

    if (account) {
      return {
        accountId,
        accountName: account.accountName,
        resolved: true,
      };
    }
  }

  return resolveAccountIdentity_(accountName, identityLookup);
}
