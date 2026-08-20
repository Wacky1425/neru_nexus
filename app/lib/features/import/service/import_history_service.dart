import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/constants/api_constants.dart';
import '../model/import_history_model.dart';

class ImportHistoryService {
  const ImportHistoryService();

  Future<ImportHistoryData> fetchHistory({int limit = 50}) async {
    final uri = Uri.parse(ApiConstants.baseUrl).replace(
      queryParameters: {
        'action': 'import_history',
        'key': ApiConstants.apiKey,
        'limit': limit.toString(),
      },
    );

    final response = await http.get(uri);

    if (response.statusCode != 200) {
      throw Exception(
        '取込履歴の取得に失敗しました: '
        '${response.statusCode}',
      );
    }

    final dynamic decodedValue;

    try {
      decodedValue = jsonDecode(response.body);
    } on FormatException {
      throw Exception('取込履歴APIから不正なレスポンスが返されました');
    }

    if (decodedValue is! Map) {
      throw Exception('取込履歴APIの形式が正しくありません');
    }

    final decoded = Map<String, dynamic>.from(decodedValue);

    if (decoded['success'] != true) {
      final error = decoded['error'];

      if (error is Map) {
        throw Exception(error['message']?.toString() ?? '取込履歴の取得に失敗しました');
      }

      throw Exception(error?.toString() ?? '取込履歴の取得に失敗しました');
    }

    final data = decoded['data'];

    if (data is! Map) {
      throw Exception('取込履歴APIのデータ形式が正しくありません');
    }

    final items = data['items'];

    if (items is! List) {
      throw Exception('取込履歴APIのitems形式が正しくありません');
    }

    final histories = items.map((item) {
      if (item is! Map) {
        throw Exception('取込履歴データの形式が正しくありません');
      }

      return ImportHistoryModel.fromJson(Map<String, dynamic>.from(item));
    }).toList();

    final configsValue = data['configs'];

    final configs = <ImportConfigModel>[];

    if (configsValue is List) {
      for (final item in configsValue) {
        if (item is! Map) {
          continue;
        }

        configs.add(
          ImportConfigModel.fromJson(Map<String, dynamic>.from(item)),
        );
      }
    }

    return ImportHistoryData(histories: histories, configs: configs);
  }
}
