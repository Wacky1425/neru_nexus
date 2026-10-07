function getAppUpdateInfo() {
  return {
    version: "2.2.25",
    buildNumber: 245,
    apkUrl: "https://github.com/Wacky1425/neru_nexus/releases/download/latest/neru-nexus-v2.2.25-245.apk",
    releaseNotes: "V2.2.25: SMBCログイン画面の「普通預金規定」を口座選択と誤認していた自動クリックを削除。認証後の口座選択は画面を特定してから再実装。",
    required: false,
    updatedAt: new Date().toISOString(),
  };
}
