# Neru Nexus 開発引き継ぎ資料

**基準日:** 2026-08-27\
**基準ソース:** `flutter202608271627.zip` / `gas202608271627.zip` /
`Neru_Nexus_live (2).xlsx`

> この資料は、cleanup後に提供された3つの最新版を正本として、Flutter・GAS・Google
> Sheetsを横断監査した結果をまとめたもの。過去の構想ではなく、現行コードと現行シート構造を優先している。

------------------------------------------------------------------------

## 1. 現在地

Neru Nexus は、個人の家計・資産・副業/配信経費を一元管理するための
Flutter + Google Apps Script + Google Sheets 構成のアプリ。

現時点では「試作品」よりかなり先まで進んでおり、以下の基盤は実装済み。

-   Flutterアプリ本体（Home / 取引 / 取込 / 分析 / 資産 / 設定）
-   手動取引の追加・編集・削除
-   CSV取込
-   Import History
-   Gmail速報取込（Olive / SMBC）
-   Gmail速報と正式CSVの照合
-   自動分類Rules
-   要確認フロー
-   無視取引・復元
-   カテゴリ管理
-   口座管理・残高推定
-   クレジットカード引落照合
-   Homeの資金余力・生活防衛資金等の計算
-   Analytics
-   Goals
-   Budget設定
-   GAS回帰テスト
-   キャッシュ
-   maintenance / manual test群

大規模cleanupも完了しており、旧Dream、旧Review用シート、旧Dashboard系シート、旧Budget項目などは撤去済み。

------------------------------------------------------------------------

## 2. 全体アーキテクチャ

``` text
┌─────────────────────────────┐
│ Flutter                     │
│ UI / Model / Service        │
└──────────────┬──────────────┘
               │ HTTPS JSON
               │ action + API key
               ▼
┌─────────────────────────────┐
│ Google Apps Script Web App  │
│ doGet / doPost              │
│ ↓                           │
│ Transactions / Rules / CSV  │
│ Gmail / Settlement / Home   │
│ Analytics / Goals / Budget  │
└──────────────┬──────────────┘
               │ SpreadsheetApp
               ▼
┌─────────────────────────────┐
│ Google Sheets               │
│ Master / Transaction /      │
│ Import History / Summary    │
└─────────────────────────────┘

外部入力:
Gmail ───────► GAS Gmail Import
CSV ─Flutter► GAS CSV Import
```

### 設計上の特徴

-   **Flutterは表示・操作担当**
-   **GASが実質的なBackend / Domain Service**
-   **Google SheetsがDB兼マスタ兼集計保存先**
-   分類・照合・集計など重要なロジックはGAS側に寄っている
-   FlutterはServiceを介してactionベースのAPIを呼ぶ
-   集計は `R_MonthlySummary` / `R_CategorySummary` にキャッシュ的に保持
-   HomeやAnalyticsにもGAS側キャッシュがある

------------------------------------------------------------------------

## 3. Flutter構成

現行Flutterは **62 Dartファイル**。

### 主要Core

  パス                                             役割
  ------------------------------------------------ ---------------------------
  `lib/main.dart`                                  エントリポイント
  `lib/app.dart`                                   `NeruNexusApp`
  `lib/features/app_shell.dart`                    6タブのメインNavigation
  `lib/core/network/api_client.dart`               GAS API共通通信
  `lib/core/constants/api_constants.dart`          Web App URL / API認証設定
  `lib/core/master/master_repository.dart`         Master取得窓口
  `lib/core/master/master_cache.dart`              Masterキャッシュ
  `lib/core/refresh/app_refresh_controller.dart`   画面間更新通知
  `lib/core/theme/app_theme.dart`                  Theme

### メインタブ

`AppShell` は `IndexedStack` で次の6画面を保持。

1.  Home
2.  取引
3.  取込
4.  分析
5.  資産
6.  設定

### Feature別実装

#### Home

-   `home_page.dart`
-   `home_model.dart`
-   `home_service.dart`
-   `money_card.dart`
-   `health_card.dart`
-   `recent_transaction_card.dart`

現在のHomeは単純な支出表示ではなく、GAS側のMoney
Allocationロジックを利用して、
「あと使えるお金」「資金余力」「生活防衛資金」「直近取引」等を表示する構造。

#### Transactions

-   一覧
-   詳細
-   追加/編集フォーム
-   無視取引一覧
-   Gmail Import Status
-   `TransactionService`

取引管理は現行アプリの中心。手入力も既に実装されている。

#### Import

-   CSVファイル選択
-   CSV取込
-   Import History
-   取込結果から追加取引一覧へ遷移

#### Analytics

-   月次分析
-   支出カテゴリ円グラフ
-   月次推移グラフ
-   Summary SheetをGAS経由で利用

#### Accounts

-   口座一覧
-   口座追加
-   口座編集
-   残高
-   opening balance
-   カード締日/支払日等

#### Categories

-   カテゴリ追加
-   編集
-   無効化
-   IDベースのカテゴリマスタ

#### Review

-   要確認取引
-   Rule追加・分類反映のBackendと連携

#### Settlement

-   クレカ照合状態
-   手動照合
-   手動解除

#### Goals

-   目標作成・更新・無効化
-   将来支出/資金目標管理

#### Budget

現行は以下の5項目。

-   給与予定
-   副業予定
-   NISA積立
-   固定費予算
-   変動費予算

旧 `貯金目標` / `夢積立` は撤去済み。

------------------------------------------------------------------------

## 4. GAS構成

現行GASは **30 `.gs` ファイル**。

### `00_config.gs`

-   定数/設定ファイル

