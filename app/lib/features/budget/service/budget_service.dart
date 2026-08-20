import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/constants/api_constants.dart';
import '../model/budget_model.dart';

class BudgetService {
  const BudgetService();

  Future<BudgetModel> fetchBudget({required String yearMonth}) async {
    final uri = Uri.parse(ApiConstants.baseUrl).replace(
      queryParameters: {
        'action': 'budget_settings',
        'key': ApiConstants.apiKey,
        'yearMonth': yearMonth,
      },
    );

    final response = await http.get(uri);

    if (response.statusCode != 200) {
      throw Exception('予算設定の取得に失敗しました: ${response.statusCode}');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;

    if (decoded['success'] != true) {
      final error = decoded['error'] as Map?;

      throw Exception(error?['message']?.toString() ?? '予算設定APIでエラーが発生しました');
    }

    final data = decoded['data'];

    if (data is! Map) {
      throw Exception('予算設定APIの形式が正しくありません');
    }

    return BudgetModel.fromJson(Map<String, dynamic>.from(data));
  }

  Future<BudgetModel> updateBudget({
    required String yearMonth,
    required int salaryPlanned,
    required int sideIncomePlanned,
    required int savingTarget,
    required int nisaTarget,
    required int fixedExpenseBudget,
    required int variableExpenseBudget,
    required int dreamTarget,
  }) async {
    final uri = Uri.parse(ApiConstants.baseUrl);

    final response = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'action': 'budget_settings_update',
        'key': ApiConstants.apiKey,
        'yearMonth': yearMonth,
        'salaryPlanned': salaryPlanned,
        'sideIncomePlanned': sideIncomePlanned,
        'savingTarget': savingTarget,
        'nisaTarget': nisaTarget,
        'fixedExpenseBudget': fixedExpenseBudget,
        'variableExpenseBudget': variableExpenseBudget,
        'dreamTarget': dreamTarget,
      }),
    );

    if (response.statusCode != 200) {
      throw Exception('予算設定の保存に失敗しました: ${response.statusCode}');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;

    if (decoded['success'] != true) {
      final error = decoded['error'] as Map?;

      throw Exception(error?['message']?.toString() ?? '予算設定の保存中にエラーが発生しました');
    }

    final data = decoded['data'];

    if (data is! Map) {
      throw Exception('予算設定APIの形式が正しくありません');
    }

    return BudgetModel.fromJson(Map<String, dynamic>.from(data));
  }
}
