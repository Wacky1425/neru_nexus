import 'dart:convert';

import 'package:app/core/network/api_client.dart';
import 'package:app/features/import/service/import_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  tearDown(ApiClient.resetTestClientFactory);

  test('empty CSV is rejected before network access', () async {
    expect(() => const ImportService().importCsv(csvText: '  ', fileName: 'a.csv'),
        throwsA(predicate((e) => e.toString().contains('CSVが空'))));
  });

  test('importCsv parses counts, settlement and timing', () async {
    ApiClient.clientFactoryForTesting = () => MockClient((request) async {
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      expect(body['action'], 'csv_import');
      expect(body['fileName'], 'olive.csv');
      expect(body['dryRun'], isFalse);
      return http.Response.bytes(
        utf8.encode(jsonEncode({
          'success': true,
          'data': {
            'csvType': 'olive', 'importBatch': 'b1',
            'addedCount': '8', 'skippedCount': 1, 'ignoredCount': 2,
            'settlementResult': {'matched': true, 'reason': 'ok', 'detailCount': 8},
            'debugTiming': {'importMs': 120, 'totalMs': '250'}
          }
        })),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final result = await const ImportService().importCsv(csvText: 'a,b\n1,2', fileName: 'olive.csv');
    expect(result.addedCount, 8);
    expect(result.ignoredCount, 2);
    expect(result.settlementResult?.matched, isTrue);
    expect(result.debugTiming?.totalMs, 250);
  });
}
