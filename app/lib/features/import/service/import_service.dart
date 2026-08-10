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

class CsvImportResult {
  const CsvImportResult({
    required this.csvType,
    required this.addedCount,
    required this.skippedCount,
    this.settlementResult,
  });

  final String csvType;
  final int addedCount;
  final int skippedCount;

  final SettlementResult? settlementResult;
}

class ImportService {
  const ImportService();

  Future<CsvImportResult> importCsv({required String csvText}) async {
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

      return CsvImportResult(
        csvType: data['csvType']?.toString() ?? 'unknown',
        addedCount: _toInt(data['addedCount']),
        skippedCount: _toInt(data['skippedCount']),
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
