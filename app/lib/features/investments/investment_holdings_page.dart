import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../accounts/model/account_balance_model.dart';
import '../accounts/service/account_balance_service.dart';
import 'investment_holding_edit_page.dart';
import 'model/investment_holding_model.dart';
import 'service/investment_holding_service.dart';

class InvestmentHoldingsPage extends StatefulWidget {
  const InvestmentHoldingsPage({super.key});

  @override
  State<InvestmentHoldingsPage> createState() => _InvestmentHoldingsPageState();
}

class _InvestmentHoldingsPageState extends State<InvestmentHoldingsPage> {
  final _service = const InvestmentHoldingService();
  final _accountService = const AccountBalanceService();

  InvestmentHoldingsResult? _result;
  List<AccountBalanceModel> _investmentAccounts = const [];
  bool _loading = true;
  bool _refreshingPrices = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load(refreshPrices: true);
  }

  Future<void> _load({bool refreshPrices = false}) async {
    if (mounted) {
      setState(() {
        _loading = _result == null;
        _error = null;
        if (refreshPrices) _refreshingPrices = true;
      });
    }

    try {
      if (refreshPrices) {
        try {
          await _service.refreshPrices();
        } catch (_) {
          // 価格元の一時障害でも、保存済み評価額は表示する。
        }
      }

      final results = await Future.wait([
        _service.fetchHoldings(),
        _accountService.fetchAccountBalances(),
      ]);

      if (!mounted) return;
      final holdings = results[0] as InvestmentHoldingsResult;
      final accounts = results[1] as AccountBalancesResult;
      setState(() {
        _result = holdings;
        _investmentAccounts = accounts.items
            .where((item) => item.isAsset && item.assetType == 'investment')
            .toList();
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error);
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _refreshingPrices = false;
        });
      }
    }
  }

  Future<void> _openEditor([InvestmentHoldingModel? holding]) async {
    if (_investmentAccounts.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('先に「投資」区分の資産口座を作成してください')),
      );
      return;
    }

    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => InvestmentHoldingEditPage(
          accounts: _investmentAccounts,
          holding: holding,
        ),
      ),
    );

    if (changed == true) {
      AccountBalanceService.clearCache();
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = _result;
    return Scaffold(
      appBar: AppBar(
        title: const Text('投資ポートフォリオ'),
        actions: [
          IconButton(
            onPressed: _refreshingPrices ? null : () => _load(refreshPrices: true),
            tooltip: '現在値を更新',
            icon: _refreshingPrices
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(),
        icon: const Icon(Icons.add),
        label: const Text('銘柄を追加'),
      ),
      body: Builder(
        builder: (context) {
          if (_loading && result == null) {
            return const Center(child: CircularProgressIndicator());
          }
          if (result == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error?.toString() ?? 'データを取得できませんでした'),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _load,
                      child: const Text('再読み込み'),
                    ),
                  ],
                ),
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () => _load(refreshPrices: true),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              children: [
                _PortfolioSummary(result: result),
                const SizedBox(height: 24),
                if (result.items.isEmpty)
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text(
                        '保有銘柄はまだありません。\n右下の「銘柄を追加」から登録できます。',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                else
                  ..._buildGroupedHoldings(result.items),
              ],
            ),
          );
        },
      ),
    );
  }

  List<Widget> _buildGroupedHoldings(List<InvestmentHoldingModel> items) {
    final groups = <String, List<InvestmentHoldingModel>>{};
    for (final item in items) {
      groups.putIfAbsent(item.accountName, () => []).add(item);
    }

    final widgets = <Widget>[];
    for (final entry in groups.entries) {
      widgets.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            entry.key.isEmpty ? '投資口座' : entry.key,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
        ),
      );
      for (final holding in entry.value) {
        widgets.add(_HoldingCard(holding: holding, onTap: () => _openEditor(holding)));
        widgets.add(const SizedBox(height: 10));
      }
      widgets.add(const SizedBox(height: 14));
    }
    return widgets;
  }
}

class _PortfolioSummary extends StatelessWidget {
  const _PortfolioSummary({required this.result});
  final InvestmentHoldingsResult result;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('投資資産', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              _yen(result.totalMarketValue),
              style: const TextStyle(fontSize: 30, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(child: _Value(label: '取得額', value: _yen(result.totalCostValue))),
                Expanded(
                  child: _Value(
                    label: '含み損益',
                    value: '${_signedYen(result.totalProfitLoss)}  ${_percent(result.totalProfitLossRate)}',
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Value extends StatelessWidget {
  const _Value({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 4),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _HoldingCard extends StatelessWidget {
  const _HoldingCard({required this.holding, required this.onTap});
  final InvestmentHoldingModel holding;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final quantityLabel = holding.securityType == 'cash'
        ? _yen(holding.marketValue)
        : '${_plain(holding.quantity)} ${holding.securityType == 'fund' ? '口' : '株/口'}';

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      holding.name,
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                  ),
                  const Icon(Icons.chevron_right),
                ],
              ),
              if (holding.symbol.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(holding.symbol, style: Theme.of(context).textTheme.bodySmall),
              ],
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(child: _Value(label: '保有', value: quantityLabel)),
                  Expanded(child: _Value(label: '評価額', value: _yen(holding.marketValue))),
                ],
              ),
              if (holding.securityType != 'cash') ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _Value(
                        label: '現在値',
                        value: '¥${NumberFormat('#,##0.##').format(holding.currentPrice)}',
                      ),
                    ),
                    Expanded(
                      child: _Value(
                        label: '含み損益',
                        value: '${_signedYen(holding.profitLoss)}  ${_percent(holding.profitLossRate)}',
                      ),
                    ),
                  ],
                ),
              ],
              if (holding.priceUpdatedAt.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  '価格更新 ${_dateTime(holding.priceUpdatedAt)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

String _yen(int value) => '¥${NumberFormat('#,###').format(value)}';
String _signedYen(int value) => '${value >= 0 ? '+' : '-'}¥${NumberFormat('#,###').format(value.abs())}';
String _percent(double value) => '${value >= 0 ? '+' : ''}${value.toStringAsFixed(1)}%';
String _plain(double value) => value == value.roundToDouble()
    ? NumberFormat('#,###').format(value.toInt())
    : NumberFormat('#,##0.####').format(value);
String _dateTime(String value) {
  final date = DateTime.tryParse(value)?.toLocal();
  if (date == null) return value;
  return DateFormat('yyyy/MM/dd HH:mm').format(date);
}
