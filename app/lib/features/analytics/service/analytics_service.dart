import '../../../core/network/api_client.dart';
import '../model/analytics_model.dart';

class AnalyticsService {
  const AnalyticsService();

  Future<AnalyticsModel> fetchAnalytics({String? yearMonth}) async {
    final queryParameters = <String, String>{};

    if (yearMonth != null && yearMonth.trim().isNotEmpty) {
      queryParameters['yearMonth'] = yearMonth.trim();
    }

    final data = await ApiClient.get(
      action: 'analytics',
      queryParameters: queryParameters,
    );

    return AnalyticsModel.fromJson(data);
  }
}
