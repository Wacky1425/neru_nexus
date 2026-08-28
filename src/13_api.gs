
function getApiKey_() {
  const apiKey =
    PropertiesService.getScriptProperties().getProperty("NERU_API_KEY");

  if (!apiKey) {
    throw new Error("スクリプトプロパティ NERU_API_KEY が設定されていません");
  }

  return apiKey;
}

function isApiAuthorized_(requestKey) {
  const receivedKey = String(requestKey || "");
  const expectedKey = getApiKey_();

  return receivedKey === expectedKey;
}

function createJsonResponse_(data, status, requestId) {
  return ContentService.createTextOutput(
    JSON.stringify({
      success: status !== "error",
      status,
      apiVersion: NERU_API_VERSION,
      requestId: String(requestId || ""),
      data,
    }),
  ).setMimeType(ContentService.MimeType.JSON);
}

function createJsonErrorResponse_(message, requestId) {
  return ContentService.createTextOutput(
    JSON.stringify({
      success: false,
      status: "error",
      apiVersion: NERU_API_VERSION,
      requestId: String(requestId || ""),
      error: {
        message: String(message || "不明なエラー"),
      },
    }),
  ).setMimeType(ContentService.MimeType.JSON);
}

function assertCompatibleApiVersion_(clientVersion) {
  const value = String(clientVersion || "").trim();
  if (value && value !== NERU_API_VERSION) {
    throw new Error(`APIバージョンが一致しません: client=${value}, server=${NERU_API_VERSION}`);
  }
}

function doGet(e) {
  const requestId = createRequestId_();
  let action = "";
  try {
    const parameters = e && e.parameter ? e.parameter : {};
    assertCompatibleApiVersion_(parameters.apiVersion);

    if (!isApiAuthorized_(parameters.key)) {
      return createJsonErrorResponse_("認証に失敗しました");
    }

    action = String(parameters.action || "").trim();

    switch (action) {
      case "home":
        return createJsonResponse_(getHomeData(), "ok");

      case "analytics":
        return createJsonResponse_(
          getAnalyticsData(parameters.yearMonth),
          "ok",
        );

      case "health":
        return createJsonResponse_(
          {
            service: "Neru Nexus API",
            running: true,
            generatedAt: new Date().toISOString(),
            apiVersion: NERU_API_VERSION,
          },
          "ok",
        );

      case "transactions":
        return createJsonResponse_(
          getTransactionsData({
            limit: parameters.limit,
            offset: parameters.offset,
            yearMonth: parameters.yearMonth,
            keyword: parameters.keyword,
            majorCategory: parameters.majorCategory,
            reviewOnly: parameters.reviewOnly,
            settlementId: parameters.settlementId,
            importBatch: parameters.importBatch,
          }),
          "ok",
        );

      case "ignored_transactions":
        return createJsonResponse_(
          getIgnoredTransactionsData(e.parameter),
          "ok",
        );

      case "categories":
        return createJsonResponse_(getCategoriesData(), "ok");

      case "budget_settings":
        return createJsonResponse_(
          getBudgetSettings(parameters.yearMonth),
          "ok",
        );

      case "import_history":
        return createJsonResponse_(
          getImportHistoryData_({
            limit: parameters.limit,
          }),
          "ok",
        );

      case "master":
        return createJsonResponse_(getMasterData(), "ok");

      case "account_balances":
        return createJsonResponse_(getAccountBalancesData(), "ok");

      case "review_transactions":
        return createJsonResponse_(
          getReviewTransactionsData({
            limit: parameters.limit,
            offset: parameters.offset,
          }),
          "ok",
        );

      case "review_count":
        return createJsonResponse_(getReviewTransactionCount(), "ok");

      case "settlement_candidates":
        return createJsonResponse_(
          getSettlementCandidatesData({
            transactionId: parameters.transactionId,
          }),
          "ok",
        );

      case "settlement_statuses":
        return createJsonResponse_(getSettlementStatusesData_(), "ok");

      case "goals":
        return createJsonResponse_(getGoalsData(), "ok");

      case "gmail_import_status":
        return createJsonResponse_(getGmailImportStatus_(), "ok");

      case "recurring_candidates":
        return createJsonResponse_(getRecurringCandidatesData_(), "ok");

      case "classification_rules":
        return createJsonResponse_(getRuleManagementData_(), "ok");

      case "merchant_classification_suggestions":
        return createJsonResponse_(buildMerchantClassificationSuggestions_(), "ok");

      case "gmail_evidence_candidates":
        return createJsonResponse_(
          getGmailEvidenceCandidatesData_({
            includeDone: parameters.includeDone,
          }),
          "ok",
        );

      case "investment_holdings":
        return createJsonResponse_(getInvestmentHoldingsData_(), "ok");

      case "sbi_investment_events":
        return createJsonResponse_(
          getSbiInvestmentEventsData_({
            includeDone: parameters.includeDone,
          }),
          "ok",
        );

      case "asset_trend":
        return createJsonResponse_(
          getAssetTrendData_({ months: parameters.months }),
          "ok",
        );

      case "business_report":
        return createJsonResponse_(
          getBusinessReportData_({
            year: parameters.year,
            yearMonth: parameters.yearMonth,
          }),
          "ok",
        );

      case "system_diagnostics":
        return createJsonResponse_(getSystemDiagnostics_(), "ok", requestId);

      default:
        return createJsonErrorResponse_(`未対応のactionです: ${action}`);
    }
  } catch (error) {
    console.error(error);
    logApiError_({ requestId, method: "GET", action, error });

    return createJsonErrorResponse_(
      error && error.message ? error.message : error,
      requestId,
    );
  }
}

