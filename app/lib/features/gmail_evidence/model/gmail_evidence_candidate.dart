
class GmailEvidenceCandidate {
  const GmailEvidenceCandidate({
    required this.candidateId,
    required this.receivedAt,
    required this.transactionDate,
    required this.merchant,
    required this.amount,
    required this.subject,
    required this.gmailUrl,
    required this.attachmentCount,
    required this.proposedTransactionId,
    required this.proposedTransactionLabel,
    required this.matchScore,
    required this.status,
  });

  final String candidateId;
  final String receivedAt;
  final String transactionDate;
  final String merchant;
  final int amount;
  final String subject;
  final String gmailUrl;
  final int attachmentCount;
  final String proposedTransactionId;
  final String proposedTransactionLabel;
  final double matchScore;
  final String status;

  bool get hasMatch => proposedTransactionId.trim().isNotEmpty;

  factory GmailEvidenceCandidate.fromJson(Map<String, dynamic> json) {
    return GmailEvidenceCandidate(
      candidateId: json['candidateId']?.toString() ?? '',
      receivedAt: json['receivedAt']?.toString() ?? '',
      transactionDate: json['transactionDate']?.toString() ?? '',
      merchant: json['merchant']?.toString() ?? '',
      amount: _toInt(json['amount']),
      subject: json['subject']?.toString() ?? '',
      gmailUrl: json['gmailUrl']?.toString() ?? '',
      attachmentCount: _toInt(json['attachmentCount']),
      proposedTransactionId:
          json['proposedTransactionId']?.toString() ?? '',
      proposedTransactionLabel:
          json['proposedTransactionLabel']?.toString() ?? '',
      matchScore: _toDouble(json['matchScore']),
      status: json['status']?.toString() ?? '',
    );
  }

  static int _toInt(dynamic value) =>
      value is num ? value.toInt() : int.tryParse(value?.toString() ?? '') ?? 0;
  static double _toDouble(dynamic value) =>
      value is num ? value.toDouble() : double.tryParse(value?.toString() ?? '') ?? 0;
}

class GmailEvidenceScanResult {
  const GmailEvidenceScanResult({
    required this.inspectedCount,
    required this.addedCount,
    required this.matchedCount,
    required this.unmatchedCount,
  });

  final int inspectedCount;
  final int addedCount;
  final int matchedCount;
  final int unmatchedCount;

  factory GmailEvidenceScanResult.fromJson(Map<String, dynamic> json) {
    return GmailEvidenceScanResult(
      inspectedCount: GmailEvidenceCandidate._toInt(json['inspectedCount']),
      addedCount: GmailEvidenceCandidate._toInt(json['addedCount']),
      matchedCount: GmailEvidenceCandidate._toInt(json['matchedCount']),
      unmatchedCount: GmailEvidenceCandidate._toInt(json['unmatchedCount']),
    );
  }
}
