class BudgetModel {
  const BudgetModel({
    required this.yearMonth,
    required this.inherited,
    required this.inheritedFrom,
    required this.salaryPlanned,
    required this.sideIncomePlanned,
    required this.nisaTarget,
    required this.fixedExpenseBudget,
    required this.variableExpenseBudget,
  });

  final String yearMonth;

  final bool inherited;

  final String inheritedFrom;

  final int salaryPlanned;

  final int sideIncomePlanned;

  final int nisaTarget;

  final int fixedExpenseBudget;

  final int variableExpenseBudget;

  factory BudgetModel.fromJson(Map<String, dynamic> json) {
    return BudgetModel(
      yearMonth: json['yearMonth']?.toString() ?? '',
      inherited: json['inherited'] == true,
      inheritedFrom: json['inheritedFrom']?.toString() ?? '',
      salaryPlanned: (json['salaryPlanned'] as num?)?.toInt() ?? 0,
      sideIncomePlanned: (json['sideIncomePlanned'] as num?)?.toInt() ?? 0,
      nisaTarget: (json['nisaTarget'] as num?)?.toInt() ?? 0,
      fixedExpenseBudget: (json['fixedExpenseBudget'] as num?)?.toInt() ?? 0,
      variableExpenseBudget:
          (json['variableExpenseBudget'] as num?)?.toInt() ?? 0,
    );
  }
}
