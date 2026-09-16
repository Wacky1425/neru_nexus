import '../../core/network/api_client.dart';

class FullReconciliationIssue {
  const FullReconciliationIssue({
    required this.code,
    required this.title,
    required this.detail,
  });

  final String code;
  final String title;
  final String detail;

  factory FullReconciliationIssue.fromJson(Map<String, dynamic> json) {
    return FullReconciliationIssue(
      code: json['code']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      detail: json['detail']?.toString() ?? '',
    );
  }
}

class FullReconciliationAccount {
  const FullReconciliationAccount({
    required this.accountName,
    required this.baselineReady,
    required this.checked,
    required this.matched,
    required this.difference,
  });

  final String accountName;
  final bool baselineReady;
  final bool checked;
  final bool matched;
  final num? difference;

  factory FullReconciliationAccount.fromJson(Map<String, dynamic> json) {
    final rawDifference = json['difference'];
    return FullReconciliationAccount(
      accountName: json['accountName']?.toString() ?? '',
      baselineReady: json['baselineReady'] == true,
      checked: json['checked'] == true,
      matched: json['matched'] == true,
      difference: rawDifference is num
          ? rawDifference
          : num.tryParse(rawDifference?.toString() ?? ''),
    );
  }
}

class FullReconciliationData {
  const FullReconciliationData({
    required this.readyForDailyUse,
    required this.score,
    required this.blockers,
    required this.warnings,
    required this.passes,
    required this.accounts,
    required this.summary,
    required this.generatedAt,
  });

  final bool readyForDailyUse;
  final int score;
  final List<FullReconciliationIssue> blockers;
  final List<FullReconciliationIssue> warnings;
  final List<FullReconciliationIssue> passes;
  final List<FullReconciliationAccount> accounts;
  final Map<String, dynamic> summary;
  final String generatedAt;

  factory FullReconciliationData.fromJson(Map<String, dynamic> json) {
    List<FullReconciliationIssue> parseIssues(dynamic value) {
      if (value is! List) return const [];
      return value
          .whereType<Map>()
          .map((e) => FullReconciliationIssue.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }

    final accountValue = json['balanceItems'];
    final accounts = accountValue is List
        ? accountValue
            .whereType<Map>()
            .map((e) => FullReconciliationAccount.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : <FullReconciliationAccount>[];

    return FullReconciliationData(
      readyForDailyUse: json['readyForDailyUse'] == true,
      score: _toInt(json['score']),
      blockers: parseIssues(json['blockers']),
      warnings: parseIssues(json['warnings']),
      passes: parseIssues(json['passes']),
      accounts: accounts,
      summary: json['summary'] is Map
          ? Map<String, dynamic>.from(json['summary'] as Map)
          : const {},
      generatedAt: json['generatedAt']?.toString() ?? '',
    );
  }

  static int _toInt(dynamic value) {
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}

class FullReconciliationService {
  const FullReconciliationService();

  Future<FullReconciliationData> fetch() async {
    final data = await ApiClient.get(action: 'r6_full_reconciliation');
    return FullReconciliationData.fromJson(data);
  }
}
