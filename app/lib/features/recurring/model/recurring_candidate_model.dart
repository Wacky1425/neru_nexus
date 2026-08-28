class RecurringCandidateModel {
  const RecurringCandidateModel({
    required this.candidateKey,
    required this.merchant,
    required this.monthCount,
    required this.firstMonth,
    required this.lastMonth,
    required this.avgAmount,
    required this.minAmount,
    required this.maxAmount,
    required this.category,
    required this.status,
    required this.recurringType,
    required this.suggestedType,
    required this.note,
  });

  final String candidateKey;
  final String merchant;
  final int monthCount;
  final String firstMonth;
  final String lastMonth;
  final int avgAmount;
  final int minAmount;
  final int maxAmount;
  final String category;
  final String status;
  final String recurringType;
  final String suggestedType;
  final String note;

  bool get isCandidate => status == '候補';
  bool get isApproved => status == '承認';
  bool get isIgnored => status == '無視';

  factory RecurringCandidateModel.fromJson(Map<String, dynamic> json) {
    int toInt(dynamic value) {
      if (value is num) return value.toInt();
      return int.tryParse(value?.toString() ?? '') ?? 0;
    }

    return RecurringCandidateModel(
      candidateKey: json['candidateKey']?.toString() ?? '',
      merchant: json['merchant']?.toString() ?? '',
      monthCount: toInt(json['monthCount']),
      firstMonth: json['firstMonth']?.toString() ?? '',
      lastMonth: json['lastMonth']?.toString() ?? '',
      avgAmount: toInt(json['avgAmount']),
      minAmount: toInt(json['minAmount']),
      maxAmount: toInt(json['maxAmount']),
      category: json['category']?.toString() ?? '',
      status: json['status']?.toString() ?? '候補',
      recurringType: json['recurringType']?.toString() ?? '',
      suggestedType: json['suggestedType']?.toString() ?? '',
      note: json['note']?.toString() ?? '',
    );
  }
}

class RecurringCandidatesResult {
  const RecurringCandidatesResult({
    required this.items,
    required this.candidateCount,
    required this.approvedCount,
    required this.ignoredCount,
  });

  final List<RecurringCandidateModel> items;
  final int candidateCount;
  final int approvedCount;
  final int ignoredCount;

  factory RecurringCandidatesResult.fromJson(Map<String, dynamic> json) {
    int toInt(dynamic value) {
      if (value is num) return value.toInt();
      return int.tryParse(value?.toString() ?? '') ?? 0;
    }

    return RecurringCandidatesResult(
      items: (json['items'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => RecurringCandidateModel.fromJson(
                Map<String, dynamic>.from(item),
              ))
          .toList(),
      candidateCount: toInt(json['candidateCount']),
      approvedCount: toInt(json['approvedCount']),
      ignoredCount: toInt(json['ignoredCount']),
    );
  }
}
