class InvestmentHoldingModel {
  const InvestmentHoldingModel({
    required this.holdingId,
    required this.accountId,
    required this.accountName,
    required this.securityType,
    required this.name,
    required this.symbol,
    required this.priceProvider,
    required this.quantity,
    required this.priceUnit,
    required this.averageCost,
    required this.currentPrice,
    required this.previousClose,
    required this.priceChange,
    required this.priceChangeRate,
    required this.dailyChangeValue,
    required this.marketValue,
    required this.costValue,
    required this.profitLoss,
    required this.profitLossRate,
    required this.portfolioWeight,
    required this.priceUpdatedAt,
    required this.note,
  });

  final String holdingId;
  final String accountId;
  final String accountName;
  final String securityType;
  final String name;
  final String symbol;
  final String priceProvider;
  final double quantity;
  final double priceUnit;
  final double averageCost;
  final double currentPrice;
  final double previousClose;
  final double priceChange;
  final double priceChangeRate;
  final int dailyChangeValue;
  final int marketValue;
  final int costValue;
  final int profitLoss;
  final double profitLossRate;
  final double portfolioWeight;
  final String priceUpdatedAt;
  final String note;

  factory InvestmentHoldingModel.fromJson(Map<String, dynamic> json) {
    return InvestmentHoldingModel(
      holdingId: json['holdingId']?.toString() ?? '',
      accountId: json['accountId']?.toString() ?? '',
      accountName: json['accountName']?.toString() ?? '',
      securityType: json['securityType']?.toString() ?? 'other',
      name: json['name']?.toString() ?? '',
      symbol: json['symbol']?.toString() ?? '',
      priceProvider: json['priceProvider']?.toString() ?? 'manual',
      quantity: _toDouble(json['quantity']),
      priceUnit: _toDouble(json['priceUnit']) == 0
          ? 1
          : _toDouble(json['priceUnit']),
      averageCost: _toDouble(json['averageCost']),
      currentPrice: _toDouble(json['currentPrice']),
      previousClose: _toDouble(json['previousClose']),
      priceChange: _toDouble(json['priceChange']),
      priceChangeRate: _toDouble(json['priceChangeRate']),
      dailyChangeValue: _toInt(json['dailyChangeValue']),
      marketValue: _toInt(json['marketValue']),
      costValue: _toInt(json['costValue']),
      profitLoss: _toInt(json['profitLoss']),
      profitLossRate: _toDouble(json['profitLossRate']),
      portfolioWeight: _toDouble(json['portfolioWeight']),
      priceUpdatedAt: json['priceUpdatedAt']?.toString() ?? '',
      note: json['note']?.toString() ?? '',
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

class InvestmentHoldingsResult {
  const InvestmentHoldingsResult({
    required this.items,
    required this.totalMarketValue,
    required this.totalCostValue,
    required this.totalProfitLoss,
    required this.totalProfitLossRate,
    required this.totalDailyChange,
    required this.totalDailyChangeRate,
    required this.pricedHoldingCount,
    required this.dailyChangeAvailableCount,
    required this.latestPriceUpdatedAt,
  });

  final List<InvestmentHoldingModel> items;
  final int totalMarketValue;
  final int totalCostValue;
  final int totalProfitLoss;
  final double totalProfitLossRate;
  final int totalDailyChange;
  final double totalDailyChangeRate;
  final int pricedHoldingCount;
  final int dailyChangeAvailableCount;
  final String latestPriceUpdatedAt;

  factory InvestmentHoldingsResult.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'];
    return InvestmentHoldingsResult(
      items: rawItems is List
          ? rawItems
                .whereType<Map>()
                .map(
                  (item) => InvestmentHoldingModel.fromJson(
                    Map<String, dynamic>.from(item),
                  ),
                )
                .toList()
          : const [],
      totalMarketValue: _toInt(json['totalMarketValue']),
      totalCostValue: _toInt(json['totalCostValue']),
      totalProfitLoss: _toInt(json['totalProfitLoss']),
      totalProfitLossRate: _toDouble(json['totalProfitLossRate']),
      totalDailyChange: _toInt(json['totalDailyChange']),
      totalDailyChangeRate: _toDouble(json['totalDailyChangeRate']),
      pricedHoldingCount: _toInt(json['pricedHoldingCount']),
      dailyChangeAvailableCount: _toInt(
        json['dailyChangeAvailableCount'],
      ),
      latestPriceUpdatedAt:
          json['latestPriceUpdatedAt']?.toString() ?? '',
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
