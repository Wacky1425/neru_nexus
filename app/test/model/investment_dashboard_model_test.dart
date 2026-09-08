import 'package:flutter_test/flutter_test.dart';
import 'package:app/features/investments/model/investment_holding_model.dart';

void main() {
  test('investment dashboard fields are parsed', () {
    final result = InvestmentHoldingsResult.fromJson({
      'items': [
        {
          'holdingId': 'h1',
          'accountId': 'a1',
          'accountName': 'SBI証券',
          'securityType': 'fund',
          'name': 'Test Fund',
          'symbol': 'TEST',
          'priceProvider': 'yahoo',
          'quantity': 10000,
          'priceUnit': 10000,
          'averageCost': 10000,
          'currentPrice': 11000,
          'previousClose': 10800,
          'priceChange': 200,
          'priceChangeRate': 1.851851,
          'dailyChangeValue': 200,
          'marketValue': 11000,
          'costValue': 10000,
          'profitLoss': 1000,
          'profitLossRate': 10,
          'portfolioWeight': 55,
          'priceUpdatedAt': '2026-09-08T07:00:00.000Z',
          'note': '',
        },
      ],
      'totalMarketValue': 20000,
      'totalCostValue': 18000,
      'totalProfitLoss': 2000,
      'totalProfitLossRate': 11.11,
      'totalDailyChange': 300,
      'totalDailyChangeRate': 1.52,
      'pricedHoldingCount': 2,
      'dailyChangeAvailableCount': 2,
      'latestPriceUpdatedAt': '2026-09-08T07:00:00.000Z',
    });

    expect(result.totalDailyChange, 300);
    expect(result.dailyChangeAvailableCount, 2);
    expect(result.items.single.previousClose, 10800);
    expect(result.items.single.priceChange, 200);
    expect(result.items.single.portfolioWeight, 55);
  });
}
