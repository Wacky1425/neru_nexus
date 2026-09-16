class InvestmentPlanHoldingOption {
  const InvestmentPlanHoldingOption({
    required this.holdingId,
    required this.name,
    required this.accountName,
    required this.securityType,
    required this.symbol,
  });

  final String holdingId;
  final String name;
  final String accountName;
  final String securityType;
  final String symbol;

  factory InvestmentPlanHoldingOption.fromJson(Map<String, dynamic> json) {
    return InvestmentPlanHoldingOption(
      holdingId: json['holdingId']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      accountName: json['accountName']?.toString() ?? '',
      securityType: json['securityType']?.toString() ?? '',
      symbol: json['symbol']?.toString() ?? '',
    );
  }
}

class InvestmentPlanItem {
  const InvestmentPlanItem({
    required this.planId,
    required this.yearMonth,
    required this.holdingId,
    required this.holdingName,
    required this.accountName,
    required this.plannedAmount,
    required this.actualAmount,
    required this.remainingAmount,
    required this.progressRate,
    required this.nisaType,
    required this.note,
    required this.isActive,
  });

  final String planId;
  final String yearMonth;
  final String holdingId;
  final String holdingName;
  final String accountName;
  final int plannedAmount;
  final int actualAmount;
  final int remainingAmount;
  final double progressRate;
  final String nisaType;
  final String note;
  final bool isActive;

  factory InvestmentPlanItem.fromJson(Map<String, dynamic> json) {
    return InvestmentPlanItem(
      planId: json['planId']?.toString() ?? '',
      yearMonth: json['yearMonth']?.toString() ?? '',
      holdingId: json['holdingId']?.toString() ?? '',
      holdingName: json['holdingName']?.toString() ?? '',
      accountName: json['accountName']?.toString() ?? '',
      plannedAmount: _toInt(json['plannedAmount']),
      actualAmount: _toInt(json['actualAmount']),
      remainingAmount: _toInt(json['remainingAmount']),
      progressRate: _toDouble(json['progressRate']),
      nisaType: json['nisaType']?.toString() ?? 'taxable',
      note: json['note']?.toString() ?? '',
      isActive: json['isActive'] != false,
    );
  }

  static int _toInt(dynamic value) {
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  static double _toDouble(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }
}

class InvestmentPlannerResult {
  const InvestmentPlannerResult({
    required this.yearMonth,
    required this.items,
    required this.holdings,
    required this.recommendedAmount,
    required this.discretionaryCapacity,
    required this.scheduledInvestmentTotal,
    required this.plannedTotal,
    required this.actualTotal,
    required this.remainingPlanned,
    required this.remainingCapacity,
    required this.plannedOverRecommended,
    required this.baseNisa,
    required this.additionalNisa,
    required this.allocationStatus,
    required this.allocationMessage,
    required this.actualEventCount,
  });

  final String yearMonth;
  final List<InvestmentPlanItem> items;
  final List<InvestmentPlanHoldingOption> holdings;
  final int recommendedAmount;
  final int discretionaryCapacity;
  final int scheduledInvestmentTotal;
  final int plannedTotal;
  final int actualTotal;
  final int remainingPlanned;
  final int remainingCapacity;
  final int plannedOverRecommended;
  final int baseNisa;
  final int additionalNisa;
  final String allocationStatus;
  final String allocationMessage;
  final int actualEventCount;

  factory InvestmentPlannerResult.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'];
    final rawHoldings = json['holdings'];
    return InvestmentPlannerResult(
      yearMonth: json['yearMonth']?.toString() ?? '',
      items: rawItems is List
          ? rawItems
              .whereType<Map>()
              .map((e) => InvestmentPlanItem.fromJson(
                    Map<String, dynamic>.from(e),
                  ))
              .toList()
          : const [],
      holdings: rawHoldings is List
          ? rawHoldings
              .whereType<Map>()
              .map((e) => InvestmentPlanHoldingOption.fromJson(
                    Map<String, dynamic>.from(e),
                  ))
              .toList()
          : const [],
      recommendedAmount: InvestmentPlanItem._toInt(json['recommendedAmount']),
      discretionaryCapacity: InvestmentPlanItem._toInt(
        json['discretionaryCapacity'] ?? json['recommendedAmount'],
      ),
      scheduledInvestmentTotal: InvestmentPlanItem._toInt(
        json['scheduledInvestmentTotal'] ?? json['plannedTotal'],
      ),
      plannedTotal: InvestmentPlanItem._toInt(json['plannedTotal']),
      actualTotal: InvestmentPlanItem._toInt(json['actualTotal']),
      remainingPlanned: InvestmentPlanItem._toInt(json['remainingPlanned']),
      remainingCapacity: InvestmentPlanItem._toInt(json['remainingCapacity']),
      plannedOverRecommended:
          InvestmentPlanItem._toInt(json['plannedOverRecommended']),
      baseNisa: InvestmentPlanItem._toInt(json['baseNisa']),
      additionalNisa: InvestmentPlanItem._toInt(json['additionalNisa']),
      allocationStatus: json['allocationStatus']?.toString() ?? '',
      allocationMessage: json['allocationMessage']?.toString() ?? '',
      actualEventCount: InvestmentPlanItem._toInt(json['actualEventCount']),
    );
  }
}
