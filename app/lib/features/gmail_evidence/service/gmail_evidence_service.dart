
import '../../../core/network/api_client.dart';
import '../model/gmail_evidence_candidate.dart';

class GmailEvidenceService {
  const GmailEvidenceService();

  Future<List<GmailEvidenceCandidate>> fetchCandidates({
    bool includeDone = false,
  }) async {
    final data = await ApiClient.get(
      action: 'gmail_evidence_candidates',
      queryParameters: {'includeDone': includeDone.toString()},
    );
    final items = data['items'];
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map((item) => GmailEvidenceCandidate.fromJson(
              Map<String, dynamic>.from(item),
            ))
        .toList();
  }

  Future<GmailEvidenceScanResult> scan({int days = 90}) async {
    final data = await ApiClient.post(
      action: 'gmail_evidence_scan',
      body: {'days': days},
    );
    return GmailEvidenceScanResult.fromJson(data);
  }

  Future<void> attach(GmailEvidenceCandidate candidate) async {
    await ApiClient.post(
      action: 'gmail_evidence_attach',
      body: {
        'candidateId': candidate.candidateId,
        'transactionId': candidate.proposedTransactionId,
      },
    );
  }

  Future<void> ignore(String candidateId) async {
    await ApiClient.post(
      action: 'gmail_evidence_ignore',
      body: {'candidateId': candidateId},
    );
  }
}
