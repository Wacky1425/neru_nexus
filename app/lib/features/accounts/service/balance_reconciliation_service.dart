import '../../../core/network/api_client.dart';
import '../model/balance_reconciliation_model.dart';

class BalanceReconciliationService {
  const BalanceReconciliationService();

  Future<BalanceReconciliationResult> fetch() async {
    final data = await ApiClient.get(action: 'balance_reconciliation');
    return BalanceReconciliationResult.fromJson(data);
  }

  Future<BalanceReconciliationRecord> save({
    required String accountId,
    required int actualBalance,
    required String asOfDate,
    String note = '',
  }) async {
    final data = await ApiClient.post(
      action: 'balance_reconciliation_save',
      body: {
        'accountId': accountId,
        'actualBalance': actualBalance,
        'asOfDate': asOfDate,
        'note': note,
      },
    );
    return BalanceReconciliationRecord.fromJson(data);
  }
}
