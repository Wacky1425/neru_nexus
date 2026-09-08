// ============================================================
// Neru Nexus V2.0-2 - Transaction Account IDs
// Safe dual-write migration. Existing account-name columns remain.
// Public entry points intentionally have NO trailing underscore.
// ============================================================

function migrateV202AccountIds() {
  const sheet = getRequiredSheet(SHEETS.TRANSACTIONS);

  // V2.0-2 Fix1:
  // Existing import logic has historically treated AEON PAY as an
  // electronic-money transfer destination. If such transactions already
  // exist but M_Accounts lacks the corresponding master row, repair the
  // master before assigning transaction account IDs.
  const addedAccounts = ensureV202KnownAccountMasters_();

  let headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map((value) => String(value || "").trim());

  const addedColumns = [];
  for (const column of ["account_id", "from_account_id", "to_account_id"]) {
    if (!headers.includes(column)) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(column);
      addedColumns.push(column);
      headers.push(column);
    }
  }

  const index = createHeaderIndex(headers);
  assertRequiredColumns(
    index,
    [
      "account_name",
      "from_account",
      "to_account",
      "account_id",
      "from_account_id",
      "to_account_id",
    ],
    SHEETS.TRANSACTIONS,
  );

  const lastRow = sheet.getLastRow();
  let updatedCount = 0;
  let unresolvedCount = 0;
  const unresolved = [];

  if (lastRow >= 2) {
    const values = sheet
      .getRange(2, 1, lastRow - 1, headers.length)
      .getValues();

    const lookup = buildAccountIdentityLookup_();

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      let rowUpdated = false;

      const mappings = [
        ["account_name", "account_id"],
        ["from_account", "from_account_id"],
        ["to_account", "to_account_id"],
      ];

      for (const [nameColumn, idColumn] of mappings) {
        const rawName = String(row[index[nameColumn]] || "").trim();
        const existingId = String(row[index[idColumn]] || "").trim();

        if (!rawName || existingId) continue;

        const canonicalName = resolveCanonicalAccountName_(rawName);
        const account = lookup.byName.get(canonicalName);

        if (!account) {
          unresolvedCount++;
          if (unresolved.length < 20) {
            unresolved.push({
              rowNumber: i + 2,
              column: nameColumn,
              accountName: rawName,
            });
          }
          continue;
        }

        row[index[nameColumn]] = canonicalName;
        row[index[idColumn]] = String(account.accountId || "").trim();
        rowUpdated = true;
      }

      if (rowUpdated) updatedCount++;
    }

    sheet
      .getRange(2, 1, values.length, headers.length)
      .setValues(values);
  }

  clearTableCache(SHEETS.TRANSACTIONS);
  clearAccountBalanceCache_();

  const verification = verifyV202AccountIds();

  const result = {
    addedAccounts,
    addedColumns,
    updatedCount,
    unresolvedCount,
    unresolved,
    verification,
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyV202AccountIds() {
  const table = loadTransactions();
  const requiredColumns = [
    "account_name",
    "from_account",
    "to_account",
    "account_id",
    "from_account_id",
    "to_account_id",
  ];

  const missingColumns = requiredColumns.filter(
    (column) => table.index[column] === undefined,
  );

  if (missingColumns.length > 0) {
    return {
      ready: false,
      missingColumns,
      transactionCount: table.rows.length,
      resolvedReferenceCount: 0,
      unresolvedReferenceCount: 0,
      mismatchCount: 0,
    };
  }

  const lookup = buildAccountIdentityLookup_();
  let resolvedReferenceCount = 0;
  let unresolvedReferenceCount = 0;
  let mismatchCount = 0;
  const issues = [];

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];

    const mappings = [
      ["account_name", "account_id"],
      ["from_account", "from_account_id"],
      ["to_account", "to_account_id"],
    ];

    for (const [nameColumn, idColumn] of mappings) {
      const rawName = getString(row, table.index, nameColumn);
      const accountId = getString(row, table.index, idColumn);

      if (!rawName && !accountId) continue;

      if (!rawName || !accountId) {
        unresolvedReferenceCount++;
        if (issues.length < 20) {
          issues.push({
            rowNumber: i + 2,
            column: nameColumn,
            accountName: rawName,
            accountId,
            issue: "missing_name_or_id",
          });
        }
        continue;
      }

      const canonicalName = resolveCanonicalAccountName_(rawName);
      const account = lookup.byId.get(accountId);

      if (
        !account ||
        resolveCanonicalAccountName_(account.accountName) !== canonicalName
      ) {
        mismatchCount++;
        if (issues.length < 20) {
          issues.push({
            rowNumber: i + 2,
            column: nameColumn,
            accountName: rawName,
            accountId,
            issue: "id_name_mismatch",
          });
        }
        continue;
      }

      resolvedReferenceCount++;
    }
  }

  return {
    ready: unresolvedReferenceCount === 0 && mismatchCount === 0,
    missingColumns: [],
    transactionCount: table.rows.length,
    resolvedReferenceCount,
    unresolvedReferenceCount,
    mismatchCount,
    issues,
  };
}

function testAccountIdentityResolver_() {
  const accounts = getAccountsData_().items || [];

  if (accounts.length === 0) {
    return {
      assertions: "PASS",
      skipped: true,
      reason: "no accounts",
    };
  }

  const sample = accounts[0];
  const resolved = resolveAccountIdentity_(sample.accountName);

  if (
    !resolved.resolved ||
    resolved.accountId !== sample.accountId ||
    resolved.accountName !== resolveCanonicalAccountName_(sample.accountName)
  ) {
    throw new Error("Account ID resolver不一致");
  }

  return {
    assertions: "PASS",
    resolved,
  };
}


