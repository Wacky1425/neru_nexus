// ============================================================
// Neru Nexus V2.0-4 - Device pairing authentication
//
// V1 compatibility:
//   apiVersion=1 continues to use the legacy Script Property API key.
//
// V2 canonical auth:
//   1. Run createV204PairingCode() manually in Apps Script.
//   2. Enter the one-time code in the app.
//   3. App exchanges it for a random device token.
//   4. Device token is stored only as a SHA-256 hash server-side.
//   5. Pairing code is one-time and expires after 10 minutes.
//
// Apps Script web-app GET handlers do not expose arbitrary request headers,
// so the v2 token is transported as a request parameter over HTTPS.
// ============================================================

const NERU_AUTH_PAIRING_PROPERTY = "NERU_V2_PAIRING";
const NERU_AUTH_DEVICES_PROPERTY = "NERU_V2_DEVICES";
const NERU_AUTH_PAIRING_TTL_MS = 10 * 60 * 1000;
const NERU_AUTH_DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const NERU_AUTH_MAX_DEVICES = 8;

function sha256Hex_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ""),
    Utilities.Charset.UTF_8,
  );

  return bytes
    .map((byte) => {
      const normalized = byte < 0 ? byte + 256 : byte;
      return normalized.toString(16).padStart(2, "0");
    })
    .join("");
}

function createRandomAuthToken_() {
  return [
    Utilities.getUuid().replace(/-/g, ""),
    Utilities.getUuid().replace(/-/g, ""),
  ].join("");
}

function loadV204Devices_() {
  const raw =
    PropertiesService.getScriptProperties().getProperty(
      NERU_AUTH_DEVICES_PROPERTY,
    );

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    throw new Error("V2端末認証データを読み込めません");
  }
}

function saveV204Devices_(devices) {
  PropertiesService.getScriptProperties().setProperty(
    NERU_AUTH_DEVICES_PROPERTY,
    JSON.stringify(devices || []),
  );
}

function pruneV204Devices_(devices) {
  const now = Date.now();

  return (devices || []).filter((device) => {
    if (!device || device.revoked === true) return false;

    const expiresAtMs = Date.parse(String(device.expiresAt || ""));
    return Number.isFinite(expiresAtMs) && expiresAtMs > now;
  });
}

function createV204PairingCode() {
  const randomHex = Utilities.getUuid().replace(/-/g, "").substring(0, 8);
  const randomValue = parseInt(randomHex, 16);
  const code = String(10000000 + (randomValue % 90000000));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + NERU_AUTH_PAIRING_TTL_MS);

  PropertiesService.getScriptProperties().setProperty(
    NERU_AUTH_PAIRING_PROPERTY,
    JSON.stringify({
      codeHash: sha256Hex_(code),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      used: false,
      failedAttempts: 0,
    }),
  );

  const result = {
    pairingCode: code,
    expiresAt: expiresAt.toISOString(),
    validMinutes: 10,
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyPairingCode_(code) {
  const raw =
    PropertiesService.getScriptProperties().getProperty(
      NERU_AUTH_PAIRING_PROPERTY,
    );

  if (!raw) {
    throw new Error(
      "有効なペアリングコードがありません。createV204PairingCode()を実行してください",
    );
  }

  let pairing;

  try {
    pairing = JSON.parse(raw);
  } catch (error) {
    throw new Error("ペアリング情報が壊れています");
  }

  if (pairing.used === true) {
    throw new Error("このペアリングコードは使用済みです");
  }

  const expiresAtMs = Date.parse(String(pairing.expiresAt || ""));

  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new Error("ペアリングコードの有効期限が切れています");
  }

  if (sha256Hex_(String(code || "").trim()) !== String(pairing.codeHash || "")) {
    const failedAttempts = Number(pairing.failedAttempts || 0) + 1;
    pairing.failedAttempts = failedAttempts;

    if (failedAttempts >= 5) {
      PropertiesService.getScriptProperties().deleteProperty(
        NERU_AUTH_PAIRING_PROPERTY,
      );
      throw new Error(
        "ペアリングコードの入力上限に達しました。新しいコードを発行してください",
      );
    }

    PropertiesService.getScriptProperties().setProperty(
      NERU_AUTH_PAIRING_PROPERTY,
      JSON.stringify(pairing),
    );

    throw new Error(
      `ペアリングコードが正しくありません（残り${5 - failedAttempts}回）`,
    );
  }

  return pairing;
}

function pairV204Device_(data) {
  const pairingCode = String(data.pairingCode || "").trim();
  const deviceName =
    String(data.deviceName || "Neru Nexus Device").trim().slice(0, 80) ||
    "Neru Nexus Device";

  if (!/^\d{8}$/.test(pairingCode)) {
    throw new Error("ペアリングコードは8桁で入力してください");
  }

  verifyPairingCode_(pairingCode);

  const token = createRandomAuthToken_();
  const tokenHash = sha256Hex_(token);
  const deviceId =
    "dev_" + Utilities.getUuid().replace(/-/g, "").substring(0, 16);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + NERU_AUTH_DEVICE_TTL_MS);

  let devices = pruneV204Devices_(loadV204Devices_());

  if (devices.length >= NERU_AUTH_MAX_DEVICES) {
    devices.sort((a, b) =>
      String(a.lastSeenAt || a.createdAt || "").localeCompare(
        String(b.lastSeenAt || b.createdAt || ""),
      ),
    );
    devices = devices.slice(devices.length - NERU_AUTH_MAX_DEVICES + 1);
  }

  devices.push({
    deviceId,
    deviceName,
    tokenHash,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    revoked: false,
  });

  saveV204Devices_(devices);

  PropertiesService.getScriptProperties().deleteProperty(
    NERU_AUTH_PAIRING_PROPERTY,
  );

  return {
    paired: true,
    deviceId,
    deviceName,
    token,
    expiresAt: expiresAt.toISOString(),
  };
}

