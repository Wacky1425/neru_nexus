import 'package:flutter_test/flutter_test.dart';
import 'package:app/features/accounts/model/asset_snapshot_model.dart';

void main() {
  test('AssetTrendResult parses snapshots and change', () {
    final result = AssetTrendResult.fromJson({
      'items': [
        {
          'snapshotDate': '2026-07-31',
          'yearMonth': '2026-07',
          'totalAssets': 300000,
          'totalLiabilities': 100000,
          'netAssets': 200000,
          'liquidAssets': 120000,
          'investmentAssets': 170000,
          'otherAssets': 10000,
        },
        {
          'snapshotDate': '2026-08-28',
          'yearMonth': '2026-08',
          'totalAssets': 340000,
          'totalLiabilities': 90000,
          'netAssets': 250000,
          'liquidAssets': 130000,
          'investmentAssets': 200000,
          'otherAssets': 10000,
        },
      ],
      'netChange': 50000,
      'netChangeRate': 0.25,
    });

    expect(result.items, hasLength(2));
    expect(result.latest?.netAssets, 250000);
    expect(result.previous?.netAssets, 200000);
    expect(result.netChange, 50000);
    expect(result.netChangeRate, 0.25);
  });

  test('AssetTrendResult accepts empty response', () {
    final result = AssetTrendResult.fromJson({});
    expect(result.items, isEmpty);
    expect(result.latest, isNull);
    expect(result.netChange, 0);
  });
}
