import '../../../core/network/api_client.dart';
import '../model/goal_model.dart';

class GoalService {
  const GoalService();

  Future<List<GoalModel>> fetchGoals() async {
    final data = await ApiClient.get(action: 'goals');

    final items = data['items'];

    if (items is! List) {
      throw Exception('目的資金APIのitems形式が正しくありません');
    }

    return items
        .whereType<Map>()
        .map((item) => GoalModel.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<void> createGoal({
    required String goalName,
    required String goalType,
    required int targetAmount,
    required String targetDate,
    required String certainty,
    required int reservedCash,
    required int priority,
    required String note,
  }) async {
    await ApiClient.post(
      action: 'goal_create',
      body: {
        'goalName': goalName,
        'goalType': goalType,
        'targetAmount': targetAmount,
        'targetDate': targetDate,
        'certainty': certainty,
        'reservedCash': reservedCash,
        'priority': priority,
        'note': note,
      },
    );
  }

  Future<void> updateGoal({
    required String goalId,
    required String goalName,
    required String goalType,
    required int targetAmount,
    required String targetDate,
    required String certainty,
    required int reservedCash,
    required int priority,
    required String note,
  }) async {
    await ApiClient.post(
      action: 'goal_update',
      body: {
        'goalId': goalId,
        'goalName': goalName,
        'goalType': goalType,
        'targetAmount': targetAmount,
        'targetDate': targetDate,
        'certainty': certainty,
        'reservedCash': reservedCash,
        'priority': priority,
        'note': note,
      },
    );
  }

  Future<void> deactivateGoal(String goalId) async {
    await ApiClient.post(action: 'goal_deactivate', body: {'goalId': goalId});
  }
}
