// ============================================================
// Neru Nexus V2.0-3 - API v2 compatibility layer
//
// v1 remains supported via `action`.
// v2 uses stable namespaced `route` values.
// Existing handler implementations are reused during the migration.
// ============================================================

const NERU_API_V2_GET_ROUTES = Object.freeze({
  "system.health": "health",
  "system.appUpdateInfo": "app_update_info",
  "dashboard.home": "home",
  "analytics.monthly": "analytics",
  "transactions.list": "transactions",
  "transactions.ignored": "ignored_transactions",
  "categories.list": "categories",
  "budgets.settings": "budget_settings",
  "imports.history": "import_history",
  "master.bundle": "master",
  "accounts.balances": "account_balances",
  "accounts.balanceReconciliation": "balance_reconciliation",
  "reviews.transactions": "review_transactions",
  "reviews.reconciliation_history": "reconciliation_history",
  "reviews.count": "review_count",
  "settlements.candidates": "settlement_candidates",
  "settlements.statuses": "settlement_statuses",
  "goals.list": "goals",
  "gmail.importStatus": "gmail_import_status",
  "recurring.candidates": "recurring_candidates",
  "classification.rules": "classification_rules",
  "classification.suggestions": "merchant_classification_suggestions",
  "gmailEvidence.candidates": "gmail_evidence_candidates",
  "investments.holdings": "investment_holdings",
  "investments.priceHistory": "investment_price_history",
  "investments.plans": "investment_plans",
  "investments.sbiEvents": "sbi_investment_events",
  "assets.trend": "asset_trend",
  "business.report": "business_report",
  "system.diagnostics": "system_diagnostics",
  "system.reconciliationAudit": "r6_full_reconciliation",
  "system.capabilities": "__v2_capabilities__",
  "auth.status": "__v2_auth_status__",
  "system.backendStatus": "__v2_backend_status__",
});
const NERU_API_V2_POST_ROUTES = Object.freeze({
  "transactions.create": "transaction_create",
  "transactions.update": "transaction_update",
  "transactions.delete": "transaction_delete",
  "transactions.confirmPreliminary": "transaction_manual_confirm",
  "transactions.restoreIgnored": "transaction_restore_ignored",
  "transactions.ignore": "transaction_ignore",
  "imports.csv": "csv_import",
  "imports.csvPreview": "csv_import_preview",
  "discord.transactions.create": "discord_transaction",
  "categories.create": "category_create",
  "categories.update": "category_update",
  "categories.deactivate": "category_deactivate",
  "settlements.confirm": "settlement_confirm",
  "settlements.manualMatch": "settlement_manual_match",
  "settlements.manualUnmatch": "settlement_manual_unmatch",
  "accounts.updateOpeningBalance": "update_account_opening_balance",
  "accounts.balanceReconciliation.save": "balance_reconciliation_save",
  "accounts.create": "account_create",
  "accounts.update": "account_update",
  "accounts.deactivate": "account_deactivate",
  "budgets.settings.update": "budget_settings_update",
  "goals.create": "goal_create",
  "goals.update": "goal_update",
  "goals.deactivate": "goal_deactivate",
  "recurring.candidates.update": "recurring_candidate_update",
  "classification.rules.create": "classification_rule_create",
  "classification.rules.update": "classification_rule_update",
  "classification.rules.delete": "classification_rule_delete",
  "classification.suggestions.promote": "merchant_classification_suggestion_promote",
  "gmailEvidence.scan": "gmail_evidence_scan",
  "gmailEvidence.attach": "gmail_evidence_attach",
  "gmailEvidence.ignore": "gmail_evidence_ignore",
  "investments.holdings.create": "investment_holding_create",
  "investments.holdings.update": "investment_holding_update",
  "investments.holdings.deactivate": "investment_holding_deactivate",
  "investments.prices.refresh": "investment_prices_refresh",
  "investments.plans.save": "investment_plan_save",
  "investments.plans.deactivate": "investment_plan_deactivate",
  "investments.sbi.scan": "sbi_investment_scan",
  "investments.sbi.apply": "sbi_investment_event_apply",
  "investments.sbi.ignore": "sbi_investment_event_ignore",
  "assets.snapshot.capture": "asset_snapshot_capture",
  "business.taxExport.create": "business_tax_export_create",
  "system.backup.create": "system_backup_create",
  "system.integrity.check": "system_integrity_check",
  "auth.pair": "__v2_auth_pair__",
  "auth.revoke": "__v2_auth_revoke__",
});

let NERU_REQUEST_API_VERSION_ = "1";
let NERU_REQUEST_ID_ = "";

function resolveRequestedApiVersion_(value) {
  const requested = String(value || "").trim() || "1";

  if (!NERU_API_SUPPORTED_VERSIONS.includes(requested)) {
    throw new Error(
      `未対応のAPIバージョンです: ${requested} ` +
        `(supported=${NERU_API_SUPPORTED_VERSIONS.join(",")})`,
    );
  }

  return requested;
}

function beginApiRequestContext_(apiVersion, requestId) {
  NERU_REQUEST_API_VERSION_ = resolveRequestedApiVersion_(apiVersion);
  NERU_REQUEST_ID_ = String(requestId || "");
}

