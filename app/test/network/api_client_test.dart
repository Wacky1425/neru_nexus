import 'dart:convert';

import 'package:app/core/network/api_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  tearDown(ApiClient.resetTestClientFactory);

  test('GET decodes successful API envelope and sends v2 route', () async {
    ApiClient.clientFactoryForTesting = () => MockClient((request) async {
      expect(request.method, 'GET');
      expect(request.url.queryParameters['route'], 'dashboard.home');
      expect(request.url.queryParameters['apiVersion'], '2');
      expect(request.url.queryParameters['action'], isNull);
      expect(request.url.queryParameters['token'], 'test-device-token');
      expect(request.url.queryParameters['key'], isNull);
      return http.Response.bytes(utf8.encode(jsonEncode({'success': true, 'data': {'value': 42}})), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });

    final data = await ApiClient.get(action: 'home');
    expect(data['value'], 42);
  });

  test('POST sends JSON envelope and follows redirect', () async {
    var call = 0;
    ApiClient.clientFactoryForTesting = () => MockClient((request) async {
      call++;
      if (call == 1) {
        expect(request.method, 'POST');
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['route'], 'transactions.delete');
        expect(body['apiVersion'], '2');
        expect(body['action'], isNull);
        expect(body['token'], 'test-device-token');
        expect(body['key'], isNull);
        expect(body['id'], 't1');
        return http.Response('', 302, headers: {'location': 'https://example.test/result'});
      }
      expect(request.url.toString(), 'https://example.test/result');
      return http.Response.bytes(utf8.encode(jsonEncode({'success': true, 'data': {'deleted': true}})), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });

    final data = await ApiClient.post(action: 'transaction_delete', body: {'id': 't1'});
    expect(data['deleted'], isTrue);
  });

  test('invalid envelope throws useful exception', () async {
    ApiClient.clientFactoryForTesting = () => MockClient((_) async =>
        http.Response.bytes(utf8.encode(jsonEncode({'success': false, 'error': {'message': 'boom'}})), 200, headers: {'content-type': 'application/json; charset=utf-8'}));

    expect(() => ApiClient.get(action: 'x'), throwsA(predicate((e) => e.toString().contains('boom'))));
  });
  test('concurrent identical GET requests share one network call', () async {
    var calls = 0;

    ApiClient.clientFactoryForTesting = () => MockClient((request) async {
      calls++;
      await Future<void>.delayed(const Duration(milliseconds: 20));

      return http.Response.bytes(
        utf8.encode(
          jsonEncode({
            'success': true,
            'data': {'value': 7},
          }),
        ),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final results = await Future.wait([
      ApiClient.get(action: 'home'),
      ApiClient.get(action: 'home'),
    ]);

    expect(calls, 1);
    expect(results[0]['value'], 7);
    expect(results[1]['value'], 7);
  });

  test('rejects incompatible API version', () async {
    ApiClient.clientFactoryForTesting = () => MockClient((request) async {
      return http.Response.bytes(
        utf8.encode('{"success":true,"apiVersion":"999","data":{}}'),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    await expectLater(
      ApiClient.get(action: 'health_version_test'),
      throwsA(isA<Exception>()),
    );
  });

  test('public pairing POST sends no device token', () async {
    ApiClient.clientFactoryForTesting = () => MockClient((request) async {
      final body = jsonDecode(request.body) as Map<String, dynamic>;

      expect(body['route'], 'auth.pair');
      expect(body['apiVersion'], '2');
      expect(body['token'], isNull);
      expect(body['pairingCode'], '12345678');

      return http.Response.bytes(
        utf8.encode(
          jsonEncode({
            'success': true,
            'apiVersion': '2',
            'data': {
              'paired': true,
              'token': 'new-token',
            },
          }),
        ),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final data = await ApiClient.postPublic(
      action: 'auth_pair',
      body: {'pairingCode': '12345678'},
    );

    expect(data['paired'], isTrue);
  });


}
