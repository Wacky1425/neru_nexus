import 'package:flutter/foundation.dart';
import '../../../core/network/api_client.dart';
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

    final dataMap = await ApiClient.get(
      action: 'settlement_statuses',
    );

    // GAS-side timing is still preserved in the v2 payload.
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

    final modelWatch = Stopwatch()..start();
    final result = SettlementStatusesResponseModel.fromJson(dataMap);
    modelWatch.stop();
    totalWatch.stop();

    _cachedResult = result;

    debugPrint('');
    debugPrint('========== Settlement Flutter Performance ======');
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
    await ApiClient.post(
      action: 'settlement_manual_match',
      body: {'settlementTransactionId': settlementTransactionId},
    );
    clearCache();
  }

  // ============================================================
  // 手動照合解除
  // ============================================================

  Future<void> cancelManualMatch({
    required String settlementTransactionId,
  }) async {
    await ApiClient.post(
      action: 'settlement_manual_unmatch',
      body: {'settlementTransactionId': settlementTransactionId},
    );
    clearCache();
  }

}
