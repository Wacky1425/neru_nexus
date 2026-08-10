class TransactionModel {
  const TransactionModel({
    required this.id,
    required this.transactionDate,
    required this.merchant,
    required this.itemName,
    required this.amount,
    required this.type,
    required this.majorCategory,
    required this.subCategory,
    required this.status,
    required this.wallet,
    required this.intent,
    required this.paymentMethod,
    required this.accountName,
    required this.rawText,
    required this.settlementStatus,
    required this.settlementId,
    required this.fromAccount,
    required this.toAccount,
    required this.importBatch,
  });

  final String id;
  final String transactionDate;
  final String merchant;
  final String itemName;
  final int amount;
  final String type;
  final String majorCategory;
  final String subCategory;
  final String status;
  final String wallet;
  final String intent;
  final String paymentMethod;
  final String rawText;
  final String settlementStatus;
  final String settlementId;
  final String fromAccount;
  final String toAccount;
  final String importBatch;
  final String accountName;

  factory TransactionModel.fromJson(Map<String, dynamic> json) {
    return TransactionModel(
      id: json['id'] ?? '',
      transactionDate: json['transactionDate'] ?? '',
      merchant: json['merchant'] ?? '',
      itemName: json['itemName'] ?? '',
      amount: (json['amount'] as num?)?.toInt() ?? 0,
      type: json['type'] ?? '',
      majorCategory: json['majorCategory'] ?? '',
      subCategory: json['subCategory'] ?? '',
      status: json['status'] ?? '',
      wallet: json['wallet'] ?? '',
      intent: json['intent'] ?? '',
      paymentMethod: json['paymentMethod'] ?? '',
      rawText: json['rawText'] ?? '',
      settlementStatus: json['settlementStatus'] ?? '',
      settlementId: json['settlementId'] ?? '',
      fromAccount: json['fromAccount'] ?? '',
      toAccount: json['toAccount'] ?? '',
      importBatch: json['importBatch'] ?? '',
      accountName: json['accountName'] ?? '',
    );
  }
}

class SettlementCandidate {
  const SettlementCandidate({
    required this.importBatch,
    required this.cardAccount,
    required this.totalAmount,
    required this.settlementAmount,
    required this.difference,
    required this.detailCount,
    required this.firstDate,
    required this.lastDate,
  });

  final String importBatch;
  final String cardAccount;
  final int totalAmount;
  final int settlementAmount;
  final int difference;
  final int detailCount;
  final String firstDate;
  final String lastDate;

  factory SettlementCandidate.fromJson(Map<String, dynamic> json) {
    return SettlementCandidate(
      importBatch: json['importBatch']?.toString() ?? '',
      cardAccount: json['cardAccount']?.toString() ?? '',
      totalAmount: (json['totalAmount'] as num?)?.toInt() ?? 0,
      settlementAmount: (json['settlementAmount'] as num?)?.toInt() ?? 0,
      difference: (json['difference'] as num?)?.toInt() ?? 0,
      detailCount: (json['detailCount'] as num?)?.toInt() ?? 0,
      firstDate: json['firstDate']?.toString() ?? '',
      lastDate: json['lastDate']?.toString() ?? '',
    );
  }
}
