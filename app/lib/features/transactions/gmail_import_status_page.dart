import 'package:flutter/material.dart';

import 'model/gmail_import_status_model.dart';
import 'service/transaction_service.dart';

class GmailImportStatusPage extends StatefulWidget {
  const GmailImportStatusPage({super.key});

  @override
  State<GmailImportStatusPage> createState() => _GmailImportStatusPageState();
}

class _GmailImportStatusPageState extends State<GmailImportStatusPage> {
  final TransactionService _transactionService = const TransactionService();

  late Future<GmailImportStatusModel> _future;

  @override
  void initState() {
    super.initState();

    _future = _load();
  }

  Future<GmailImportStatusModel> _load() {
    return _transactionService.fetchGmailImportStatus();
  }

  Future<void> _refresh() async {
    final future = _load();

    setState(() {
      _future = future;
    });

    await future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Gmail取込状況')),

      body: FutureBuilder<GmailImportStatusModel>(
        future: _future,

        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _buildErrorState(context, snapshot.error);
          }

          final status = snapshot.data;

          if (status == null) {
            return const Center(child: Text('取込状況を取得できませんでした'));
          }

          return RefreshIndicator(
            onRefresh: _refresh,

            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),

              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),

              children: [
                _buildStatusCard(context, status),

                const SizedBox(height: 16),

                Text(
                  '最終実行',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),

                const SizedBox(height: 8),

                Card(
                  child: Column(
                    children: [
                      _StatusItem(
                        title: '最終実行日時',
                        value: _formatDateTime(status.updatedAt),
                      ),

                      const Divider(height: 1),

                      _StatusItem(
                        title: 'Gmail検出',
                        value: '${status.gmailFoundCount}件',
                      ),

                      const Divider(height: 1),

                      _StatusItem(
                        title: '変換',
                        value: '${status.convertedCount}件',
                      ),

                      const Divider(height: 1),

                      _StatusItem(
                        title: '新規候補',
                        value: '${status.importCandidateCount}件',
                      ),

                      const Divider(height: 1),

                      _StatusItem(title: '追加', value: '${status.addedCount}件'),

                      const Divider(height: 1),

                      _StatusItem(
                        title: 'スキップ',
                        value: '${status.skippedCount}件',
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 16),

                Text(
                  '取得元',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),

                const SizedBox(height: 8),

                Card(
                  child: Column(
                    children: [
                      _StatusItem(
                        title: 'Olive',
                        value: '${status.oliveCount}件',
                      ),

                      const Divider(height: 1),

                      _StatusItem(title: 'SMBC', value: '${status.smbcCount}件'),
                    ],
                  ),
                ),

                if (status.errorMessage.trim().isNotEmpty) ...[
                  const SizedBox(height: 16),

                  Text(
                    'エラー',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),

                  const SizedBox(height: 8),

                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            Icons.error_outline,
                            color: Theme.of(context).colorScheme.error,
                          ),

                          const SizedBox(width: 12),

                          Expanded(child: Text(status.errorMessage)),
                        ],
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 16),

                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.schedule_outlined),

                        const SizedBox(width: 12),

                        Expanded(
                          child: Text(
                            'Gmail速報はApps Scriptの'
                            '時間主導トリガーから定期的に取得されます。'
                            'この画面を下へ引っ張ると'
                            '最新の取込状況を再取得できます。',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildStatusCard(BuildContext context, GmailImportStatusModel status) {
    final colorScheme = Theme.of(context).colorScheme;

    IconData icon;
    String title;
    String subtitle;
    Color backgroundColor;
    Color foregroundColor;

    if (!status.hasRun) {
      icon = Icons.help_outline;

      title = '未実行';

      subtitle = 'Gmail取込の実行履歴がありません。';

      backgroundColor = colorScheme.surfaceContainerHighest;

      foregroundColor = colorScheme.onSurfaceVariant;
    } else if (status.isSuccess) {
      icon = Icons.check_circle_outline;

      title = '正常';

      subtitle = '前回のGmail取込は正常に完了しました。';

      backgroundColor = colorScheme.primaryContainer;

      foregroundColor = colorScheme.onPrimaryContainer;
    } else if (status.isError) {
      icon = Icons.error_outline;

      title = 'エラー';

      subtitle = '前回のGmail取込でエラーが発生しました。';

      backgroundColor = colorScheme.errorContainer;

      foregroundColor = colorScheme.onErrorContainer;
    } else {
      icon = Icons.info_outline;

      title = '状態不明';

      subtitle = '保存されている取込状態を確認してください。';

      backgroundColor = colorScheme.surfaceContainerHighest;

      foregroundColor = colorScheme.onSurfaceVariant;
    }

    return Card(
      color: backgroundColor,

      child: Padding(
        padding: const EdgeInsets.all(18),

        child: Row(
          children: [
            Icon(icon, size: 36, color: foregroundColor),

            const SizedBox(width: 16),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,

                children: [
                  Text(
                    title,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: foregroundColor,
                    ),
                  ),

                  const SizedBox(height: 4),

                  Text(
                    subtitle,
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: foregroundColor),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState(BuildContext context, Object? error) {
    final message = error.toString().replaceFirst('Exception: ', '');

    return RefreshIndicator(
      onRefresh: _refresh,

      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),

        children: [
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.65,

            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),

                child: Column(
                  mainAxisSize: MainAxisSize.min,

                  children: [
                    Icon(
                      Icons.error_outline,
                      size: 48,
                      color: Theme.of(context).colorScheme.error,
                    ),

                    const SizedBox(height: 12),

                    const Text(
                      'Gmail取込状況を取得できませんでした',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),

                    const SizedBox(height: 8),

                    Text(message, textAlign: TextAlign.center),

                    const SizedBox(height: 16),

                    FilledButton.icon(
                      onPressed: _refresh,

                      icon: const Icon(Icons.refresh),

                      label: const Text('再読み込み'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _formatDateTime(String value) {
    final trimmed = value.trim();

    if (trimmed.isEmpty) {
      return '未実行';
    }

    final parsed = DateTime.tryParse(trimmed.replaceFirst(' ', 'T'));

    if (parsed == null) {
      return trimmed;
    }

    final month = parsed.month.toString().padLeft(2, '0');

    final day = parsed.day.toString().padLeft(2, '0');

    final hour = parsed.hour.toString().padLeft(2, '0');

    final minute = parsed.minute.toString().padLeft(2, '0');

    final second = parsed.second.toString().padLeft(2, '0');

    return '${parsed.year}/$month/$day '
        '$hour:$minute:$second';
  }
}

class _StatusItem extends StatelessWidget {
  const _StatusItem({required this.title, required this.value});

  final String title;
  final String value;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Text(title),

      trailing: Text(
        value,
        style: const TextStyle(fontWeight: FontWeight.bold),
      ),
    );
  }
}
