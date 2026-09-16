import 'package:app/features/accounts/model/balance_reconciliation_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('R2 balance reconciliation parses summary and difference', () {
    final result = BalanceReconciliationResult.fromJson({
      'baselineDate': '2026-01-01',
      'totalCount': 1,
      'baselineReadyCount': 1,
      'baselinePendingCount': 0,
      'checkedCount': 1,
      'uncheckedCount': 0,
      'matchedCount': 0,
      'mismatchCount': 1,
      'items': [
        {
          'accountId': 'acc_1',
          'accountName': '三井住友銀行',
          'isAsset': true,
          'isLiability': false,
          'assetType': 'cash',
          'baselineDate': '2026-01-01',
          'openingBalance': 100000,
          'openingBalanceDate': '2026-01-01',
          'baselineReady': true,
          'calculatedBalance': 120000,
          'latestReconciliation': {
            'reconciliationId': 'balrec_1',
            'checkedAt': '2026-09-09T03:00:00.000Z',
            'asOfDate': '2026-09-09',
            'calculatedBalance': 120000,
            'actualBalance': 119500,
            'difference': -500,
            'matched': false,
            'note': 'ATM残高',
          },
        },
      ],
    });

    expect(result.baselineDate, '2026-01-01');
    expect(result.items.single.baselineReady, isTrue);
    expect(result.items.single.latestReconciliation?.difference, -500);
    expect(result.mismatchCount, 1);
  });
}