function authorizeV204Token_(token, options) {
  const settings = options || {};
  const updateLastSeen = settings.updateLastSeen !== false;
  const tokenHash = sha256Hex_(String(token || "").trim());

  if (!token || !tokenHash) {
    return {
      authorized: false,
      reason: "missing_token",
    };
  }

  let devices = loadV204Devices_();
  const now = new Date();
  const nowMs = now.getTime();
  let changed = false;

  for (const device of devices) {
    if (!device || device.revoked === true) continue;

    const expiresAtMs = Date.parse(String(device.expiresAt || ""));

    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
      if (device.tokenHash === tokenHash) {
        return {
          authorized: false,
          reason: "expired_token",
        };
      }
      continue;
    }

    if (String(device.tokenHash || "") !== tokenHash) continue;

    if (updateLastSeen) {
      const lastSeenMs = Date.parse(String(device.lastSeenAt || ""));
      const sixHoursMs = 6 * 60 * 60 * 1000;

      if (!Number.isFinite(lastSeenMs) || nowMs - lastSeenMs >= sixHoursMs) {
        device.lastSeenAt = now.toISOString();

        // Active devices use a sliding 90-day expiration. This avoids routine
        // re-pairing while still expiring abandoned tokens.
        device.expiresAt = new Date(
          nowMs + NERU_AUTH_DEVICE_TTL_MS,
        ).toISOString();

        changed = true;
      }
    }

    if (changed) {
      saveV204Devices_(devices);
    }

    return {
      authorized: true,
      deviceId: String(device.deviceId || ""),
      deviceName: String(device.deviceName || ""),
      expiresAt: String(device.expiresAt || ""),
    };
  }

  return {
    authorized: false,
    reason: "invalid_token",
  };
}

function getV204AuthStatus_(token) {
  const auth = authorizeV204Token_(token);

  if (!auth.authorized) {
    throw new Error("端末認証に失敗しました。再ペアリングしてください");
  }

  return {
    paired: true,
    deviceId: auth.deviceId,
    deviceName: auth.deviceName,
    expiresAt: auth.expiresAt,
  };
}

function revokeV204Device_(token) {
  const tokenHash = sha256Hex_(String(token || "").trim());
  const devices = loadV204Devices_();
  let revoked = false;
  let deviceId = "";

  for (const device of devices) {
    if (String(device.tokenHash || "") !== tokenHash) continue;

    device.revoked = true;
    device.revokedAt = new Date().toISOString();
    revoked = true;
    deviceId = String(device.deviceId || "");
    break;
  }

  if (!revoked) {
    throw new Error("解除対象の端末認証が見つかりません");
  }

  saveV204Devices_(devices);

  return {
    revoked: true,
    deviceId,
  };
}

function isV204AuthorizedRequest_(token) {
  return authorizeV204Token_(token).authorized === true;
}

function verifyV204Auth() {
  const issues = [];

  if (NERU_AUTH_PAIRING_TTL_MS !== 10 * 60 * 1000) {
    issues.push("pairing TTL must be 10 minutes");
  }

  if (NERU_AUTH_DEVICE_TTL_MS <= NERU_AUTH_PAIRING_TTL_MS) {
    issues.push("device TTL must be longer than pairing TTL");
  }

  if (sha256Hex_("Neru Nexus") !== sha256Hex_("Neru Nexus")) {
    issues.push("SHA-256 helper is unstable");
  }

  const sampleToken = createRandomAuthToken_();

  if (sampleToken.length < 64) {
    issues.push("device token is too short");
  }

  const result = {
    ready: issues.length === 0,
    pairingTtlMinutes: NERU_AUTH_PAIRING_TTL_MS / 60000,
    deviceTtlDays: NERU_AUTH_DEVICE_TTL_MS / 86400000,
    maxDevices: NERU_AUTH_MAX_DEVICES,
    issues,
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testV204AuthHelpers_() {
  const digest = sha256Hex_("test");

  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new Error("SHA-256 digest format failed");
  }

  const token = createRandomAuthToken_();

  if (!/^[0-9a-f]{64}$/i.test(token)) {
    throw new Error("random auth token format failed");
  }

  return {
    assertions: "PASS",
  };
}


function listV204Devices() {
  const devices = loadV204Devices_().map((device) => ({
    deviceId: String(device.deviceId || ""),
    deviceName: String(device.deviceName || ""),
    createdAt: String(device.createdAt || ""),
    lastSeenAt: String(device.lastSeenAt || ""),
    expiresAt: String(device.expiresAt || ""),
    revoked: device.revoked === true,
  }));

  Logger.log(JSON.stringify(devices, null, 2));
  return devices;
}

function revokeAllV204Devices() {
  const devices = loadV204Devices_();
  const revokedAt = new Date().toISOString();
  let revokedCount = 0;

  for (const device of devices) {
    if (!device || device.revoked === true) continue;

    device.revoked = true;
    device.revokedAt = revokedAt;
    revokedCount++;
  }

  saveV204Devices_(devices);

  const result = {
    revokedCount,
    revokedAt,
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
