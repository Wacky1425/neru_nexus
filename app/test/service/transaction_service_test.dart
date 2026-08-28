import 'dart:convert';

import 'package:app/core/network/api_client.dart';
import 'package:app/features/transactions/service/transaction_service.dart';
import 'package:app/features/transactions/transaction_form_page.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  tearDown(ApiClient.resetTestClientFactory);

  test('fetchTransactions trims optional filters and parses items', () async {
    ApiClient.clientFactoryForTesting = () => MockClient((request) async {
      expect(request.url.queryParameters['action'], 'transactions');
      expect(request.url.queryParameters['yearMonth'], '2026-08');
      expect(request.url.queryParameters['keyword'], isNull);
      expect(request.url.queryParameters['reviewOnly'], 'true');
      return http.Response.bytes(
        utf8.encode(jsonEncode({
          'success': true,
          'data': {
            'items': [
              {'id': 't1', 'amount': 1000, 'itemName': 'テスト', 'sourceType': 'Neru Nexus App'}
            ]
          }
        })),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final items = await const TransactionService().fetchTransactions(
      yearMonth: ' 2026-08 ', keyword: '   ', reviewOnly: true,
    );
    expect(items, hasLength(1));
    expect(items.single.id, 't1');
    expect(items.single.amount, 1000);
  });

  test('empty settlement transaction id returns no candidates without network', () async {
    final result = await const TransactionService().fetchSettlementCandidates(transactionId: '  ');
    expect(result, isEmpty);
  });

  test('delete rejects empty id before network', () async {
    expect(() => const TransactionService().deleteTransaction(id: ' '),
        throwsA(predicate((e) => e.toString().contains('取引ID'))));
  });
  test('fetchTransactionPage parses pagination metadata', () async {
    ApiClient.clientFactoryForTesting = () => MockClient((request) async {
      expect(request.url.queryParameters['limit'], '50');
      expect(request.url.queryParameters['offset'], '50');

      return http.Response.bytes(
        utf8.encode(
          jsonEncode({
            'success': true,
            'data': {
              'items': [
                {'id': 't51', 'amount': 500},
              ],
              'total': 120,
              'limit': 50,
              'offset': 50,
              'hasMore': true,
            },
          }),
        ),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final page = await const TransactionService().fetchTransactionPage(
      limit: 50,
      offset: 50,
    );

    expect(page.items.single.id, 't51');
    expect(page.total, 120);
    expect(page.limit, 50);
    expect(page.offset, 50);
    expect(page.hasMore, isTrue);
  });


  test('createTransaction sends transfer type and both accounts', () async {
    ApiClient.clientFactoryForTesting = () => MockClient((request) async {
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      expect(body['action'], 'transaction_create');
      expect(body['type'], '移動');
      expect(body['fromAccount'], '三井住友銀行');
      expect(body['toAccount'], '住信SBIネット銀行');

      return http.Response.bytes(
        utf8.encode(
          jsonEncode({
            'success': true,
            'data': {
              'addedCount': 1,
              'transaction': {
                'id': 'transfer-1',
                'transactionDate': '2026-08-28',
                'amount': 10000,
                'type': '移動',
                'majorCategory': '移動',
                'subCategory': '口座移動',
                'status': '確定',
                'fromAccount': '三井住友銀行',
                'toAccount': '住信SBIネット銀行',
                'sourceType': 'Neru Nexus App',
              },
            },
          }),
        ),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final result = await const TransactionService().createTransaction(
      transaction: TransactionFormResult(
        date: DateTime(2026, 8, 28),
        type: TransactionType.transfer,
        amount: 10000,
        majorCategory: '移動',
        subCategory: '口座移動',
        title: '資金移動',
        paymentMethod: '銀行',
        accountName: '',
        status: '確定',
        memo: '',
        purposeType: '',
        expenseRatio: 0,
        evidenceUrl: '',
        fromAccount: '三井住友銀行',
        toAccount: '住信SBIネット銀行',
      ),
    );

    expect(result.type, '移動');
    expect(result.fromAccount, '三井住友銀行');
    expect(result.toAccount, '住信SBIネット銀行');
  });

}
