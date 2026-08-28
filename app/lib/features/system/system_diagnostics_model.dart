class SystemCheckItem {
  const SystemCheckItem({required this.name, required this.ok, required this.detail});
  final String name;
  final bool ok;
  final String detail;

  factory SystemCheckItem.fromJson(Map<String, dynamic> json) => SystemCheckItem(
    name: json['name']?.toString() ?? '',
    ok: json['ok'] == true,
    detail: json['detail']?.toString() ?? '',
  );
}

class SystemErrorLog {
  const SystemErrorLog({required this.loggedAt, required this.action, required this.message});
  final String loggedAt;
  final String action;
  final String message;

  factory SystemErrorLog.fromJson(Map<String, dynamic> json) => SystemErrorLog(
    loggedAt: json['loggedAt']?.toString() ?? '',
    action: json['action']?.toString() ?? '',
    message: json['message']?.toString() ?? '',
  );
}

class SystemDiagnosticsModel {
  const SystemDiagnosticsModel({
    required this.apiVersion,
    required this.integrityOk,
    required this.checks,
    required this.errors,
    required this.warnings,
    required this.latestBackupName,
    required this.latestBackupCreatedAt,
    required this.recentErrors,
  });

  final String apiVersion;
  final bool integrityOk;
  final List<SystemCheckItem> checks;
  final List<String> errors;
  final List<String> warnings;
  final String latestBackupName;
  final String latestBackupCreatedAt;
  final List<SystemErrorLog> recentErrors;

  factory SystemDiagnosticsModel.fromJson(Map<String, dynamic> json) {
    final integrity = json['integrity'] is Map
        ? Map<String, dynamic>.from(json['integrity'] as Map)
        : <String, dynamic>{};
    final latestBackup = json['latestBackup'] is Map
        ? Map<String, dynamic>.from(json['latestBackup'] as Map)
        : <String, dynamic>{};

    return SystemDiagnosticsModel(
      apiVersion: json['apiVersion']?.toString() ?? '',
      integrityOk: integrity['ok'] == true,
      checks: (integrity['checks'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => SystemCheckItem.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      errors: (integrity['errors'] as List? ?? const []).map((e) => e.toString()).toList(),
      warnings: (integrity['warnings'] as List? ?? const []).map((e) => e.toString()).toList(),
      latestBackupName: latestBackup['fileName']?.toString() ?? '',
      latestBackupCreatedAt: latestBackup['createdAt']?.toString() ?? '',
      recentErrors: (json['recentErrors'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => SystemErrorLog.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}
