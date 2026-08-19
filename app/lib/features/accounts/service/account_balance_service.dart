import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/constants/api_constants.dart';
import '../model/account_balance_model.dart';

class AccountBalanceService {
  const AccountBalanceService();

  static AccountBalancesResult? _cachedResult;

  static AccountBalancesResult? get cachedResult {
    return _cachedResult;
  }

  static bool get hasCache {
    return _cachedResult != null;
  }

  static void clearCache() {
    _cachedResult = null;
  }

  static const String _storageKey = 'account_balances_cache';

  static Future<AccountBalancesResult?> loadStoredCache() async {
    final prefs = await SharedPreferences.getInstance();

    final raw = prefs.getString(_storageKey);

    if (raw == null || raw.isEmpty) {
      return null;
    }

    try {
      final decoded = jsonDecode(raw);

      if (decoded is! Map) {
        return null;
      }

      final result = AccountBalancesResult.fromJson(
        Map<String, dynamic>.from(decoded),
      );

      _cachedResult = result;

      return result;
    } catch (_) {
      return null;
    }
  }

  static Future<void> _saveStoredCache(AccountBalancesResult result) async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.setString(_storageKey, jsonEncode(result.toJson()));
  }

  Future<AccountBalancesResult> fetchAccountBalances() async {
    final uri = Uri.parse(ApiConstants.baseUrl).replace(
      queryParameters: {
        'action': 'account_balances',
        'key': ApiConstants.apiKey,
      },
    );

    final response = await http.get(uri);

    if (response.statusCode != 200) {
      throw Exception(
        '口座残高の取得に失敗しました: '
        '${response.statusCode}',
      );
    }

    final dynamic decodedValue;

    try {
      decodedValue = jsonDecode(response.body);
    } on FormatException {
      throw Exception(
        '口座残高APIから'
        '不正なレスポンスが返されました',
      );
    }

    if (decodedValue is! Map) {
      throw Exception('口座残高APIの形式が正しくありません');
    }

    final decoded = Map<String, dynamic>.from(decodedValue);

    if (decoded['success'] != true) {
      final error = decoded['error'];

      if (error is Map) {
        throw Exception(error['message']?.toString() ?? '口座残高の取得に失敗しました');
      }

      throw Exception(error?.toString() ?? '口座残高の取得に失敗しました');
    }

    final data = decoded['data'];

    if (data is! Map) {
      throw Exception('口座残高APIのデータ形式が正しくありません');
    }

    final dataMap = Map<String, dynamic>.from(data);

    final rawItems = dataMap['items'];

    final items = rawItems is List
        ? rawItems
              .whereType<Map>()
              .map(
                (item) => AccountBalanceModel.fromJson(
                  Map<String, dynamic>.from(item),
                ),
              )
              .toList()
        : <AccountBalanceModel>[];

    final result = AccountBalancesResult(
      items: items,
      totalAssets: _toInt(dataMap['totalAssets']),
      totalLiabilities: _toInt(dataMap['totalLiabilities']),
      netAssets: _toInt(dataMap['netAssets']),
    );

    _cachedResult = result;

    await _saveStoredCache(result);

    return result;
  }

  Future<void> updateOpeningBalance({
    required String accountId,
    required int openingBalance,
    required String openingBalanceDate,
  }) async {
    late http.Response response;
    final request = http.Request('POST', Uri.parse(ApiConstants.baseUrl));

    request.headers['Content-Type'] = 'application/json';

    request.body = jsonEncode({
      'key': ApiConstants.apiKey,
      'action': 'update_account_opening_balance',
      'accountId': accountId,
      'openingBalance': openingBalance,
      'openingBalanceDate': openingBalanceDate,
    });

    request.followRedirects = false;

    final client = http.Client();

    try {
      final firstResponse = await client.send(request);

      if (firstResponse.statusCode == 302 || firstResponse.statusCode == 303) {
        final location = firstResponse.headers['location'];

        if (location == null || location.isEmpty) {
          throw Exception('口座更新APIのリダイレクト先がありません');
        }

        final redirectedResponse = await client.get(Uri.parse(location));

        response = redirectedResponse;
      } else {
        response = await http.Response.fromStream(firstResponse);
      }
    } finally {
      client.close();
    }

    if (response.statusCode != 200) {
      throw Exception(
        '口座情報の更新に失敗しました: '
        '${response.statusCode}',
      );
    }

    final dynamic decodedValue;

    try {
      decodedValue = jsonDecode(response.body);
    } on FormatException {
      throw Exception(
        '口座更新APIから'
        '不正なレスポンスが返されました',
      );
    }

    if (decodedValue is! Map) {
      throw Exception('口座更新APIの形式が正しくありません');
    }

    final decoded = Map<String, dynamic>.from(decodedValue);

    if (decoded['success'] != true) {
      final error = decoded['error'];

      if (error is Map) {
        throw Exception(error['message']?.toString() ?? '口座情報の更新に失敗しました');
      }

      throw Exception(error?.toString() ?? '口座情報の更新に失敗しました');
    }
    clearCache();
  }

  Future<void> updateAccount({
    required String accountId,
    required String accountName,
    required String paymentMethod,
    required String wallet,
    required String institution,
    required bool isAsset,
    required bool isLiability,
    required int openingBalance,
    required String openingBalanceDate,
  }) async {
    late http.Response response;

    final request = http.Request('POST', Uri.parse(ApiConstants.baseUrl));

    request.headers['Content-Type'] = 'application/json';

    request.body = jsonEncode({
      'key': ApiConstants.apiKey,
      'action': 'account_update',
      'accountId': accountId,
      'accountName': accountName,
      'paymentMethod': paymentMethod,
      'wallet': wallet,
      'institution': institution,
      'isAsset': isAsset,
      'isLiability': isLiability,
      'openingBalance': openingBalance,
      'openingBalanceDate': openingBalanceDate,
    });

    request.followRedirects = false;

    final client = http.Client();

    try {
      final firstResponse = await client.send(request);

      if (firstResponse.statusCode == 302 || firstResponse.statusCode == 303) {
        final location = firstResponse.headers['location'];

        if (location == null || location.isEmpty) {
          throw Exception('口座更新APIのリダイレクト先がありません');
        }

        response = await client.get(Uri.parse(location));
      } else {
        response = await http.Response.fromStream(firstResponse);
      }
    } finally {
      client.close();
    }

    if (response.statusCode != 200) {
      throw Exception(
        '口座情報の更新に失敗しました: '
        '${response.statusCode}',
      );
    }

    final dynamic decodedValue;

    try {
      decodedValue = jsonDecode(response.body);
    } on FormatException {
      throw Exception('口座更新APIから不正なレスポンスが返されました');
    }

    if (decodedValue is! Map) {
      throw Exception('口座更新APIの形式が正しくありません');
    }

    final decoded = Map<String, dynamic>.from(decodedValue);

    if (decoded['success'] != true) {
      final error = decoded['error'];

      if (error is Map) {
        throw Exception(error['message']?.toString() ?? '口座情報の更新に失敗しました');
      }

      throw Exception(error?.toString() ?? '口座情報の更新に失敗しました');
    }

    clearCache();
  }

  Future<void> deactivateAccount({required String accountId}) async {
    late http.Response response;

    final request = http.Request('POST', Uri.parse(ApiConstants.baseUrl));

    request.headers['Content-Type'] = 'application/json';

    request.body = jsonEncode({
      'key': ApiConstants.apiKey,
      'action': 'account_deactivate',
      'accountId': accountId,
    });

    request.followRedirects = false;

    final client = http.Client();

    try {
      final firstResponse = await client.send(request);

      if (firstResponse.statusCode == 302 || firstResponse.statusCode == 303) {
        final location = firstResponse.headers['location'];

        if (location == null || location.isEmpty) {
          throw Exception('口座削除APIのリダイレクト先がありません');
        }

        response = await client.get(Uri.parse(location));
      } else {
        response = await http.Response.fromStream(firstResponse);
      }
    } finally {
      client.close();
    }

    if (response.statusCode != 200) {
      throw Exception(
        '口座の削除に失敗しました: '
        '${response.statusCode}',
      );
    }

    final dynamic decodedValue;

    try {
      decodedValue = jsonDecode(response.body);
    } on FormatException {
      throw Exception('口座削除APIから不正なレスポンスが返されました');
    }

    if (decodedValue is! Map) {
      throw Exception('口座削除APIの形式が正しくありません');
    }

    final decoded = Map<String, dynamic>.from(decodedValue);

    if (decoded['success'] != true) {
      final error = decoded['error'];

      if (error is Map) {
        throw Exception(error['message']?.toString() ?? '口座の削除に失敗しました');
      }

      throw Exception(error?.toString() ?? '口座の削除に失敗しました');
    }

    clearCache();
  }

  Future<void> createAccount({
    required String accountName,
    required String paymentMethod,
    required String wallet,
    required String institution,
    required bool isAsset,
    required bool isLiability,
    required int openingBalance,
    required String openingBalanceDate,
  }) async {
    late http.Response response;

    final request = http.Request('POST', Uri.parse(ApiConstants.baseUrl));

    request.headers['Content-Type'] = 'application/json';

    request.body = jsonEncode({
      'key': ApiConstants.apiKey,
      'action': 'account_create',
      'accountName': accountName,
      'paymentMethod': paymentMethod,
      'wallet': wallet,
      'institution': institution,
      'isAsset': isAsset,
      'isLiability': isLiability,
      'openingBalance': openingBalance,
      'openingBalanceDate': openingBalanceDate,
    });

    request.followRedirects = false;

    final client = http.Client();

    try {
      final firstResponse = await client.send(request);

      if (firstResponse.statusCode == 302 || firstResponse.statusCode == 303) {
        final location = firstResponse.headers['location'];

        if (location == null || location.isEmpty) {
          throw Exception('口座追加APIのリダイレクト先がありません');
        }

        response = await client.get(Uri.parse(location));
      } else {
        response = await http.Response.fromStream(firstResponse);
      }
    } finally {
      client.close();
    }

    if (response.statusCode != 200) {
      throw Exception(
        '口座の追加に失敗しました: '
        '${response.statusCode}',
      );
    }

    final dynamic decodedValue;

    try {
      decodedValue = jsonDecode(response.body);
    } on FormatException {
      throw Exception('口座追加APIから不正なレスポンスが返されました');
    }

    if (decodedValue is! Map) {
      throw Exception('口座追加APIの形式が正しくありません');
    }

    final decoded = Map<String, dynamic>.from(decodedValue);

    if (decoded['success'] != true) {
      final error = decoded['error'];

      if (error is Map) {
        throw Exception(error['message']?.toString() ?? '口座の追加に失敗しました');
      }

      throw Exception(error?.toString() ?? '口座の追加に失敗しました');
    }
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
