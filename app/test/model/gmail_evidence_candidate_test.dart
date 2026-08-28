
import 'package:app/features/gmail_evidence/model/gmail_evidence_candidate.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses Gmail evidence candidate and proposed match', () {
    final item = GmailEvidenceCandidate.fromJson({
      'candidateId': 'c1',
      'transactionDate': '2026-08-28',
      'merchant': 'Amazon',
      'amount': 1980,
      'subject': '領収書',
      'attachmentCount': 1,
      'proposedTransactionId': 't1',
      'proposedTransactionLabel': '2026-08-28 Amazon ¥1980',
      'matchScore': 0.95,
      'status': 'matched',
    });

    expect(item.hasMatch, isTrue);
    expect(item.amount, 1980);
    expect(item.matchScore, 0.95);
  });
}
