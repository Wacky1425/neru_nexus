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
    );
  }

  static int _toInt(dynamic value) {
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}

class AssetTrendResult {
  const AssetTrendResult({
    required this.items,
    required this.netChange,
    required this.netChangeRate,
  });

  final List<AssetSnapshotModel> items;
  final int netChange;
  final double netChangeRate;

  AssetSnapshotModel? get latest => items.isEmpty ? null : items.last;
  AssetSnapshotModel? get previous => items.length < 2 ? null : items[items.length - 2];

  factory AssetTrendResult.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'];
    return AssetTrendResult(
      items: rawItems is List
          ? rawItems
              .whereType<Map>()
              .map((item) => AssetSnapshotModel.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : <AssetSnapshotModel>[],
      netChange: AssetSnapshotModel._toInt(json['netChange']),
      netChangeRate: _toDouble(json['netChangeRate']),
    );
  }

  static double _toDouble(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }
}
