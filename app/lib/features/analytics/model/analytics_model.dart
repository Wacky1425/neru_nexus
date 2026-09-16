class AnalyticsModel {
  final String yearMonth;
  final int totalExpense;
  final int fixedExpense;
  final int totalIncome;
  final int balance;
  final int variableExpense;
  final String previousYearMonth;
  final int previousTotalExpense;
  final int previousTotalIncome;
  final int previousBalance;
  final int? comparisonDay;
  final String comparisonMode;
  final int averageExpense3Months;
  final int expenseBudget;
  final int fixedExpenseBudget;
  final int variableExpenseBudget;
  final int budgetRemaining;
  final double budgetUsageRate;
  final bool budgetInherited;
  final String budgetInheritedFrom;
  final int elapsedDays;
  final int daysInMonth;
  final int projectedExpense;
  final List<Map<String, dynamic>> categories;
  final List<Map<String, dynamic>> categoryChanges;
  final List<Map<String, dynamic>> monthlyTrend;

  AnalyticsModel({
    required this.yearMonth,
    required this.totalExpense,
    required this.fixedExpense,
    required this.totalIncome,
    required this.balance,
    required this.variableExpense,
    required this.categories,
    required this.categoryChanges,
    required this.monthlyTrend,
    required this.previousYearMonth,
    required this.previousTotalExpense,
    required this.previousTotalIncome,
    required this.previousBalance,
    required this.comparisonDay,
    required this.comparisonMode,
    required this.averageExpense3Months,
    required this.expenseBudget,
    required this.fixedExpenseBudget,
    required this.variableExpenseBudget,
    required this.budgetRemaining,
    required this.budgetUsageRate,
    required this.budgetInherited,
    required this.budgetInheritedFrom,
    required this.elapsedDays,
    required this.daysInMonth,
    required this.projectedExpense,
  });

  factory AnalyticsModel.fromJson(Map<String, dynamic> json) {
    int toInt(String key) => (json[key] as num?)?.toInt() ?? 0;
    double toDouble(String key) => (json[key] as num?)?.toDouble() ?? 0;

    return AnalyticsModel(
      yearMonth: json['yearMonth']?.toString() ?? '',
      totalExpense: toInt('totalExpense'),
      fixedExpense: toInt('fixedExpense'),
      variableExpense: toInt('variableExpense'),
      totalIncome: toInt('totalIncome'),
      balance: toInt('balance'),
      previousYearMonth: json['previousYearMonth']?.toString() ?? '',
      previousTotalExpense: toInt('previousTotalExpense'),
      previousTotalIncome: toInt('previousTotalIncome'),
      previousBalance: toInt('previousBalance'),
      comparisonDay: json['comparisonDay'] == null ? null : toInt('comparisonDay'),
      comparisonMode: json['comparisonMode']?.toString() ?? 'full_month',
      averageExpense3Months: toInt('averageExpense3Months'),
      expenseBudget: toInt('expenseBudget'),
      fixedExpenseBudget: toInt('fixedExpenseBudget'),
      variableExpenseBudget: toInt('variableExpenseBudget'),
      budgetRemaining: toInt('budgetRemaining'),
      budgetUsageRate: toDouble('budgetUsageRate'),
      budgetInherited: json['budgetInherited'] == true,
      budgetInheritedFrom: json['budgetInheritedFrom']?.toString() ?? '',
      elapsedDays: toInt('elapsedDays'),
      daysInMonth: toInt('daysInMonth'),
      projectedExpense: toInt('projectedExpense'),
      categories: List<Map<String, dynamic>>.from(json['categories'] ?? []),
      categoryChanges:
          List<Map<String, dynamic>>.from(json['categoryChanges'] ?? []),
      monthlyTrend: List<Map<String, dynamic>>.from(json['monthlyTrend'] ?? []),
    );
  }
}