function ensureV202KnownAccountMasters_() {
  const transactionSheet = getRequiredSheet(SHEETS.TRANSACTIONS);
  const txValues = transactionSheet.getDataRange().getValues();

  if (txValues.length < 2) {
    return [];
  }

  const txIndex = createHeaderIndex(txValues[0]);
  const accountNameColumns = ["account_name", "from_account", "to_account"];

  for (const column of accountNameColumns) {
    if (txIndex[column] === undefined) {
      throw new Error(`T_Transactionsに${column}列がありません`);
    }
  }

  const referencedNames = new Set();

  for (const row of txValues.slice(1)) {
    for (const column of accountNameColumns) {
      const value = resolveCanonicalAccountName_(
        String(row[txIndex[column]] || "").trim(),
      );

      if (value) {
        referencedNames.add(value);
      }
    }
  }

  // Only definitions that are explicitly produced by Neru Nexus import logic
  // belong here. Do not auto-create arbitrary unresolved names.
  const knownAccounts = [
    {
      accountId: "acc_aeon_pay",
      accountName: "AEON PAY",
      paymentMethod: "AEON PAY",
      wallet: "生活",
      institution: "AEON",
      assetType: "cash",
      isAsset: 1,
      isLiability: 0,
      active: 1,
      note: "V2.0-2 migration: 電子マネーチャージ先を正式口座化",
    },
  ];

  const accountSheet = getRequiredSheet(SHEETS.ACCOUNTS);
  const accountValues = accountSheet.getDataRange().getValues();

  if (accountValues.length === 0) {
    throw new Error("M_Accountsにヘッダーがありません");
  }

  const headers = accountValues[0].map((value) =>
    String(value || "").trim(),
  );
  const index = createHeaderIndex(headers);

  assertRequiredColumns(
    index,
    [
      "account_id",
      "account_name",
      "payment_method",
      "wallet",
      "institution",
      "is_asset",
      "is_liability",
      "active",
      "note",
      "sort_order",
      "opening_balance",
      "opening_balance_date",
    ],
    SHEETS.ACCOUNTS,
  );

  const existingByName = new Map();
  const existingById = new Map();

  for (let i = 1; i < accountValues.length; i++) {
    const row = accountValues[i];
    const accountId = String(row[index["account_id"]] || "").trim();
    const accountName = resolveCanonicalAccountName_(
      String(row[index["account_name"]] || "").trim(),
    );

    if (accountName) {
      existingByName.set(accountName, { row, rowNumber: i + 1 });
    }

    if (accountId) {
      existingById.set(accountId, { row, rowNumber: i + 1 });
    }
  }

  const addedAccounts = [];
  let maxSortOrder = accountValues.slice(1).reduce((maximum, row) => {
    const value = Number(row[index["sort_order"]] || 0);
    return value > maximum ? value : maximum;
  }, 0);

  for (const definition of knownAccounts) {
    if (!referencedNames.has(definition.accountName)) {
      continue;
    }

    const existing = existingByName.get(definition.accountName);

    if (existing) {
      const currentId = String(
        existing.row[index["account_id"]] || "",
      ).trim();

      if (!currentId) {
        if (existingById.has(definition.accountId)) {
          throw new Error(
            `M_Accountsのaccount_id競合: ${definition.accountId}`,
          );
        }

        accountSheet
          .getRange(existing.rowNumber, index["account_id"] + 1)
          .setValue(definition.accountId);

        addedAccounts.push({
          accountId: definition.accountId,
          accountName: definition.accountName,
          action: "filled_missing_id",
        });
      }

      continue;
    }

    if (existingById.has(definition.accountId)) {
      throw new Error(
        `M_Accountsのaccount_id競合: ${definition.accountId}`,
      );
    }

    const row = new Array(headers.length).fill("");

    row[index["account_id"]] = definition.accountId;
    row[index["account_name"]] = definition.accountName;
    row[index["payment_method"]] = definition.paymentMethod;
    row[index["wallet"]] = definition.wallet;
    row[index["institution"]] = definition.institution;

    if (index["asset_type"] !== undefined) {
      row[index["asset_type"]] = definition.assetType;
    }

    row[index["is_asset"]] = definition.isAsset;
    row[index["is_liability"]] = definition.isLiability;
    row[index["active"]] = definition.active;
    row[index["note"]] = definition.note;
    row[index["sort_order"]] = ++maxSortOrder;
    row[index["opening_balance"]] = 0;
    row[index["opening_balance_date"]] = "";

    if (index["closing_day"] !== undefined) {
      row[index["closing_day"]] = 0;
    }
    if (index["payment_day"] !== undefined) {
      row[index["payment_day"]] = 0;
    }
    if (index["payment_month_offset"] !== undefined) {
      row[index["payment_month_offset"]] = 0;
    }

    accountSheet.appendRow(row);

    existingByName.set(definition.accountName, {
      row,
      rowNumber: accountSheet.getLastRow(),
    });
    existingById.set(definition.accountId, {
      row,
      rowNumber: accountSheet.getLastRow(),
    });

    addedAccounts.push({
      accountId: definition.accountId,
      accountName: definition.accountName,
      action: "created",
    });
  }

  if (addedAccounts.length > 0) {
    clearTableCache(SHEETS.ACCOUNTS);
    clearAccountBalanceCache_();
  }

  return addedAccounts;
}
