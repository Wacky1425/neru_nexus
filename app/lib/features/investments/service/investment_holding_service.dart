import '../../../core/network/api_client.dart';
import '../model/investment_holding_model.dart';

class InvestmentHoldingService {
  const InvestmentHoldingService();

  Future<InvestmentHoldingsResult> fetchHoldings() async {
    final data = await ApiClient.get(action: 'investment_holdings');
    return InvestmentHoldingsResult.fromJson(data);
  }

  Future<void> refreshPrices() async {
    await ApiClient.post(action: 'investment_prices_refresh');
  }

  Future<void> createHolding({
    required String accountId,
    required String securityType,
    required String name,
    required String symbol,
    required String priceProvider,
    required double quantity,
    required double priceUnit,
    required double averageCost,
    required double currentPrice,
    required String note,
  }) async {
    await ApiClient.post(
      action: 'investment_holding_create',
      body: {
        'accountId': accountId,
        'securityType': securityType,
        'name': name,
        'symbol': symbol,
        'priceProvider': priceProvider,
        'quantity': quantity,
        'priceUnit': priceUnit,
        'averageCost': averageCost,
        'currentPrice': currentPrice,
        'note': note,
      },
    );
  }

  Future<void> updateHolding({
    required String holdingId,
    required String accountId,
    required String securityType,
    required String name,
    required String symbol,
    required String priceProvider,
    required double quantity,
    required double priceUnit,
    required double averageCost,
    required double currentPrice,
    required String note,
  }) async {
    await ApiClient.post(
      action: 'investment_holding_update',
      body: {
        'holdingId': holdingId,
        'accountId': accountId,
        'securityType': securityType,
        'name': name,
        'symbol': symbol,
        'priceProvider': priceProvider,
        'quantity': quantity,
        'priceUnit': priceUnit,
        'averageCost': averageCost,
        'currentPrice': currentPrice,
        'note': note,
      },
    );
  }

  Future<void> deactivateHolding(String holdingId) async {
    await ApiClient.post(
      action: 'investment_holding_deactivate',
      body: {'holdingId': holdingId},
    );
  }
}
