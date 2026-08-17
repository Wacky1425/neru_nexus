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

  factory AccountBalanceModel.fromJson(Map<String, dynamic> json) {
    return AccountBalanceModel(
      accountId: json['accountId']?.toString() ?? '',
      accountName: json['accountName']?.toString() ?? '',
      paymentMethod: json['paymentMethod']?.toString() ?? '',
      wallet: json['wallet']?.toString() ?? '',
      institution: json['institution']?.toString() ?? '',
      isAsset: json['isAsset'] == true,
      isLiability: json['isLiability'] == true,
      currentBalance: (json['currentBalance'] as num?)?.toInt() ?? 0,
      openingBalance: (json['openingBalance'] as num?)?.toInt() ?? 0,
      openingBalanceDate: json['openingBalanceDate']?.toString() ?? '',
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
    };
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
      totalAssets: (json['totalAssets'] as num?)?.toInt() ?? 0,
      totalLiabilities: (json['totalLiabilities'] as num?)?.toInt() ?? 0,
      netAssets: (json['netAssets'] as num?)?.toInt() ?? 0,
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
}
