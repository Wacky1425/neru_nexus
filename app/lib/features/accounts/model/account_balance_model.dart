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
}
