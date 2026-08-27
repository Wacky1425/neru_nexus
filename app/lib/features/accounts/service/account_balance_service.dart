import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/network/api_client.dart';
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

  static AccountBalancesResult? get cachedResult => _cachedResult;

  static bool get hasCache => _cachedResult != null;

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
    final data = await ApiClient.get(action: 'account_balances');
    final rawItems = data['items'];

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
      totalAssets: _toInt(data['totalAssets']),
      totalLiabilities: _toInt(data['totalLiabilities']),
      netAssets: _toInt(data['netAssets']),
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
    await ApiClient.post(
      action: 'update_account_opening_balance',
      body: {
        'accountId': accountId,
        'openingBalance': openingBalance,
        'openingBalanceDate': openingBalanceDate,
      },
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
    final data = await ApiClient.post(
      action: 'account_update',
      body: {
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
      },
    );

    final result = AccountUpdateResult.fromJson(data);
    clearCache();
    return result;
  }

  Future<void> deactivateAccount({required String accountId}) async {
    await ApiClient.post(
      action: 'account_deactivate',
      body: {'accountId': accountId},
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
    await ApiClient.post(
      action: 'account_create',
      body: {
        'accountName': accountName,
        'paymentMethod': paymentMethod,
        'wallet': wallet,
        'institution': institution,
        'isAsset': isAsset,
        'isLiability': isLiability,
        'openingBalance': openingBalance,
        'openingBalanceDate': openingBalanceDate,
      },
    );
    clearCache();
  }

  static int _toInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}
