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
  final List<Map<String, dynamic>> categories;
  final List<Map<String, dynamic>> monthlyTrend;

  AnalyticsModel({
    required this.yearMonth,
    required this.totalExpense,
    required this.fixedExpense,
    required this.totalIncome,
    required this.balance,
    required this.variableExpense,
    required this.categories,
    required this.monthlyTrend,
    required this.previousYearMonth,
    required this.previousTotalExpense,
    required this.previousTotalIncome,
    required this.previousBalance,
  });

  factory AnalyticsModel.fromJson(Map<String, dynamic> json) {
    return AnalyticsModel(
      yearMonth: json["yearMonth"] ?? "",
      totalExpense: json["totalExpense"] ?? 0,
      fixedExpense: json["fixedExpense"] ?? 0,
      variableExpense: json["variableExpense"] ?? 0,
      totalIncome: json["totalIncome"] ?? 0,
      balance: json["balance"] ?? 0,
      categories: List<Map<String, dynamic>>.from(json["categories"] ?? []),
      previousYearMonth: json["previousYearMonth"] ?? "",
      previousTotalExpense: json["previousTotalExpense"] ?? 0,
      previousTotalIncome: json["previousTotalIncome"] ?? 0,
      previousBalance: json["previousBalance"] ?? 0,
      monthlyTrend: List<Map<String, dynamic>>.from(json['monthlyTrend'] ?? []),
    );
  }
}
