
import 'package:app/features/business/model/business_report_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses business tax readiness and issue lists', () {
    final report = BusinessReportModel.fromJson({
      'year': '2026',
      'income': 100000,
      'expenseGross': 30000,
      'deductibleExpense': 20000,
      'profit': 80000,
      'taxReadiness': {
        'score': 55,
        'ready': false,
        'issueCount': 2,
        'reviewCount': 1,
        'classificationMissingCount': 1,
        'evidenceMissingCount': 1,
        'expenseRatioReviewCount': 0,
      },
      'monthly': [
        {
          'yearMonth': '2026-08',
          'income': 100000,
          'expenseGross': 30000,
          'deductibleExpense': 20000,
          'profit': 80000,
          'evidenceAttachedCount': 1,
          'evidenceMissingCount': 1,
          'reviewCount': 1,
          'classificationMissingCount': 1,
          'expenseRatioReviewCount': 0,
          'readinessIssueCount': 3,
          'readinessScore': 35,
        },
      ],
      'reviewItems': [
        {
          'id': 't1',
          'transactionDate': '2026-08-01',
          'type': '支出',
          'merchant': 'Test',
          'amount': 1000,
          'majorCategory': 'その他',
          'subCategory': '要確認',
          'purposeType': '経費',
          'status': '要確認',
          'needsReview': true,
          'classificationMissing': true,
          'expenseRatioNeedsReview': false,
        },
      ],
    });

    expect(report.taxReadiness.ready, isFalse);
    expect(report.taxReadiness.issueCount, 2);
    expect(report.monthly.single.readinessIssueCount, 3);
    expect(report.reviewItems.single.needsReview, isTrue);
  });
}
