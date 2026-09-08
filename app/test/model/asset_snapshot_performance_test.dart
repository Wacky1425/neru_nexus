
import 'package:app/features/accounts/model/asset_snapshot_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses investment performance decomposition', () {
    final result = AssetTrendResult.fromJson({
      'items': [
        {
          'snapshotDate': '2026-08-01',
          'yearMonth': '2026-08',
          'totalAssets': 200000,
          'totalLiabilities': 0,
          'netAssets': 200000,
          'liquidAssets': 100000,
          'investmentAssets': 100000,
          'otherAssets': 0,
          'periodContribution': 0,
          'periodInvestmentReturn': 0,
        },
        {
          'snapshotDate': '2026-08-31',
          'yearMonth': '2026-08',
          'totalAssets': 235000,
          'totalLiabilities': 0,
          'netAssets': 235000,
          'liquidAssets': 100000,
          'investmentAssets': 135000,
          'otherAssets': 0,
          'periodContribution': 20000,
          'periodInvestmentReturn': 15000,
        },
      ],
      'netChange': 35000,
      'netChangeRate': 0.175,
      'investmentPerformance': {
        'startInvestmentAssets': 100000,
        'endInvestmentAssets': 135000,
        'investmentChange': 35000,
        'netContribution': 20000,
        'investmentReturn': 15000,
        'investmentReturnRate': 0.125,
        'comparable': true,
      },
    });

    expect(result.investmentPerformance.comparable, isTrue);
    expect(result.investmentPerformance.netContribution, 20000);
    expect(result.investmentPerformance.investmentReturn, 15000);
    expect(result.items.last.periodInvestmentReturn, 15000);
  });
}
