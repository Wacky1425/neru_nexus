
class ClassificationRuleModel {
  const ClassificationRuleModel({
    required this.rowNumber,
    required this.priority,
    required this.matchTarget,
    required this.keyword,
    required this.ruleType,
    required this.typeResult,
    required this.majorCategory,
    required this.subCategory,
    required this.purposeType,
    required this.expenseRatio,
    required this.statusResult,
    required this.note,
    required this.walletResult,
    required this.intentResult,
  });

  final int rowNumber;
  final int priority;
  final String matchTarget;
  final String keyword;
  final String ruleType;
  final String typeResult;
  final String majorCategory;
  final String subCategory;
  final String purposeType;
  final double expenseRatio;
  final String statusResult;
  final String note;
  final String walletResult;
  final String intentResult;

  factory ClassificationRuleModel.fromJson(Map<String, dynamic> json) {
    return ClassificationRuleModel(
      rowNumber: _toInt(json['rowNumber']),
      priority: _toInt(json['priority']),
      matchTarget: json['matchTarget']?.toString() ?? 'merchant',
      keyword: json['keyword']?.toString() ?? '',
      ruleType: json['ruleType']?.toString() ?? 'equals',
      typeResult: json['typeResult']?.toString() ?? '',
      majorCategory: json['majorCategory']?.toString() ?? '',
      subCategory: json['subCategory']?.toString() ?? '',
      purposeType: json['purposeType']?.toString() ?? '私用',
      expenseRatio: _toDouble(json['expenseRatio']),
      statusResult: json['statusResult']?.toString() ?? '確定',
      note: json['note']?.toString() ?? '',
      walletResult: json['walletResult']?.toString() ?? '生活',
      intentResult: json['intentResult']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toPayload() => {
    'rowNumber': rowNumber,
    'priority': priority,
    'matchTarget': matchTarget,
    'keyword': keyword,
    'ruleType': ruleType,
    'typeResult': typeResult,
    'majorCategory': majorCategory,
    'subCategory': subCategory,
    'purposeType': purposeType,
    'expenseRatio': expenseRatio,
    'statusResult': statusResult,
    'note': note,
    'walletResult': walletResult,
    'intentResult': intentResult,
  };

  static int _toInt(dynamic value) =>
      value is num ? value.toInt() : int.tryParse(value?.toString() ?? '') ?? 0;
  static double _toDouble(dynamic value) =>
      value is num ? value.toDouble() : double.tryParse(value?.toString() ?? '') ?? 0;
}

class MerchantClassificationSuggestion {
  const MerchantClassificationSuggestion({
    required this.merchant,
    required this.sampleCount,
    required this.matchedCount,
    required this.confidence,
    required this.typeResult,
    required this.majorCategory,
    required this.subCategory,
    required this.purposeType,
    required this.expenseRatio,
    required this.walletResult,
    required this.intentResult,
  });

  final String merchant;
  final int sampleCount;
  final int matchedCount;
  final double confidence;
  final String typeResult;
  final String majorCategory;
  final String subCategory;
  final String purposeType;
  final double expenseRatio;
  final String walletResult;
  final String intentResult;

  factory MerchantClassificationSuggestion.fromJson(Map<String, dynamic> json) {
    return MerchantClassificationSuggestion(
      merchant: json['merchant']?.toString() ?? '',
      sampleCount: ClassificationRuleModel._toInt(json['sampleCount']),
      matchedCount: ClassificationRuleModel._toInt(json['matchedCount']),
      confidence: ClassificationRuleModel._toDouble(json['confidence']),
      typeResult: json['typeResult']?.toString() ?? '',
      majorCategory: json['majorCategory']?.toString() ?? '',
      subCategory: json['subCategory']?.toString() ?? '',
      purposeType: json['purposeType']?.toString() ?? '私用',
      expenseRatio: ClassificationRuleModel._toDouble(json['expenseRatio']),
      walletResult: json['walletResult']?.toString() ?? '生活',
      intentResult: json['intentResult']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toPromotePayload() => {
    'merchant': merchant,
    'typeResult': typeResult,
    'majorCategory': majorCategory,
    'subCategory': subCategory,
    'purposeType': purposeType,
    'expenseRatio': expenseRatio,
    'walletResult': walletResult,
    'intentResult': intentResult,
  };
}
