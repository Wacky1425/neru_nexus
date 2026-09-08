# Neru Nexus Ver.1 Release Hardening

## Release check
PowerShell from the Flutter project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\release_check.ps1
```

This executes `flutter pub get`, `flutter test`, `flutter analyze`, and `flutter build apk --release`.

## API version
Flutter and GAS use API version `1`. Flutter sends `apiVersion=1` on GET/POST. GAS rejects a different explicit version and returns the server version in the response envelope.

## Backup
GAS function `createNeruNexusBackup_()` copies the entire linked spreadsheet to the Drive folder `Neru Nexus Backups`. The newest 30 copies are retained. Run `setupDailyNeruNexusBackupTrigger_()` once after deployment to create the daily 03:00 backup trigger. `runReleaseChecks()` also installs it.

The app also exposes Settings > System Diagnostics / Backup > Back up now.

## Recovery
1. Open the latest `Neru_Nexus_Backup_yyyyMMdd_HHmmss` in Drive.
2. Compare the damaged production spreadsheet with the backup before changing anything.
3. For full recovery, use the backup spreadsheet as a source and restore affected sheet data into the original linked spreadsheet. Do not casually replace the production spreadsheet ID because the GAS project is linked to it.
4. Run `runDataIntegrityCheck_()` and then `runRegressionTests()`.
5. Open the app and verify Home, Transactions, Analytics, Accounts/Assets, Review, CSV Import, and Settlement.

## GAS deployment
1. Replace the GAS source with this package.
2. Save the project.
3. Run `runReleaseChecks()` once from the GAS editor and confirm no exception.
4. Deploy > Manage deployments > Edit the existing Web App deployment > New version > Deploy.
5. Keep the existing Web App URL. Flutter API v1 does not require a URL change.
6. Open Settings > System Diagnostics and confirm API v1 and Data integrity OK.

## Error logging
Unhandled GET/POST exceptions are written to `T_ErrorLog`, created automatically on first need. The latest entries are visible from System Diagnostics.

## CSV retry
If CSV import fails, the selected bytes remain in the Flutter screen and an explicit `Retry same CSV` button is shown. A successful retry continues to use existing duplicate prevention.
