
import 'package:app/features/home/model/home_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses V1.4 home forecast payload', () {
    final home = HomeModel.fromJson({
      'yearMonth': '2026-09',
      'homeForecast': {
        'projectedExpense': 150000,
        'projectedBalance': 80000,
        'safeDailySpend': 2500,
        'alerts': [
          {'type': 'overspend', 'severity': 'medium'}
        ],
        'recommendations': [
          {'type': 'nisa', 'amount': 10000}
        ],
      },
    });

    expect(home.homeForecast['projectedExpense'], 150000);
    expect((home.homeForecast['alerts'] as List).length, 1);
  });
}
