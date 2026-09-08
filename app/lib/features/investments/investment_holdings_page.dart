import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../accounts/model/account_balance_model.dart';
import '../accounts/model/asset_snapshot_model.dart';
import '../accounts/service/account_balance_service.dart';
import '../accounts/service/asset_snapshot_service.dart';
import 'investment_holding_edit_page.dart';
import 'investment_planner_page.dart';
import 'model/investment_holding_model.dart';
import 'service/investment_holding_service.dart';
import 'sbi_gmail/sbi_investment_event_page.dart';

class InvestmentHoldingsPage extends StatefulWidget {
  const InvestmentHoldingsPage({super.key});

  @override
  State<InvestmentHoldingsPage> createState() => _InvestmentHoldingsPageState();
}

class _InvestmentHoldingsPageState extends State<InvestmentHoldingsPage> {
  final _service = const InvestmentHoldingService();
  final _accountService = const AccountBalanceService();
  final _snapshotService = const AssetSnapshotService();

  InvestmentHoldingsResult? _result;
  List<AccountBalanceModel> _investmentAccounts = const [];
  AssetTrendResult? _trend;
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
        _snapshotService.fetchTrend(months: 12),
      ]);

      if (!mounted) return;
      final holdings = results[0] as InvestmentHoldingsResult;
      final accounts = results[1] as AccountBalancesResult;
      final trend = results[2] as AssetTrendResult;
      setState(() {
        _result = holdings;
        _trend = trend;
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
            onPressed: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const InvestmentPlannerPage(),
                ),
              );
            },
            tooltip: '投資プラン',
            icon: const Icon(Icons.event_note_outlined),
          ),
          IconButton(
            onPressed: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const SbiInvestmentEventPage(),
                ),
              );
              if (context.mounted) {
                AccountBalanceService.clearCache();
                await _load();
              }
            },
            tooltip: 'SBI証券通知',
            icon: const Icon(Icons.mail_outline),
          ),
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
                const SizedBox(height: 16),
                _InvestmentValueTrendCard(trend: _trend),
                const SizedBox(height: 16),
                if (result.items.isNotEmpty)
                  _PortfolioCompositionChart(items: result.items),
                if (result.items.isNotEmpty) const SizedBox(height: 24),
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
            const SizedBox(height: 10),
            _Value(
              label: '前日比',
              value:
                  '${_signedYen(result.totalDailyChange)}  '
                  '${_percent(result.totalDailyChangeRate)}',
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _Value(
                    label: '取得額',
                    value: _yen(result.totalCostValue),
                  ),
                ),
                Expanded(
                  child: _Value(
                    label: '含み損益',
                    value:
                        '${_signedYen(result.totalProfitLoss)}  '
                        '${_percent(result.totalProfitLossRate)}',
                  ),
                ),
              ],
            ),
            if (result.latestPriceUpdatedAt.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                '価格更新 ${_dateTime(result.latestPriceUpdatedAt)} ・ '
                '前日比取得 ${result.dailyChangeAvailableCount}/'
                '${result.pricedHoldingCount}銘柄',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }
}


class _InvestmentValueTrendCard extends StatelessWidget {
  const _InvestmentValueTrendCard({required this.trend});

  final AssetTrendResult? trend;

  @override
  Widget build(BuildContext context) {
    final items = trend?.items ?? const <AssetSnapshotModel>[];
    final usable = items.where((item) => item.investmentAssets >= 0).toList();

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 18, 18, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('投資資産の推移', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              '日次Snapshotの投資資産評価額',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 18),
            if (usable.length < 2)
              const SizedBox(
                height: 150,
                child: Center(
                  child: Text(
                    '推移表示には2日分以上のSnapshotが必要です\n毎日のSnapshotから自動で育っていきます',
                    textAlign: TextAlign.center,
                  ),
                ),
              )
            else
              SizedBox(
                height: 210,
                child: _InvestmentValueLineChart(items: usable),
              ),
          ],
        ),
      ),
    );
  }
}

class _InvestmentValueLineChart extends StatelessWidget {
  const _InvestmentValueLineChart({required this.items});

  final List<AssetSnapshotModel> items;

