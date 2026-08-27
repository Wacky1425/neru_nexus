import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'service/import_service.dart';
import 'import_result_transactions_page.dart';
import 'package:charset/charset.dart';
import '../../core/refresh/app_refresh_controller.dart';
import 'model/import_history_model.dart';
import 'service/import_history_service.dart';

class ImportPage extends StatefulWidget {
  const ImportPage({super.key});

  @override
  State<ImportPage> createState() => _ImportPageState();
}

class _ImportPageState extends State<ImportPage> {
  String? _selectedFileName;
  Uint8List? _selectedFileBytes;

  bool _isImporting = false;

  int? _addedCount;
  int? _skippedCount;
  int? _ignoredCount;
  String? _detectedCsvType;
  String? _importBatch;
  CsvImportTiming? _debugTiming;
  String? _errorMessage;
  final _importService = const ImportService();
  final _importHistoryService = const ImportHistoryService();

  late Future<ImportHistoryData> _historyFuture;

  @override
  void initState() {
    super.initState();

    _historyFuture = _importHistoryService.fetchHistory();
  }

  Future<void> _reloadHistory() async {
    final future = _importHistoryService.fetchHistory();

    setState(() {
      _historyFuture = future;
    });

    await future;
  }

  Map<String, Set<String>> _buildBillingImportStatus(
    List<ImportHistoryModel> histories,
  ) {
    final result = <String, Set<String>>{};

    for (final history in histories) {
      if (history.billingYearMonths.isEmpty) {
        continue;
      }

      final accountName = history.accountName.trim();

      if (accountName.isEmpty) {
        continue;
      }

      for (final yearMonth in history.billingYearMonths) {
        final normalized = yearMonth.trim();

        if (!RegExp(r'^\d{4}-\d{2}$').hasMatch(normalized)) {
          continue;
        }

        result.putIfAbsent(normalized, () => <String>{});

        result[normalized]!.add(accountName);
      }
    }

    return result;
  }

