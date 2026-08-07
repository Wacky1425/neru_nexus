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
    required this.rawText,
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
    );
  }
}