### `01_sheet.gs`

-   `getRequiredSheet()`
-   `getValues()`
-   `createHeaderIndex()`
-   `assertRequiredColumns()`
-   `loadTable()`
-   `isIgnoredTransactionRow_()`
-   `rowToObject()`
-   `tableValuesToObjects()`
-   `loadObjects()`
-   `writeTable()`
-   `clearTableCache()`

### `02_utils.gs`

-   `normalizeYearMonth()`
-   `getString()`
-   `getNumber()`
-   `parseAmount()`
-   `formatApiDate_()`

### `04_rules.gs`

-   `normalizeTextForRule()`
-   `getRules()`
-   `matchRule()`
-   `buildClassification()`
-   `createDefaultClassification()`
-   `classifyTransaction()`
-   `isRuleMatched()`
-   `classifyMoneyTransaction()`
-   `detectBankElectronicMoneyCharge_()`
-   `detectBankDepositType_()`
-   `classifyPayPayTransaction_()`
-   `guessPurposeType()`
-   `guessExpenseRatio()`
-   `guessIntent()`

### `05_transactions.gs`

-   `loadTransactions()`
-   `findTransactionById_()`
-   `buildTransactionRow()`
-   `resolveTransactionYearMonth()`
-   `buildDuplicateKey()`
-   `normalizeDuplicateDate_()`
-   `getExistingDuplicateKeyCounts()`
-   `normalizeMerchant()`
-   `normalizeTextBase()`
-   `loadMerchantAliases()`
-   `applyMerchantAlias()`
-   `appendTransactionRows()`
-   `addTransactions()`
-   `createTransactionFromApp_()`
-   `updateTransactionFromApp_()`
-   `deleteTransactionFromApp_()`
-   `getTransactionsData()`

### `06_review.gs`

-   `getNextRulePriority_()`
-   `buildRuleRow_()`
-   `appendRules_()`
-   `addRuleFromTransaction_()`
-   `applyRuleToPendingTransactions_()`
-   `getReviewTransactionsData()`
-   `getReviewTransactionCount()`

### `07_dashboard.gs`

-   `rebuildAllViews()`
-   `isFixedExpenseCategory()`
-   `calculateAvailableMoney_()`
-   `calculateDailyBudget_()`
-   `calculateMoneyHealth_()`
-   `getHomeRecentTransactions_()`
-   `clearHomeRecentTransactionsCache_()`
-   `getFinancialSettings_()`
-   `calculateBaselineEssentialLivingCost_()`
-   `calculateEmergencyFundStatus_()`
-   `calculateProtectedCash_()`
-   `calculateUpcomingCardPayments_()`
-   `calculateCashNeededUntilNextPayday_()`
-   `createSafeMonthlyDate_()`
-   `getHomeData()`

### `08_budget.gs`

-   `loadBudgetTable_()`
-   `normalizeBudgetYearMonth()`
-   `getBudgetsForMonth()`
-   `getBudgetSettings()`
-   `updateBudgetSettingsFromApp_()`
-   `getLatestBudgetMonth()`

### `09_analytics.gs`

-   `getAnalyticsData()`
-   `normalizeYearMonth_()`

### `10_csv_import.gs`

-   `detectCsvTypeFromRows()`
-   `convertOliveRowsWithoutHeader()`
-   `getImportConfig()`
-   `getConfigNameByCsvType()`
-   `shouldIgnoreCsvRow_()`
-   `normalizeCsvRowByHeader()`
-   `importCsvFromApp_()`
-   `readCsvRowsFromText_()`
-   `importParsedCsvRows_()`

### `11_discord.gs`

-   `createDiscordTransaction_()`

### `12_summary.gs`

-   `createMonthlySummary_()`
-   `aggregateTransactionSummaries_()`
-   `buildMonthlySummaryRows_()`
-   `buildCategorySummaryRows_()`
-   `rebuildSummaries()`
-   `rebuildSummariesForMonth_()`
-   `replaceSummaryMonth_()`
-   `getDirtySummaryMonths_()`
-   `markSummaryDirty_()`
-   `clearSummaryDirty_()`
-   `ensureSummaryFresh_()`
-   `loadAnalyticsMonthlySummary_()`
-   `loadAnalyticsCategorySummary_()`
-   `clearAnalyticsSummaryCache_()`

### `13_api.gs`

-   `getApiKey_()`
-   `isApiAuthorized_()`
-   `createJsonResponse_()`
-   `createJsonErrorResponse_()`
-   `doGet()`
-   `doPost()`

### `14_categories.gs`

-   `getCategoriesData()`
-   `createCategoryFromApp_()`
-   `deactivateCategoryFromApp_()`
-   `updateCategoryFromApp_()`
-   `renameCategoryInTransactions_()`
-   `toBoolean_()`
-   `createNextCategoryId_()`

### `15_accounts.gs`

-   `createAccountFromApp_()`
-   `updateAccountFromApp_()`
-   `renameAccountInTransactions_()`
-   `deactivateAccountFromApp_()`
-   `getAccountsData_()`
-   `getAccountBalancesData_()`
-   `buildAccountBalanceResult_()`
-   `updateAccountOpeningBalanceFromApp_()`
-   `getAccountBillingSettings_()`
-   `calculateBillingYearMonth_()`
-   `getImportBillingYearMonths_()`
-   `getAccountBalancesData()`
-   `clearAccountBalanceCache_()`

### `16_master.gs`

-   `getMasterData()`
-   `buildTransactionTypes_()`

### `17_money_allocation.gs`

-   `getLiquidCashBalance_()`
-   `calculateMonthlyFreeCash_()`
-   `calculateGoalMonthlyAllocation_()`
-   `calculateMonthlyMoneyAllocation_()`

