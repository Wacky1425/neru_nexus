class GoalModel {
  const GoalModel({
    required this.goalId,
    required this.goalName,
    required this.goalType,
    required this.targetAmount,
    required this.targetDate,
    required this.certainty,
    required this.reservedCash,
    required this.priority,
    required this.note,
  });

  final String goalId;
  final String goalName;
  final String goalType;
  final int targetAmount;
  final String targetDate;
  final String certainty;
  final int reservedCash;
  final int priority;
  final String note;

  factory GoalModel.fromJson(Map<String, dynamic> json) {
    return GoalModel(
      goalId: json['goalId']?.toString() ?? '',
      goalName: json['goalName']?.toString() ?? '',
      goalType: json['goalType']?.toString() ?? '',
      targetAmount: _toInt(json['targetAmount']),
      targetDate: json['targetDate']?.toString() ?? '',
      certainty: json['certainty']?.toString() ?? '',
      reservedCash: _toInt(json['reservedCash']),
      priority: _toInt(json['priority']),
      note: json['note']?.toString() ?? '',
    );
  }

  static int _toInt(dynamic value) {
    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}
