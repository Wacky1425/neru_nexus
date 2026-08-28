import 'package:app/features/recurring/model/recurring_candidate_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Recurring candidate parses schedule and annual estimate', () {
    final item = RecurringCandidateModel.fromJson({
      'candidateKey': 'netflix',
      'merchant': 'NETFLIX',
      'monthCount': 3,
      'firstMonth': '2026-05',
      'lastMonth': '2026-07',
      'avgAmount': 1490,
      'minAmount': 1490,
      'maxAmount': 1490,
      'category': '娯楽 / 動画',
      'status': '承認',
      'recurringType': 'サブスク',
      'suggestedType': 'サブスク',
      'expectedDay': 1,
      'yearlyEstimate': 17880,
      'note': '',
    });
    expect(item.expectedDay, 1);
    expect(item.yearlyEstimate, 17880);
    expect(item.isApproved, isTrue);
  });

  test('Recurring result parses monthly summary', () {
    final result = RecurringCandidatesResult.fromJson({
      'items': [],
      'candidateCount': 2,
      'approvedCount': 4,
      'ignoredCount': 1,
      'monthlyTotal': 12000,
      'yearlyEstimate': 144000,
      'currentMonthRemaining': 5000,
      'currentMonthRemainingCount': 2,
      'currentMonthOverdueCount': 1,
    });
    expect(result.monthlyTotal, 12000);
    expect(result.yearlyEstimate, 144000);
    expect(result.currentMonthRemainingCount, 2);
    expect(result.currentMonthOverdueCount, 1);
  });
}
