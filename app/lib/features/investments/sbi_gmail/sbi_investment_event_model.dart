
class SbiInvestmentEventModel {
  const SbiInvestmentEventModel({
    required this.eventId,
    required this.tradeDate,
    required this.side,
    required this.securityName,
    required this.symbol,
    required this.quantity,
    required this.price,
    required this.amount,
    required this.subject,
    required this.gmailUrl,
    required this.holdingId,
    required this.holdingName,
    required this.matchScore,
    required this.status,
  });

  final String eventId;
  final String tradeDate;
  final String side;
  final String securityName;
  final String symbol;
  final double quantity;
  final double price;
  final double amount;
  final String subject;
  final String gmailUrl;
  final String holdingId;
  final String holdingName;
  final double matchScore;
  final String status;

  bool get isMatched => holdingId.trim().isNotEmpty;
  bool get isBuy => side == 'buy';

  factory SbiInvestmentEventModel.fromJson(Map<String, dynamic> json) {
    return SbiInvestmentEventModel(
      eventId: json['eventId']?.toString() ?? '',
      tradeDate: json['tradeDate']?.toString() ?? '',
      side: json['side']?.toString() ?? '',
      securityName: json['securityName']?.toString() ?? '',
      symbol: json['symbol']?.toString() ?? '',
      quantity: _toDouble(json['quantity']),
      price: _toDouble(json['price']),
      amount: _toDouble(json['amount']),
      subject: json['subject']?.toString() ?? '',
      gmailUrl: json['gmailUrl']?.toString() ?? '',
      holdingId: json['holdingId']?.toString() ?? '',
      holdingName: json['holdingName']?.toString() ?? '',
      matchScore: _toDouble(json['matchScore']),
      status: json['status']?.toString() ?? '',
    );
  }

  static double _toDouble(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }
}

class SbiInvestmentScanResult {
  const SbiInvestmentScanResult({
    required this.inspectedCount,
    required this.addedCount,
    required this.matchedCount,
    required this.unmatchedCount,
  });

  final int inspectedCount;
  final int addedCount;
  final int matchedCount;
  final int unmatchedCount;

  factory SbiInvestmentScanResult.fromJson(Map<String, dynamic> json) {
    int toInt(dynamic value) {
      if (value is num) return value.toInt();
      return int.tryParse(value?.toString() ?? '') ?? 0;
    }

    return SbiInvestmentScanResult(
      inspectedCount: toInt(json['inspectedCount']),
      addedCount: toInt(json['addedCount']),
      matchedCount: toInt(json['matchedCount']),
      unmatchedCount: toInt(json['unmatchedCount']),
    );
  }
}
