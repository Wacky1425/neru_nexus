
import '../../../core/network/api_client.dart';
import 'sbi_investment_event_model.dart';

class SbiInvestmentEventService {
  const SbiInvestmentEventService();

  Future<List<SbiInvestmentEventModel>> fetchEvents() async {
    final data = await ApiClient.get(action: 'sbi_investment_events');
    final items = data['items'];
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map(
          (item) => SbiInvestmentEventModel.fromJson(
            Map<String, dynamic>.from(item),
          ),
        )
        .toList();
  }

  Future<SbiInvestmentScanResult> scan({int days = 90}) async {
    final data = await ApiClient.post(
      action: 'sbi_investment_scan',
      body: {'days': days},
    );
    return SbiInvestmentScanResult.fromJson(data);
  }

  Future<void> apply(SbiInvestmentEventModel event) async {
    await ApiClient.post(
      action: 'sbi_investment_event_apply',
      body: {
        'eventId': event.eventId,
        'holdingId': event.holdingId,
      },
    );
  }

  Future<void> ignore(String eventId) async {
    await ApiClient.post(
      action: 'sbi_investment_event_ignore',
      body: {'eventId': eventId},
    );
  }
}
