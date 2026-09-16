# R6 Full Data Reconciliation

R6 adds a go-live audit that combines the existing reliability layers into one screen.

Checks include:
- base data integrity
- category/account ID integrity
- opening balance readiness
- account reconciliation completion and mismatches
- review transactions
- transfer/investment normalization
- card settlement review/pending status
- CSV import history/config presence

`readyForDailyUse` is true only when blocker-level checks are clear. Warnings remain visible but do not by themselves block daily use.

The Flutter screen is available from Assets > 全データ突合.
The GAS API v2 route is `system.reconciliationAudit`.
Manual verification entry point: `verifyR6FullReconciliation()`.

## R6.1 Gmail速報の明細待ち
- `VISA加盟店` のように速報だけでは用途を特定できない Olive 速報は、ユーザーの「要確認」から除外する。
- 速報データ自体は `preliminary` のまま保持し、正式CSV取込時の既存自動照合を継続利用する。
- 過去分も同じ判定で自動的に「明細待ち」として扱うため、1件ずつ手動修正は不要。
- 公開確認関数: `migrateR61PreliminaryDetailWaiting()` / `verifyR61PreliminaryDetailWaiting()`