### `18_import_history.gs`

-   `addImportHistory_()`
-   `getImportPeriod_()`
-   `normalizeImportDate_()`
-   `getImportHistoryData_()`
-   `formatApiDateTime_()`

### `19_card_settlement.gs`

-   `reconcileCardSettlementForBatch_()`
-   `reconcilePendingCardSettlements_()`
-   `writeSettlementTransactionValues_()`
-   `normalizeSettlementDate_()`
-   `confirmSettlementManually_()`
-   `cancelSettlementManualMatch_()`
-   `getSettlementStatusesData_()`
-   `perfMark_()`
-   `buildAccountBillingSettingsMap_()`
-   `calculateBillingYearMonthFromSettings_()`
-   `getSettlementCandidatesData()`

### `20_account_resolution.gs`

-   `getAccountAliases_()`
-   `resolveAccountFromAliases_()`
-   `resolveCreditCardAccount_()`
-   `applyTransferMetadata_()`
-   `resolveTransferDestinationAccount_()`
-   `resolveCanonicalAccountName_()`

### `21_olive_special.gs`

-   `reconcileOliveEarlyRepayments_()`
-   `resolveEarlyRepaymentDate_()`
-   `analyzeOliveEarlyRepaymentCsv_()`
-   `diffDateDays_()`

### `22_goals.gs`

-   `createGoalFromApp_()`
-   `updateGoalFromApp_()`
-   `deactivateGoalFromApp_()`
-   `normalizeGoalDate_()`
-   `getGoalsData()`

### `23_recurring.gs`

-   `buildRecurringCandidateMap_()`
-   `buildRecurringCandidateRows_()`
-   `rebuildRecurringCandidates()`

### `50_gmail_import.gs`

-   `getGmailTransactionCandidates_()`
-   `importGmailTransactions()`
-   `buildTransactionFromGmailItem_()`
-   `buildSmbcGmailTransaction_()`
-   `filterGmailTransactionsForImport_()`
-   `installGmailImportTrigger()`
-   `removeGmailImportTrigger()`

### `51_gmail_parser.gs`

-   `parseGmailPreliminaryMessage_()`
-   `parseOliveCardMail_()`
-   `parseSmbcDepositMail_()`
-   `parseSmbcWithdrawalMail_()`
-   `normalizeGmailBody_()`
-   `parseGmailAmount_()`

### `52_gmail_reconcile.gs`

-   `normalizeMerchantForReconcile_()`
-   `merchantSimilarityScore_()`
-   `reconcileGmailPreliminaryWithFormalCsv_()`
-   `preserveEditedGmailFields_()`

### `53_gmail_management.gs`

-   `confirmPreliminaryTransactionFromApp_()`
-   `restoreIgnoredTransactionFromApp_()`
-   `getIgnoredTransactionsData()`
-   `saveGmailImportStatus_()`
-   `getGmailImportStatus_()`
-   `ignoreTransactionFromApp_()`

### `98_maintenance.gs`

-   `resetTransactionsForProduction()`
-   `clearGeneratedSheetRows_()`
-   `resetTransactionDataForReimport()`
-   `reclassifyAllTransactions()`
-   `normalizeAllTransactions()`
-   `normalizeAllTransactionsWithAlias()`
-   `buildMerchantFrequencyMap()`
-   `validateTransactionAccounts()`
-   `reclassifyExistingPayPayTransactions()`
-   `previewSpreadsheetMasterCleanup()`
-   `executeSpreadsheetMasterCleanup()`
-   `buildCategoryCleanupKey_()`
-   `buildRuleCleanupSignature_()`
-   `createSpreadsheetCleanupBackup_()`
-   `previewSpreadsheetCleanup3()`
-   `executeSpreadsheetCleanup3()`
-   `buildSpreadsheetCleanup3TransactionPreview_()`
-   `rowValuesWidth_()`
-   `previewSpreadsheetCleanup4()`
-   `executeSpreadsheetCleanup4()`
-   `previewSpreadsheetCleanup5()`
-   `executeSpreadsheetCleanup5()`
-   `previewLegacyBudgetCleanup6()`
-   `executeLegacyBudgetCleanup6()`

### `99_manual_tests.gs`

-   `testDoPostCash()`
-   `testDoPostMemo()`
-   `testCreateTransactionFromApp()`
-   `testCreateCategoryFromApp()`
-   `testUpdateCategoryFromApp()`
-   `testClearAnalyticsCache()`
-   `testExistingOliveCsvVsGmail()`
-   `testOliveEarlyRepaymentParsedRows()`
-   `testGmailPreliminaryImport()`
-   `testParseGmailMessages_()`
-   `testListVpassMails()`
-   `testShowOliveMailBody()`
-   `testAddGmailPreliminaryTransaction()`

### `99_tests.gs`

-   `testLoadTable()`
-   `testObjectLoaders()`
-   `testClassifyMoneyTransaction()`
-   `testOliveCsvTypeMapping()`
-   `testAccess()`
-   `testGetHomeData()`
-   `testGetTransactionsData()`
-   `testGetAnalyticsData()`
-   `testGetCategoriesData()`
-   `testGetMasterData()`
-   `testGmailClassificationSummary()`
-   `testGmailFormalReconcileDryRun()`
-   `testPreliminaryEditedPreservation()`
-   `testIgnoredTransactionExclusion()`
-   `testBackfillExistingGmailFormalMatches()`
-   `testGetGmailImportStatus()`
-   `testGetBudgetSettings()`
-   `testGmailImportDryRun()`
-   `testGmailImportDryRunSummary()`
-   `runRegressionTests()`
-   `testAccountBalancesSafe()`
-   `testSettlementStatusesSafe()`
-   `testCsvCoreSafe()`
-   `testCleanup7CategorySpecification()`
-   `testCleanup7GuessMetadata()`

