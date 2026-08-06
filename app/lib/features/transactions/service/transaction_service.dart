import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/constants/api_constants.dart';
import '../transaction_form_page.dart';
import '../model/transaction_model.dart';

class TransactionService {
  const TransactionService();
  Future<List<TransactionModel>> fetchTransactions({
    int limit = 100,
    int offset = 0,
    String? yearMonth,
    String? keyword,
    String? majorCategory,
    bool reviewOnly = false,
  }) async {
    final queryParameters = <String, String>{
      'action': 'transactions',
      'key': ApiConstants.apiKey,
      'limit': limit.toString(),
      'offset': offset.toString(),
    };
    if (yearMonth != null && yearMonth.trim().isNotEmpty) {
      queryParameters['yearMonth'] = yearMonth.trim();
    }

    if (keyword != null && keyword.trim().isNotEmpty) {
      queryParameters['keyword'] = keyword.trim();
    }

    if (majorCategory != null && majorCategory.trim().isNotEmpty) {
      queryParameters['majorCategory'] = majorCategory.trim();
    }

    queryParameters['reviewOnly'] = reviewOnly.toString();

    final uri = Uri.parse(
      ApiConstants.baseUrl,
    ).replace(queryParameters: queryParameters);
    final response = await http.get(uri);

    if (response.statusCode != 200) {
      throw Exception(
        '取引一覧の取得に失敗しました: '
        '${response.statusCode}',
      );
    }

    final dynamic decodedValue;

    try {
      decodedValue = jsonDecode(response.body);
    } on FormatException {
      throw Exception('取引一覧APIから不正なレスポンスが返されました');
    }

    if (decodedValue is! Map) {
      throw Exception('取引一覧APIの形式が正しくありません');
    }

    final decoded = Map<String, dynamic>.from(decodedValue);

    if (decoded['success'] != true) {
      final error = decoded['error'];

      if (error is Map) {
        throw Exception(error['message']?.toString() ?? '取引一覧の取得に失敗しました');
      }

      throw Exception(error?.toString() ?? '取引一覧の取得に失敗しました');
    }

    final data = decoded['data'];

    if (data is! Map) {
      throw Exception('取引一覧APIのデータ形式が正しくありません');
    }

    final items = data['items'];

    if (items is! List) {
      throw Exception('取引一覧APIのitems形式が正しくありません');
    }

    return items.map((item) {
      if (item is! Map) {
        throw Exception('取引データの形式が正しくありません');
      }

      return TransactionModel.fromJson(Map<String, dynamic>.from(item));
    }).toList();
  }

  Future<void> createTransaction({
    required TransactionFormResult transaction,
  }) async {
    final uri = Uri.parse(ApiConstants.baseUrl);

    final client = http.Client();

    try {
      final request = http.Request('POST', uri);

      request.followRedirects = false;

      request.headers.addAll({'Content-Type': 'application/json'});

      request.body = jsonEncode({
        'action': 'transaction_create',
        'key': ApiConstants.apiKey,
        'transactionDate': _formatDate(transaction.date),
        'type': transaction.type == TransactionType.expense ? '支出' : '収入',
        'amount': transaction.amount,
        'majorCategory': transaction.majorCategory,
        'subCategory': transaction.subCategory,
        'title': transaction.title,
        'paymentMethod': transaction.paymentMethod,
        'status': transaction.status,
        'memo': transaction.memo ?? '',
        'accountName': transaction.accountName,
      });

      final streamedResponse = await client.send(request);

      final response = await _resolveResponse(client, streamedResponse);

      if (response.statusCode != 200) {
        throw Exception(
          '取引の登録に失敗しました: '
          '${response.statusCode}',
        );
      }

      final dynamic decodedValue;

      try {
        decodedValue = jsonDecode(response.body);
      } on FormatException {
        throw Exception('取引登録APIから不正なレスポンスが返されました');
      }

      if (decodedValue is! Map) {
        throw Exception('取引登録APIの形式が正しくありません');
      }

      final decoded = Map<String, dynamic>.from(decodedValue);

      if (decoded['success'] != true) {
        final error = decoded['error'];

        if (error is Map) {
          throw Exception(error['message']?.toString() ?? '取引の登録に失敗しました');
        }

        throw Exception(error?.toString() ?? '取引の登録に失敗しました');
      }

      final data = decoded['data'];

      if (data is! Map) {
        throw Exception('取引登録APIのデータ形式が正しくありません');
      }

      final addedCount = _toInt(data['addedCount']);

      if (addedCount <= 0) {
        throw Exception('取引が登録されませんでした');
      }
    } finally {
      client.close();
    }
  }

