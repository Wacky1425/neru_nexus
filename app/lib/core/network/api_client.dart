import 'dart:convert';

import 'package:http/http.dart' as http;

import '../constants/api_constants.dart';

class ApiClient {
  const ApiClient._();

  static final Map<String, Future<Map<String, dynamic>>> _inFlightGets =
      <String, Future<Map<String, dynamic>>>{};

  /// Test hook. Production leaves this null and uses a normal http.Client.
  static http.Client Function()? clientFactoryForTesting;

  static http.Client _createClient() {
    return clientFactoryForTesting?.call() ?? http.Client();
  }

  static void resetTestClientFactory() {
    clientFactoryForTesting = null;
    _inFlightGets.clear();
  }

  static Future<Map<String, dynamic>> get({
    required String action,
    Map<String, String>? queryParameters,
  }) {
    final parameters = <String, String>{
      'action': action,
      'key': ApiConstants.apiKey,
      'apiVersion': ApiConstants.apiVersion,
      ...?queryParameters,
    };

    final uri = Uri.parse(
      ApiConstants.baseUrl,
    ).replace(
      queryParameters: parameters,
    );

    final requestKey = uri.toString();
    final inFlight = _inFlightGets[requestKey];

    if (inFlight != null) {
      return inFlight;
    }

    final future = _performGet(uri);
    _inFlightGets[requestKey] = future;

    void clearInFlight() {
      if (identical(_inFlightGets[requestKey], future)) {
        _inFlightGets.remove(requestKey);
      }
    }

    future.then<void>(
      (_) => clearInFlight(),
      onError: (Object _, StackTrace __) {
        clearInFlight();
      },
    );

    return future;
  }

  static Future<Map<String, dynamic>> _performGet(Uri uri) async {
    final client = _createClient();

    try {
      final response = await client.get(uri);
      return _decodeResponse(response);
    } finally {
      client.close();
    }
  }

  static Future<Map<String, dynamic>> post({
    required String action,
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse(
      ApiConstants.baseUrl,
    );

    final client = _createClient();

    try {
      final request = http.Request(
        'POST',
        uri,
      )
        ..followRedirects = false
        ..headers.addAll({
          'Content-Type': 'application/json',
        })
        ..body = jsonEncode({
          'action': action,
          'key': ApiConstants.apiKey,
          'apiVersion': ApiConstants.apiVersion,
          ...?body,
        });

      final streamedResponse =
          await client.send(request);

      final response = await _resolveResponse(
        client,
        streamedResponse,
      );

      return _decodeResponse(response);
    } finally {
      client.close();
    }
  }

  static Future<http.Response> _resolveResponse(
    http.Client client,
    http.StreamedResponse initialResponse,
  ) async {
    final initialBody =
        await initialResponse.stream.bytesToString();

    final statusCode =
        initialResponse.statusCode;

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

    final location =
        initialResponse.headers['location'];

    if (location == null ||
        location.trim().isEmpty) {
      throw Exception(
        'APIの転送先が取得できませんでした',
      );
    }

    return client.get(
      Uri.parse(location),
    );
  }

  static Map<String, dynamic> _decodeResponse(
    http.Response response,
  ) {
    if (response.statusCode != 200) {
      throw Exception(
        'API通信に失敗しました: ${response.statusCode}',
      );
    }

    final dynamic decodedValue;

    try {
      decodedValue =
          jsonDecode(response.body);
    } on FormatException {
      throw Exception(
        'APIから不正なレスポンスが返されました',
      );
    }

    if (decodedValue is! Map) {
      throw Exception(
        'APIレスポンスの形式が正しくありません',
      );
    }

    final decoded =
        Map<String, dynamic>.from(
      decodedValue,
    );

    final serverVersion = decoded['apiVersion']?.toString().trim();
    if (serverVersion != null &&
        serverVersion.isNotEmpty &&
        serverVersion != ApiConstants.apiVersion) {
      throw Exception(
        'APIバージョンが一致しません。アプリを更新してください。'
        ' (app=${ApiConstants.apiVersion}, server=$serverVersion)',
      );
    }

    if (decoded['success'] != true) {
      final error = decoded['error'];

      if (error is Map) {
        throw Exception(
          error['message']?.toString() ??
              'APIでエラーが発生しました',
        );
      }

      throw Exception(
        error?.toString() ??
            'APIでエラーが発生しました',
      );
    }

    final data = decoded['data'];

    if (data is! Map) {
      throw Exception(
        'APIのdata形式が正しくありません',
      );
    }

    return Map<String, dynamic>.from(data);
  }
}