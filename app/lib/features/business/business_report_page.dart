import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import 'model/business_report_model.dart';
import 'service/business_report_service.dart';

class BusinessReportPage extends StatefulWidget {
  const BusinessReportPage({super.key});

  @override
  State<BusinessReportPage> createState() => _BusinessReportPageState();
}

class _BusinessReportPageState extends State<BusinessReportPage> {
  final _service = const BusinessReportService();
  late int _year;
  late Future<BusinessReportModel> _future;
  bool _exporting = false;

  @override
  void initState() {
    super.initState();
    _year = DateTime.now().year;
    _future = _service.fetchReport(year: _year);
  }

  void _changeYear(int delta) {
    setState(() {
      _year += delta;
      _future = _service.fetchReport(year: _year);
    });
  }

  Future<void> _reload() async {
    final next = _service.fetchReport(year: _year);
    setState(() => _future = next);
    await next;
  }

  Future<void> _export() async {
    if (_exporting) return;
    setState(() => _exporting = true);
    try {
      final result = await _service.createTaxExport(year: _year);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('確定申告CSVを作成しました'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(result.filename),
              const SizedBox(height: 8),
              Text('${result.rowCount}件を書き出しました'),
              const SizedBox(height: 12),
              const Text('Google Drive の「Neru Nexus Exports」に保存されています。'),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: result.fileUrl));
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Driveリンクをコピーしました')),
                  );
                }
              },
              child: const Text('リンクをコピー'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('閉じる'),
            ),
          ],
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('配信・副業'),
        actions: [
          IconButton(
            tooltip: '確定申告CSV',
            onPressed: _exporting ? null : _export,
            icon: _exporting
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.file_download_outlined),
          ),
        ],
      ),
      body: FutureBuilder<BusinessReportModel>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting &&
              !snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError && !snapshot.hasData) {
            return Center(
              child: FilledButton.icon(
                onPressed: _reload,
                icon: const Icon(Icons.refresh),
                label: const Text('再読み込み'),
              ),
            );
          }

          final report = snapshot.data;
          if (report == null) {
            return const Center(child: Text('データがありません'));
          }

          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
              children: [
                if (snapshot.connectionState == ConnectionState.waiting)
                  const LinearProgressIndicator(),
                if (snapshot.connectionState == ConnectionState.waiting)
                  const SizedBox(height: 8),
                _YearSelector(
                  year: _year,
                  onPrevious: () => _changeYear(-1),
                  onNext: _year >= DateTime.now().year
                      ? null
                      : () => _changeYear(1),
                ),
                const SizedBox(height: 12),
                _OverviewCard(report: report),
                const SizedBox(height: 16),
                _KpiGrid(report: report),
                const SizedBox(height: 16),
                _EvidenceCard(report: report),
                if (report.monthly.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  _SectionTitle(
                    title: '月次推移',
                    subtitle: '売上・経費・利益を月ごとに比較',
                  ),
                  const SizedBox(height: 8),
                  _MonthlyChart(items: report.monthly),
                  const SizedBox(height: 12),
                  _BestWorstCard(report: report),
                  const SizedBox(height: 12),
                  ...report.monthly.reversed.map(
                    (month) => _MonthlyListCard(month: month),
                  ),
                ],
                if (report.categories.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  const _SectionTitle(
                    title: '経費カテゴリ',
                    subtitle: '経費算入額が大きい順',
                  ),
                  const SizedBox(height: 8),
                  _CategoryCard(
                    categories: report.categories,
                    total: report.deductibleExpense,
                  ),
                ],
                if (report.evidenceMissingItems.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  _SectionTitle(
                    title: '証憑未登録',
                    subtitle: '${report.evidenceMissingItems.length}件の確認が必要',
                  ),
                  const SizedBox(height: 8),
                  ...report.evidenceMissingItems.map(
                    (item) => _BusinessTransactionCard(
                      item: item,
                      emphasizeMissingEvidence: true,
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                const _SectionTitle(
                  title: '事業取引',
                  subtitle: '今年の配信・副業関連取引',
                ),
                const SizedBox(height: 8),
                if (report.items.isEmpty)
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(18),
                      child: Text('この年の副業取引はありません'),
                    ),
                  )
                else
                  ...report.items.take(100).map(
                    (item) => _BusinessTransactionCard(item: item),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _YearSelector extends StatelessWidget {
  const _YearSelector({
    required this.year,
    required this.onPrevious,
    required this.onNext,
  });

  final int year;
  final VoidCallback onPrevious;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        IconButton(
          onPressed: onPrevious,
          icon: const Icon(Icons.chevron_left),
        ),
        Text(
          '$year年',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
        IconButton(
          onPressed: onNext,
          icon: const Icon(Icons.chevron_right),
        ),
      ],
    );
  }
}

class _OverviewCard extends StatelessWidget {
  const _OverviewCard({required this.report});

  final BusinessReportModel report;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            _MoneyRow(label: '売上', value: _yen(report.income)),
            const SizedBox(height: 12),
            _MoneyRow(label: '支出総額', value: _yen(report.expenseGross)),
            const SizedBox(height: 12),
            _MoneyRow(
              label: '経費算入額',
              value: _yen(report.deductibleExpense),
            ),
            const Divider(height: 28),
            _MoneyRow(
              label: '利益',
              value: _yen(report.profit),
              strong: true,
            ),
          ],
        ),
      ),
    );
  }
}

