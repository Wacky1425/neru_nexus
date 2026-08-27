import '../../../core/network/api_client.dart';

class SettlementResult {
  const SettlementResult({
    required this.matched,
    required this.reason,
    this.cardAccount,
    this.batchTotal,
    this.candidateCount,
    this.candidateAmount,
    this.difference,
    this.settlementId,
    this.detailCount,
  });

  final bool matched;
  final String reason;

  final String? cardAccount;
  final int? batchTotal;

  final int? candidateCount;
  final int? candidateAmount;
  final int? difference;

  final String? settlementId;
  final int? detailCount;

  factory SettlementResult.fromJson(Map<String, dynamic> json) {
    return SettlementResult(
      matched: json['matched'] == true,
      reason: json['reason']?.toString() ?? '',
      cardAccount: json['cardAccount']?.toString(),
      batchTotal: _nullableInt(json['batchTotal']),
      candidateCount: _nullableInt(json['candidateCount']),
      candidateAmount: _nullableInt(json['candidateAmount']),
      difference: _nullableInt(json['difference']),
      settlementId: json['settlementId']?.toString(),
      detailCount: _nullableInt(json['detailCount']),
    );
  }

  static int? _nullableInt(dynamic value) {
    if (value == null) {
      return null;
    }

    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value.toString());
  }
}

class CsvImportTiming {
  const CsvImportTiming({
    required this.importMs,
    required this.configNameMs,
    required this.configMs,
    required this.rulesMs,
    required this.normalizeMs,
    required this.addTransactionsMs,
    required this.settlementMs,
    required this.reviewQueueMs,
    required this.reviewSummaryMs,
    required this.allViewsMs,
    required this.allViewsSummariesMs,
    required this.allViewsMonthlyCheckMs,
    required this.allViewsLatestMonthMs,
    required this.allViewsDashboardMs,
    required this.totalMs,
  });

  final int importMs;

  final int configNameMs;
  final int configMs;
  final int rulesMs;
  final int normalizeMs;
  final int addTransactionsMs;
  final int settlementMs;

  final int reviewQueueMs;
  final int reviewSummaryMs;
  final int allViewsMs;

  final int allViewsSummariesMs;
  final int allViewsMonthlyCheckMs;
  final int allViewsLatestMonthMs;
  final int allViewsDashboardMs;

  final int totalMs;

  factory CsvImportTiming.fromJson(Map<String, dynamic> json) {
    return CsvImportTiming(
      importMs: _toInt(json['importMs']),
      configNameMs: _toInt(json['configNameMs']),
      configMs: _toInt(json['configMs']),
      rulesMs: _toInt(json['rulesMs']),
      normalizeMs: _toInt(json['normalizeMs']),
      addTransactionsMs: _toInt(json['addTransactionsMs']),
      settlementMs: _toInt(json['settlementMs']),
      reviewQueueMs: _toInt(json['reviewQueueMs']),
      reviewSummaryMs: _toInt(json['reviewSummaryMs']),
      allViewsMs: _toInt(json['allViewsMs']),
      allViewsSummariesMs: _toInt(json['allViewsSummariesMs']),
      allViewsMonthlyCheckMs: _toInt(json['allViewsMonthlyCheckMs']),
      allViewsLatestMonthMs: _toInt(json['allViewsLatestMonthMs']),
      allViewsDashboardMs: _toInt(json['allViewsDashboardMs']),
      totalMs: _toInt(json['totalMs']),
    );
  }

  static int _toInt(dynamic value) {
    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}

class CsvImportResult {
  const CsvImportResult({
    required this.csvType,
    required this.importBatch,
    required this.addedCount,
    required this.skippedCount,
    required this.ignoredCount,
    this.settlementResult,
    this.debugTiming,
  });

  final String csvType;
  final String importBatch;
  final int addedCount;
  final int skippedCount;
  final int ignoredCount;

  final SettlementResult? settlementResult;
  final CsvImportTiming? debugTiming;
}

class ImportService {
  const ImportService();

  Future<CsvImportResult> importCsv({
    required String csvText,
    required String fileName,
  }) async {
    if (csvText.trim().isEmpty) {
      throw Exception('CSVが空です');
    }

    final data = await ApiClient.post(
      action: 'csv_import',
      body: {'csvText': csvText, 'fileName': fileName, 'dryRun': false},
    );

    final settlementValue = data['settlementResult'];

    SettlementResult? settlementResult;

    if (settlementValue is Map) {
      settlementResult = SettlementResult.fromJson(
        Map<String, dynamic>.from(settlementValue),
      );
    }

    final debugTimingValue = data['debugTiming'];

    CsvImportTiming? debugTiming;

    if (debugTimingValue is Map) {
      debugTiming = CsvImportTiming.fromJson(
        Map<String, dynamic>.from(debugTimingValue),
      );
    }

    return CsvImportResult(
      csvType: data['csvType']?.toString() ?? 'unknown',
      importBatch: data['importBatch']?.toString() ?? '',
      addedCount: _toInt(data['addedCount']),
      skippedCount: _toInt(data['skippedCount']),
      ignoredCount: _toInt(data['ignoredCount']),
      settlementResult: settlementResult,
      debugTiming: debugTiming,
    );
  }

  static int _toInt(dynamic value) {
    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}
