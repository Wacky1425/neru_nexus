
import 'package:app/features/transactions/model/transaction_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses stable category ids while keeping category names', () {
    final item = TransactionModel.fromJson({
      'id': 'tx1',
      'type': '支出',
      'majorCategory': '食費',
      'subCategory': 'スーパー',
      'majorCategoryId': 'major_001',
      'subCategoryId': 'sub_001',
      'accountName': 'Olive',
      'accountId': 'acc_001',
      'fromAccount': '三井住友銀行',
      'fromAccountId': 'acc_002',
      'toAccount': 'PayPay',
      'toAccountId': 'acc_003',
    });

    expect(item.majorCategory, '食費');
    expect(item.subCategory, 'スーパー');
    expect(item.majorCategoryId, 'major_001');
    expect(item.subCategoryId, 'sub_001');
    expect(item.accountName, 'Olive');
    expect(item.accountId, 'acc_001');
    expect(item.fromAccountId, 'acc_002');
    expect(item.toAccountId, 'acc_003');
  });
}