function doPost(e) {
  const requestId = createRequestId_();
  let action = "";
  try {
    const data = JSON.parse(
      e && e.postData && e.postData.contents ? e.postData.contents : "{}",
    );

    assertCompatibleApiVersion_(data.apiVersion);

    const key = String(data.key || "").trim();

    if (!isApiAuthorized_(key)) {
      return createJsonErrorResponse_("認証に失敗しました");
    }

    action = String(data.action || "").trim();

    switch (action) {
      case "transaction_create":
        return createTransactionFromApp_(data);

      case "transaction_update":
        return updateTransactionFromApp_(data);

      case "transaction_delete":
        return deleteTransactionFromApp_(data);

      case "transaction_manual_confirm":
        return confirmPreliminaryTransactionFromApp_(data);

      case "transaction_restore_ignored":
        return restoreIgnoredTransactionFromApp_(data);

      case "csv_import":
        return importCsvFromApp_(data);

      case "discord_transaction":
        return createDiscordTransaction_(data);

      case "category_create":
        return createCategoryFromApp_(data);

      case "category_update":
        return updateCategoryFromApp_(data);

      case "category_deactivate":
        return deactivateCategoryFromApp_(data);

      case "settlement_confirm":
        return confirmSettlementManually_(data);

      case "settlement_manual_match":
        return confirmSettlementManually_(data);

      case "settlement_manual_unmatch":
        return cancelSettlementManualMatch_(data);

      case "update_account_opening_balance":
        return updateAccountOpeningBalanceFromApp_(data);

      case "account_create":
        return createAccountFromApp_(data);

      case "account_update":
        return updateAccountFromApp_(data);

      case "account_deactivate":
        return deactivateAccountFromApp_(data);

      case "budget_settings_update":
        return updateBudgetSettingsFromApp_(data);

      case "goal_create":
        return createGoalFromApp_(data);

      case "goal_update":
        return updateGoalFromApp_(data);

      case "goal_deactivate":
        return deactivateGoalFromApp_(data);

      case "transaction_ignore":
        return ignoreTransactionFromApp_(data);

      case "recurring_candidate_update":
        return updateRecurringCandidateFromApp_(data);

      case "classification_rule_create":
        return createClassificationRuleFromApp_(data);

      case "classification_rule_update":
        return updateClassificationRuleFromApp_(data);

      case "classification_rule_delete":
        return deleteClassificationRuleFromApp_(data);

      case "merchant_classification_suggestion_promote":
        return promoteMerchantSuggestionFromApp_(data);

      case "gmail_evidence_scan":
        return scanGmailEvidenceFromApp_(data);

      case "gmail_evidence_attach":
        return attachGmailEvidenceCandidateFromApp_(data);

      case "gmail_evidence_ignore":
        return ignoreGmailEvidenceCandidateFromApp_(data);

      case "investment_holding_create":
        return createInvestmentHoldingFromApp_(data);

      case "investment_holding_update":
        return updateInvestmentHoldingFromApp_(data);

      case "investment_holding_deactivate":
        return deactivateInvestmentHoldingFromApp_(data);

      case "investment_prices_refresh":
        return refreshInvestmentPricesFromApp_();

      case "sbi_investment_scan":
        return scanSbiInvestmentGmailFromApp_(data);

      case "sbi_investment_event_apply":
        return applySbiInvestmentEventFromApp_(data);

      case "sbi_investment_event_ignore":
        return ignoreSbiInvestmentEventFromApp_(data);

      case "asset_snapshot_capture":
        return captureAssetSnapshotFromApp_();

      case "business_tax_export_create":
        return createBusinessTaxExportFromApp_(data);

      case "system_backup_create":
        return createNeruNexusBackupFromApp_();

      case "system_integrity_check":
        return createJsonResponse_(runDataIntegrityCheck_(), "ok", requestId);

      default:
        return createJsonErrorResponse_(`未対応のactionです: ${action}`);
    }
  } catch (error) {
    console.error(error);
    logApiError_({ requestId, method: "POST", action, error });

    return createJsonErrorResponse_(
      error && error.message ? error.message : String(error),
      requestId,
    );
  }
}


