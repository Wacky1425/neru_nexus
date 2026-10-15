function getAppUpdateInfo() {
  return {
    version: "2.2.30",
    buildNumber: 250,
    apkUrl: "https://github.com/Wacky1425/neru_nexus/releases/download/latest/neru-nexus-v2.2.30-250.apk",
    releaseNotes: "V2.2.30: SMBC自動操作の待機時間を調整。入力後1.5秒待ってログインし、認証後画面も1.5秒待機、明細は3秒待ってから解析。",
    required: false,
    updatedAt: new Date().toISOString(),
  };
}
