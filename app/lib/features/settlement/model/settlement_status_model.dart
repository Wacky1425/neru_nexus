class SettlementDetailModel {
  const SettlementDetailModel({
    required this.id,
    required this.transactionDate,
    required this.merchant,
    required this.itemName,
    required this.amount,
    required this.majorCategory,
    required this.subCategory,
    required this.settlementStatus,
    required this.settlementId,
  });

  final String id;

  final String transactionDate;

  final String merchant;

  final String itemName;

  final int amount;

  final String majorCategory;

  final String subCategory;

  final String settlementStatus;

  final String settlementId;

  factory SettlementDetailModel.fromJson(Map<String, dynamic> json) {
    return SettlementDetailModel(
      id: json['id']?.toString() ?? '',

      transactionDate: json['transactionDate']?.toString() ?? '',

      merchant: json['merchant']?.toString() ?? '',

      itemName: json['itemName']?.toString() ?? '',

      amount: _toInt(json['amount']),

      majorCategory: json['majorCategory']?.toString() ?? '',

      subCategory: json['subCategory']?.toString() ?? '',

      settlementStatus: json['settlementStatus']?.toString() ?? '',

      settlementId: json['settlementId']?.toString() ?? '',
    );
  }

  static int _toInt(dynamic value) {
    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}

class SettlementStatusModel {
  const SettlementStatusModel({
    required this.transactionId,
    required this.cardAccount,
    required this.settlementDate,
    required this.billingYearMonth,
    required this.settlementAmount,
    required this.detailTotal,
    required this.difference,
    required this.detailCount,
    required this.status,
    required this.settlementId,
    required this.detailTransactionIds,
    required this.detailItems,
    required this.canManualMatch,
    required this.reason,
  });

  final String transactionId;

  final String cardAccount;

  final String settlementDate;

  final String billingYearMonth;

  final int settlementAmount;

  final int detailTotal;

  final int difference;

  final int detailCount;

  final String status;

  final String settlementId;

  final List<String> detailTransactionIds;

  final List<SettlementDetailModel> detailItems;

  final bool canManualMatch;

  final String reason;

  factory SettlementStatusModel.fromJson(Map<String, dynamic> json) {
    return SettlementStatusModel(
      transactionId: json['transactionId']?.toString() ?? '',

      cardAccount: json['cardAccount']?.toString() ?? '',

      settlementDate: json['settlementDate']?.toString() ?? '',

      billingYearMonth: json['billingYearMonth']?.toString() ?? '',

      settlementAmount: _toInt(json['settlementAmount']),

      detailTotal: _toInt(json['detailTotal']),

      difference: _toInt(json['difference']),

      detailCount: _toInt(json['detailCount']),

      status: json['status']?.toString() ?? '',

      settlementId: json['settlementId']?.toString() ?? '',

      detailTransactionIds: (json['detailTransactionIds'] as List? ?? [])
          .map((item) => item.toString())
          .toList(),

      detailItems: (json['detailItems'] as List? ?? [])
          .whereType<Map>()
          .map(
            (item) =>
                SettlementDetailModel.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(),

      canManualMatch: json['canManualMatch'] == true,

      reason: json['reason']?.toString() ?? '',
    );
  }

  bool get isMatched => status == 'matched';

  bool get isManualMatched => status == 'manual_matched';

  bool get isReview => status == 'review';

  bool get isPending => status == 'pending';

  bool get hasDifference => difference != 0;

  bool get hasDetails => detailItems.isNotEmpty;

  static int _toInt(dynamic value) {
    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}

class SettlementStatusSummaryModel {
  const SettlementStatusSummaryModel({
    required this.totalCount,
    required this.matchedCount,
    required this.manualMatchedCount,
    required this.reviewCount,
    required this.pendingCount,
  });

  final int totalCount;

  final int matchedCount;

  final int manualMatchedCount;

  final int reviewCount;

  final int pendingCount;

  factory SettlementStatusSummaryModel.fromJson(Map<String, dynamic> json) {
    return SettlementStatusSummaryModel(
      totalCount: _toInt(json['totalCount']),

      matchedCount: _toInt(json['matchedCount']),

      manualMatchedCount: _toInt(json['manualMatchedCount']),

      reviewCount: _toInt(json['reviewCount']),

      pendingCount: _toInt(json['pendingCount']),
    );
  }

  static int _toInt(dynamic value) {
    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}

class SettlementStatusesResponseModel {
  const SettlementStatusesResponseModel({
    required this.items,
    required this.summary,
  });

  final List<SettlementStatusModel> items;

  final SettlementStatusSummaryModel summary;

  factory SettlementStatusesResponseModel.fromJson(Map<String, dynamic> json) {
    return SettlementStatusesResponseModel(
      items: (json['items'] as List? ?? [])
          .whereType<Map>()
          .map(
            (item) =>
                SettlementStatusModel.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(),

      summary: SettlementStatusSummaryModel.fromJson(
        Map<String, dynamic>.from(json['summary'] as Map? ?? {}),
      ),
    );
  }
}
