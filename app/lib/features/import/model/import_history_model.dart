class ImportHistoryModel {
  const ImportHistoryModel({
    required this.importBatch,
    required this.importedAt,
    required this.csvType,
    required this.configName,
    required this.accountName,
    required this.fileName,
    required this.targetYearMonth,
    required this.periodStart,
    required this.periodEnd,
    required this.rowCount,
    required this.addedCount,
    required this.skippedCount,
    required this.status,
  });

  final String importBatch;
  final DateTime? importedAt;

  final String csvType;
  final String configName;
  final String accountName;
  final String fileName;

  final String targetYearMonth;
  final String periodStart;
  final String periodEnd;

  final int rowCount;
  final int addedCount;
  final int skippedCount;

  final String status;

  factory ImportHistoryModel.fromJson(Map<String, dynamic> json) {
    return ImportHistoryModel(
      importBatch: json['importBatch']?.toString() ?? '',

      importedAt: DateTime.tryParse(json['importedAt']?.toString() ?? ''),

      csvType: json['csvType']?.toString() ?? '',

      configName: json['configName']?.toString() ?? '',

      accountName: json['accountName']?.toString() ?? '',

      fileName: json['fileName']?.toString() ?? '',

      targetYearMonth: json['targetYearMonth']?.toString() ?? '',

      periodStart: json['periodStart']?.toString() ?? '',

      periodEnd: json['periodEnd']?.toString() ?? '',

      rowCount: _toInt(json['rowCount']),

      addedCount: _toInt(json['addedCount']),

      skippedCount: _toInt(json['skippedCount']),

      status: json['status']?.toString() ?? '',
    );
  }

  static int _toInt(dynamic value) {
    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}
