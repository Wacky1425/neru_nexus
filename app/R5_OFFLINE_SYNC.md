# R5 Offline / Sync Foundation

- GET responses are cached locally with SharedPreferences and used when transport fails.
- Transaction create/update/delete/ignore/manual-confirm/restore operations are queued on transport failure.
- Pending transaction updates/deletes/creates are overlaid onto cached transaction lists after restart.
- The app shell displays a persistent "同期待ち N件" banner with manual retry.
- Any successful GET/POST opportunistically flushes the mutation queue.
- Server/API validation errors are not queued; only transport failures are.

## Scope of R5 v1
This establishes offline-first behavior for the most important mutable domain: Transactions. Other feature writes remain online-only until explicitly migrated to the queue.

## Local-first Fix3 (2026-09-09)

- API GET snapshots and mutation queue moved from SharedPreferences to SQLite (`neru_nexus_local_v1.db`).
- Existing R5 SharedPreferences cache/queue is migrated once so pending edits are not discarded.
- A saved device pairing token can enter the app without an online `auth.status` round trip.
- Pending mutations are retried at shell startup and whenever the app returns to foreground.
- Queue rows are deleted by stable queue ID only after the server accepts the mutation.
- Sync failure reason is shown under the pending-count banner instead of leaving a silent `1件`.
- Ordinary `flutter run`, hot restart, process death and app restart keep the SQLite DB. Uninstall / Android "clear storage" still removes it.

## Fix4 - Offline master warm-up
- AppShell now refreshes the master snapshot opportunistically after startup/resume.
- The master response includes accounts, categories, payment methods, transaction types/statuses and is persisted by the R5 SQLite API cache.
- Therefore, after one successful online launch, opening the transaction form offline no longer depends on having opened that form online beforehand.
- Network failure during warm-up is intentionally ignored; offline startup remains valid.

## Fix7 - optimistic conflict protection

- Transaction list responses include a server-derived `revision` token.
- Offline update/delete queues carry the revision that was visible when editing started.
- GAS recomputes the current revision immediately before update/delete.
- If another device/import changed the row meanwhile, the mutation is rejected as a sync conflict instead of silently overwriting server data.
- The existing R5 queue classifies that server rejection as `needs_attention`, so later valid mutations continue syncing.
- Older cached rows without a revision remain backward-compatible; conflict protection becomes active after the first refreshed transaction fetch following this deployment.
