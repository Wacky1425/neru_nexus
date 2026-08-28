
import 'package:app/features/classification_rules/model/classification_rule_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('classification rule parses editable rule fields', () {
    final rule = ClassificationRuleModel.fromJson({
      'rowNumber': 4,
      'priority': 120,
      'matchTarget': 'merchant',
      'keyword': 'マクドナルド',
      'ruleType': 'equals',
      'typeResult': '支出',
      'majorCategory': '食費',
      'subCategory': '外食',
      'purposeType': '私用',
      'expenseRatio': 0,
      'statusResult': '確定',
      'walletResult': '生活',
    });
    expect(rule.rowNumber, 4);
    expect(rule.keyword, 'マクドナルド');
    expect(rule.subCategory, '外食');
  });

  test('merchant suggestion parses confidence evidence', () {
    final suggestion = MerchantClassificationSuggestion.fromJson({
      'merchant': 'テスト店',
      'sampleCount': 5,
      'matchedCount': 4,
      'confidence': 0.8,
      'typeResult': '支出',
      'majorCategory': '食費',
      'subCategory': '外食',
    });
    expect(suggestion.sampleCount, 5);
    expect(suggestion.matchedCount, 4);
    expect(suggestion.confidence, 0.8);
  });
}
