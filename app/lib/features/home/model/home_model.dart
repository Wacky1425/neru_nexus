class HomeModel {
  const HomeModel({
    required this.yearMonth,
    required this.availableMoney,
    required this.dailyBudget,

    required this.monthlySurplus,
    required this.goalAllocation,
    required this.goalRequired,
    required this.goalShortage,
    required this.emergencyCashAllocation,

    required this.baseNisa,
    required this.additionalNisa,
    required this.totalNisa,
    required this.unallocatedCash,

    required this.allocationStatus,
    required this.allocationMessage,

    required this.liquidCash,
    required this.protectedCash,
    required this.emergencyFund,

    required this.goalFundingDetails,

    required this.savingForecast,
    required this.sideBusinessProfit,
    required this.moneyHealth,
    required this.featuredDream,
    required this.recentTransactions,
    required this.generatedAt,
  });

  final String yearMonth;

  // 今月使えるお金
  final int availableMoney;
  final int dailyBudget;

  // 今月の資金配分
  final int monthlySurplus;

  final int goalAllocation;
  final int goalRequired;
  final int goalShortage;

  final int emergencyCashAllocation;

  final int baseNisa;
  final int additionalNisa;
  final int totalNisa;

  final int unallocatedCash;

  final String allocationStatus;
  final String allocationMessage;

  // 現金・生活防衛資金
  final int liquidCash;
  final int protectedCash;

  final Map<String, dynamic> emergencyFund;

  // Goal
  final List<Map<String, dynamic>> goalFundingDetails;

  // 既存情報
  final int savingForecast;
  final int sideBusinessProfit;

  final Map<String, dynamic> moneyHealth;

  final Map<String, dynamic>? featuredDream;

  final List<Map<String, dynamic>> recentTransactions;

  final String generatedAt;

  factory HomeModel.fromJson(Map<String, dynamic> json) {
    return HomeModel(
      yearMonth: json['yearMonth']?.toString() ?? '',

      availableMoney: _toInt(json['availableMoney']),

      dailyBudget: _toInt(json['dailyBudget']),

      monthlySurplus: _toInt(json['monthlySurplus']),

      goalAllocation: _toInt(json['goalAllocation']),

      goalRequired: _toInt(json['goalRequired']),

      goalShortage: _toInt(json['goalShortage']),

      emergencyCashAllocation: _toInt(json['emergencyCashAllocation']),

      baseNisa: _toInt(json['baseNisa']),

      additionalNisa: _toInt(json['additionalNisa']),

      totalNisa: _toInt(json['totalNisa']),

      unallocatedCash: _toInt(json['unallocatedCash']),

      allocationStatus: json['allocationStatus']?.toString() ?? '',

      allocationMessage: json['allocationMessage']?.toString() ?? '',

      liquidCash: _toInt(json['liquidCash']),

      protectedCash: _toInt(json['protectedCash']),

      emergencyFund: Map<String, dynamic>.from(
        json['emergencyFund'] as Map? ?? {},
      ),

      goalFundingDetails: (json['goalFundingDetails'] as List? ?? [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(),

      savingForecast: _toInt(json['savingForecast']),

      sideBusinessProfit: _toInt(json['sideBusinessProfit']),

      moneyHealth: Map<String, dynamic>.from(json['moneyHealth'] as Map? ?? {}),

      featuredDream: json['featuredDream'] == null
          ? null
          : Map<String, dynamic>.from(json['featuredDream'] as Map),

      recentTransactions: (json['recentTransactions'] as List? ?? [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(),

      generatedAt: json['generatedAt']?.toString() ?? '',
    );
  }

  static int _toInt(dynamic value) {
    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}
