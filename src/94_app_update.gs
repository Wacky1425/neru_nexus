function getAppUpdateInfo() {
  return {
    version: "2.2.14",
    buildNumber: 234,
    apkUrl: "https://github.com/Wacky1425/neru_nexus/releases/download/latest/neru-nexus.apk",
    releaseNotes: "V2.2.14: SMBC WebViewのDOM文字列を正しくデコードし、明細構造化・既存取引照合が0件になる問題を修正。",
    required: false,
    updatedAt: new Date().toISOString(),
  };
}
