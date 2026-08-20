import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/constants/api_constants.dart';

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
    this.settlementResult,
    this.debugTiming,
  });

  final String csvType;
  final String importBatch;
  final int addedCount;
  final int skippedCount;

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

    final uri = Uri.parse(ApiConstants.baseUrl);
    final client = http.Client();

    try {
      final request = http.Request('POST', uri)
        ..followRedirects = false
        ..headers.addAll({'Content-Type': 'application/json'})
        ..body = jsonEncode({
          'action': 'csv_import',
          'key': ApiConstants.apiKey,
          'csvText': csvText,
          'fileName': fileName,
        });

      final streamedResponse = await client.send(request);

      final response = await _resolveResponse(client, streamedResponse);

      if (response.statusCode != 200) {
        throw Exception('CSV取込に失敗しました: ${response.statusCode}');
      }

      final dynamic decodedValue;

      try {
        decodedValue = jsonDecode(response.body);
      } on FormatException {
        throw Exception('CSV取込APIから不正なレスポンスが返されました');
      }

      if (decodedValue is! Map) {
        throw Exception('CSV取込APIの形式が正しくありません');
      }

      final decoded = Map<String, dynamic>.from(decodedValue);

      if (decoded['success'] != true) {
        final error = decoded['error'];

        if (error is Map) {
          throw Exception(error['message']?.toString() ?? 'CSV取込に失敗しました');
        }

        throw Exception(error?.toString() ?? 'CSV取込に失敗しました');
      }

      final data = decoded['data'];

      if (data is! Map) {
        throw Exception('CSV取込APIのデータ形式が正しくありません');
      }

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
        debugTiming: debugTiming,
        settlementResult: settlementResult,
      );
    } finally {
      client.close();
    }
  }

  Future<http.Response> _resolveResponse(
    http.Client client,
    http.StreamedResponse initialResponse,
  ) async {
    final initialBody = await initialResponse.stream.bytesToString();

    final statusCode = initialResponse.statusCode;

    if (statusCode != 301 &&
        statusCode != 302 &&
        statusCode != 303 &&
        statusCode != 307 &&
        statusCode != 308) {
      return http.Response(
        initialBody,
        statusCode,
        headers: initialResponse.headers,
      );
    }

    final location = initialResponse.headers['location'];

    if (location == null || location.trim().isEmpty) {
      throw Exception('CSV取込APIの転送先が取得できませんでした');
    }

    return client.get(Uri.parse(location));
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
