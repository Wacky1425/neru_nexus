const NERU_API_VERSION = "1";

const SHEETS = Object.freeze({
  // ===== Master =====
  CATEGORIES: "M_Categories",
  ACCOUNTS: "M_Accounts",
  RULES: "M_Rules",
  IMPORT_CONFIG: "M_ImportConfig",
  ACCOUNT_ALIAS: "M_AccountAlias",
  MERCHANT_ALIAS: "M_MerchantAlias",
  GOALS: "M_Goals",
  FINANCIAL_SETTINGS: "M_FinancialSettings",
  INVESTMENT_HOLDINGS: "M_InvestmentHoldings",
  ASSET_SNAPSHOTS: "R_AssetSnapshots",

  // ===== Transaction =====
  TRANSACTIONS: "T_Transactions",
  RECURRING_CANDIDATES: "T_RecurringCandidates",
  IMPORT_HISTORY: "T_ImportHistory",
  ERROR_LOG: "T_ErrorLog",
  GMAIL_EVIDENCE_CANDIDATES: "T_GmailEvidenceCandidates",
  SBI_INVESTMENT_EVENTS: "T_SbiInvestmentEvents",

  // ===== Report =====
  MONTHLY_SUMMARY: "R_MonthlySummary",
  CATEGORY_SUMMARY: "R_CategorySummary",
  // ===== Future =====
  BUDGETS: "M_Budgets",
});

const FOLDERS = Object.freeze({
  CSV_IMPORT: "1igN1iH0nFHOqf45uGUBIXe7oBPZIE_Hq",
  EVIDENCE_IMAGES: "1Kv0tY7pPD6vcumQH-xcyuZ1Mo_XtH39b"
});

const SS = SpreadsheetApp.getActiveSpreadsheet();