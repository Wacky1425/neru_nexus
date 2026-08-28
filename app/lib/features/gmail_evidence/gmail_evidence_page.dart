
import 'package:flutter/material.dart';

import 'model/gmail_evidence_candidate.dart';
import 'service/gmail_evidence_service.dart';

class GmailEvidencePage extends StatefulWidget {
  const GmailEvidencePage({super.key});

  @override
  State<GmailEvidencePage> createState() => _GmailEvidencePageState();
}

class _GmailEvidencePageState extends State<GmailEvidencePage> {
  final GmailEvidenceService _service = const GmailEvidenceService();

  bool _loading = true;
  bool _scanning = false;
  Object? _error;
  List<GmailEvidenceCandidate> _items = const [];

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    try {
      final items = await _service.fetchCandidates();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error;
      });
    }
  }

  Future<void> _scan() async {
    if (_scanning) return;
    setState(() => _scanning = true);

    try {
      final result = await _service.scan(days: 90);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${result.inspectedCount}件確認 / '
            '${result.addedCount}件追加 / '
            '${result.matchedCount}件照合候補',
          ),
        ),
      );
      await _reload();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error.toString().replaceFirst('Exception: ', '')),
        ),
      );
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  Future<void> _attach(GmailEvidenceCandidate item) async {
    if (!item.hasMatch) return;

    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('証憑を紐付け'),
        content: Text(
          '${item.subject}\n\n'
          '↓\n\n'
          '${item.proposedTransactionLabel}\n\n'
          'このGmailを取引の証憑として登録しますか？',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('キャンセル'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('紐付け'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    try {
      await _service.attach(item);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('証憑を紐付けました')),
      );
      await _reload();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error.toString().replaceFirst('Exception: ', '')),
        ),
      );
    }
  }

  Future<void> _ignore(GmailEvidenceCandidate item) async {
    await _service.ignore(item.candidateId);
    await _reload();
  }

  @override
  Widget build(BuildContext context) {
    final matched = _items.where((item) => item.hasMatch).length;
    final unmatched = _items.length - matched;

    return Scaffold(
      appBar: AppBar(title: const Text('Gmail領収書・証憑')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorView(error: _error!, onRetry: _reload)
              : RefreshIndicator(
                  onRefresh: _reload,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 100),
                    children: [
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '証憑候補',
                                style: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '未処理 ${_items.length}件 ・ '
                                '照合候補 $matched件 ・ 未照合 $unmatched件',
                              ),
                              const SizedBox(height: 12),
                              FilledButton.icon(
                                onPressed: _scanning ? null : _scan,
                                icon: const Icon(Icons.manage_search),
                                label: Text(
                                  _scanning
                                      ? 'Gmail確認中…'
                                      : '過去90日の領収書メールを確認',
                                ),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                'Gmailから候補を作るだけで、支出取引を勝手に追加したり、'
                                '既存の証憑を上書きしたりはしません。',
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      if (_items.isEmpty)
                        const SizedBox(
                          height: 280,
                          child: Center(child: Text('未処理の証憑候補はありません')),
                        )
                      else
                        ..._items.map((item) => _CandidateCard(
                              item: item,
                              onAttach: () => _attach(item),
                              onIgnore: () => _ignore(item),
                            )),
                    ],
                  ),
                ),
    );
  }
}

class _CandidateCard extends StatelessWidget {
  const _CandidateCard({
    required this.item,
    required this.onAttach,
    required this.onIgnore,
  });

  final GmailEvidenceCandidate item;
  final VoidCallback onAttach;
  final VoidCallback onIgnore;

  @override
  Widget build(BuildContext context) {
    final score = (item.matchScore * 100).round();

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              item.subject.isEmpty ? item.merchant : item.subject,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 6),
            Text(
              '${item.transactionDate} ・ ¥${item.amount}'
              '${item.merchant.isNotEmpty ? ' ・ ${item.merchant}' : ''}',
            ),
            if (item.attachmentCount > 0) ...[
              const SizedBox(height: 4),
              Text('添付ファイル ${item.attachmentCount}件'),
            ],
            const Divider(height: 20),
            if (item.hasMatch) ...[
              Text(
                '取引候補 $score%',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(item.proposedTransactionLabel),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: onIgnore,
                    child: const Text('対象外'),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.icon(
                    onPressed: onAttach,
                    icon: const Icon(Icons.attach_file),
                    label: const Text('証憑にする'),
                  ),
                ],
              ),
            ] else ...[
              const Text('一致する取引を特定できませんでした'),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: onIgnore,
                  child: const Text('対象外'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry});

  final Object error;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48),
            const SizedBox(height: 12),
            Text(
              error.toString().replaceFirst('Exception: ', ''),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('再読み込み'),
            ),
          ],
        ),
      ),
    );
  }
}
