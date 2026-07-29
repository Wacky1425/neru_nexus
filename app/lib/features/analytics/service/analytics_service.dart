import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/constants/api_constants.dart';
import '../model/analytics_model.dart';

class AnalyticsService {
  const AnalyticsService();

  Future<AnalyticsModel> fetchAnalytics({
    String? yearMonth,
  }) async {
    final queryParameters = <String, String>{
      'action': 'analytics',
      'key': ApiConstants.apiKey,
    };

    if (yearMonth != null &&
        yearMonth.trim().isNotEmpty) {
      queryParameters['yearMonth'] =
          yearMonth.trim();
    }

    final uri =
        Uri.parse(ApiConstants.baseUrl).replace(
      queryParameters: queryParameters,
    );

    final response = await http.get(uri);

    if (response.statusCode != 200) {
      throw Exception(
        'Analyticsデータの取得に失敗しました: '
        '${response.statusCode}',
      );
    }

    final decoded =
        jsonDecode(response.body)
            as Map<String, dynamic>;

    if (decoded['success'] != true) {
      final error = decoded['error'] as Map?;

      throw Exception(
        error?['message']?.toString() ??
            'Analytics APIでエラーが発生しました',
      );
    }

    final data = decoded['data'];

    if (data is! Map) {
      throw Exception(
        'Analytics APIの形式が正しくありません',
      );
    }

    return AnalyticsModel.fromJson(
      Map<String, dynamic>.from(data),
    );
  }
}