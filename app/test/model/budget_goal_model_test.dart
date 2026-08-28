import 'package:app/features/budget/model/budget_model.dart';
import 'package:app/features/goals/model/goal_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('BudgetModel parses inherited settings', () {
    final model = BudgetModel.fromJson({
      'yearMonth': '2026-08', 'inherited': true, 'inheritedFrom': '2026-07',
      'salaryPlanned': 250000, 'sideIncomePlanned': 30000, 'nisaTarget': 50000,
      'fixedExpenseBudget': 80000, 'variableExpenseBudget': 50000,
    });
    expect(model.inherited, isTrue);
    expect(model.nisaTarget, 50000);
  });

  test('GoalModel accepts numeric strings', () {
    final model = GoalModel.fromJson({
      'goalId': 'g1', 'goalName': '旅行', 'goalType': 'planned',
      'targetAmount': '120000', 'targetDate': '2027-03-01', 'certainty': 'high',
      'reservedCash': '20000', 'priority': '1', 'note': '',
    });
    expect(model.targetAmount, 120000);
    expect(model.reservedCash, 20000);
  });
}