  Future<void> updateTransaction({
    required String id,
    required TransactionFormResult transaction,
  }) async {
    if (id.trim().isEmpty) {
      throw Exception('更新対象の取引IDがありません');
    }

    final uri = Uri.parse(ApiConstants.baseUrl);

    final client = http.Client();

    try {
      final request = http.Request('POST', uri);

      request.followRedirects = false;

      request.headers.addAll({'Content-Type': 'application/json'});

      request.body = jsonEncode({
        'action': 'transaction_update',
        'key': ApiConstants.apiKey,
        'id': id,
        'transactionDate': _formatDate(transaction.date),
        'type': transaction.type == TransactionType.expense ? '支出' : '収入',
        'amount': transaction.amount,
        'majorCategory': transaction.majorCategory,
        'subCategory': transaction.subCategory,
        'title': transaction.title,
        'paymentMethod': transaction.paymentMethod,
        'status': transaction.status,
        'memo': transaction.memo ?? '',
      });

      final streamedResponse = await client.send(request);

      final response = await _resolveResponse(client, streamedResponse);

      if (response.statusCode != 200) {
        throw Exception(
          '取引の更新に失敗しました: '
          '${response.statusCode}',
        );
      }

      final dynamic decodedValue;

      try {
        decodedValue = jsonDecode(response.body);
      } on FormatException {
        throw Exception('取引更新APIから不正なレスポンスが返されました');
      }

      if (decodedValue is! Map) {
        throw Exception('取引更新APIの形式が正しくありません');
      }

      final decoded = Map<String, dynamic>.from(decodedValue);

      if (decoded['success'] != true) {
        final error = decoded['error'];

        if (error is Map) {
          throw Exception(error['message']?.toString() ?? '取引の更新に失敗しました');
        }

        throw Exception(error?.toString() ?? '取引の更新に失敗しました');
      }

      final data = decoded['data'];

      if (data is! Map) {
        throw Exception('取引更新APIのデータ形式が正しくありません');
      }

      if (data['updated'] != true) {
        throw Exception('取引が更新されませんでした');
      }
    } finally {
      client.close();
    }
  }

  Future<void> deleteTransaction({required String id}) async {
    if (id.trim().isEmpty) {
      throw Exception('削除対象の取引IDがありません');
    }

    final uri = Uri.parse(ApiConstants.baseUrl);

    final client = http.Client();

    try {
      final request = http.Request('POST', uri);

      request.followRedirects = false;

      request.headers.addAll({'Content-Type': 'application/json'});

      request.body = jsonEncode({
        'action': 'transaction_delete',
        'key': ApiConstants.apiKey,
        'id': id.trim(),
      });

      final streamedResponse = await client.send(request);

      final response = await _resolveResponse(client, streamedResponse);

      if (response.statusCode != 200) {
        throw Exception(
          '取引の削除に失敗しました: '
          '${response.statusCode}',
        );
      }

      final dynamic decodedValue;

      try {
        decodedValue = jsonDecode(response.body);
      } on FormatException {
        throw Exception('取引削除APIから不正なレスポンスが返されました');
      }

      if (decodedValue is! Map) {
        throw Exception('取引削除APIの形式が正しくありません');
      }

      final decoded = Map<String, dynamic>.from(decodedValue);

      if (decoded['success'] != true) {
        final error = decoded['error'];

        if (error is Map) {
          throw Exception(error['message']?.toString() ?? '取引の削除に失敗しました');
        }

        throw Exception(error?.toString() ?? '取引の削除に失敗しました');
      }

      final data = decoded['data'];

      if (data is! Map) {
        throw Exception('取引削除APIのデータ形式が正しくありません');
      }

      if (data['deleted'] != true) {
        throw Exception('取引が削除されませんでした');
      }
    } finally {
      client.close();
    }
  }

  Future<http.Response> _resolveResponse(
    http.Client client,
    http.StreamedResponse initialResponse,
  ) async {
    final initialBody = await initialResponse.stream.bytesToString();

    final statusCode = initialResponse.statusCode;

    if (statusCode != 301 &&
        statusCode != 302 &&
        statusCode != 303 &&
        statusCode != 307 &&
        statusCode != 308) {
      return http.Response(
        initialBody,
        statusCode,
        headers: initialResponse.headers,
      );
    }

    final location = initialResponse.headers['location'];

    if (location == null || location.trim().isEmpty) {
      throw Exception('取引登録APIの転送先が取得できませんでした');
    }

    final redirectUri = Uri.parse(location);

    /*
     * Apps ScriptのPOST処理はすでに完了している。
     * 転送先にはGETでレスポンス本文だけを取得する。
     */
    return client.get(redirectUri);
  }

  static String _formatDate(DateTime date) {
    final year = date.year.toString().padLeft(4, '0');

    final month = date.month.toString().padLeft(2, '0');

    final day = date.day.toString().padLeft(2, '0');

    return '$year-$month-$day';
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
