import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../../../core/constants/api_constants.dart';
import '../model/settlement_status_model.dart';

class SettlementService {
  const SettlementService();

  // ============================================================
  // Cache
  // ============================================================

  static SettlementStatusesResponseModel? _cachedResult;

  static SettlementStatusesResponseModel? get cachedResult {
    return _cachedResult;
  }

  static bool get hasCache {
    return _cachedResult != null;
  }

  static int get cachedReviewCount {
    final result = _cachedResult;

    if (result == null) {
      return 0;
    }

    return result.items.where((item) {
      return item.status == 'review' || item.status == 'pending';
    }).length;
  }

  static void clearCache() {
    _cachedResult = null;
  }

  // ============================================================
  // 照合状況取得
  // ============================================================

  Future<SettlementStatusesResponseModel> fetchStatuses() async {
    final totalWatch = Stopwatch()..start();

    final uri = Uri.parse(ApiConstants.baseUrl).replace(
      queryParameters: {
        'action': 'settlement_statuses',
        'key': ApiConstants.apiKey,
      },
    );

    final httpWatch = Stopwatch()..start();

    final response = await http.get(uri);

    httpWatch.stop();

    if (response.statusCode != 200) {
      throw Exception(
        'カード照合状況の取得に失敗しました: '
        '${response.statusCode}',
      );
    }

    final decodeWatch = Stopwatch()..start();

    final dynamic decodedValue;

    try {
      decodedValue = jsonDecode(response.body);
    } on FormatException {
      throw Exception('カード照合状況APIから不正なレスポンスが返されました');
    }

    decodeWatch.stop();

    if (decodedValue is! Map) {
      throw Exception('カード照合状況APIの形式が正しくありません');
    }

    final decoded = Map<String, dynamic>.from(decodedValue);

    if (decoded['success'] != true) {
      final error = decoded['error'];

      if (error is Map) {
        throw Exception(
          error['message']?.toString() ?? 'カード照合状況APIでエラーが発生しました',
        );
      }

      throw Exception(error?.toString() ?? 'カード照合状況APIでエラーが発生しました');
    }

    final data = decoded['data'];

    if (data is! Map) {
      throw Exception('カード照合状況APIのデータ形式が正しくありません');
    }

    final dataMap = Map<String, dynamic>.from(data);

    // ==========================================================
    // GAS側性能計測
    // ==========================================================

    final performance = dataMap['performance'];

    if (performance is Map) {
      debugPrint('');
      debugPrint('========== Settlement GAS Performance ==========');

      performance.forEach((key, value) {
        final milliseconds = num.tryParse(value.toString()) ?? 0;

        final seconds = milliseconds / 1000;

        debugPrint(
          '$key: '
          '${milliseconds.toStringAsFixed(0)}ms '
          '(${seconds.toStringAsFixed(3)}秒)',
        );
      });

      debugPrint('================================================');
      debugPrint('');
    }

    // ==========================================================
    // Model変換
    // ==========================================================

    final modelWatch = Stopwatch()..start();

    final result = SettlementStatusesResponseModel.fromJson(dataMap);

    modelWatch.stop();
    totalWatch.stop();

    // ==========================================================
    // Cache更新
    // ==========================================================

    _cachedResult = result;

    // ==========================================================
    // Flutter側性能計測
    // ==========================================================

    debugPrint('');
    debugPrint('========== Settlement Flutter Performance ======');

    debugPrint(
      'HTTP全体: '
      '${httpWatch.elapsedMilliseconds}ms '
      '(${(httpWatch.elapsedMilliseconds / 1000).toStringAsFixed(3)}秒)',
    );

    debugPrint(
      'JSON decode: '
      '${decodeWatch.elapsedMilliseconds}ms '
      '(${(decodeWatch.elapsedMilliseconds / 1000).toStringAsFixed(3)}秒)',
    );

    debugPrint(
      'Model変換: '
      '${modelWatch.elapsedMilliseconds}ms '
      '(${(modelWatch.elapsedMilliseconds / 1000).toStringAsFixed(3)}秒)',
    );

    debugPrint(
      'fetchStatuses全体: '
      '${totalWatch.elapsedMilliseconds}ms '
      '(${(totalWatch.elapsedMilliseconds / 1000).toStringAsFixed(3)}秒)',
    );

    debugPrint('================================================');
    debugPrint('');

    return result;
  }

  // ============================================================
  // 手動照合
  // ============================================================

  Future<void> manualMatch({required String settlementTransactionId}) async {
    final body = {
      'action': 'settlement_manual_match',
      'key': ApiConstants.apiKey,
      'settlementTransactionId': settlementTransactionId,
    };

    final response = await http.post(
      Uri.parse(ApiConstants.baseUrl),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );

    if (response.statusCode != 200) {
      throw Exception(
        '手動照合に失敗しました: '
        '${response.statusCode}',
      );
    }

    final dynamic decodedValue;

    try {
      decodedValue = jsonDecode(response.body);
    } on FormatException {
      throw Exception('手動照合APIから不正なレスポンスが返されました');
    }

    if (decodedValue is! Map) {
      throw Exception('手動照合APIの形式が正しくありません');
    }

    final decoded = Map<String, dynamic>.from(decodedValue);

    if (decoded['success'] != true) {
      final error = decoded['error'];

      if (error is Map) {
        throw Exception(error['message']?.toString() ?? '手動照合APIでエラーが発生しました');
      }

      throw Exception(error?.toString() ?? '手動照合APIでエラーが発生しました');
    }

    clearCache();
  }

  // ============================================================
  // 手動照合解除
  // ============================================================

  Future<void> cancelManualMatch({
    required String settlementTransactionId,
  }) async {
    final body = {
      'action': 'settlement_manual_unmatch',
      'key': ApiConstants.apiKey,
      'settlementTransactionId': settlementTransactionId,
    };

    final response = await http.post(
      Uri.parse(ApiConstants.baseUrl),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );

    if (response.statusCode != 200) {
      throw Exception(
        '手動照合の解除に失敗しました: '
        '${response.statusCode}',
      );
    }

    final dynamic decodedValue;

    try {
      decodedValue = jsonDecode(response.body);
    } on FormatException {
      throw Exception('手動照合解除APIから不正なレスポンスが返されました');
    }

    if (decodedValue is! Map) {
      throw Exception('手動照合解除APIの形式が正しくありません');
    }

    final decoded = Map<String, dynamic>.from(decodedValue);

    if (decoded['success'] != true) {
      final error = decoded['error'];

      if (error is Map) {
        throw Exception(error['message']?.toString() ?? '手動照合解除APIでエラーが発生しました');
      }

      throw Exception(error?.toString() ?? '手動照合解除APIでエラーが発生しました');
    }

    clearCache();
  }
}
