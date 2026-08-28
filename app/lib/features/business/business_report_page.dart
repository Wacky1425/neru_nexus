import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

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

  String _yen(int value) {
    final sign = value < 0 ? '-' : '';
    final digits = value.abs().toString();
    final out = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) out.write(',');
      out.write(digits[i]);
    }
    return '$sign¥$out';
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
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.file_download_outlined),
          ),
        ],
      ),
      body: FutureBuilder<BusinessReportModel>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: FilledButton.icon(
                onPressed: _reload,
                icon: const Icon(Icons.refresh),
                label: const Text('再読み込み'),
              ),
            );
          }
          final report = snapshot.data;
          if (report == null) return const Center(child: Text('データがありません'));

          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton(onPressed: () => _changeYear(-1), icon: const Icon(Icons.chevron_left)),
                    Text('$_year年', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                    IconButton(onPressed: _year >= DateTime.now().year ? null : () => _changeYear(1), icon: const Icon(Icons.chevron_right)),
                  ],
                ),
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      children: [
                        _MoneyRow(label: '売上', value: _yen(report.income)),
                        const SizedBox(height: 12),
                        _MoneyRow(label: '支出総額', value: _yen(report.expenseGross)),
                        const SizedBox(height: 12),
                        _MoneyRow(label: '経費算入額', value: _yen(report.deductibleExpense)),
                        const Divider(height: 28),
                        _MoneyRow(label: '利益', value: _yen(report.profit), strong: true),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Card(
                  child: ListTile(
                    leading: Icon(report.evidenceMissingCount == 0 ? Icons.verified_outlined : Icons.warning_amber_rounded),
                    title: const Text('証憑'),
                    subtitle: Text('登録済み ${report.evidenceAttachedCount}件 / 未登録 ${report.evidenceMissingCount}件'),
                  ),
                ),
                const SizedBox(height: 24),
                Text('月別', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                if (report.monthly.isEmpty)
                  const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('この年の副業取引はありません')))
                else
                  ...report.monthly.reversed.map((month) => Card(
                    child: ListTile(
                      title: Text(month.yearMonth),
                      subtitle: Text('売上 ${_yen(month.income)} / 経費 ${_yen(month.deductibleExpense)}'),
                      trailing: Text(_yen(month.profit), style: const TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  )),
                if (report.categories.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  Text('経費カテゴリ', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  ...report.categories.map((category) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('${category.majorCategory} / ${category.subCategory}'),
                    subtitle: Text('${category.count}件・支出総額 ${_yen(category.grossAmount)}'),
                    trailing: Text(_yen(category.deductibleAmount)),
                  )),
                ],
                const SizedBox(height: 24),
                Text('事業取引', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                ...report.items.take(100).map((item) => Card(
                  child: ListTile(
                    leading: Icon(item.type == '収入' ? Icons.south_west_rounded : Icons.north_east_rounded),
                    title: Text(item.itemName.isNotEmpty ? item.itemName : item.merchant),
                    subtitle: Text(
                      item.type == '支出'
                          ? '${item.transactionDate}・経費率 ${(item.expenseRatio * 100).round()}%${item.evidenceUrl.isEmpty ? '・証憑なし' : ''}'
                          : item.transactionDate,
                    ),
                    trailing: Text(_yen(item.type == '支出' ? item.expenseAmount : item.amount)),
                  ),
                )),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _MoneyRow extends StatelessWidget {
  const _MoneyRow({required this.label, required this.value, this.strong = false});
  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final style = strong ? Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold) : null;
    return Row(
      children: [
        Expanded(child: Text(label, style: style)),
        Text(value, style: style),
      ],
    );
  }
}