  @override
  Widget build(BuildContext context) {
    final values = items.map((e) => e.investmentAssets.toDouble()).toList();
    var minY = values.reduce(math.min);
    var maxY = values.reduce(math.max);
    if (minY == maxY) {
      final delta = math.max(1000.0, minY.abs() * .05);
      minY -= delta;
      maxY += delta;
    }
    final padding = math.max(1000.0, (maxY - minY) * .12);
    minY = math.max(0, minY - padding);
    maxY += padding;

    final spots = <FlSpot>[
      for (var i = 0; i < items.length; i++)
        FlSpot(i.toDouble(), items[i].investmentAssets.toDouble()),
    ];

    return LineChart(
      LineChartData(
        minY: minY,
        maxY: maxY,
        gridData: const FlGridData(show: true),
        borderData: FlBorderData(show: false),
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipItems: (spots) => spots.map((spot) {
              final index = spot.x.round().clamp(0, items.length - 1);
              return LineTooltipItem(
                '${items[index].snapshotDate}\n${_yen(spot.y.round())}',
                Theme.of(context).textTheme.bodySmall ??
                    const TextStyle(fontSize: 12),
              );
            }).toList(),
          ),
        ),
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
          rightTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 54,
              getTitlesWidget: (value, meta) => Text(
                _compactYen(value),
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 28,
              interval: math.max(1, (items.length / 4).ceil()).toDouble(),
              getTitlesWidget: (value, meta) {
                final index = value.round();
                if (index < 0 || index >= items.length) {
                  return const SizedBox.shrink();
                }
                final date = items[index].snapshotDate;
                final label = date.length >= 10
                    ? '${date.substring(5, 7)}/${date.substring(8, 10)}'
                    : date;
                return Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    label,
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
                );
              },
            ),
          ),
        ),
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            isCurved: false,
            barWidth: 2,
            dotData: FlDotData(show: items.length <= 14),
          ),
        ],
      ),
    );
  }
}

class _PortfolioCompositionChart extends StatelessWidget {
  const _PortfolioCompositionChart({required this.items});

  final List<InvestmentHoldingModel> items;

  @override
  Widget build(BuildContext context) {
    final valued = items.where((item) => item.marketValue > 0).toList()
      ..sort((a, b) => b.marketValue.compareTo(a.marketValue));
    if (valued.isEmpty) return const SizedBox.shrink();

    final total = valued.fold<double>(0, (sum, item) => sum + item.marketValue);
    final sections = <PieChartSectionData>[];
    final legend = <Widget>[];

    for (var i = 0; i < valued.length; i++) {
      final item = valued[i];
      final percent = total > 0 ? item.marketValue / total * 100 : 0.0;
      sections.add(
        PieChartSectionData(
          value: item.marketValue.toDouble(),
          title: percent >= 6 ? '${percent.toStringAsFixed(0)}%' : '',
          radius: 54,
          titleStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
        ),
      );
      legend.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 5),
          child: Row(
            children: [
              const Icon(Icons.circle, size: 9),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  item.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text('${percent.toStringAsFixed(1)}%'),
            ],
          ),
        ),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('ポートフォリオ構成', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 18),
            SizedBox(
              height: 180,
              child: PieChart(
                PieChartData(
                  sections: sections,
                  centerSpaceRadius: 42,
                  sectionsSpace: 2,
                ),
              ),
            ),
            const SizedBox(height: 14),
            ...legend,
          ],
        ),
      ),
    );
  }
}

String _compactYen(double value) {
  final abs = value.abs();
  if (abs >= 100000000) {
    return '¥${(value / 100000000).toStringAsFixed(1)}億';
  }
  if (abs >= 10000) {
    return '¥${(value / 10000).toStringAsFixed(0)}万';
  }
  return '¥${value.toStringAsFixed(0)}';
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
                        label: holding.securityType == 'fund'
                            ? '基準価額'
                            : '現在値',
                        value:
                            '¥${NumberFormat('#,##0.##').format(holding.currentPrice)}',
                      ),
                    ),
                    Expanded(
                      child: _Value(
                        label: '含み損益',
                        value:
                            '${_signedYen(holding.profitLoss)}  '
                            '${_percent(holding.profitLossRate)}',
                      ),
                    ),
                  ],
                ),
              ],
              if (holding.securityType != 'cash') ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _Value(
                        label: '前日比',
                        value: holding.previousClose > 0
                            ? '${_signedNumber(holding.priceChange)}  '
                                '${_percent(holding.priceChangeRate)}'
                            : '未取得',
                      ),
                    ),
                    Expanded(
                      child: _Value(
                        label: '構成比',
                        value:
                            '${holding.portfolioWeight.toStringAsFixed(1)}%',
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                LinearProgressIndicator(
                  value: (holding.portfolioWeight / 100).clamp(0.0, 1.0),
                ),
              ],
              if (holding.priceUpdatedAt.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  '価格更新 ${_dateTime(holding.priceUpdatedAt)}'
                  '${holding.securityType == 'fund' ? ' ・ 基準価額' : ''}',
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
String _signedNumber(double value) =>
    '${value >= 0 ? '+' : '-'}¥${NumberFormat('#,##0.##').format(value.abs())}';
String _percent(double value) => '${value >= 0 ? '+' : ''}${value.toStringAsFixed(1)}%';
String _plain(double value) => value == value.roundToDouble()
    ? NumberFormat('#,###').format(value.toInt())
    : NumberFormat('#,##0.####').format(value);
String _dateTime(String value) {
  final date = DateTime.tryParse(value)?.toLocal();
  if (date == null) return value;
  return DateFormat('yyyy/MM/dd HH:mm').format(date);
}
