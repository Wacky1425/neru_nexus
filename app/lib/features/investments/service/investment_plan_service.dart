import '../../../core/network/api_client.dart';
import '../model/investment_plan_model.dart';

class InvestmentPlanService {
  const InvestmentPlanService();

  Future<InvestmentPlannerResult> fetchPlanner({
    required String yearMonth,
  }) async {
    final data = await ApiClient.get(
      action: 'investment_plans',
      queryParameters: {'yearMonth': yearMonth},
    );
    return InvestmentPlannerResult.fromJson(data);
  }

  Future<InvestmentPlannerResult> savePlan({
    String planId = '',
    required String yearMonth,
    required String holdingId,
    required int plannedAmount,
    required String nisaType,
    String note = '',
  }) async {
    final data = await ApiClient.post(
      action: 'investment_plan_save',
      body: {
        'planId': planId,
        'yearMonth': yearMonth,
        'holdingId': holdingId,
        'plannedAmount': plannedAmount,
        'nisaType': nisaType,
        'note': note,
      },
    );
    return InvestmentPlannerResult.fromJson(data);
  }

  Future<InvestmentPlannerResult> deactivatePlan({
    required String planId,
  }) async {
    final data = await ApiClient.post(
      action: 'investment_plan_deactivate',
      body: {'planId': planId},
    );
    return InvestmentPlannerResult.fromJson(data);
  }
}
