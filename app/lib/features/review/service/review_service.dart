import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/constants/api_constants.dart';
import '../../transactions/model/transaction_model.dart';

class ReviewTransactionsResult {
  const ReviewTransactionsResult({
    required this.items,
    required this.total,
    required this.limit,
    required this.offset,
    required this.hasMore,
  });

  final List<TransactionModel> items;
  final int total;
  final int limit;
  final int offset;
  final bool hasMore;
}

class ReviewService {
  const ReviewService();

  Future<ReviewTransactionsResult> fetchReviewTransactions({
    int limit = 100,
    int offset = 0,
  }) async {
    final uri = Uri.parse(ApiConstants.baseUrl).replace(
      queryParameters: {
        'action': 'review_transactions',
        'key': ApiConstants.apiKey,
        'limit': limit.toString(),
        'offset': offset.toString(),
      },
    );

    final response = await http.get(uri);

    if (response.statusCode != 200) {
      throw Exception('要確認一覧を取得できませんでした');
    }

    final decoded = jsonDecode(response.body);

    if (decoded['success'] != true) {
      throw Exception(decoded['error']['message']);
    }

    final data = decoded['data'];

    if (data is! Map) {
      throw Exception('要確認一覧APIのデータ形式が正しくありません');
    }

    final itemsValue = data['items'];

    if (itemsValue is! List) {
      throw Exception('要確認一覧APIのitems形式が正しくありません');
    }

    final items = itemsValue.map((item) {
      if (item is! Map) {
        throw Exception('要確認取引の形式が正しくありません');
      }

      return TransactionModel.fromJson(Map<String, dynamic>.from(item));
    }).toList();

    return ReviewTransactionsResult(
      items: items,
      total: _toInt(data['total']),
      limit: _toInt(data['limit']),
      offset: _toInt(data['offset']),
      hasMore: data['hasMore'] == true,
    );
  }

  Future<int> fetchReviewCount() async {
    final uri = Uri.parse(ApiConstants.baseUrl).replace(
      queryParameters: {'action': 'review_count', 'key': ApiConstants.apiKey},
    );

    final response = await http.get(uri);

    if (response.statusCode != 200) {
      throw Exception('要確認件数を取得できませんでした');
    }

    final dynamic decodedValue = jsonDecode(response.body);

    if (decodedValue is! Map) {
      throw Exception('要確認件数APIの形式が正しくありません');
    }

    final decoded = Map<String, dynamic>.from(decodedValue);

    if (decoded['success'] != true) {
      throw Exception('要確認件数を取得できませんでした');
    }

    final data = decoded['data'];

    if (data is! Map) {
      throw Exception('要確認件数APIのデータ形式が正しくありません');
    }

    final count = data['count'];

    if (count is num) {
      return count.toInt();
    }

    return int.tryParse(count?.toString() ?? '') ?? 0;
  }

  static int _toInt(dynamic value) {
    if (value is int) {
      return value;
    }

    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}
