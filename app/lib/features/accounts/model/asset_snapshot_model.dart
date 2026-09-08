class AssetSnapshotModel {
  const AssetSnapshotModel({
    required this.snapshotDate,
    required this.yearMonth,
    required this.totalAssets,
    required this.totalLiabilities,
    required this.netAssets,
    required this.liquidAssets,
    required this.investmentAssets,
    required this.otherAssets,
    required this.createdAt,
    required this.periodContribution,
    required this.periodInvestmentReturn,
  });

  final String snapshotDate;
  final String yearMonth;
  final int totalAssets;
  final int totalLiabilities;
  final int netAssets;
  final int liquidAssets;
  final int investmentAssets;
  final int otherAssets;
  final String createdAt;
  final int periodContribution;
  final int periodInvestmentReturn;

  factory AssetSnapshotModel.fromJson(Map<String, dynamic> json) {
    return AssetSnapshotModel(
      snapshotDate: json['snapshotDate']?.toString() ?? '',
      yearMonth: json['yearMonth']?.toString() ?? '',
      totalAssets: _toInt(json['totalAssets']),
      totalLiabilities: _toInt(json['totalLiabilities']),
      netAssets: _toInt(json['netAssets']),
      liquidAssets: _toInt(json['liquidAssets']),
      investmentAssets: _toInt(json['investmentAssets']),
      otherAssets: _toInt(json['otherAssets']),
      createdAt: json['createdAt']?.toString() ?? '',
      periodContribution: _toInt(json['periodContribution']),
      periodInvestmentReturn: _toInt(json['periodInvestmentReturn']),
    );
  }

  static int _toInt(dynamic value) {
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}

class InvestmentPerformanceResult {
  const InvestmentPerformanceResult({
    required this.startInvestmentAssets,
    required this.endInvestmentAssets,
    required this.investmentChange,
    required this.netContribution,
    required this.investmentReturn,
    required this.investmentReturnRate,
    required this.comparable,
  });

  final int startInvestmentAssets;
  final int endInvestmentAssets;
  final int investmentChange;
  final int netContribution;
  final int investmentReturn;
  final double investmentReturnRate;
  final bool comparable;

  factory InvestmentPerformanceResult.fromJson(Map<String, dynamic> json) {
    return InvestmentPerformanceResult(
      startInvestmentAssets: AssetSnapshotModel._toInt(
        json['startInvestmentAssets'],
      ),
      endInvestmentAssets: AssetSnapshotModel._toInt(
        json['endInvestmentAssets'],
      ),
      investmentChange: AssetSnapshotModel._toInt(json['investmentChange']),
      netContribution: AssetSnapshotModel._toInt(json['netContribution']),
      investmentReturn: AssetSnapshotModel._toInt(json['investmentReturn']),
      investmentReturnRate: AssetTrendResult._toDouble(
        json['investmentReturnRate'],
      ),
      comparable: json['comparable'] == true,
    );
  }
}

class AssetTrendResult {
  const AssetTrendResult({
    required this.items,
    required this.netChange,
    required this.netChangeRate,
    required this.investmentPerformance,
  });

  final List<AssetSnapshotModel> items;
  final int netChange;
  final double netChangeRate;
  final InvestmentPerformanceResult investmentPerformance;

  AssetSnapshotModel? get latest => items.isEmpty ? null : items.last;
  AssetSnapshotModel? get previous =>
      items.length < 2 ? null : items[items.length - 2];

  factory AssetTrendResult.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'];
    final rawPerformance = json['investmentPerformance'];

    return AssetTrendResult(
      items: rawItems is List
          ? rawItems
              .whereType<Map>()
              .map(
                (item) => AssetSnapshotModel.fromJson(
                  Map<String, dynamic>.from(item),
                ),
              )
              .toList()
          : <AssetSnapshotModel>[],
      netChange: AssetSnapshotModel._toInt(json['netChange']),
      netChangeRate: _toDouble(json['netChangeRate']),
      investmentPerformance: rawPerformance is Map
          ? InvestmentPerformanceResult.fromJson(
              Map<String, dynamic>.from(rawPerformance),
            )
          : const InvestmentPerformanceResult(
              startInvestmentAssets: 0,
              endInvestmentAssets: 0,
              investmentChange: 0,
              netContribution: 0,
              investmentReturn: 0,
              investmentReturnRate: 0,
              comparable: false,
            ),
    );
  }

  static double _toDouble(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }
}
