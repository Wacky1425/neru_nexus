
import 'package:app/features/investments/sbi_gmail/sbi_investment_event_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses matched SBI investment buy event', () {
    final event = SbiInvestmentEventModel.fromJson({
      'eventId': 'e1',
      'tradeDate': '2026-08-28',
      'side': 'buy',
      'securityName': 'テスト投資信託',
      'quantity': 12345,
      'price': 10500,
      'holdingId': 'h1',
      'holdingName': 'テスト投資信託',
      'matchScore': 0.95,
      'status': 'matched',
    });

    expect(event.isBuy, isTrue);
    expect(event.isMatched, isTrue);
    expect(event.quantity, 12345);
  });
}
