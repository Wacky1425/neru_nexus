import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/constants/api_constants.dart';
import '../model/category_create_request.dart';

class CategoryService {
  const CategoryService();

  Future<void> createCategory(CategoryCreateRequest category) async {
    final uri = Uri.parse(ApiConstants.baseUrl);

    final client = http.Client();

    try {
      final request = http.Request('POST', uri);

      request.followRedirects = false;

      request.headers.addAll({'Content-Type': 'application/json'});

      request.body = jsonEncode({
        'action': 'category_create',
        'key': ApiConstants.apiKey,
        ...category.toJson(),
      });

      final streamedResponse = await client.send(request);

      final response = await _resolveResponse(client, streamedResponse);

      if (response.statusCode != 200) {
        throw Exception(
          'カテゴリ追加に失敗しました: '
          '${response.statusCode}',
        );
      }

      final dynamic decodedValue;

      try {
        decodedValue = jsonDecode(response.body);
      } on FormatException {
        throw Exception(
          'カテゴリ追加APIから'
          '不正なレスポンスが返されました',
        );
      }

      if (decodedValue is! Map) {
        throw Exception(
          'カテゴリ追加APIの形式が'
          '正しくありません',
        );
      }

      final decoded = Map<String, dynamic>.from(decodedValue);

      if (decoded['success'] != true) {
        final error = decoded['error'];

        if (error is Map) {
          throw Exception(error['message']?.toString() ?? 'カテゴリ追加に失敗しました');
        }

        throw Exception(error?.toString() ?? 'カテゴリ追加に失敗しました');
      }
    } finally {
      client.close();
    }
  }

  Future<void> updateCategory({
    required String subCategoryId,
    required String majorCategory,
    required String subCategory,
    required bool active,
  }) async {
    final uri = Uri.parse(ApiConstants.baseUrl);

    final client = http.Client();

    try {
      final request = http.Request('POST', uri)
        ..followRedirects = false
        ..headers.addAll({'Content-Type': 'application/json'})
        ..body = jsonEncode({
          'action': 'category_update',
          'key': ApiConstants.apiKey,
          'subCategoryId': subCategoryId,
          'majorCategory': majorCategory,
          'subCategory': subCategory,
          'active': active,
        });

      final streamedResponse = await client.send(request);

      final response = await _resolveResponse(client, streamedResponse);

      if (response.statusCode != 200) {
        throw Exception(
          'カテゴリ更新に失敗しました: '
          '${response.statusCode}',
        );
      }

      final dynamic decodedValue;

      try {
        decodedValue = jsonDecode(response.body);
      } on FormatException {
        throw Exception(
          'カテゴリ更新APIから'
          '不正なレスポンスが返されました',
        );
      }

      if (decodedValue is! Map) {
        throw Exception(
          'カテゴリ更新APIの形式が'
          '正しくありません',
        );
      }

      final decoded = Map<String, dynamic>.from(decodedValue);

      if (decoded['success'] != true) {
        final error = decoded['error'];

        if (error is Map) {
          throw Exception(error['message']?.toString() ?? 'カテゴリ更新に失敗しました');
        }

        throw Exception(error?.toString() ?? 'カテゴリ更新に失敗しました');
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
      throw Exception(
        'カテゴリ追加APIの転送先を'
        '取得できませんでした',
      );
    }

    // Apps Script側のPOST処理は完了済み。
    // 転送先からGETでレスポンス本文を取得する。
    return client.get(Uri.parse(location));
  }
}