### GASの責務分割

現在はファイル番号ごとに概ね責務が分離されている。

-   `00–04`: 設定 / Sheet I/O / Utils / Rules
-   `05–09`: Transactions / Review / Home / Budget / Analytics
-   `10–12`: CSV / 外部入力 / Summary
-   `13–22`: API / Categories / Accounts / Master / Money Allocation /
    Import History / Settlement / Goals
-   `23`: Recurring候補
-   `50–53`: Gmail速報取込・解析・正式CSV照合・管理
-   `98`: Maintenance
-   `99`: Regression / Manual tests

cleanup前より責務境界はかなり明確。

------------------------------------------------------------------------

## 5. API

GAS Web Appは `doGet` / `doPost` の **action文字列ルーティング**。

### GET系

-   `home`
-   `analytics`
-   `health`
-   `transactions`
-   `ignored_transactions`
-   `categories`
-   `budget_settings`
-   `import_history`
-   `master`
-   `account_balances`
-   `review_transactions`
-   `review_count`
-   `settlement_candidates`
-   `settlement_statuses`
-   `goals`
-   `gmail_import_status`

### POST系

-   `transaction_create`
-   `transaction_update`
-   `transaction_delete`
-   `transaction_manual_confirm`
-   `transaction_restore_ignored`
-   `csv_import`
-   `discord_transaction`
-   `category_create`
-   `category_update`
-   `category_deactivate`
-   `settlement_confirm`
-   `settlement_manual_match`
-   `settlement_manual_unmatch`
-   `update_account_opening_balance`
-   `account_create`
-   `account_update`
-   `account_deactivate`
-   `budget_settings_update`
-   `goal_create`
-   `goal_update`
-   `goal_deactivate`
-   `transaction_ignore`

### Flutterから現在呼ばれているaction

-   `account_balances` ---
    `lib/features/accounts/service/account_balance_service.dart`
-   `account_create` ---
    `lib/features/accounts/service/account_balance_service.dart`
-   `account_deactivate` ---
    `lib/features/accounts/service/account_balance_service.dart`
-   `account_update` ---
    `lib/features/accounts/service/account_balance_service.dart`
-   `analytics` ---
    `lib/features/analytics/service/analytics_service.dart`
-   `budget_settings` ---
    `lib/features/budget/service/budget_service.dart`
-   `budget_settings_update` ---
    `lib/features/budget/service/budget_service.dart`
-   `category_create` ---
    `lib/features/categories/service/category_service.dart`
-   `category_deactivate` ---
    `lib/features/categories/service/category_service.dart`
-   `category_update` ---
    `lib/features/categories/service/category_service.dart`
-   `csv_import` --- `lib/features/import/service/import_service.dart`
-   `gmail_import_status` ---
    `lib/features/transactions/service/transaction_service.dart`
-   `goal_create` --- `lib/features/goals/service/goal_service.dart`
-   `goal_deactivate` --- `lib/features/goals/service/goal_service.dart`
-   `goal_update` --- `lib/features/goals/service/goal_service.dart`
-   `goals` --- `lib/features/goals/service/goal_service.dart`
-   `home` --- `lib/features/home/service/home_service.dart`
-   `ignored_transactions` ---
    `lib/features/transactions/service/transaction_service.dart`
-   `import_history` ---
    `lib/features/import/service/import_history_service.dart`
-   `master` --- `lib/features/master/service/master_service.dart`
-   `review_count` --- `lib/features/review/service/review_service.dart`
-   `review_transactions` ---
    `lib/features/review/service/review_service.dart`
-   `settlement_candidates` ---
    `lib/features/transactions/service/transaction_service.dart`
-   `settlement_confirm` ---
    `lib/features/transactions/service/transaction_service.dart`
-   `settlement_manual_match` ---
    `lib/features/settlement/service/settlement_service.dart`
-   `settlement_manual_unmatch` ---
    `lib/features/settlement/service/settlement_service.dart`
-   `settlement_statuses` ---
    `lib/features/settlement/service/settlement_service.dart`
-   `transaction_create` ---
    `lib/features/transactions/service/transaction_service.dart`
-   `transaction_delete` ---
    `lib/features/transactions/service/transaction_service.dart`
-   `transaction_ignore` ---
    `lib/features/transactions/service/transaction_service.dart`
-   `transaction_manual_confirm` ---
    `lib/features/transactions/service/transaction_service.dart`
-   `transaction_restore_ignored` ---
    `lib/features/transactions/service/transaction_service.dart`
-   `transaction_update` ---
    `lib/features/transactions/service/transaction_service.dart`
-   `transactions` ---
    `lib/features/transactions/service/transaction_service.dart`
-   `update_account_opening_balance` ---
    `lib/features/accounts/service/account_balance_service.dart`

### Flutterから直接呼ばれていないGAS action

-   `health`
-   `categories`
-   `discord_transaction`

これらは即削除対象とは限らない。`discord_transaction`
のような外部連携、Master経由に統合されたもの、診断/互換用途が含まれるため、Ver.1確定時に「公開APIとして残すか」を決める。

------------------------------------------------------------------------

## 6. Google Sheets構成

現行ブックは **17シート**。

### `M_Accounts`

