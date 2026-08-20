import '../../../core/network/api_client.dart';
import '../model/import_history_model.dart';

class ImportHistoryService {
  const ImportHistoryService();

  Future<ImportHistoryData> fetchHistory({int limit = 50}) async {
    final data = await ApiClient.get(
      action: 'import_history',
      queryParameters: {'limit': limit.toString()},
    );

    final items = data['items'];

    if (items is! List) {
      throw Exception('取込履歴APIのitems形式が正しくありません');
    }

    final histories = items
        .whereType<Map>()
        .map(
          (item) =>
              ImportHistoryModel.fromJson(Map<String, dynamic>.from(item)),
        )
        .toList();

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
