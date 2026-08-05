import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/constants/api_constants.dart';
import '../model/master_model.dart';

class MasterService {
  const MasterService();

  Future<MasterModel> fetchMaster() async {
    final uri = Uri.parse(ApiConstants.baseUrl).replace(
      queryParameters: {'action': 'master', 'key': ApiConstants.apiKey},
    );

    final response = await http.get(uri);

    if (response.statusCode != 200) {
      throw Exception(
        'マスターデータの取得に失敗しました: '
        '${response.statusCode}',
      );
    }

    final dynamic decodedValue;

    try {
      decodedValue = jsonDecode(response.body);
    } on FormatException {
      throw Exception('Master APIから不正なレスポンスが返されました');
    }

    if (decodedValue is! Map) {
      throw Exception('Master APIの形式が正しくありません');
    }

    final decoded = Map<String, dynamic>.from(decodedValue);

    if (decoded['success'] != true) {
      final error = decoded['error'];

      if (error is Map) {
        throw Exception(
          error['message']?.toString() ?? 'Master APIでエラーが発生しました',
        );
      }

      throw Exception(error?.toString() ?? 'Master APIでエラーが発生しました');
    }

    final data = decoded['data'];

    if (data is! Map) {
      throw Exception('Master APIのデータ形式が正しくありません');
    }

    return MasterModel.fromJson(Map<String, dynamic>.from(data));
  }
}
