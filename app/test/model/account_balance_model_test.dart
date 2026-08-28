import 'package:app/features/accounts/model/account_balance_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Account balance JSON round trip keeps asset fields', () {
    final result = AccountBalancesResult.fromJson({
      'items': [{
        'accountId': 'a1', 'accountName': 'SBI証券', 'paymentMethod': 'その他',
        'wallet': '生活', 'institution': 'SBI証券', 'assetType': 'investment',
        'isAsset': true, 'isLiability': false, 'currentBalance': 500000,
        'openingBalance': 100000, 'openingBalanceDate': '2026-08-01',
        'closingDay': 0, 'paymentDay': 0, 'paymentMonthOffset': 0,
        'nextBillingYearMonth': '', 'nextBillingAmount': 0, 'laterBillingAmount': 0,
      }],
      'totalAssets': 500000, 'totalLiabilities': 0, 'netAssets': 500000,
      'liquidAssets': 0, 'investmentAssets': 500000, 'otherAssets': 0,
    });
    expect(result.items.single.assetType, 'investment');
    expect(result.investmentAssets, 500000);
    expect(AccountBalancesResult.fromJson(result.toJson()).netAssets, 500000);
  });
}
