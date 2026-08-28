
import '../../../core/network/api_client.dart';
import '../model/classification_rule_model.dart';

class ClassificationRuleService {
  const ClassificationRuleService();

  Future<List<ClassificationRuleModel>> fetchRules() async {
    final data = await ApiClient.get(action: 'classification_rules');
    final items = data['items'];
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map((item) => ClassificationRuleModel.fromJson(
              Map<String, dynamic>.from(item),
            ))
        .toList();
  }

  Future<List<MerchantClassificationSuggestion>> fetchSuggestions() async {
    final data = await ApiClient.get(
      action: 'merchant_classification_suggestions',
    );
    final items = data['items'];
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map((item) => MerchantClassificationSuggestion.fromJson(
              Map<String, dynamic>.from(item),
            ))
        .toList();
  }

  Future<void> createRule(Map<String, dynamic> payload) async {
    await ApiClient.post(
      action: 'classification_rule_create',
      body: payload,
    );
  }

  Future<void> updateRule(ClassificationRuleModel rule) async {
    await ApiClient.post(
      action: 'classification_rule_update',
      body: rule.toPayload(),
    );
  }

  Future<void> deleteRule(int rowNumber) async {
    await ApiClient.post(
      action: 'classification_rule_delete',
      body: {'rowNumber': rowNumber},
    );
  }

  Future<void> promoteSuggestion(
    MerchantClassificationSuggestion suggestion,
  ) async {
    await ApiClient.post(
      action: 'merchant_classification_suggestion_promote',
      body: suggestion.toPromotePayload(),
    );
  }
}
