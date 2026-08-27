# Flutter Cleanup 4

- CategoryService の POST 通信を ApiClient に統一
- AccountBalanceService の GET/POST 通信を ApiClient に統一
- AccountBalanceService の重複レスポンス検証・redirect処理を削除
- SettlementService の手動照合/解除 POST を ApiClient に統一
- SettlementService の性能計測付き fetchStatuses は意図的に現状維持
- TransactionService は規模が大きく独自レスポンス検証も多いため今回は未変更
- 仕様変更なし
