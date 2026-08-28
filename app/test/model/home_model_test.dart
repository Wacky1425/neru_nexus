import 'package:app/features/home/model/home_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('HomeModel parses calculation inputs and nested lists', () {
    final home = HomeModel.fromJson({
      'yearMonth': '2026-08', 'availableMoney': '30000', 'dailyBudget': 1000,
      'plannedIncome': 250000, 'salaryPlanned': 250000, 'salaryActual': 242000,
      'salaryReceived': true, 'sideIncomePlanned': 30000, 'actualIncome': 242000,
      'projectedIncome': 242000, 'fixedExpenseActual': 60000,
      'recurringExpectedTotal': 70000, 'recurringRemaining': 10000,
      'recurringForecastItems': [{'name': '家賃', 'amount': 60000}],
      'variableExpenseActual': 20000, 'fixedExpenseBudget': 80000,
      'variableExpenseBudget': 50000, 'budgetInherited': true,
      'budgetInheritedFrom': '2026-07', 'monthlySurplus': 112000,
      'goalAllocation': 10000, 'goalRequired': 10000, 'goalShortage': 0,
      'emergencyCashAllocation': 20000, 'baseNisa': 30000, 'additionalNisa': 5000,
      'totalNisa': 35000, 'unallocatedCash': 47000, 'allocationStatus': 'ok',
      'allocationMessage': 'ok', 'liquidCash': 500000, 'protectedCash': 350000,
      'emergencyFund': {'target': 600000}, 'goalFundingDetails': [{'goalId': 'g1'}],
      'totalAssets': 1000000, 'totalLiabilities': 100000, 'netAssets': 900000,
      'sideBusinessIncome': 50000, 'sideBusinessExpense': 10000,
      'sideBusinessProfit': 40000, 'moneyHealth': {'score': 80},
      'recentTransactions': [{'id': 't1'}], 'generatedAt': '2026-08-28T10:00:00',
    });

    expect(home.availableMoney, 30000);
    expect(home.salaryReceived, isTrue);
    expect(home.recurringForecastItems.single['name'], '家賃');
    expect(home.sideBusinessProfit, 40000);
    expect(home.budgetInheritedFrom, '2026-07');
  });
}
