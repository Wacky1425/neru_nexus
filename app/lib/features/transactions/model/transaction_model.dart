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
    required this.purposeType,
    required this.expenseRatio,
    required this.expenseAmount,
    required this.evidenceUrl,
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
    required this.note,
    required this.sourceId,
    required this.sourceType,
    required this.sourceStatus,
    required this.sourceReceivedAt,
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

  final String purposeType;
  final double expenseRatio;
  final int expenseAmount;
  final String evidenceUrl;

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

  final String note;

  final String sourceId;

  final String sourceType;

  final String sourceStatus;

  final String sourceReceivedAt;

  bool get isImported {
    final value = sourceType.trim();

    return value.isNotEmpty && value != 'Neru Nexus App';
  }

  bool get isPreliminary {
    final value = sourceStatus.trim().toLowerCase();

    return value == 'preliminary' || value == 'preliminary_edited';
  }

  bool get isPreliminaryEdited =>
      sourceStatus.trim().toLowerCase() == 'preliminary_edited';

  bool get isConfirmedSource =>
      sourceStatus.trim().toLowerCase() == 'confirmed';

  bool get isManualConfirmed =>
      sourceStatus.trim().toLowerCase() == 'manual_confirmed';

  bool get isStalePreliminary {
    if (!isPreliminary) {
      return false;
    }

    final value = sourceReceivedAt.trim();

    if (value.isEmpty) {
      return false;
    }

    final receivedAt = DateTime.tryParse(value.replaceFirst(' ', 'T'));

    if (receivedAt == null) {
      return false;
    }

    final difference = DateTime.now().difference(receivedAt);

    return difference.inDays >= 30;
  }

  factory TransactionModel.fromJson(Map<String, dynamic> json) {
    return TransactionModel(
      id: json['id']?.toString() ?? '',

      transactionDate: json['transactionDate']?.toString() ?? '',

      merchant: json['merchant']?.toString() ?? '',

      itemName: json['itemName']?.toString() ?? '',

      amount: (json['amount'] as num?)?.toInt() ?? 0,

      type: json['type']?.toString() ?? '',

      majorCategory: json['majorCategory']?.toString() ?? '',

      subCategory: json['subCategory']?.toString() ?? '',

      status: json['status']?.toString() ?? '',

      purposeType: json['purposeType']?.toString() ?? '',

      expenseRatio: (json['expenseRatio'] as num?)?.toDouble() ?? 0,

      expenseAmount: (json['expenseAmount'] as num?)?.toInt() ?? 0,

      evidenceUrl: json['evidenceUrl']?.toString() ?? '',

      wallet: json['wallet']?.toString() ?? '',

      intent: json['intent']?.toString() ?? '',

      paymentMethod: json['paymentMethod']?.toString() ?? '',

      rawText: json['rawText']?.toString() ?? '',

      settlementStatus: json['settlementStatus']?.toString() ?? '',

      settlementId: json['settlementId']?.toString() ?? '',

      fromAccount: json['fromAccount']?.toString() ?? '',

      toAccount: json['toAccount']?.toString() ?? '',

      importBatch: json['importBatch']?.toString() ?? '',

      accountName: json['accountName']?.toString() ?? '',

      note: json['note']?.toString() ?? '',

      sourceId: json['sourceId']?.toString() ?? '',

      sourceType: json['sourceType']?.toString() ?? '',

      sourceStatus: json['sourceStatus']?.toString() ?? '',

      sourceReceivedAt: json['sourceReceivedAt']?.toString() ?? '',
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
