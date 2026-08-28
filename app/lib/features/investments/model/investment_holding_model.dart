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
    required this.marketValue,
    required this.costValue,
    required this.profitLoss,
    required this.profitLossRate,
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
  final int marketValue;
  final int costValue;
  final int profitLoss;
  final double profitLossRate;
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
      marketValue: _toInt(json['marketValue']),
      costValue: _toInt(json['costValue']),
      profitLoss: _toInt(json['profitLoss']),
      profitLossRate: _toDouble(json['profitLossRate']),
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
  });

  final List<InvestmentHoldingModel> items;
  final int totalMarketValue;
  final int totalCostValue;
  final int totalProfitLoss;
  final double totalProfitLossRate;

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
