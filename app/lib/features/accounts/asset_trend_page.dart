import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'model/asset_snapshot_model.dart';
import 'service/asset_snapshot_service.dart';

class AssetTrendPage extends StatefulWidget {
  const AssetTrendPage({super.key});

  @override
  State<AssetTrendPage> createState() => _AssetTrendPageState();
}

class _AssetTrendPageState extends State<AssetTrendPage> {
  final _service = const AssetSnapshotService();

  AssetTrendResult? _result;
  bool _loading = true;
  bool _capturing = false;
  Object? _error;
  int _months = 12;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await _service.fetchTrend(months: _months);
      if (!mounted) return;
      setState(() => _result = result);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _capture() async {
    if (_capturing) return;
    setState(() => _capturing = true);
    try {
      await _service.captureNow();
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('現在の資産状況をSnapshotに保存しました')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Snapshot保存に失敗しました: $error')),
      );
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = _result;
    return Scaffold(
      appBar: AppBar(
        title: const Text('資産推移'),
        actions: [
          IconButton(
            tooltip: '現在値を保存',
            onPressed: _capturing ? null : _capture,
            icon: _capturing
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.add_chart),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            SegmentedButton<int>(
              segments: const [
                ButtonSegment(value: 6, label: Text('6か月')),
                ButtonSegment(value: 12, label: Text('1年')),
                ButtonSegment(value: 0, label: Text('全期間')),
              ],
              selected: {_months},
              onSelectionChanged: (values) {
                setState(() => _months = values.first);
                _load();
              },
            ),
            const SizedBox(height: 16),
            if (_loading && result == null)
              const SizedBox(
                height: 240,
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null && result == null)
              _MessageCard(message: _error.toString())
            else if (result == null || result.items.isEmpty)
              const _EmptyCard()
            else ...[
              _ChangeCard(result: result),
              const SizedBox(height: 16),
              _TrendChart(items: result.items),
              const SizedBox(height: 16),
              _CompositionCard(snapshot: result.latest!),
              const SizedBox(height: 16),
              _HistoryCard(items: result.items.reversed.take(12).toList()),
            ],
          ],
        ),
      ),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard();

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Column(
          children: [
            Icon(Icons.show_chart, size: 48),
            SizedBox(height: 12),
            Text('まだ資産Snapshotがありません'),
            SizedBox(height: 8),
            Text(
              '右上のボタンで現在値を保存できます。\n以後は毎日自動で記録されます。',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Card(child: Padding(padding: const EdgeInsets.all(20), child: Text(message)));
  }
}

class _ChangeCard extends StatelessWidget {
  const _ChangeCard({required this.result});
  final AssetTrendResult result;

  @override
  Widget build(BuildContext context) {
    final latest = result.latest!;
    final hasPrevious = result.previous != null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('最新の純資産', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(
              _yen(latest.netAssets),
              style: const TextStyle(fontSize: 30, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              hasPrevious
                  ? '前回比 ${_signedYen(result.netChange)}  (${_signedPercent(result.netChangeRate)})'
                  : '比較できる過去Snapshotはまだありません',
            ),
            const SizedBox(height: 4),
            Text(
              '最終Snapshot ${latest.snapshotDate}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}

class _TrendChart extends StatelessWidget {
  const _TrendChart({required this.items});
  final List<AssetSnapshotModel> items;

  @override
  Widget build(BuildContext context) {
    final values = items.map((e) => e.netAssets.toDouble()).toList();
    var minY = values.reduce(math.min);
    var maxY = values.reduce(math.max);
    if (minY == maxY) {
      minY -= math.max(1000, minY.abs() * .05);
      maxY += math.max(1000, maxY.abs() * .05);
    }
    final padding = math.max(1000, (maxY - minY) * .12);
    minY -= padding;
    maxY += padding;

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 20, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: Text('純資産推移', style: Theme.of(context).textTheme.titleMedium),
            ),
            const SizedBox(height: 18),
            SizedBox(
              height: 240,
              child: LineChart(
                LineChartData(
                  minY: minY,
                  maxY: maxY,
                  gridData: const FlGridData(show: true),
                  borderData: FlBorderData(show: false),
                  titlesData: FlTitlesData(
                    topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 52,
                        getTitlesWidget: (value, meta) => Text(
                          _compactYen(value),
                          style: const TextStyle(fontSize: 10),
                        ),
                      ),
                    ),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        interval: math.max(1, (items.length / 4).ceilToDouble()),
                        getTitlesWidget: (value, meta) {
                          final index = value.round();
                          if (index < 0 || index >= items.length) {
                            return const SizedBox.shrink();
                          }
                          final date = items[index].snapshotDate;
                          return Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(date.length >= 7 ? date.substring(5, 7) : date),
                          );
                        },
                      ),
                    ),
                  ),
                  lineBarsData: [
                    LineChartBarData(
                      spots: [
                        for (var i = 0; i < items.length; i++)
                          FlSpot(i.toDouble(), items[i].netAssets.toDouble()),
                      ],
                      isCurved: items.length > 2,
                      barWidth: 3,
                      dotData: FlDotData(show: items.length <= 12),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CompositionCard extends StatelessWidget {
  const _CompositionCard({required this.snapshot});
  final AssetSnapshotModel snapshot;

  @override
  Widget build(BuildContext context) {
    final assets = snapshot.totalAssets;
    double ratio(int value) => assets > 0 ? value / assets : 0;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('現在の資産構成', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 16),
            _RatioRow(label: '現金・預金', value: snapshot.liquidAssets, ratio: ratio(snapshot.liquidAssets)),
            const SizedBox(height: 12),
            _RatioRow(label: '投資', value: snapshot.investmentAssets, ratio: ratio(snapshot.investmentAssets)),
            if (snapshot.otherAssets != 0) ...[
              const SizedBox(height: 12),
              _RatioRow(label: 'その他', value: snapshot.otherAssets, ratio: ratio(snapshot.otherAssets)),
            ],
            const Divider(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('負債'),
                Text(_yen(snapshot.totalLiabilities)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _RatioRow extends StatelessWidget {
  const _RatioRow({required this.label, required this.value, required this.ratio});
  final String label;
  final int value;
  final double ratio;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            Expanded(child: Text(label)),
            Text('${_yen(value)}  ${(ratio * 100).toStringAsFixed(1)}%'),
          ],
        ),
        const SizedBox(height: 5),
        LinearProgressIndicator(value: ratio.clamp(0, 1)),
      ],
    );
  }
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({required this.items});
  final List<AssetSnapshotModel> items;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          children: [
            ListTile(title: Text('Snapshot履歴', style: Theme.of(context).textTheme.titleMedium)),
            for (final item in items)
              ListTile(
                dense: true,
                title: Text(item.snapshotDate),
                subtitle: Text('資産 ${_yen(item.totalAssets)} / 負債 ${_yen(item.totalLiabilities)}'),
                trailing: Text(
                  _yen(item.netAssets),
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

String _yen(int value) => '¥${NumberFormat('#,###').format(value)}';
String _signedYen(int value) =>
    '${value >= 0 ? '+' : '-'}¥${NumberFormat('#,###').format(value.abs())}';
String _signedPercent(double value) =>
    '${value >= 0 ? '+' : ''}${(value * 100).toStringAsFixed(1)}%';
String _compactYen(double value) {
  final abs = value.abs();
  if (abs >= 1000000) return '${(value / 1000000).toStringAsFixed(1)}M';
  if (abs >= 1000) return '${(value / 1000).toStringAsFixed(0)}k';
  return value.toStringAsFixed(0);
}
