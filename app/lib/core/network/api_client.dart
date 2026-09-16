import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../auth/auth_session.dart';
import '../constants/api_constants.dart';
import 'api_routes.dart';
import '../offline/offline_sync_store.dart';

class ApiClient {
  const ApiClient._();

  static final Map<String, Future<Map<String, dynamic>>> _inFlightGets =
      <String, Future<Map<String, dynamic>>>{};

  /// Test hooks. Production leaves these null.
  static http.Client Function()? clientFactoryForTesting;
  static String? authTokenForTesting;

  /// True when unit tests inject a transport-only HTTP client.
  /// Platform-backed offline persistence must not run in this mode.
  static bool get isTransportTest => clientFactoryForTesting != null;

  static http.Client _createClient() {
    return clientFactoryForTesting?.call() ?? http.Client();
  }

  static void resetTestClientFactory() {
    clientFactoryForTesting = null;
    authTokenForTesting = null;
    _inFlightGets.clear();
  }

  static Future<String> _resolveAuthToken() async {
    final testToken = authTokenForTesting;

    if (testToken != null) {
      return testToken;
    }

    // Existing tests use MockClient without touching platform secure storage.
    if (clientFactoryForTesting != null) {
      return 'test-device-token';
    }

    final token = await AuthSession.token();

    if (token.isEmpty) {
      throw const AuthenticationRequiredException();
    }

    return token;
  }

  static Future<Map<String, dynamic>> get({
    required String action,
    Map<String, String>? queryParameters,
  }) async {
    final token = await _resolveAuthToken();

    final parameters = <String, String>{
      'route': ApiRoutes.fromLegacyAction(action),
      'token': token,
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

    final future = _performGetWithCache(uri, requestKey);
    _inFlightGets[requestKey] = future;

    void clearInFlight() {
      if (identical(_inFlightGets[requestKey], future)) {
        _inFlightGets.remove(requestKey);
      }
    }

    future.then<void>(
      (_) => clearInFlight(),
      onError: (Object error, StackTrace stackTrace) {
        clearInFlight();
      },
    );

    return future;
  }

  static Future<Map<String, dynamic>> _performGetWithCache(Uri uri, String requestKey) async {
    // Unit tests inject an HTTP client and intentionally do not initialize a
    // Flutter platform binding. Keep persistence out of that transport-only
    // test path; production still uses the full offline cache/sync flow.
    if (clientFactoryForTesting != null) {
      return _performGet(uri);
    }

    try {
      final data = await _performGet(uri);
      await OfflineSyncStore.cacheGet(requestKey, data);
      await flushOfflineQueue();
      return data;
    } catch (error) {
      final cached = await OfflineSyncStore.readCachedGet(requestKey);
      if (cached != null) return {...cached, '_offlineCache': true};
      rethrow;
    }
  }

  static bool _isQueueableAction(String action) => const {
    'transaction_create',
    'transaction_update',
    'transaction_delete',
    'transaction_ignore',
    'transaction_manual_confirm',
    'transaction_restore_ignored',
  }.contains(action);

  static Future<void> flushOfflineQueue() {
    return OfflineSyncStore.flush((action, body) async {
      try {
        final token = await _resolveAuthToken();
        final data = await _performPost(action: action, body: {'token': token, ...body});
        if (data['queued'] == true) throw const SocketException('同期を再試行します');
      } catch (error) {
        final isTransportFailure = error is http.ClientException ||
            error is SocketException ||
            error is TimeoutException;
        if (isTransportFailure) rethrow;
        // Server validation/business-rule errors require user action. Mark
        // only this mutation and continue syncing later valid mutations.
        throw SyncNeedsAttentionException(
          error.toString().replaceFirst('Exception: ', ''),
        );
      }
    });
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
    final token = await _resolveAuthToken();

    final authenticatedBody = <String, dynamic>{'token': token, ...?body};
    try {
      final data = await _performPost(action: action, body: authenticatedBody);
      if (clientFactoryForTesting == null) {
        await flushOfflineQueue();
      }
      return data;
    } catch (error) {
      final isTransportFailure = error is http.ClientException ||
          error is SocketException ||
          error is TimeoutException;
      if (!_isQueueableAction(action) || !isTransportFailure) rethrow;
      final queueBody = <String, dynamic>{...?body};
      await OfflineSyncStore.enqueue(action, queueBody);
      return <String, dynamic>{'queued': true, 'offline': true};
    }
  }

  static Future<Map<String, dynamic>> postPublic({
    required String action,
    Map<String, dynamic>? body,
  }) {
    return _performPost(
      action: action,
      body: body,
    );
  }

  static Future<Map<String, dynamic>> _performPost({
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
          'route': ApiRoutes.fromLegacyAction(action),
          'apiVersion': ApiConstants.apiVersion,
          ...?body,
        });

      final streamedResponse = await client.send(request);

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

class AuthenticationRequiredException implements Exception {
  const AuthenticationRequiredException();

  @override
  String toString() => '端末認証が必要です';
}
