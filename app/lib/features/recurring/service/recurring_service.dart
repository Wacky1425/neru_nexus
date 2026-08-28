import '../../../core/network/api_client.dart';
import '../model/recurring_candidate_model.dart';

class RecurringService {
  const RecurringService();

  Future<RecurringCandidatesResult> fetchCandidates() async {
    final data = await ApiClient.get(action: 'recurring_candidates');
    return RecurringCandidatesResult.fromJson(data);
  }

  Future<void> updateCandidate({
    required String candidateKey,
    required String status,
    String recurringType = '',
    String note = '',
  }) async {
    await ApiClient.post(
      action: 'recurring_candidate_update',
      body: {
        'candidateKey': candidateKey,
        'status': status,
        'recurringType': recurringType,
        'note': note,
      },
    );
  }
}
