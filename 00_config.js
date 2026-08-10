const SHEETS = Object.freeze({
  // ===== Master =====
  CATEGORIES: "M_Categories",
  ACCOUNTS: "M_Accounts",
  RULES: "M_Rules",
  IMPORT_CONFIG: "M_ImportConfig",
  DREAM_FUNDS: "M_DreamFunds",
  ACCOUNT_ALIAS: "M_AccountAlias",
  MERCHANT_ALIAS: "M_MerchantAlias",

  // ===== Transaction =====
  TRANSACTIONS: "T_Transactions",
  IMPORT_CSV: "T_ImportCsv",
  REVIEW_QUEUE: "T_ReviewQueue",
  BULK_REVIEW: "T_BulkReview",
  RECURRING_CANDIDATES: "T_RecurringCandidates",

  // ===== Report =====
  HOME: "R_Home",
  ANALYTICS: "R_Analytics",
  MONTHLY_SUMMARY: "R_MonthlySummary",
  CATEGORY_SUMMARY: "R_CategorySummary",
  REVIEW_SUMMARY: "R_ReviewSummary",
  DASHBOARD: "R_Dashboard",

  // ===== Future =====
  BUDGETS: "M_Budgets",
});

const FOLDERS = Object.freeze({
  CSV_IMPORT: "1igN1iH0nFHOqf45uGUBIXe7oBPZIE_Hq",
  EVIDENCE_IMAGES: "1Kv0tY7pPD6vcumQH-xcyuZ1Mo_XtH39b"
});

const SS = SpreadsheetApp.getActiveSpreadsheet();