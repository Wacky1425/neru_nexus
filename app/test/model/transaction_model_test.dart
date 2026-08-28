import 'package:app/features/transactions/model/transaction_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('TransactionModel parses imported business transaction', () {
    final tx = TransactionModel.fromJson({
      'id': 't1', 'transactionDate': '2026-08-28', 'merchant': 'YouTube',
      'itemName': 'YouTube収益', 'amount': 12345, 'type': '収入',
      'majorCategory': '副業', 'subCategory': '配信収益', 'status': '確定',
      'purposeType': 'business', 'expenseRatio': 0.5, 'expenseAmount': 6000,
      'evidenceUrl': 'https://example.com/e', 'wallet': '事業', 'intent': 'income',
      'paymentMethod': '銀行', 'accountName': '事業口座', 'rawText': 'raw',
      'settlementStatus': '', 'settlementId': '', 'fromAccount': '', 'toAccount': '',
      'importBatch': 'b1', 'note': 'memo', 'sourceId': 's1', 'sourceType': 'gmail',
      'sourceStatus': 'confirmed', 'sourceReceivedAt': '2026-08-28 10:00:00',
    });

    expect(tx.amount, 12345);
    expect(tx.expenseRatio, 0.5);
    expect(tx.isImported, isTrue);
    expect(tx.isConfirmedSource, isTrue);
    expect(tx.isPreliminary, isFalse);
  });

  test('manual source is not imported and missing values fall back safely', () {
    final tx = TransactionModel.fromJson({'sourceType': 'Neru Nexus App'});
    expect(tx.isImported, isFalse);
    expect(tx.amount, 0);
    expect(tx.itemName, '');
  });
}
