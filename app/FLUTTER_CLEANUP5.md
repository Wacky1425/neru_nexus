# Flutter Cleanup 5

- TransactionService の GET/POST 通信を ApiClient に統一
- TransactionService 内の http/json/redirect 重複処理を撤去
- IDだけを送る更新系を共通 helper に整理
- TransactionModel 一覧/単体変換 helper を整理
- 既存 action / request body / refresh 挙動は維持
