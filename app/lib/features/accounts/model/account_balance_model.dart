class AccountBalanceModel {
  const AccountBalanceModel({
    required this.accountId,
    required this.accountName,
    required this.paymentMethod,
    required this.wallet,
    required this.institution,
    required this.isAsset,
    required this.isLiability,
    required this.currentBalance,
    required this.openingBalance,
    required this.openingBalanceDate,
    required this.closingDay,
    required this.paymentDay,
    required this.paymentMonthOffset,
    required this.nextBillingYearMonth,
    required this.nextBillingAmount,
    required this.laterBillingAmount,
  });

  final String accountId;
  final String accountName;
  final String paymentMethod;
  final String wallet;
  final String institution;

  final bool isAsset;
  final bool isLiability;

  final int currentBalance;
  final int openingBalance;
  final String openingBalanceDate;

  // クレジットカード請求設定
  // 0 = 未設定
  // closingDay 31 = 月末締め
  final int closingDay;
  final int paymentDay;
  final int paymentMonthOffset;

  // クレジットカード請求情報
  final String nextBillingYearMonth;
  final int nextBillingAmount;
  final int laterBillingAmount;

  factory AccountBalanceModel.fromJson(Map<String, dynamic> json) {
    return AccountBalanceModel(
      accountId: json['accountId']?.toString() ?? '',

      accountName: json['accountName']?.toString() ?? '',

      paymentMethod: json['paymentMethod']?.toString() ?? '',

      wallet: json['wallet']?.toString() ?? '',

      institution: json['institution']?.toString() ?? '',

      isAsset: json['isAsset'] == true,

      isLiability: json['isLiability'] == true,

      currentBalance: _toInt(json['currentBalance']),

      openingBalance: _toInt(json['openingBalance']),

      openingBalanceDate: json['openingBalanceDate']?.toString() ?? '',

      closingDay: _toInt(json['closingDay']),

      paymentDay: _toInt(json['paymentDay']),

      paymentMonthOffset: _toInt(json['paymentMonthOffset']),

      nextBillingYearMonth: json['nextBillingYearMonth']?.toString() ?? '',

      nextBillingAmount: _toInt(json['nextBillingAmount']),

      laterBillingAmount: _toInt(json['laterBillingAmount']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'accountId': accountId,
      'accountName': accountName,
      'paymentMethod': paymentMethod,
      'wallet': wallet,
      'institution': institution,
      'isAsset': isAsset,
      'isLiability': isLiability,
      'currentBalance': currentBalance,
      'openingBalance': openingBalance,
      'openingBalanceDate': openingBalanceDate,
      'closingDay': closingDay,
      'paymentDay': paymentDay,
      'paymentMonthOffset': paymentMonthOffset,
      'nextBillingYearMonth': nextBillingYearMonth,
      'nextBillingAmount': nextBillingAmount,
      'laterBillingAmount': laterBillingAmount,
    };
  }

  static int _toInt(dynamic value) {
    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}

class AccountBalancesResult {
  const AccountBalancesResult({
    required this.items,
    required this.totalAssets,
    required this.totalLiabilities,
    required this.netAssets,
  });

  final List<AccountBalanceModel> items;

  final int totalAssets;
  final int totalLiabilities;
  final int netAssets;

  factory AccountBalancesResult.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'];

    final items = rawItems is List
        ? rawItems
              .whereType<Map>()
              .map(
                (item) => AccountBalanceModel.fromJson(
                  Map<String, dynamic>.from(item),
                ),
              )
              .toList()
        : <AccountBalanceModel>[];

    return AccountBalancesResult(
      items: items,
      totalAssets: _toInt(json['totalAssets']),
      totalLiabilities: _toInt(json['totalLiabilities']),
      netAssets: _toInt(json['netAssets']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'items': items.map((item) => item.toJson()).toList(),
      'totalAssets': totalAssets,
      'totalLiabilities': totalLiabilities,
      'netAssets': netAssets,
    };
  }

  static int _toInt(dynamic value) {
    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}
