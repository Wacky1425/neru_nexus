import 'package:flutter_test/flutter_test.dart';
import 'package:app/features/accounts/model/asset_snapshot_model.dart';

void main() {
  test('investment trend keeps daily investment asset values in order', () {
    final result = AssetTrendResult.fromJson({
      'items': [
        {
          'snapshotDate': '2026-09-07',
          'investmentAssets': 100000,
        },
        {
          'snapshotDate': '2026-09-08',
          'investmentAssets': 105000,
        },
      ],
    });

    expect(result.items, hasLength(2));
    expect(result.items.first.investmentAssets, 100000);
    expect(result.items.last.investmentAssets, 105000);
  });
}
