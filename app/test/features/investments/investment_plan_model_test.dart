import 'package:flutter_test/flutter_test.dart';
import 'package:app/features/investments/model/investment_plan_model.dart';

void main() {
  test('InvestmentPlannerResult parses plan and monthly totals', () {
    final result = InvestmentPlannerResult.fromJson({
      'yearMonth': '2026-09',
      'recommendedAmount': 30000,
      'plannedTotal': 25000,
      'actualTotal': 10000,
      'remainingPlanned': 15000,
      'remainingCapacity': 20000,
      'plannedOverRecommended': 0,
      'baseNisa': 20000,
      'additionalNisa': 10000,
      'actualEventCount': 1,
      'items': [
        {
          'planId': 'p1',
          'yearMonth': '2026-09',
          'holdingId': 'h1',
          'holdingName': 'eMAXIS Slim',
          'plannedAmount': 25000,
          'actualAmount': 10000,
          'remainingAmount': 15000,
          'progressRate': 0.4,
          'nisaType': 'nisa',
          'isActive': true,
        }
      ],
      'holdings': [
        {
          'holdingId': 'h1',
          'name': 'eMAXIS Slim',
          'accountName': 'SBI証券',
          'securityType': 'fund',
          'symbol': '03311187',
        }
      ],
    });

    expect(result.recommendedAmount, 30000);
    expect(result.items.single.actualAmount, 10000);
    expect(result.items.single.progressRate, 0.4);
    expect(result.holdings.single.symbol, '03311187');
  });
}
