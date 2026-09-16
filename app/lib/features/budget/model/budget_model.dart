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
    required this.freeSpendingTarget,
    required this.savingsTarget,
    required this.totalIncomePlanned,
    required this.livingBudget,
    required this.plannedFreeCash,
    required this.actualExpense,
    required this.projectedExpense,
    required this.budgetRemaining,
    required this.budgetUsageRate,
    required this.projectedUsageRate,
    required this.elapsedDays,
    required this.daysInMonth,
    required this.goalRequired,
    required this.goalAllocation,
    required this.goalShortage,
    required this.goalFundingDetails,
    required this.emergencyCashAllocation,
    required this.emergencyTargetAmount,
    required this.emergencyProtectedCash,
    required this.emergencyShortage,
    required this.emergencyCoveredMonths,
    required this.emergencyTargetMonths,
    required this.emergencyStage,
    required this.discretionaryBudget,
    required this.discretionaryCapacity,
    required this.unassignedCash,
    required this.committedPlan,
    required this.planShortage,
  });

  final String yearMonth;
  final bool inherited;
  final String inheritedFrom;
  final int salaryPlanned;
  final int sideIncomePlanned;
  final int nisaTarget;
  final int fixedExpenseBudget;
  final int variableExpenseBudget;
  final int freeSpendingTarget;
  final int savingsTarget;

  final int totalIncomePlanned;
  final int livingBudget;
  final int plannedFreeCash;
  final int actualExpense;
  final int projectedExpense;
  final int budgetRemaining;
  final double budgetUsageRate;
  final double projectedUsageRate;
  final int elapsedDays;
  final int daysInMonth;
  final int goalRequired;
  final int goalAllocation;
  final int goalShortage;
  final List<Map<String, dynamic>> goalFundingDetails;
  final int emergencyCashAllocation;
  final int emergencyTargetAmount;
  final int emergencyProtectedCash;
  final int emergencyShortage;
  final double emergencyCoveredMonths;
  final int emergencyTargetMonths;
  final String emergencyStage;
  final int discretionaryBudget;
  final int discretionaryCapacity;
  final int unassignedCash;
  final int committedPlan;
  final int planShortage;

  factory BudgetModel.fromJson(Map<String, dynamic> json) {
    int toInt(String key) => (json[key] as num?)?.toInt() ?? 0;
    double toDouble(String key) => (json[key] as num?)?.toDouble() ?? 0;

    return BudgetModel(
      yearMonth: json['yearMonth']?.toString() ?? '',
      inherited: json['inherited'] == true,
      inheritedFrom: json['inheritedFrom']?.toString() ?? '',
      salaryPlanned: toInt('salaryPlanned'),
      sideIncomePlanned: toInt('sideIncomePlanned'),
      nisaTarget: toInt('nisaTarget'),
      fixedExpenseBudget: toInt('fixedExpenseBudget'),
      variableExpenseBudget: toInt('variableExpenseBudget'),
      freeSpendingTarget: toInt('freeSpendingTarget'),
      savingsTarget: toInt('savingsTarget'),
      totalIncomePlanned: toInt('totalIncomePlanned'),
      livingBudget: toInt('livingBudget'),
      plannedFreeCash: toInt('plannedFreeCash'),
      actualExpense: toInt('actualExpense'),
      projectedExpense: toInt('projectedExpense'),
      budgetRemaining: toInt('budgetRemaining'),
      budgetUsageRate: toDouble('budgetUsageRate'),
      projectedUsageRate: toDouble('projectedUsageRate'),
      elapsedDays: toInt('elapsedDays'),
      daysInMonth: toInt('daysInMonth'),
      goalRequired: toInt('goalRequired'),
      goalAllocation: toInt('goalAllocation'),
      goalShortage: toInt('goalShortage'),
      goalFundingDetails: (json['goalFundingDetails'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(),
      emergencyCashAllocation: toInt('emergencyCashAllocation'),
      emergencyTargetAmount: toInt('emergencyTargetAmount'),
      emergencyProtectedCash: toInt('emergencyProtectedCash'),
      emergencyShortage: toInt('emergencyShortage'),
      emergencyCoveredMonths: toDouble('emergencyCoveredMonths'),
      emergencyTargetMonths: toInt('emergencyTargetMonths'),
      emergencyStage: json['emergencyStage']?.toString() ?? '',
      discretionaryBudget: toInt('discretionaryBudget'),
      discretionaryCapacity: toInt('discretionaryCapacity'),
      unassignedCash: toInt('unassignedCash'),
      committedPlan: toInt('committedPlan'),
      planShortage: toInt('planShortage'),
    );
  }
}