-   データ行数: 約 13
-   列: `account_id`, `account_name`, `payment_method`, `wallet`,
    `institution`, `is_asset`, `is_liability`, `active`, `note`,
    `sort_order`, `opening_balance`, `opening_balance_date`,
    `closing_day`, `payment_day`, `payment_month_offset`, `asset_type`

### `M_AccountAlias`

-   データ行数: 約 12
-   列: `raw_account_name`, `canonical_account_name`

### `M_Budgets`

-   データ行数: 約 5
-   列: `year_month`, `item`, `value`

### `M_Categories`

-   データ行数: 約 87
-   列: `type`, `major_category_id`, `major_category`,
    `sub_category_id`, `sub_category`, `is_expense_target`, `active`,
    `sort_order`, `note`, `essential`

### `M_ImportConfig`

-   データ行数: 約 8
-   列: `config_name`, `csv_type`, `date_col`, `merchant_col`,
    `item_col`, `amount_col`, `note_col`, `source_type`,
    `payment_method`, `account_name`, `amount_sign`, `active`

### `M_MerchantAlias`

-   データ行数: 約 18
-   列: `raw_name`, `canonical_name`

### `M_Rules`

-   データ行数: 約 140
-   列: `priority`, `match_target`, `keyword`, `rule_type`,
    `type_result`, `major_category`, `sub_category`, `purpose_type`,
    `expense_ratio`, `status_result`, `note`, `wallet_result`,
    `intent_result`

### `M_Goals`

-   データ行数: 約 3
-   列: `goal_id`, `goal_name`, `goal_type`, `target_amount`,
    `target_date`, `certainty`, `reserved_cash`, `priority`, `active`,
    `note`

### `M_FinancialSettings`

-   データ行数: 約 8
-   列: `setting_key`, `setting_value`, `note`

### `T_Transactions`

-   データ行数: 約 385
-   列: `id`, `transaction_date`, `recorded_at`, `year_month`, `type`,
    `source_type`, `payment_method`, `account_name`, `merchant`,
    `item_name`, `raw_text`, `amount`, `major_category`, `sub_category`,
    `purpose_type`, `expense_ratio`, `expense_amount`, `note`,
    `evidence_url`, `original_image_url`, `import_batch`,
    `duplicate_key`, `status`, `wallet`, `intent`, `from_account`,
    `to_account`, `settlement_status`, `settlement_id`, `source_id`,
    `source_status`, `source_received_at`

### `T_RecurringCandidates`

-   データ行数: 約 0
-   列: `merchant`, `amount`, `month_count`, `first_month`,
    `last_month`, `avg_amount`, `category`, `status`, `note`

### `T_ImportHistory`

-   データ行数: 約 23
-   列: `import_batch`, `imported_at`, `csv_type`, `config_name`,
    `account_name`, `file_name`, `target_year_month`, `period_start`,
    `period_end`, `row_count`, `added_count`, `skipped_count`,
    `ignored_count`, `status`, `billing_year_month`,
    `billing_year_months`

### `R_CategorySummary`

-   データ行数: 約 34
-   列: `year_month`, `major_category`, `total_amount`,
    `count_transactions`

### `R_MonthlySummary`

-   データ行数: 約 8
-   列: `year_month`, `total_expense`, `total_income`, `total_discount`,
    `total_transfer`, `total_business_expense`, `net_expense`,
    `count_transactions`, `fixed_expense`, `variable_expense`,
    `business_income`, `business_expense`, `business_profit`

### `project_todo`

-   データ行数: 約 12
-   列: `id`, `title`, `priority`, `status`, `category`, `description`,
    `trigger`, `dependencies`, `notes`

### `毎月のお金`

-   データ行数: 約 0
-   ヘッダーなし/補助シート

### `いずれかかるお金`

-   データ行数: 約 10
-   列: `結婚費用`, `5200000.0`

### システム本体が利用する主要14シート

**Master** - `M_Accounts` - `M_AccountAlias` - `M_Budgets` -
`M_Categories` - `M_ImportConfig` - `M_MerchantAlias` - `M_Rules` -
`M_Goals` - `M_FinancialSettings`

**Transaction** - `T_Transactions` - `T_RecurringCandidates` -
`T_ImportHistory`

**Report** - `R_CategorySummary` - `R_MonthlySummary`

### 補助/人間用シート

-   `project_todo`
-   `毎月のお金`
-   `いずれかかるお金`

この3枚は現行GASの `SHEETS`
定数には含まれず、アプリ本体DBとは別物として扱うべき。

------------------------------------------------------------------------

## 7. 中心データモデル

### `T_Transactions`

現在のTransactionは単なる家計簿行ではなく、入力元・分類・照合状態まで持つ。

主なグループ:

**Identity / Date** - id - transaction_date - recorded_at - year_month

**Source** - source_type - source_id - source_status -
source_received_at - import_batch

**Payment** - payment_method - account_name

**Description** - merchant - item_name - raw_text - note

**Money** - amount - expense_ratio - expense_amount

**Classification** - type - major_category - sub_category -
purpose_type - wallet - intent - status

**Transfer / Settlement** - from_account - to_account -
settlement_status - settlement_id

**Evidence** - evidence_url - original_image_url

**Duplicate** - duplicate_key

この設計により、CSV・Gmail速報・手入力を同じTransactionへ統合できている。

------------------------------------------------------------------------

## 8. データフロー

### 8.1 手入力

``` text
Flutter TransactionForm
→ transaction_create / transaction_update
→ GAS create/update
→ T_Transactions
→ Summary dirty
→ Home/Analytics再計算
```

### 8.2 CSV

