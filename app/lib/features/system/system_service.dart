import '../../core/network/api_client.dart';
import 'system_diagnostics_model.dart';

class SystemService {
  const SystemService();

  Future<SystemDiagnosticsModel> fetchDiagnostics() async {
    final data = await ApiClient.get(action: 'system_diagnostics');
    return SystemDiagnosticsModel.fromJson(data);
  }

  Future<Map<String, dynamic>> createBackup() {
    return ApiClient.post(action: 'system_backup_create');
  }

  Future<Map<String, dynamic>> runIntegrityCheck() {
    return ApiClient.post(action: 'system_integrity_check');
  }
}
