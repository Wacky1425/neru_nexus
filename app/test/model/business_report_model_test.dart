import 'package:app/features/business/model/business_report_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('BusinessReportModel parses enhanced KPI fields', () {
    final report = BusinessReportModel.fromJson({
      'year': '2026',
      'income': 100000,
      'expenseGross': 50000,
      'deductibleExpense': 40000,
      'profit': 60000,
      'effectiveExpenseRatio': 0.8,
      'profitMargin': 0.6,
      'evidenceCoverageRate': 0.75,
      'evidenceAttachedCount': 3,
      'evidenceMissingCount': 1,
      'transactionCount': 6,
      'expenseTransactionCount': 4,
      'bestMonth': {
        'yearMonth': '2026-08',
        'income': 70000,
        'expenseGross': 20000,
        'deductibleExpense': 15000,
        'profit': 55000,
        'evidenceAttachedCount': 2,
        'evidenceMissingCount': 0,
      },
      'worstMonth': {
        'yearMonth': '2026-07',
        'income': 30000,
        'expenseGross': 30000,
        'deductibleExpense': 25000,
        'profit': 5000,
        'evidenceAttachedCount': 1,
        'evidenceMissingCount': 1,
      },
      'monthly': [],
      'categories': [],
      'evidenceMissingItems': [
        {
          'id': 't1',
          'transactionDate': '2026-07-01',
          'type': '支出',
          'merchant': 'SKEB',
          'itemName': 'イラスト',
          'amount': 10000,
          'majorCategory': '事業',
          'subCategory': '外注費',
          'purposeType': '経費',
          'expenseRatio': 1,
          'expenseAmount': 10000,
          'note': '',
          'evidenceUrl': '',
          'accountName': 'Olive',
        },
      ],
      'items': [],
    });

    expect(report.profit, 60000);
    expect(report.effectiveExpenseRatio, 0.8);
    expect(report.profitMargin, 0.6);
    expect(report.evidenceCoverageRate, 0.75);
    expect(report.bestMonth?.yearMonth, '2026-08');
    expect(report.worstMonth?.profit, 5000);
    expect(report.evidenceMissingItems, hasLength(1));
    expect(report.evidenceMissingItems.first.expenseAmount, 10000);
  });

  test('BusinessReportModel safely defaults enhanced fields', () {
    final report = BusinessReportModel.fromJson({});
    expect(report.effectiveExpenseRatio, 0);
    expect(report.profitMargin, 0);
    expect(report.evidenceCoverageRate, 0);
    expect(report.evidenceMissingItems, isEmpty);
    expect(report.bestMonth, isNull);
  });
}