``` text
Flutter FilePicker
→ csv_import
→ CSV type判定
→ M_ImportConfig
→ normalize
→ Rules分類
→ duplicate判定
→ T_Transactions
→ T_ImportHistory
→ Card Settlement / Gmail正式照合
→ Summary dirty
```

### 8.3 Gmail速報

``` text
Gmail Trigger
→ Gmail parser
→ Olive / SMBC message parse
→ preliminary Transaction生成
→ duplicate/filter
→ T_Transactions
→ Gmail import status保存
```

### 8.4 Gmail速報 → 正式CSV

``` text
Gmail preliminary
        │
        ▼
T_Transactions
        │
正式CSV ─────► reconcile
        │
        ├─ 一致 → 正式情報へ更新
        ├─ ユーザー編集済み項目 → preserve
        └─ 不一致 → review
```

この「速報→正式確定」の仕組みはNeru Nexusの重要な独自部分。

### 8.5 クレカ引落

カード利用Transactionと銀行側引落をSettlementロジックで結び、
二重に支出として数えない設計。

------------------------------------------------------------------------

## 9. 分類システム

分類の中心は `M_Rules` と `04_rules.gs`。

Ruleは、

-   priority
-   match_target
-   keyword
-   rule_type
-   type_result
-   major_category
-   sub_category
-   purpose_type
-   expense_ratio
-   status_result
-   wallet_result
-   intent_result

を持つ。

Ruleに一致しない場合はDefault Classification /
guess系metadataへフォールバック。

カテゴリは `M_Categories`
でIDを持つが、Transaction本体は現状カテゴリ名も保持する構造。カテゴリrename時には既存Transactionへ反映する処理がある。

------------------------------------------------------------------------

## 10. Home / Money Allocation

Homeは `07_dashboard.gs` + `17_money_allocation.gs` が中心。

現在確認できるロジック:

-   あと使えるお金
-   日次予算
-   Money Health
-   直近取引
-   基準生活費
-   生活防衛資金
-   Protected Cash
-   今後のカード支払
-   次回給与日まで必要な現金
-   Liquid Cash
-   月間Free Cash
-   Goalへの月次Allocation
-   Money Allocation

`M_FinancialSettings` に現在ある設定:

-   emergency_fund_months = 6
-   base_nisa_monthly = 20,000
-   min_cash_months = 1
-   cash_heavy_until_months = 3
-   balanced_until_months = 6
-   goal_safety_months = 6
-   forecast_months = 36
-   payday_day = 25

------------------------------------------------------------------------

## 11. キャッシュ / 性能

実装済み:

-   Sheet table cache
-   Account balance cache
-   Home recent transactions cache
-   Analytics summary cache
-   Master cache（Flutter）
-   Summary dirty方式

特にSummaryを毎回全Transactionから再集計せず、
変更月だけdirtyにして再生成する方向へ整理済み。

------------------------------------------------------------------------

## 12. テスト

### GAS

`runRegressionTests()` を中心に回帰テストが存在。

確認対象には以下が含まれる。

-   Sheet/Object Loader
-   Classification
-   Olive CSV mapping
-   Home
-   Transactions
-   Analytics
-   Categories
-   Master
-   Gmail classification
-   Gmail formal reconcile
-   edited field preservation
-   ignored transaction
-   Gmail status
-   Budget
-   Account balances
-   Settlement
-   CSV core
-   category specification / metadata

さらに `99_manual_tests.gs` に、書込や実Gmailを伴う手動診断を分離済み。

### Flutter

現行 `test/widget_test.dart` は、

-   `NeruNexusApp` がbuildできる

というSmoke Testのみ。

**ここは現状の大きなテスト不足ポイント。**

------------------------------------------------------------------------

# 13. 全体監査で判明した問題点

## P0: Ver.1前に直したい

### 13.1 Flutter API keyがアプリ内に静的埋め込み

`ApiConstants` にWeb App URLとAPI keyが定数として入っている。

個人利用では即座に致命傷ではないが、APKを配布する場合、このkeyは「秘密」としては機能しない。

**対応方針** - Ver.1を完全個人利用に限定するならリスク受容可能 -
外部配布するなら認証方式を再設計 - 少なくともkeyを「秘密鍵」と見なさない

### 13.2 Flutter自動テストがほぼない

GASは回帰テストが育った一方、Flutterはbuild smokeのみ。

Service共通化やModel変更でAPI契約を壊しても、`flutter analyze`
だけでは検出できない。

**最低限追加したい** - Model JSON parse tests - ApiClient response
handling tests - TransactionService request/response tests - HomeModel
tests - ImportHistoryModel tests - BudgetModel tests

### 13.3 `project_todo` が現状と大きくズレている

例: - 「手入力フォーム Todo」→ 既に実装済み - 「Flutterアプリ化 Todo」→
既に実装済み - 「資産管理画面 Todo」→ 既に実装済み

このシートをロードマップとして使うと判断を誤る。

**対応:** 今回のロードマップへ置換するか、シート自体を更新。

------------------------------------------------------------------------

## P1: Ver.1完成度に直結

### 13.4 RecurringはBackendだけ先行

`23_recurring.gs` と `T_RecurringCandidates` は存在するが、
現行FlutterにRecurring管理画面はない。

現シートも実質空。

つまり「定期支払い検知」は**基礎コードあり・製品機能未完成**。

### 13.5 Import Historyに旧互換列が残る

`T_ImportHistory` に

-   `billing_year_month`
-   `billing_year_months`

が共存。

Flutterは複数形側を現役利用する方向へ整理済み。
単数形はGAS互換性を最終確認後、削除候補。

### 13.6 API actionが文字列契約

FlutterとGASが `transaction_create` 等の文字列で結合。

