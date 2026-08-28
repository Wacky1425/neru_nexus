import 'package:app/features/analytics/model/analytics_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('AnalyticsModel parses summary, category and trend data', () {
    final model = AnalyticsModel.fromJson({
      'yearMonth': '2026-08', 'totalExpense': 120000, 'fixedExpense': 70000,
      'variableExpense': 50000, 'totalIncome': 250000, 'balance': 130000,
      'previousYearMonth': '2026-07', 'previousTotalExpense': 110000,
      'previousTotalIncome': 240000, 'previousBalance': 130000,
      'categories': [{'name': '食費', 'amount': 30000}],
      'monthlyTrend': [{'yearMonth': '2026-08', 'expense': 120000}],
    });
    expect(model.balance, 130000);
    expect(model.categories.single['name'], '食費');
    expect(model.monthlyTrend, hasLength(1));
  });
}