class _KpiGrid extends StatelessWidget {
  const _KpiGrid({required this.report});

  final BusinessReportModel report;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = (constraints.maxWidth - 12) / 2;
        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            SizedBox(
              width: width,
              child: _KpiCard(
                label: '利益率',
                value: _percent(report.profitMargin),
                subtitle: '利益 ÷ 売上',
              ),
            ),
            SizedBox(
              width: width,
              child: _KpiCard(
                label: '実効経費率',
                value: _percent(report.effectiveExpenseRatio),
                subtitle: '経費算入 ÷ 支出',
              ),
            ),
            SizedBox(
              width: width,
              child: _KpiCard(
                label: '証憑カバー率',
                value: _percent(report.evidenceCoverageRate),
                subtitle: '${report.evidenceAttachedCount}/${report.expenseTransactionCount}件',
              ),
            ),
            SizedBox(
              width: width,
              child: _KpiCard(
                label: '事業取引',
                value: '${report.transactionCount}件',
                subtitle: '年間取引数',
              ),
            ),
          ],
        );
      },
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.label,
    required this.value,
    required this.subtitle,
  });

  final String label;
  final String value;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 6),
            Text(
              value,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}

class _EvidenceCard extends StatelessWidget {
  const _EvidenceCard({required this.report});

  final BusinessReportModel report;

  @override
  Widget build(BuildContext context) {
    final complete = report.evidenceMissingCount == 0;
    return Card(
      child: ListTile(
        leading: Icon(
          complete ? Icons.verified_outlined : Icons.warning_amber_rounded,
        ),
        title: Text(complete ? '証憑はすべて登録済み' : '証憑未登録があります'),
        subtitle: Text(
          '登録済み ${report.evidenceAttachedCount}件 / '
          '未登録 ${report.evidenceMissingCount}件',
        ),
        trailing: Text(_percent(report.evidenceCoverageRate)),
      ),
    );
  }
}

class _MonthlyChart extends StatelessWidget {
  const _MonthlyChart({required this.items});

  final List<BusinessMonthSummary> items;

