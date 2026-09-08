import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthSession {
  AuthSession._();

  static const _tokenKey = 'neru_nexus_v2_device_token';
  static const _deviceIdKey = 'neru_nexus_v2_device_id';
  static const _deviceNameKey = 'neru_nexus_v2_device_name';
  static const _expiresAtKey = 'neru_nexus_v2_device_expires_at';

  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static final ValueNotifier<bool> authenticated = ValueNotifier<bool>(false);

  static bool _initialized = false;
  static String _token = '';
  static String _deviceId = '';
  static String _deviceName = '';
  static String _expiresAt = '';

  static Future<void> initialize() async {
    if (_initialized) return;

    _token = (await _storage.read(key: _tokenKey) ?? '').trim();
    _deviceId = (await _storage.read(key: _deviceIdKey) ?? '').trim();
    _deviceName = (await _storage.read(key: _deviceNameKey) ?? '').trim();
    _expiresAt = (await _storage.read(key: _expiresAtKey) ?? '').trim();
    _initialized = true;
  }

  static Future<String> token() async {
    await initialize();
    return _token;
  }

  static Future<bool> isPaired() async {
    return (await token()).isNotEmpty;
  }

  static String get deviceId => _deviceId;
  static String get deviceName => _deviceName;
  static String get expiresAt => _expiresAt;

  static Future<void> save({
    required String token,
    required String deviceId,
    required String deviceName,
    required String expiresAt,
  }) async {
    final normalizedToken = token.trim();

    if (normalizedToken.isEmpty) {
      throw ArgumentError('端末トークンが空です');
    }

    _token = normalizedToken;
    _deviceId = deviceId.trim();
    _deviceName = deviceName.trim();
    _expiresAt = expiresAt.trim();
    _initialized = true;
    authenticated.value = true;

    await Future.wait([
      _storage.write(key: _tokenKey, value: _token),
      _storage.write(key: _deviceIdKey, value: _deviceId),
      _storage.write(key: _deviceNameKey, value: _deviceName),
      _storage.write(key: _expiresAtKey, value: _expiresAt),
    ]);
  }

  static Future<void> updateMetadata({
    String? deviceId,
    String? deviceName,
    String? expiresAt,
  }) async {
    await initialize();

    if (deviceId != null) {
      _deviceId = deviceId.trim();
      await _storage.write(key: _deviceIdKey, value: _deviceId);
    }

    if (deviceName != null) {
      _deviceName = deviceName.trim();
      await _storage.write(key: _deviceNameKey, value: _deviceName);
    }

    if (expiresAt != null) {
      _expiresAt = expiresAt.trim();
      await _storage.write(key: _expiresAtKey, value: _expiresAt);
    }
  }

  static Future<void> clear() async {
    _token = '';
    _deviceId = '';
    _deviceName = '';
    _expiresAt = '';
    _initialized = true;
    authenticated.value = false;

    await Future.wait([
      _storage.delete(key: _tokenKey),
      _storage.delete(key: _deviceIdKey),
      _storage.delete(key: _deviceNameKey),
      _storage.delete(key: _expiresAtKey),
    ]);
  }
}