  Future<void> _selectCsvFile() async {
    if (_isImporting) {
      return;
    }

    try {
      final result = await FilePicker.platform.pickFiles(
        dialogTitle: 'CSVファイルを選択',
        type: FileType.custom,
        allowedExtensions: const ['csv'],
        allowMultiple: false,
        withData: true,
      );

      if (result == null || result.files.isEmpty) {
        return;
      }

      final file = result.files.single;
      final bytes = file.bytes;

      if (bytes == null || bytes.isEmpty) {
        throw Exception('CSVファイルを読み込めませんでした');
      }

      if (!mounted) {
        return;
      }

      setState(() {
        _selectedFileName = file.name;
        _selectedFileBytes = bytes;

        _addedCount = null;
        _skippedCount = null;
        _ignoredCount = null;
        _detectedCsvType = null;
        _importBatch = null;
        _debugTiming = null;
        _errorMessage = null;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _selectedFileName = null;
        _selectedFileBytes = null;

        _errorMessage = error.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  String _decodeCsv(Uint8List bytes) {
    if (bytes.isEmpty) {
      throw Exception('CSVファイルが空です');
    }

    // UTF-8 BOM付き
    if (bytes.length >= 3 &&
        bytes[0] == 0xEF &&
        bytes[1] == 0xBB &&
        bytes[2] == 0xBF) {
      return utf8.decode(bytes.sublist(3), allowMalformed: false);
    }

    // まずUTF-8として読む
    try {
      return utf8.decode(bytes, allowMalformed: false);
    } on FormatException {
      // UTF-8でなければShift_JISとして読む
      try {
        return shiftJis.decode(bytes);
      } catch (_) {
        throw Exception(
          'CSVの文字コードを読み取れませんでした。'
          'UTF-8またはShift_JIS形式のCSVを選択してください。',
        );
      }
    }
  }

  Future<void> _importCsv() async {
    if (_selectedFileName == null ||
        _selectedFileBytes == null ||
        _isImporting) {
      return;
    }

    setState(() {
      _isImporting = true;
      _errorMessage = null;
      _addedCount = null;
      _skippedCount = null;
      _ignoredCount = null;
      _detectedCsvType = null;
      _importBatch = null;
      _debugTiming = null;
    });

    try {
      final csvText = _decodeCsv(_selectedFileBytes!);

      final result = await _importService.importCsv(
        csvText: csvText,
        fileName: _selectedFileName!,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _detectedCsvType = result.csvType;
        _importBatch = result.importBatch;
        _addedCount = result.addedCount;
        _skippedCount = result.skippedCount;
        _ignoredCount = result.ignoredCount;
        _debugTiming = result.debugTiming;
        // 取込成功後は選択中CSVを解除
        _selectedFileName = null;
        _selectedFileBytes = null;
      });

      AppRefreshController.refreshAll();

      await _reloadHistory();

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${result.addedCount}件追加・'
            '${result.skippedCount}件重複・'
            '${result.ignoredCount}件除外しました',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _errorMessage = error.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() {
          _isImporting = false;
        });
      }
    }
  }

  String _formatDuration(int milliseconds) {
    return '${(milliseconds / 1000).toStringAsFixed(2)}秒';
  }

  List<String> _buildHistoryYearMonths(List<ImportHistoryModel> histories) {
    final values = <String>{};

    final now = DateTime.now();

    // 今月は履歴がなくても必ず表示
    values.add(
      '${now.year}-'
      '${now.month.toString().padLeft(2, '0')}',
    );

    for (final history in histories) {
      final start = DateTime.tryParse(history.periodStart);

      final end = DateTime.tryParse(history.periodEnd);

      if (start == null || end == null) {
        // 古い履歴など、期間が取れない場合の保険
        final fallback = history.targetYearMonth.trim();

        if (RegExp(r'^\d{4}-\d{2}$').hasMatch(fallback)) {
          values.add(fallback);
        }

        continue;
      }

      var cursor = DateTime(start.year, start.month);

      final lastMonth = DateTime(end.year, end.month);

      while (!cursor.isAfter(lastMonth)) {
        values.add(
          '${cursor.year}-'
          '${cursor.month.toString().padLeft(2, '0')}',
        );

        cursor = DateTime(cursor.year, cursor.month + 1);
      }
    }

    final result = values.toList()..sort((a, b) => b.compareTo(a));

    return result;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('CSV取込')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
          children: [
            Text(
              '明細CSVを取り込む',
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 8),

            Text(
              'Olive、三井住友銀行、PayPayなどの'
              'CSVを選択すると、形式を自動判定して'
              '取引へ登録します。',
              style: Theme.of(context).textTheme.bodyMedium,
            ),

            const SizedBox(height: 24),

            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'CSVファイル',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),

                    const SizedBox(height: 12),

                    OutlinedButton.icon(
                      onPressed: _isImporting ? null : _selectCsvFile,
                      icon: const Icon(Icons.upload_file_outlined),
                      label: const Text('ファイルを選択'),
                    ),

                    const SizedBox(height: 16),

                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: Theme.of(context).colorScheme.outlineVariant,
                        ),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.description_outlined),

                          const SizedBox(width: 12),

                          Expanded(
                            child: Text(
                              _selectedFileName ??
                                  'CSVファイルが'
                                      '選択されていません',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            FilledButton.icon(
              onPressed: _selectedFileName == null || _isImporting
                  ? null
                  : _importCsv,
              icon: _isImporting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.download_done_outlined),
              label: Text(_isImporting ? '取込中...' : '取り込む'),
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
              ),
            ),

            if (_errorMessage != null) ...[
              const SizedBox(height: 20),

              Card(
                child: ListTile(
                  leading: Icon(
                    Icons.error_outline,
                    color: Theme.of(context).colorScheme.error,
                  ),
                  title: const Text('取込に失敗しました'),
                  subtitle: Text(_errorMessage!),
                ),
              ),
            ],

