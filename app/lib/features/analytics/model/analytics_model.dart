class AnalyticsModel {
  final String yearMonth;
  final int totalExpense;
  final int fixedExpense;
  final int variableExpense;
  final List<Map<String, dynamic>> categories;

  AnalyticsModel({
    required this.yearMonth,
    required this.totalExpense,
    required this.fixedExpense,
    required this.variableExpense,
    required this.categories,
  });

  factory AnalyticsModel.fromJson(
    Map<String, dynamic> json,
  ) {
    return AnalyticsModel(
      yearMonth: json["yearMonth"] ?? "",
      totalExpense: json["totalExpense"] ?? 0,
      fixedExpense: json["fixedExpense"] ?? 0,
      variableExpense: json["variableExpense"] ?? 0,
      categories: List<Map<String, dynamic>>.from(
        json["categories"] ?? [],
      ),
    );
  }
}