function getApiResponseVersion_() {
  return NERU_REQUEST_API_VERSION_ || "1";
}

function getApiRequestId_() {
  return NERU_REQUEST_ID_ || "";
}

function resolveV2LegacyAction_(method, route) {
  const normalizedMethod = String(method || "").toUpperCase();
  const normalizedRoute = String(route || "").trim();

  if (!normalizedRoute) {
    throw new Error("API v2ではrouteは必須です");
  }

  const map =
    normalizedMethod === "GET"
      ? NERU_API_V2_GET_ROUTES
      : normalizedMethod === "POST"
        ? NERU_API_V2_POST_ROUTES
        : null;

  if (!map) {
    throw new Error(`未対応のHTTP methodです: ${normalizedMethod}`);
  }

  const action = map[normalizedRoute];

  if (!action) {
    throw new Error(`未対応のAPI v2 routeです: ${normalizedRoute}`);
  }

  return action;
}

function resolveApiAction_(method, payload, apiVersion) {
  const version = resolveRequestedApiVersion_(apiVersion);
  const data = payload || {};

  if (version === "1") {
    return String(data.action || "").trim();
  }

  // During the v2 cutover, route is canonical. A legacy action fallback is
  // accepted only so a partially-updated client does not brick the app.
  const route = String(data.route || "").trim();

  if (route) {
    return resolveV2LegacyAction_(method, route);
  }

  const legacyAction = String(data.action || "").trim();

  if (legacyAction) {
    return legacyAction;
  }

  throw new Error("API v2ではrouteは必須です");
}

function getApiV2Capabilities_() {
  return {
    service: "Neru Nexus API",
    currentVersion: NERU_API_VERSION,
    supportedVersions: [...NERU_API_SUPPORTED_VERSIONS],
    compatibility: {
      v1ActionSupported: true,
      v2RouteSupported: true,
      v2LegacyActionFallback: true,
    },
    routes: {
      get: Object.keys(NERU_API_V2_GET_ROUTES).sort(),
      post: Object.keys(NERU_API_V2_POST_ROUTES).sort(),
    },
  };
}

function verifyV203ApiV2() {
  // V2.0-3 introduced the baseline route set. Later versions may safely add
  // routes, so this verifier must not fail merely because the API expanded.
  const minimumGetRoutes = 28;
  const minimumPostRoutes = 43;
  const issues = [];

  if (NERU_API_VERSION !== "2") {
    issues.push(`current API version is ${NERU_API_VERSION}`);
  }

  if (
    !NERU_API_SUPPORTED_VERSIONS.includes("1") ||
    !NERU_API_SUPPORTED_VERSIONS.includes("2")
  ) {
    issues.push("supported versions must include both v1 and v2");
  }

  const getRouteCount = Object.keys(NERU_API_V2_GET_ROUTES).length;
  const postRouteCount = Object.keys(NERU_API_V2_POST_ROUTES).length;

  if (getRouteCount < minimumGetRoutes) {
    issues.push(
      `GET route count below V2.0-3 baseline: ${getRouteCount} < ${minimumGetRoutes}`,
    );
  }

  if (postRouteCount < minimumPostRoutes) {
    issues.push(
      `POST route count below V2.0-3 baseline: ${postRouteCount} < ${minimumPostRoutes}`,
    );
  }

  if (resolveV2LegacyAction_("GET", "transactions.list") !== "transactions") {
    issues.push("transactions.list mapping mismatch");
  }

  if (
    resolveV2LegacyAction_("POST", "transactions.create") !==
    "transaction_create"
  ) {
    issues.push("transactions.create mapping mismatch");
  }

  const result = {
    ready: issues.length === 0,
    currentVersion: NERU_API_VERSION,
    supportedVersions: [...NERU_API_SUPPORTED_VERSIONS],
    getRouteCount,
    postRouteCount,
    issues,
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testApiV2Routing_() {
  if (resolveRequestedApiVersion_("") !== "1") {
    throw new Error("blank version must resolve to v1");
  }

  if (resolveRequestedApiVersion_("2") !== "2") {
    throw new Error("v2 resolution failed");
  }

  if (
    resolveApiAction_(
      "GET",
      { route: "accounts.balances" },
      "2",
    ) !== "account_balances"
  ) {
    throw new Error("GET v2 route mapping failed");
  }

  if (
    resolveApiAction_(
      "POST",
      { route: "accounts.update" },
      "2",
    ) !== "account_update"
  ) {
    throw new Error("POST v2 route mapping failed");
  }

  if (
    resolveApiAction_(
      "GET",
      { action: "home" },
      "1",
    ) !== "home"
  ) {
    throw new Error("v1 action compatibility failed");
  }

  if (
    resolveApiAction_(
      "GET",
      { route: "investments.plans" },
      "2",
    ) !== "investment_plans"
  ) {
    throw new Error("Investment Planner GET v2 route mapping failed");
  }

  if (
    resolveApiAction_(
      "POST",
      { route: "investments.plans.save" },
      "2",
    ) !== "investment_plan_save"
  ) {
    throw new Error("Investment Planner POST v2 route mapping failed");
  }

  return {
    assertions: "PASS",
    currentVersion: NERU_API_VERSION,
  };
}