            if (_addedCount != null && _skippedCount != null) ...[
              const SizedBox(height: 20),

              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '取込結果',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.bold),
                      ),

                      const SizedBox(height: 16),

                      _ResultRow(
                        label: '判定形式',
                        value: _detectedCsvType ?? '不明',
                      ),

                      const SizedBox(height: 12),

                      _ResultRow(label: '追加', value: '$_addedCount件'),

                      const SizedBox(height: 12),

                      _ResultRow(label: '重複スキップ', value: '$_skippedCount件'),

                      const SizedBox(height: 12),

                      _ResultRow(label: '除外', value: '${_ignoredCount ?? 0}件'),

                      if (_importBatch != null && _importBatch!.isNotEmpty) ...[
                        const SizedBox(height: 20),

                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: () {
                              Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => ImportResultTransactionsPage(
                                    importBatch: _importBatch!,
                                  ),
                                ),
                              );
                            },
                            icon: const Icon(Icons.receipt_long_outlined),
                            label: const Text('取り込んだ取引を見る'),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 32),

            Text(
              '最近の取込履歴',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 12),

            FutureBuilder<ImportHistoryData>(
              future: _historyFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Card(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  );
                }

                if (snapshot.hasError) {
                  return Card(
                    child: ListTile(
                      leading: Icon(
                        Icons.error_outline,
                        color: Theme.of(context).colorScheme.error,
                      ),
                      title: const Text('取込履歴を取得できませんでした'),
                      subtitle: Text(
                        snapshot.error.toString().replaceFirst(
                          'Exception: ',
                          '',
                        ),
                      ),
                      trailing: IconButton(
                        onPressed: _reloadHistory,
                        icon: const Icon(Icons.refresh),
                      ),
                    ),
                  );
                }

                final data = snapshot.data;

                if (data == null) {
                  return const SizedBox.shrink();
                }

                final histories = data.histories;
                final configs = data.configs;

                final yearMonths = _buildHistoryYearMonths(histories);

                final billingStatus = _buildBillingImportStatus(histories);

                final billingYearMonths = billingStatus.keys.toList()
                  ..sort((a, b) => b.compareTo(a));

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // =========================
                    // 取込状況
                    // =========================
                    Card(
                      clipBehavior: Clip.antiAlias,
                      child: ExpansionTile(
                        initiallyExpanded: true,
                        leading: const Icon(Icons.fact_check_outlined),
                        title: const Text(
                          '取込状況',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                        subtitle: const Text('月別データ・カード請求'),
                        childrenPadding: const EdgeInsets.fromLTRB(
                          16,
                          0,
                          16,
                          16,
                        ),
                        children: [
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              '月別データ状況',
                              style: Theme.of(context).textTheme.titleMedium
                                  ?.copyWith(fontWeight: FontWeight.bold),
                            ),
                          ),

                          const SizedBox(height: 12),

                          if (yearMonths.isEmpty)
                            const Align(
                              alignment: Alignment.centerLeft,
                              child: Text('月別データの履歴はありません'),
                            )
                          else
                            for (final yearMonth in yearMonths) ...[
                              _ImportStatusCard(
                                yearMonth: yearMonth,
                                configs: configs,
                                allHistories: histories,
                              ),

                              const SizedBox(height: 12),
                            ],

                          if (billingYearMonths.isNotEmpty) ...[
                            const SizedBox(height: 12),

                            const Divider(),

                            const SizedBox(height: 16),

                            Align(
                              alignment: Alignment.centerLeft,
                              child: Text(
                                'カード請求取込状況',
                                style: Theme.of(context).textTheme.titleMedium
                                    ?.copyWith(fontWeight: FontWeight.bold),
                              ),
                            ),

                            const SizedBox(height: 12),

                            for (final yearMonth in billingYearMonths) ...[
                              _BillingImportStatusCard(
                                yearMonth: yearMonth,
                                configs: configs,
                                importedAccounts:
                                    billingStatus[yearMonth] ??
                                    const <String>{},
                              ),

                              const SizedBox(height: 12),
                            ],
                          ],
                        ],
                      ),
                    ),

                    const SizedBox(height: 12),

                    // =========================
                    // 取込履歴
                    // =========================
                    Card(
                      clipBehavior: Clip.antiAlias,
                      child: ExpansionTile(
                        initiallyExpanded: false,
                        leading: const Icon(Icons.history),
                        title: const Text(
                          '取込履歴',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                        subtitle: Text(
                          histories.isEmpty ? '履歴なし' : '${histories.length}件',
                        ),
                        childrenPadding: const EdgeInsets.only(bottom: 8),
                        children: [
                          if (histories.isEmpty)
                            const Padding(
                              padding: EdgeInsets.all(20),
                              child: Align(
                                alignment: Alignment.centerLeft,
                                child: Text('取込履歴はまだありません'),
                              ),
                            )
                          else
                            for (int i = 0; i < histories.length; i++) ...[
                              _ImportHistoryTile(
                                history: histories[i],
                                onTap: histories[i].importBatch.isEmpty
                                    ? null
                                    : () {
                                        Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (_) =>
                                                ImportResultTransactionsPage(
                                                  importBatch:
                                                      histories[i].importBatch,
                                                ),
                                          ),
                                        );
                                      },
                              ),

                              if (i < histories.length - 1)
                                const Divider(height: 1),
                            ],
                        ],
                      ),
                    ),

                    const SizedBox(height: 12),

                    // =========================
                    // 開発情報
                    // =========================
                    if (_debugTiming != null)
                      Card(
                        clipBehavior: Clip.antiAlias,
                        child: ExpansionTile(
                          initiallyExpanded: false,
                          leading: const Icon(Icons.speed_outlined),
                          title: const Text(
                            '処理時間',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          subtitle: const Text('開発用'),
                          childrenPadding: const EdgeInsets.fromLTRB(
                            16,
                            0,
                            16,
                            16,
                          ),
                          children: [
                            _ResultRow(
                              label: 'CSV本体',
                              value: _formatDuration(_debugTiming!.importMs),
                            ),

                            const SizedBox(height: 8),

                            _ResultRow(
                              label: '└ CSV種別→設定',
                              value: _formatDuration(
                                _debugTiming!.configNameMs,
                              ),
                            ),

                            const SizedBox(height: 8),

                            _ResultRow(
                              label: '└ 設定読込',
                              value: _formatDuration(_debugTiming!.configMs),
                            ),

                            const SizedBox(height: 8),

                            _ResultRow(
                              label: '└ 分類ルール読込',
                              value: _formatDuration(_debugTiming!.rulesMs),
                            ),

                            const SizedBox(height: 8),

                            _ResultRow(
                              label: '└ CSV解析・分類',
                              value: _formatDuration(_debugTiming!.normalizeMs),
                            ),

                            const SizedBox(height: 8),

                            _ResultRow(
                              label: '└ 取引追加',
                              value: _formatDuration(
                                _debugTiming!.addTransactionsMs,
                              ),
                            ),

                            const SizedBox(height: 8),

                            _ResultRow(
                              label: '└ カード引落照合',
                              value: _formatDuration(
                                _debugTiming!.settlementMs,
                              ),
                            ),

                            const SizedBox(height: 8),

                            _ResultRow(
                              label: 'ReviewQueue',
                              value: _formatDuration(
                                _debugTiming!.reviewQueueMs,
                              ),
                            ),

                            const SizedBox(height: 8),

                            _ResultRow(
                              label: 'ReviewSummary',
                              value: _formatDuration(
                                _debugTiming!.reviewSummaryMs,
                              ),
                            ),

                            const SizedBox(height: 8),

                            _ResultRow(
                              label: 'AllViews',
                              value: _formatDuration(_debugTiming!.allViewsMs),
                            ),

                            const SizedBox(height: 8),

                            _ResultRow(
                              label: '└ 集計再構築',
                              value: _formatDuration(
                                _debugTiming!.allViewsSummariesMs,
                              ),
                            ),

                            const SizedBox(height: 8),

                            _ResultRow(
                              label: '└ 月次確認',
                              value: _formatDuration(
                                _debugTiming!.allViewsMonthlyCheckMs,
                              ),
                            ),

                            const SizedBox(height: 8),

                            _ResultRow(
                              label: '└ 最新月設定',
                              value: _formatDuration(
                                _debugTiming!.allViewsLatestMonthMs,
                              ),
                            ),

                            const SizedBox(height: 8),

                            _ResultRow(
                              label: '└ Dashboard更新',
                              value: _formatDuration(
                                _debugTiming!.allViewsDashboardMs,
                              ),
                            ),

                            const SizedBox(height: 12),

                            const Divider(),

                            const SizedBox(height: 12),

                            _ResultRow(
                              label: '合計',
                              value: _formatDuration(_debugTiming!.totalMs),
                            ),
                          ],
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _ResultRow extends StatelessWidget {
  const _ResultRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
      ],
    );
  }
}

