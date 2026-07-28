class HomeModel {
  const HomeModel({
    required this.yearMonth,
    required this.availableMoney,
    required this.savingForecast,
    required this.sideBusinessProfit,
    required this.dailyBudget,
    required this.moneyHealth,
    required this.featuredDream,
    required this.generatedAt,
  });

  final String yearMonth;
  final int availableMoney;
  final int savingForecast;
  final int sideBusinessProfit;
  final int dailyBudget;
  final Map<String, dynamic> moneyHealth;
  final Map<String, dynamic>? featuredDream;
  final String generatedAt;

  factory HomeModel.fromJson(Map<String, dynamic> json) {
    return HomeModel(
      yearMonth: json['yearMonth']?.toString() ?? '',
      availableMoney:
          (json['availableMoney'] as num?)?.toInt() ?? 0,
      savingForecast:
          (json['savingForecast'] as num?)?.toInt() ?? 0,
      sideBusinessProfit:
          (json['sideBusinessProfit'] as num?)?.toInt() ?? 0,
      dailyBudget:
          (json['dailyBudget'] as num?)?.toInt() ?? 0,
      moneyHealth:
          Map<String, dynamic>.from(
            json['moneyHealth'] as Map? ?? {},
          ),
      featuredDream: json['featuredDream'] == null
          ? null
          : Map<String, dynamic>.from(
              json['featuredDream'] as Map,
            ),
      generatedAt: json['generatedAt']?.toString() ?? '',
    );
  }
}