  @override
  Widget build(BuildContext context) {
    final maxValue = items.fold<double>(
      0,
      (max, item) => math.max(
        max,
        math.max(
          item.income.toDouble(),
          math.max(
            item.deductibleExpense.toDouble(),
            math.max(0, item.profit.toDouble()),
          ),
        ),
      ),
    );
    final minProfit = items.fold<double>(
      0,
      (min, item) => math.min(min, item.profit.toDouble()),
    );

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 20, 16, 16),
        child: SizedBox(
          height: 260,
          child: BarChart(
            BarChartData(
              minY: minProfit < 0 ? minProfit * 1.15 : 0,
              maxY: maxValue <= 0 ? 1 : maxValue * 1.15,
              alignment: BarChartAlignment.spaceAround,
              gridData: const FlGridData(show: true),
              borderData: FlBorderData(show: false),
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
                    reservedSize: 46,
                    getTitlesWidget: (value, meta) => Text(
                      _compactYen(value),
                      style: const TextStyle(fontSize: 9),
                    ),
                  ),
                ),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    getTitlesWidget: (value, meta) {
                      final index = value.round();
                      if (index < 0 || index >= items.length) {
                        return const SizedBox.shrink();
                      }
                      final ym = items[index].yearMonth;
                      return Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          ym.length >= 7 ? '${int.parse(ym.substring(5, 7))}月' : ym,
                          style: const TextStyle(fontSize: 10),
                        ),
                      );
                    },
                  ),
                ),
              ),
              barGroups: [
                for (var i = 0; i < items.length; i++)
                  BarChartGroupData(
                    x: i,
                    barsSpace: 2,
                    barRods: [
                      BarChartRodData(
                        toY: items[i].income.toDouble(),
                        width: 6,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                      BarChartRodData(
                        toY: items[i].deductibleExpense.toDouble(),
                        width: 6,
                        color: Theme.of(context).colorScheme.secondary,
                      ),
                      BarChartRodData(
                        toY: items[i].profit.toDouble(),
                        width: 6,
                        color: Theme.of(context).colorScheme.tertiary,
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}



class _BestWorstCard extends StatelessWidget {
  const _BestWorstCard({required this.report});

  final BusinessReportModel report;

  @override
  Widget build(BuildContext context) {
    final best = report.bestMonth;
    final worst = report.worstMonth;
    if (best == null || worst == null) return const SizedBox.shrink();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(
              child: _MonthHighlight(
                label: '最高利益',
                month: best.yearMonth,
                amount: best.profit,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _MonthHighlight(
                label: '最低利益',
                month: worst.yearMonth,
                amount: worst.profit,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MonthHighlight extends StatelessWidget {
  const _MonthHighlight({
    required this.label,
    required this.month,
    required this.amount,
  });

  final String label;
  final String month;
  final int amount;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 4),
        Text(month, style: const TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 2),
        Text(_yen(amount)),
      ],
    );
  }
}

class _MonthlyListCard extends StatelessWidget {
  const _MonthlyListCard({required this.month});

  final BusinessMonthSummary month;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        title: Text(month.yearMonth),
        subtitle: Text(
          '売上 ${_yen(month.income)} / '
          '経費 ${_yen(month.deductibleExpense)}'
          '${month.evidenceMissingCount > 0 ? ' / 証憑未登録 ${month.evidenceMissingCount}件' : ''}',
        ),
        trailing: Text(
          _yen(month.profit),
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({
    required this.categories,
    required this.total,
  });

  final List<BusinessCategorySummary> categories;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Column(
        children: [
          for (final category in categories) ...[
            ListTile(
              title: Text(
                '${category.majorCategory} / ${category.subCategory}',
              ),
              subtitle: Text(
                '${category.count}件・支出総額 ${_yen(category.grossAmount)}'
                '${total > 0 ? '・経費の${(category.deductibleAmount / total * 100).toStringAsFixed(1)}%' : ''}',
              ),
              trailing: Text(_yen(category.deductibleAmount)),
            ),
            if (category != categories.last) const Divider(height: 1),
          ],
        ],
      ),
    );
  }
}

class _BusinessTransactionCard extends StatelessWidget {
  const _BusinessTransactionCard({
    required this.item,
    this.emphasizeMissingEvidence = false,
  });

  final BusinessTransactionItem item;
  final bool emphasizeMissingEvidence;

  @override
  Widget build(BuildContext context) {
    final expense = item.type == '支出';
    final title = item.itemName.isNotEmpty ? item.itemName : item.merchant;
    final missing = expense && item.evidenceUrl.isEmpty;

    return Card(
      child: ListTile(
        leading: Icon(
          missing && emphasizeMissingEvidence
              ? Icons.receipt_long_outlined
              : expense
                  ? Icons.north_east_rounded
                  : Icons.south_west_rounded,
        ),
        title: Text(title.isEmpty ? '名称なし' : title),
        subtitle: Text(
          expense
              ? '${item.transactionDate}・経費率 ${(item.expenseRatio * 100).round()}%'
                  '${missing ? '・証憑なし' : '・証憑あり'}'
              : item.transactionDate,
        ),
        trailing: Text(
          _yen(expense ? item.expenseAmount : item.amount),
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({
    required this.title,
    required this.subtitle,
  });

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
        const SizedBox(height: 2),
        Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

class _MoneyRow extends StatelessWidget {
  const _MoneyRow({
    required this.label,
    required this.value,
    this.strong = false,
  });

  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final style = strong
        ? Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
            )
        : null;

    return Row(
      children: [
        Expanded(child: Text(label, style: style)),
        Text(value, style: style),
      ],
    );
  }
}

String _yen(int value) => '¥${NumberFormat('#,###').format(value)}';

String _percent(double value) => '${(value * 100).toStringAsFixed(1)}%';

String _compactYen(double value) {
  final abs = value.abs();
  if (abs >= 1000000) return '${(value / 1000000).toStringAsFixed(1)}M';
  if (abs >= 1000) return '${(value / 1000).toStringAsFixed(0)}k';
  return value.toStringAsFixed(0);
}