class _ImportHistoryTile extends StatelessWidget {
  const _ImportHistoryTile({required this.history, this.onTap});

  final ImportHistoryModel history;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final accountName = history.accountName.trim().isNotEmpty
        ? history.accountName.trim()
        : history.csvType;

    final period = _formatPeriod(history.periodStart, history.periodEnd);

    return ListTile(
      onTap: onTap,
      leading: const CircleAvatar(child: Icon(Icons.history)),
      title: Text(accountName, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (history.fileName.isNotEmpty)
            Text(
              history.fileName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),

          if (period.isNotEmpty) Text(period),

          Text(
            '追加 ${history.addedCount}件'
            ' ・ 重複 ${history.skippedCount}件'
            ' ・ 除外 ${history.ignoredCount}件',
          ),
        ],
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            _formatDateTime(history.importedAt),
            style: Theme.of(context).textTheme.bodySmall,
          ),

          if (onTap != null) const Icon(Icons.chevron_right, size: 20),
        ],
      ),
    );
  }

  static String _formatPeriod(String start, String end) {
    if (start.isEmpty && end.isEmpty) {
      return '';
    }

    if (start == end || end.isEmpty) {
      return start;
    }

    return '$start ～ $end';
  }

  static String _formatDateTime(DateTime? date) {
    if (date == null) {
      return '';
    }

    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    final hour = date.hour.toString().padLeft(2, '0');
    final minute = date.minute.toString().padLeft(2, '0');

    return '$month/$day $hour:$minute';
  }
}

