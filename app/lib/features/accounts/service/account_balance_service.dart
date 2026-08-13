import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/constants/api_constants.dart';
import '../model/account_balance_model.dart';

class AccountBalanceService {
  const AccountBalanceService();

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

    return AccountBalancesResult(
      items: items,
      totalAssets: _toInt(dataMap['totalAssets']),
      totalLiabilities: _toInt(dataMap['totalLiabilities']),
      netAssets: _toInt(dataMap['netAssets']),
    );
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