メリットは単純さ。
一方でrenameやresponse変更をコンパイル時に検出できない。

現規模なら維持可能だが、**API契約テスト**を追加した方が安全。

### 13.7 Sheets DBのスケール限界

現在の個人家計用途なら十分現実的。
ただしTransactionが数万～数十万行へ伸びると、

-   全表読み込み
-   filter
-   append/update
-   Spreadsheet API latency
-   GAS実行時間

がボトルネックになる。

今すぐDB移行する必要はない。
**「遅くなったら移行」できるようRepository境界を崩さないことが重要。**

------------------------------------------------------------------------

## P2: 品質・保守性

### 13.8 Maintenance関数が本番ソースに多い

`98_maintenance.gs` にcleanup migrationまで残っている。

cleanupが確定した後は、
過去cleanup関数を本番デプロイ対象から外す/履歴へ移す余地がある。

### 13.9 公開APIの棚卸し余地

GASにはFlutterから直接呼ばれないactionがある。

特に - health - categories - discord_transaction

などは用途を明文化しておく。

### 13.10 CategoryはIDと名称が混在

MasterはIDを持つ一方、Transaction/Ruleにはカテゴリ名が強く残る。

現状rename propagationで成立しているが、
将来的にはTransaction側もcategory ID中心にすると整合性は強くなる。

ただしこれは**Ver.1後の大改修候補**。今やると影響が大きい。

### 13.11 補助シートとアプリDBが同じWorkbook

`project_todo` / `毎月のお金` / `いずれかかるお金` はアプリDBではない。

人間用メモとして便利だが、DBシートと同居しているため境界が曖昧。

名前に `DOC_` / `PLAN_` を付ける、別Workbookへ分ける等は将来候補。

### 13.12 空ファイル残骸

最新版ZIPには0 byteの

-   `lib/features/categories/model/category_model.dart`
-   `lib/features/home/widgets/section_title.dart`

が残っている。

機能影響はないが、Cleanup
7で削除対象だったものなので、次回ZIP作成時に除去してよい。

------------------------------------------------------------------------

# 14. 現在の機能完成度

  機能                状態              判定
  ------------------- ----------------- ----------------------
  Flutter基本UI       実装済み          完成
  取引一覧            実装済み          完成度高
  手入力              実装済み          完成度高
  編集/削除           実装済み          完成度高
  カテゴリ管理        実装済み          完成度高
  Rules分類           実装済み          継続改善
  要確認              実装済み          完成度高
  CSV取込             実装済み          対応金融機関拡張余地
  Import History      実装済み          旧列整理余地
  Gmail速報           実装済み          実運用検証継続
  Gmail→正式CSV照合   実装済み          重要・実運用検証
  クレカSettlement    実装済み          実運用検証継続
  Home                実装済み          ロジック調整フェーズ
  Analytics           実装済み          拡張余地
  資産/口座管理       実装済み          拡張余地
  Goals               実装済み          Home連携あり
  Budget              実装済み          旧仕様整理済
  Recurring           Backend一部あり   未完成
  サブスク一覧        未実装            将来
  資産推移            未実装            Ver.1候補
  配信経費レポート    Summary基盤あり   UI未完成
  OCR                 未実装            Ver.1後候補
  AI分類候補          未実装            Ver.1後候補
  確定申告補助        基礎データあり    Ver.1後候補

------------------------------------------------------------------------

# 15. Ver.1完成条件

Ver.1は「考えられる機能を全部入れる」ではなく、 **日常の家計をNeru
Nexusだけで安定運用できること**を完成条件にする。

### 必須

1.  取引の追加・編集・削除が安定
2.  CSV取込が重複なく安定
3.  Gmail速報が二重計上を起こさない
4.  正式CSVで速報を確定できる
5.  クレカ引落が二重支出にならない
6.  要確認をアプリ内で処理できる
7.  Homeの金額が信用できる
8.  Analyticsが月次実績と一致
9.  口座残高が説明可能
10. バックアップ/復旧手順がある
11. Regression + Flutter主要Model/APIテストが通る
12. 日常運用で「スプシを直接直さないと詰む」ケースを極力なくす

------------------------------------------------------------------------

# 16. 推奨ロードマップ

## Phase 0 --- Cleanup確定

**優先度: 最優先 / 短時間**

-   空Dart 2ファイルを削除
-   Cleanup migrationをいつ本番ソースから退役させるか決定
-   `project_todo` を現状へ更新
-   `billing_year_month` の最終撤去可否確認

**完了条件:** 現在の正本が一意。

------------------------------------------------------------------------

## Phase 1 --- 実運用の信頼性完成

**優先度: 最優先**

### 1-1 Gmail速報を実生活で検証

-   Olive利用
-   SMBC入出金
-   重複
-   無視
-   手動修正
-   正式CSV後の確定

### 1-2 CSV正式確定

-   Olive通常
-   Olive早期返済
-   SMBC銀行
-   PayPay
-   セゾン
-   未対応金融機関の必要性確認

### 1-3 Settlement

-   カード利用
-   引落
-   手動match/unmatch
-   月跨ぎ
-   締日/支払日

**完了条件:** 1～2か月の実データで二重計上・取りこぼしがない。

------------------------------------------------------------------------

## Phase 2 --- Home / Money Allocation完成

**優先度: 高**

現在ロジックはかなり実装済みなので、新機能追加より**数字の意味を固定する**。

-   「あと使えるお金」の正式定義
-   固定費/変動費予算との関係
-   NISA積立
-   次回給与
-   カード支払予定
-   生活防衛資金
-   Goal reserve
-   副業利益
-   月末予測

