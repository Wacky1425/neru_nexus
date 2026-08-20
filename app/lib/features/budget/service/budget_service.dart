import '../../../core/network/api_client.dart';
import '../model/budget_model.dart';

class BudgetService {
  const BudgetService();

  Future<BudgetModel> fetchBudget({required String yearMonth}) async {
    final data = await ApiClient.get(
      action: 'budget_settings',
      queryParameters: {'yearMonth': yearMonth},
    );

    return BudgetModel.fromJson(data);
  }

  Future<BudgetModel> updateBudget({
    required String yearMonth,
    required int salaryPlanned,
    required int sideIncomePlanned,
    required int savingTarget,
    required int nisaTarget,
    required int fixedExpenseBudget,
    required int variableExpenseBudget,
    required int dreamTarget,
  }) async {
    final data = await ApiClient.post(
      action: 'budget_settings_update',
      body: {
        'yearMonth': yearMonth,
        'salaryPlanned': salaryPlanned,
        'sideIncomePlanned': sideIncomePlanned,
        'savingTarget': savingTarget,
        'nisaTarget': nisaTarget,
        'fixedExpenseBudget': fixedExpenseBudget,
        'variableExpenseBudget': variableExpenseBudget,
        'dreamTarget': dreamTarget,
      },
    );

    return BudgetModel.fromJson(data);
  }
}
