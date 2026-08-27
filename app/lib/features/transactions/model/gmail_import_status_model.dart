class GmailImportStatusModel {
  const GmailImportStatusModel({
    required this.hasStatus,
    required this.status,
    required this.updatedAt,
    required this.gmailFoundCount,
    required this.convertedCount,
    required this.skippedCount,
    required this.importCandidateCount,
    required this.oliveCount,
    required this.smbcCount,
    required this.addedCount,
    required this.errorMessage,
  });

  final bool hasStatus;

  final String status;

  final String updatedAt;

  final int gmailFoundCount;

  final int convertedCount;

  final int skippedCount;

  final int importCandidateCount;

  final int oliveCount;

  final int smbcCount;

  final int addedCount;

  final String errorMessage;

  bool get isSuccess => status.trim().toLowerCase() == 'success';

  bool get isError => status.trim().toLowerCase() == 'error';

  bool get hasRun =>
      hasStatus &&
      status.trim().isNotEmpty &&
      status.trim().toLowerCase() != 'not_run';

  factory GmailImportStatusModel.fromJson(Map<String, dynamic> json) {
    return GmailImportStatusModel(
      hasStatus: json['hasStatus'] == true,

      status: json['status']?.toString() ?? '',

      updatedAt: json['updatedAt']?.toString() ?? '',

      gmailFoundCount: _toInt(json['gmailFoundCount']),

      convertedCount: _toInt(json['convertedCount']),

      skippedCount: _toInt(json['skippedCount']),

      importCandidateCount: _toInt(json['importCandidateCount']),

      oliveCount: _toInt(json['oliveCount']),

      smbcCount: _toInt(json['smbcCount']),

      addedCount: _toInt(json['addedCount']),

      errorMessage: json['errorMessage']?.toString() ?? '',
    );
  }

  static int _toInt(dynamic value) {
    if (value is int) {
      return value;
    }

    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}
