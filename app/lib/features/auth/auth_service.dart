import '../../core/auth/auth_session.dart';
import '../../core/network/api_client.dart';

class DeviceAuthStatus {
  const DeviceAuthStatus({
    required this.paired,
    required this.deviceId,
    required this.deviceName,
    required this.expiresAt,
  });

  final bool paired;
  final String deviceId;
  final String deviceName;
  final String expiresAt;

  factory DeviceAuthStatus.fromJson(Map<String, dynamic> json) {
    return DeviceAuthStatus(
      paired: json['paired'] == true,
      deviceId: json['deviceId']?.toString() ?? '',
      deviceName: json['deviceName']?.toString() ?? '',
      expiresAt: json['expiresAt']?.toString() ?? '',
    );
  }
}

class AuthService {
  const AuthService();

  Future<DeviceAuthStatus> pair({
    required String pairingCode,
    required String deviceName,
  }) async {
    final data = await ApiClient.postPublic(
      action: 'auth_pair',
      body: {
        'pairingCode': pairingCode.trim(),
        'deviceName': deviceName.trim(),
      },
    );

    final token = data['token']?.toString().trim() ?? '';
    final status = DeviceAuthStatus.fromJson(data);

    if (!status.paired || token.isEmpty) {
      throw Exception('端末認証情報を取得できませんでした');
    }

    await AuthSession.save(
      token: token,
      deviceId: status.deviceId,
      deviceName: status.deviceName,
      expiresAt: status.expiresAt,
    );

    return status;
  }

  Future<DeviceAuthStatus> status() async {
    final data = await ApiClient.get(action: 'auth_status');
    final status = DeviceAuthStatus.fromJson(data);

    if (!status.paired) {
      throw Exception('端末認証が無効です');
    }

    await AuthSession.updateMetadata(
      deviceId: status.deviceId,
      deviceName: status.deviceName,
      expiresAt: status.expiresAt,
    );
    AuthSession.authenticated.value = true;

    return status;
  }

  Future<void> revoke() async {
    final data = await ApiClient.post(action: 'auth_revoke');

    if (data['revoked'] != true) {
      throw Exception('端末認証を解除できませんでした');
    }

    await AuthSession.clear();
  }
}
