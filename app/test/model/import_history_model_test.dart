import 'package:app/features/import/model/import_history_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('ImportHistoryModel parses plural billing months and numeric strings', () {
    final model = ImportHistoryModel.fromJson({
      'importBatch': 'b1', 'importedAt': '2026-08-28T10:00:00',
      'csvType': 'olive', 'configName': 'olive', 'accountName': 'Olive',
      'fileName': 'a.csv', 'targetYearMonth': '2026-08', 'periodStart': '2026-08-01',
      'periodEnd': '2026-08-31', 'rowCount': '10', 'addedCount': 8,
      'skippedCount': 1, 'ignoredCount': 1,
      'billingYearMonths': ['2026-08', '2026-09'], 'status': 'success',
    });
    expect(model.rowCount, 10);
    expect(model.billingYearMonths, ['2026-08', '2026-09']);
    expect(model.importedAt, isNotNull);
  });
}
