import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/constants/api_constants.dart';
import '../model/account_balance_model.dart';

class AccountReconciliationResult {
  const AccountReconciliationResult({
    required this.matched,
    required this.reason,
    required this.processedCount,
    required this.matchedCount,
    required this.reviewCount,
  });

  final bool matched;
  final String reason;

  final int processedCount;
  final int matchedCount;
  final int reviewCount;

  factory AccountReconciliationResult.fromJson(Map<String, dynamic> json) {
    return AccountReconciliationResult(
      matched: json['matched'] == true,
      reason: json['reason']?.toString() ?? '',
      processedCount: _toInt(json['processedCount']),
      matchedCount: _toInt(json['matchedCount']),
      reviewCount: _toInt(json['reviewCount']),
    );
  }

  static int _toInt(dynamic value) {
    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}

class AccountUpdateResult {
  const AccountUpdateResult({
    required this.updated,
    required this.accountId,
    required this.oldAccountName,
    required this.accountName,
    required this.closingDay,
    required this.paymentDay,
    required this.paymentMonthOffset,
    required this.billingSettingsChanged,
    required this.reconciliation,
  });

  final bool updated;

  final String accountId;
  final String oldAccountName;
  final String accountName;

  final int closingDay;
  final int paymentDay;
  final int paymentMonthOffset;

  final bool billingSettingsChanged;

  final AccountReconciliationResult? reconciliation;

  factory AccountUpdateResult.fromJson(Map<String, dynamic> json) {
    final rawReconciliation = json['reconciliation'];

    return AccountUpdateResult(
      updated: json['updated'] == true,
      accountId: json['accountId']?.toString() ?? '',
      oldAccountName: json['oldAccountName']?.toString() ?? '',
      accountName: json['accountName']?.toString() ?? '',
      closingDay: _toInt(json['closingDay']),
      paymentDay: _toInt(json['paymentDay']),
      paymentMonthOffset: _toInt(json['paymentMonthOffset']),
      billingSettingsChanged: json['billingSettingsChanged'] == true,
      reconciliation: rawReconciliation is Map
          ? AccountReconciliationResult.fromJson(
              Map<String, dynamic>.from(rawReconciliation),
            )
          : null,
    );
  }

  static int _toInt(dynamic value) {
    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}

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
      throw Exception('口座残高APIから不正なレスポンスが返されました');
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

        response = await client.get(Uri.parse(location));
      } else {
        response = await http.Response.fromStream(firstResponse);
      }
    } finally {
      client.close();
    }

    _validateSuccessResponse(
      response,
      statusMessage: '口座情報の更新に失敗しました',
      invalidResponseMessage: '口座更新APIから不正なレスポンスが返されました',
      invalidFormatMessage: '口座更新APIの形式が正しくありません',
    );

    clearCache();
  }

  Future<AccountUpdateResult> updateAccount({
    required String accountId,
    required String accountName,
    required String paymentMethod,
    required String wallet,
    required String institution,
    required bool isAsset,
    required bool isLiability,
    required int openingBalance,
    required String openingBalanceDate,
    required int closingDay,
    required int paymentDay,
    required int paymentMonthOffset,
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
      'closingDay': closingDay,
      'paymentDay': paymentDay,
      'paymentMonthOffset': paymentMonthOffset,
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

    final data = decoded['data'];

    if (data is! Map) {
      throw Exception('口座更新APIのデータ形式が正しくありません');
    }

    final result = AccountUpdateResult.fromJson(
      Map<String, dynamic>.from(data),
    );

    clearCache();

    return result;
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

    _validateSuccessResponse(
      response,
      statusMessage: '口座の削除に失敗しました',
      invalidResponseMessage: '口座削除APIから不正なレスポンスが返されました',
      invalidFormatMessage: '口座削除APIの形式が正しくありません',
    );

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

    _validateSuccessResponse(
      response,
      statusMessage: '口座の追加に失敗しました',
      invalidResponseMessage: '口座追加APIから不正なレスポンスが返されました',
      invalidFormatMessage: '口座追加APIの形式が正しくありません',
    );

    clearCache();
  }

  static void _validateSuccessResponse(
    http.Response response, {
    required String statusMessage,
    required String invalidResponseMessage,
    required String invalidFormatMessage,
  }) {
    if (response.statusCode != 200) {
      throw Exception(
        '$statusMessage: '
        '${response.statusCode}',
      );
    }

    final dynamic decodedValue;

    try {
      decodedValue = jsonDecode(response.body);
    } on FormatException {
      throw Exception(invalidResponseMessage);
    }

    if (decodedValue is! Map) {
      throw Exception(invalidFormatMessage);
    }

    final decoded = Map<String, dynamic>.from(decodedValue);

    if (decoded['success'] != true) {
      final error = decoded['error'];

      if (error is Map) {
        throw Exception(error['message']?.toString() ?? statusMessage);
      }

      throw Exception(error?.toString() ?? statusMessage);
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
