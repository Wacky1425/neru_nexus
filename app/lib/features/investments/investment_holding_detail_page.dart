import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../accounts/model/account_balance_model.dart';
import 'investment_holding_edit_page.dart';
import 'model/investment_holding_model.dart';
import 'service/investment_holding_service.dart';

class InvestmentHoldingDetailPage extends StatefulWidget {
  const InvestmentHoldingDetailPage({
    super.key,
    required this.holding,
    required this.accounts,
  });

  final InvestmentHoldingModel holding;
  final List<AccountBalanceModel> accounts;

  @override
  State<InvestmentHoldingDetailPage> createState() => _InvestmentHoldingDetailPageState();
}

class _InvestmentHoldingDetailPageState extends State<InvestmentHoldingDetailPage> {
  final _service = const InvestmentHoldingService();
  String _range = '1m';
  InvestmentPriceHistoryResult? _history;
  bool _loading = false;
  Object? _error;

  static const _ranges = <String, String>{
    '1d': '1日', '1w': '1週', '1m': '1か月', '3m': '3か月', '1y': '1年', 'max': '全期間',
  };

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    if (widget.holding.securityType == 'cash') return;
    setState(() { _loading = true; _error = null; });
    try {
      final result = await _service.fetchPriceHistory(holdingId: widget.holding.holdingId, range: _range);
      if (mounted) setState(() => _history = result);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _edit() async {
    final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => InvestmentHoldingEditPage(accounts: widget.accounts, holding: widget.holding),
    ));
    if (changed == true && mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final h = widget.holding;
    return Scaffold(
      appBar: AppBar(
        title: Text(h.name),
        actions: [IconButton(onPressed: _edit, tooltip: '編集', icon: const Icon(Icons.edit_outlined))],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (h.symbol.isNotEmpty) Text(h.symbol, style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 8),
                Text(
                  h.securityType == 'fund' ? '基準価額  ${_price(h.currentPrice)}' : '現在値  ${_price(h.currentPrice)}',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text('前日比  ${h.previousClose > 0 ? '${_signedPrice(h.priceChange)}  ${_signedPercent(h.priceChangeRate)}' : '未取得'}'),
                const Divider(height: 28),
                _row('保有数量', '${_number(h.quantity)} ${h.securityType == 'fund' ? '口' : '株/口'}'),
                _row('平均取得単価', _price(h.averageCost)),
                _row('評価額', _yen(h.marketValue)),
                _row('含み損益', '${_signedYen(h.profitLoss)}  ${_signedPercent(h.profitLossRate)}'),
                if (h.priceUpdatedAt.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text('価格更新 ${_dateTime(h.priceUpdatedAt)}', style: Theme.of(context).textTheme.bodySmall),
                ],
              ]),
            ),
          ),
          if (h.securityType != 'cash') ...[
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(h.securityType == 'fund' ? '基準価額チャート' : '株価チャート', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold))),
                    if (_loading) const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                  ]),
                  const SizedBox(height: 12),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: SegmentedButton<String>(
                      segments: _ranges.entries.where((e) => h.securityType != 'fund' || e.key != '1d').map((e) => ButtonSegment(value: e.key, label: Text(e.value))).toList(),
                      selected: {_range},
                      onSelectionChanged: (value) { setState(() => _range = value.first); _loadHistory(); },
                      showSelectedIcon: false,
                    ),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(height: 250, child: _chartBody()),
                  if ((_history?.exchangeName ?? '').isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text('${_history!.exchangeName} ・ 画面表示時に最新データを取得', style: Theme.of(context).textTheme.bodySmall),
                    ),
                ]),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _chartBody() {
    if (_loading && _history == null) return const Center(child: CircularProgressIndicator());
    if (_error != null) return Center(child: Text('チャートを取得できませんでした\n$_error', textAlign: TextAlign.center));
    final history = _history;
    if (history == null || !history.available || history.points.length < 2) {
      final message = history?.unavailableReason.isNotEmpty == true ? history!.unavailableReason : '表示できる価格履歴がありません';
      return Center(child: Text(message, textAlign: TextAlign.center));
    }
    return _PriceLineChart(points: history.points, range: _range);
  }

  Widget _row(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(children: [Expanded(child: Text(label)), Text(value, style: const TextStyle(fontWeight: FontWeight.w600))]),
  );
}

class _PriceLineChart extends StatelessWidget {
  const _PriceLineChart({required this.points, required this.range});
  final List<InvestmentPricePoint> points;
  final String range;

  @override
  Widget build(BuildContext context) {
    final prices = points.map((e) => e.price).toList();
    var minY = prices.reduce(math.min);
    var maxY = prices.reduce(math.max);
    final pad = math.max(1.0, (maxY - minY).abs() * .12);
    if (minY == maxY) { minY -= pad; maxY += pad; } else { minY -= pad; maxY += pad; }
    final spots = [for (var i = 0; i < points.length; i++) FlSpot(i.toDouble(), points[i].price)];
    return LineChart(LineChartData(
      minY: minY, maxY: maxY,
      gridData: const FlGridData(show: true),
      borderData: FlBorderData(show: false),
      lineBarsData: [LineChartBarData(spots: spots, isCurved: false, barWidth: 2, dotData: FlDotData(show: points.length <= 12))],
      lineTouchData: LineTouchData(touchTooltipData: LineTouchTooltipData(getTooltipItems: (spots) => spots.map((s) {
        final i = s.x.round().clamp(0, points.length - 1);
        return LineTooltipItem('${_pointDate(points[i].time, range)}\n${_price(points[i].price)}', Theme.of(context).textTheme.bodySmall ?? const TextStyle(fontSize: 12));
      }).toList())),
      titlesData: FlTitlesData(
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 56, getTitlesWidget: (v, m) => Text(_compact(v), style: Theme.of(context).textTheme.labelSmall))),
        bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 28, interval: math.max(1, (points.length / 4).ceil()).toDouble(), getTitlesWidget: (v, m) {
          final i = v.round(); if (i < 0 || i >= points.length) return const SizedBox.shrink();
          return Padding(padding: const EdgeInsets.only(top: 6), child: Text(_pointDate(points[i].time, range), style: Theme.of(context).textTheme.labelSmall));
        })),
      ),
    ));
  }
}

String _price(double v) => '¥${NumberFormat('#,##0.##').format(v)}';
String _yen(int v) => '¥${NumberFormat('#,###').format(v)}';
String _signedYen(int v) => '${v >= 0 ? '+' : '-'}¥${NumberFormat('#,###').format(v.abs())}';
String _signedPrice(double v) => '${v >= 0 ? '+' : '-'}¥${NumberFormat('#,##0.##').format(v.abs())}';
String _signedPercent(double v) => '${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}%';
String _number(double v) => v == v.roundToDouble() ? NumberFormat('#,###').format(v.toInt()) : NumberFormat('#,##0.####').format(v);
String _dateTime(String value) { final d = DateTime.tryParse(value)?.toLocal(); return d == null ? value : DateFormat('yyyy/MM/dd HH:mm').format(d); }
String _compact(double v) { final a=v.abs(); if(a>=10000) return '¥${(v/10000).toStringAsFixed(1)}万'; return '¥${v.toStringAsFixed(0)}'; }
String _pointDate(DateTime d, String range) => range == '1d' ? DateFormat('HH:mm').format(d) : range == 'max' || range == '1y' ? DateFormat('yy/MM').format(d) : DateFormat('M/d').format(d);
