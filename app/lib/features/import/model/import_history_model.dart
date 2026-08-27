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
    required this.ignoredCount,
    required this.billingYearMonths,
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
  final int ignoredCount;

  final List<String> billingYearMonths;

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
      ignoredCount: _toInt(json['ignoredCount']),
      billingYearMonths: (json['billingYearMonths'] as List? ?? [])
          .map((value) => value.toString())
          .where((value) => value.isNotEmpty)
          .toList(),
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

class ImportConfigModel {
  const ImportConfigModel({
    required this.configName,
    required this.accountName,
    required this.sourceType,
  });

  final String configName;
  final String accountName;
  final String sourceType;

  factory ImportConfigModel.fromJson(Map<String, dynamic> json) {
    return ImportConfigModel(
      configName: json['configName']?.toString() ?? '',
      accountName: json['accountName']?.toString() ?? '',
      sourceType: json['sourceType']?.toString() ?? '',
    );
  }
}

class ImportHistoryData {
  const ImportHistoryData({required this.histories, required this.configs});

  final List<ImportHistoryModel> histories;
  final List<ImportConfigModel> configs;
}
