# Flutter Cleanup 3

- MasterService / AnalyticsService / HomeService / ReviewService を共通 ApiClient へ統一。
- 各Serviceに重複していた GET URI構築、API key付与、JSON success/data unwrap、HTTPエラー処理を削除。
- ImportHistoryModel の旧互換フィールド billingYearMonth を削除。現UIは billingYearMonths のみ使用。
- Budgetの「貯金目標」「夢積立」、TransactionService/Account/Settlement/Category の大きな通信整理は今回は未変更。
