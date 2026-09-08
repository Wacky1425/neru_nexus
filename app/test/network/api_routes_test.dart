import 'package:app/core/network/api_routes.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('maps legacy feature actions to stable API v2 routes', () {
    expect(ApiRoutes.fromLegacyAction('home'), 'dashboard.home');
    expect(
      ApiRoutes.fromLegacyAction('account_balances'),
      'accounts.balances',
    );
    expect(
      ApiRoutes.fromLegacyAction('transaction_create'),
      'transactions.create',
    );
    expect(
      ApiRoutes.fromLegacyAction('system_integrity_check'),
      'system.integrity.check',
    );
  });

  test('unknown action passes through for error-envelope diagnostics', () {
    expect(ApiRoutes.fromLegacyAction('unknown_test_route'), 'unknown_test_route');
  });
}
