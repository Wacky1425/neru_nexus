import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/constants/api_constants.dart';
import '../model/home_model.dart';

class HomeService {
  const HomeService();

  Future<HomeModel> fetchHome() async {
    final uri = Uri.parse(ApiConstants.baseUrl).replace(
      queryParameters: {
        'action': 'home',
        'key': ApiConstants.apiKey,
      },
    );

    final response = await http.get(uri);

    if (response.statusCode != 200) {
      throw Exception(
        'Homeデータの取得に失敗しました: ${response.statusCode}',
      );
    }

    final decoded =
        jsonDecode(response.body) as Map<String, dynamic>;

    if (decoded['success'] != true) {
      final error = decoded['error'] as Map?;
      throw Exception(
        error?['message']?.toString() ??
            'Home APIでエラーが発生しました',
      );
    }

    final data = decoded['data'];

    if (data is! Map) {
      throw Exception('Home APIの形式が正しくありません');
    }

    return HomeModel.fromJson(
      Map<String, dynamic>.from(data),
    );
  }
}