$ErrorActionPreference = "Stop"

Write-Host "[1/4] flutter pub get"
flutter pub get

Write-Host "[2/4] flutter test"
flutter test

Write-Host "[3/4] flutter analyze"
flutter analyze

Write-Host "[4/4] flutter build apk --release"
flutter build apk --release

Write-Host "Neru Nexus Ver.1 release checks passed."
