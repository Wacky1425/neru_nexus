# R1 取込監査・重複防止

## 実装内容
- CSV選択時の取込前プレビューAPIを追加。
- 既存Transactionsと同じduplicate keyルールで、新規/既存件数を取込前に算出。
- 完全重複CSVはFlutter側で取込ボタンを無効化し「再取込不要」と表示。
- 一部重複CSVは既存行をスキップし、新規行だけ追加。
- CSV本文SHA-256を`T_ImportHistory.file_hash`へ保存し、同一ファイルの過去取込を検知。
- `duplicate_status`, `existing_count`, `new_count`を履歴へ保存。
- 既存の取込履歴→import_batch単位の取引一覧導線を維持。
- 既存`T_ImportHistory`は列名ベースで書き込み、未知列を壊さない。

## GAS更新後に実行
1. `migrateR1ImportAudit()`
2. `verifyR1ImportAudit()`
3. `runReleaseChecks()`

末尾 `_` の関数は内部helperであり、手動実行しない。