enum ImportCoverageStatus { none, partial, complete }

class _ImportStatusCard extends StatelessWidget {
  const _ImportStatusCard({
    required this.yearMonth,
    required this.configs,
    required this.allHistories,
  });

  final String yearMonth;
  final List<ImportConfigModel> configs;
  final List<ImportHistoryModel> allHistories;

  @override
  Widget build(BuildContext context) {
    final uniqueConfigs = <String, ImportConfigModel>{};

    for (final config in configs) {
      final accountName = config.accountName.trim();

      if (accountName.isEmpty) {
        continue;
      }

      uniqueConfigs.putIfAbsent(accountName, () => config);
    }

    final entries = uniqueConfigs.entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _formatYearMonth(yearMonth),
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 12),

            for (int i = 0; i < entries.length; i++) ...[
              _ImportStatusRow(
                accountName: entries[i].key,
                status: _getCoverageStatus(
                  yearMonth: yearMonth,
                  accountName: entries[i].key,
                  histories: allHistories,
                ),
              ),

              if (i < entries.length - 1) const Divider(height: 16),
            ],
          ],
        ),
      ),
    );
  }

  static String _formatYearMonth(String value) {
    final parts = value.split('-');

    if (parts.length != 2) {
      return value;
    }

    return '${parts[0]}年${int.tryParse(parts[1]) ?? 0}月';
  }
}

class _ImportStatusRow extends StatelessWidget {
  const _ImportStatusRow({required this.accountName, required this.status});

  final String accountName;
  final ImportCoverageStatus status;

  @override
  Widget build(BuildContext context) {
    final icon = switch (status) {
      ImportCoverageStatus.complete => Icons.check_circle,
      ImportCoverageStatus.partial => Icons.timelapse,
      ImportCoverageStatus.none => Icons.remove_circle_outline,
    };

    final label = switch (status) {
      ImportCoverageStatus.complete => '取込済み',
      ImportCoverageStatus.partial => '一部取込',
      ImportCoverageStatus.none => '未取込',
    };

    return Row(
      children: [
        Icon(
          icon,
          size: 20,
          color: status == ImportCoverageStatus.none
              ? Theme.of(context).colorScheme.outline
              : Theme.of(context).colorScheme.primary,
        ),

        const SizedBox(width: 10),

        Expanded(
          child: Text(
            accountName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),

        Text(
          label,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.bold),
        ),
      ],
    );
  }
}