各数字について、 **入力 → 計算式 → Home表示** を仕様書化。

**完了条件:** Homeの各金額を手計算で説明できる。

------------------------------------------------------------------------

## Phase 3 --- Recurring / 固定費

**優先度: 高**

既存 `23_recurring.gs` を活かす。

-   Candidate生成仕様を確定
-   固定費とサブスクを区別するか決定
-   Flutter管理画面
-   候補の承認/無視
-   次月予測への利用

**完了条件:** 毎月発生する支出を自動で認識し、Home予測へ使える。

------------------------------------------------------------------------

## Phase 4 --- 資産管理完成

**優先度: 高**

現行Account Balanceを基礎に、

-   銀行
-   現金
-   証券
-   NISA
-   クレカ負債

を「資産 / 負債 / 純資産」で統合。

追加候補: - 月末Snapshot - 総資産推移 - 現金比率 - 投資比率 -
Goalとの関係

**重要:** `R_MonthlySummary` は収支Summaryであり資産Snapshotではない。
資産推移には別Snapshot設計が必要。

------------------------------------------------------------------------

## Phase 5 --- 配信/副業機能

**優先度: 高**

既に - purpose_type - expense_ratio - business_income -
business_expense - business_profit - 配信カテゴリ

があるため、基礎は揃っている。

実装: - 配信収益 - 配信経費 - 経費率 - 月次/年次利益 - 証憑リンク -
確定申告用Export

**完了条件:** 年末に配信活動の収支をNeru Nexusだけから取り出せる。

------------------------------------------------------------------------

## Phase 6 --- Flutterテスト強化

**優先度: 高**

最低限:

1.  TransactionModel
2.  HomeModel
3.  AnalyticsModel
4.  ImportHistoryModel
5.  AccountBalanceModel
6.  BudgetModel
7.  GoalModel
8.  ApiClient
9.  TransactionService
10. ImportService

の正常系/欠損値/エラーresponseテスト。

その後Widget test: - Transaction Form - Import Result - Budget - Account
edit

**完了条件:** Backendレスポンス変更をCI/テストで検知可能。

------------------------------------------------------------------------

## Phase 7 --- UX / Performance

**優先度: 中**

実データが増えてから計測。

-   Transaction pagination
-   Search/filter performance
-   GAS read/write回数
-   cache hit率
-   CSV取込時間
-   Home初回表示
-   Analytics rebuild時間

**原則:** 体感問題が出る前に大規模DB移行しない。

------------------------------------------------------------------------

## Phase 8 --- Ver.1 Release Hardening

**優先度: 高**

-   バックアップ手順
-   復旧手順
-   GAS deployment手順
-   API version管理
-   Error log
-   Import失敗時の再実行
-   データ整合性check
-   regression一括実行
-   Flutter test
-   flutter analyze
-   本番APK build

ここを通した時点を **Neru Nexus Ver.1完成** とする。

------------------------------------------------------------------------

# 17. Ver.1後ロードマップ

### V1.1候補

-   住信SBI CSV
-   サブスク一覧
-   資産推移グラフ
-   配信経費レポート強化

### V1.2候補

-   Gmail領収書
-   レシートOCR
-   merchant分類候補

### V2候補

-   Category完全ID化
-   API versioning
-   Backend DB移行検討
-   認証再設計
-   AI分類
-   確定申告支援高度化

------------------------------------------------------------------------

# 18. 今やらない方がいいこと

-   「綺麗だから」という理由だけでGASをさらに細分化
-   今すぐGoogle SheetsをDBへ置換
-   Category ID化の全面改修
-   AI分類を先に作る
-   OCRを先に作る
-   Analyticsのグラフ種類を大量追加
-   Homeに指標を増やし続ける

まず**既存の自動取込→分類→確定→集計→資金判断**という一本の流れを完成させる方が価値が高い。

------------------------------------------------------------------------

# 19. 次チャットで最初にやること

推奨開始地点は **Phase 0 → Phase 1**。

新チャットではこの資料を添付し、

> Neru
> Nexus開発の続きです。この引き継ぎ資料を正として進めます。まずPhase
> 0の残件を確認して、その後Phase 1の実運用信頼性完成から進めたい。

で開始すればよい。

コード変更が必要になった時点で、その時点の最新版Flutter/GASを正本として渡す。

------------------------------------------------------------------------

# 20. 正本管理ルール

今後は混乱防止のため、

``` text
Flutter: 日時付きZIP
GAS:     日時付きZIP
Sheets:  日時付きxlsx
Docs:    この引き継ぎ資料
```

を1セットとして扱う。

変更後にテストが通ったものだけ次の正本に昇格。

### Flutter

``` text
flutter pub get
flutter analyze
flutter test
flutter run
```

### GAS

``` text
clasp push
runRegressionTests()
```

### Spreadsheet

-   Migration前バックアップ
-   Migration実行
-   Regression
-   最新xlsx保存

------------------------------------------------------------------------

# 21. 最終評価

現在のNeru Nexusは、基盤を作り直す段階ではない。

**主要なデータモデル・取引処理・分類・CSV・Gmail・Settlement・Home・Analytics・資産・Goalsまで既に繋がっている。**

今後の中心課題は、

1.  実運用で正確性を証明する
2.  HomeのMoney Allocation仕様を固定する
3.  Recurringを製品機能として完成させる
4.  資産Snapshotと副業レポートを完成させる
5.  Flutter自動テストを増やす
6.  Ver.1の運用/復旧手順を固める

こと。

つまり次フェーズは**「機能を作り散らす」から「日常的に信用して使えるVer.1へ仕上げる」フェーズ**。