ImportCoverageStatus _getCoverageStatus({
  required String yearMonth,
  required String accountName,
  required List<ImportHistoryModel> histories,
}) {
  final parts = yearMonth.split('-');

  if (parts.length != 2) {
    return ImportCoverageStatus.none;
  }

  final year = int.tryParse(parts[0]);
  final month = int.tryParse(parts[1]);

  if (year == null || month == null) {
    return ImportCoverageStatus.none;
  }

  final monthStart = DateTime(year, month, 1);
  final monthEnd = DateTime(year, month + 1, 0);

  final now = DateTime.now();

  final currentMonth = now.year == year && now.month == month;

  final requiredEnd = currentMonth
      ? DateTime(now.year, now.month, now.day)
      : monthEnd;

  DateTime? coveredStart;
  DateTime? coveredEnd;

  for (final history in histories) {
    if (history.accountName.trim() != accountName.trim()) {
      continue;
    }

    final start = DateTime.tryParse(history.periodStart);
    final end = DateTime.tryParse(history.periodEnd);

    if (start == null || end == null) {
      continue;
    }

    // この履歴が対象月に一切かからない
    if (end.isBefore(monthStart) || start.isAfter(monthEnd)) {
      continue;
    }

    if (coveredStart == null || start.isBefore(coveredStart)) {
      coveredStart = start;
    }

    if (coveredEnd == null || end.isAfter(coveredEnd)) {
      coveredEnd = end;
    }
  }

  if (coveredStart == null || coveredEnd == null) {
    return ImportCoverageStatus.none;
  }

  final coversStart = !coveredStart.isAfter(monthStart);

  final coversEnd = !coveredEnd.isBefore(requiredEnd);

  if (coversStart && coversEnd) {
    return ImportCoverageStatus.complete;
  }

  return ImportCoverageStatus.partial;
}

class _BillingImportStatusCard extends StatelessWidget {
  const _BillingImportStatusCard({
    required this.yearMonth,
    required this.configs,
    required this.importedAccounts,
  });

  final String yearMonth;
  final List<ImportConfigModel> configs;
  final Set<String> importedAccounts;

  @override
  Widget build(BuildContext context) {
    final cardAccounts = <String>{};

    for (final config in configs) {
      final sourceType = config.sourceType.trim();

      if (sourceType != 'CSV_クレカ') {
        continue;
      }

      final accountName = config.accountName.trim();

      if (accountName.isNotEmpty) {
        cardAccounts.add(accountName);
      }
    }

    final accounts = cardAccounts.toList()..sort();

    if (accounts.isEmpty) {
      return const SizedBox.shrink();
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _formatYearMonth(yearMonth),
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 12),

            for (int i = 0; i < accounts.length; i++) ...[
              _BillingImportStatusRow(
                accountName: accounts[i],
                imported: importedAccounts.contains(accounts[i]),
              ),

              if (i < accounts.length - 1) const Divider(height: 16),
            ],
          ],
        ),
      ),
    );
  }

  static String _formatYearMonth(String value) {
    final parts = value.split('-');

    if (parts.length != 2) {
      return value;
    }

    return '${parts[0]}年'
        '${int.tryParse(parts[1]) ?? 0}月';
  }
}

class _BillingImportStatusRow extends StatelessWidget {
  const _BillingImportStatusRow({
    required this.accountName,
    required this.imported,
  });

  final String accountName;
  final bool imported;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(
          imported ? Icons.check_circle : Icons.remove_circle_outline,
          size: 20,
          color: imported
              ? Theme.of(context).colorScheme.primary
              : Theme.of(context).colorScheme.outline,
        ),

        const SizedBox(width: 10),

        Expanded(
          child: Text(
            accountName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),

        Text(
          imported ? '取込済み' : '未取込',
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.bold),
        ),
      ],
    );
  }
}
