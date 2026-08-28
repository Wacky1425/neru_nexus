
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'sbi_investment_event_model.dart';
import 'sbi_investment_event_service.dart';

class SbiInvestmentEventPage extends StatefulWidget {
  const SbiInvestmentEventPage({super.key});

  @override
  State<SbiInvestmentEventPage> createState() => _SbiInvestmentEventPageState();
}

class _SbiInvestmentEventPageState extends State<SbiInvestmentEventPage> {
  final _service = const SbiInvestmentEventService();

  bool _loading = true;
  bool _scanning = false;
  Object? _error;
  List<SbiInvestmentEventModel> _events = const [];

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    try {
      final events = await _service.fetchEvents();
      if (!mounted) return;
      setState(() {
        _events = events;
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
            '${result.inspectedCount}件確認 / ${result.addedCount}件追加 / '
            '${result.matchedCount}件保有銘柄一致',
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

  Future<void> _apply(SbiInvestmentEventModel event) async {
    if (!event.isMatched) return;
    final action = event.isBuy ? '買付' : '売却';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('$actionを保有数量へ反映'),
        content: Text(
          '${event.securityName}\n'
          '${_number(event.quantity)}${event.symbol.isEmpty ? '口/株' : ''}\n\n'
          '反映先: ${event.holdingName}\n\n'
          'このイベントを保有数量へ反映しますか？',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('キャンセル'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('反映'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      await _service.apply(event);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('保有数量へ反映しました')),
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

  Future<void> _ignore(SbiInvestmentEventModel event) async {
    await _service.ignore(event.eventId);
    await _reload();
  }

  static String _number(double value) =>
      NumberFormat('#,##0.####').format(value);

  @override
  Widget build(BuildContext context) {
    final matched = _events.where((event) => event.isMatched).length;

    return Scaffold(
      appBar: AppBar(title: const Text('SBI証券 通知取込')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorView(error: _error!, onRetry: _reload)
              : RefreshIndicator(
                  onRefresh: _reload,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
                    children: [
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '売買通知候補',
                                style: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '未処理 ${_events.length}件 ・ '
                                '保有銘柄一致 $matched件',
                              ),
                              const SizedBox(height: 12),
                              FilledButton.icon(
                                onPressed: _scanning ? null : _scan,
                                icon: const Icon(Icons.manage_search),
                                label: Text(
                                  _scanning
                                      ? 'Gmail確認中…'
                                      : '過去90日のSBI証券通知を確認',
                                ),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                'メールを受け取っただけでは保有数量を変更しません。'
                                '解析結果と銘柄一致を確認してから反映します。',
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      if (_events.isEmpty)
                        const SizedBox(
                          height: 280,
                          child: Center(child: Text('未処理の売買通知はありません')),
                        )
                      else
                        ..._events.map(
                          (event) => Card(
                            margin: const EdgeInsets.only(bottom: 10),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Chip(
                                        label: Text(
                                          event.isBuy ? '買付' : '売却',
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          event.securityName.isNotEmpty
                                              ? event.securityName
                                              : event.symbol,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  Text(
                                    '${event.tradeDate} ・ '
                                    '${_number(event.quantity)}口/株'
                                    '${event.price > 0 ? ' ・ 単価 ${_number(event.price)}' : ''}',
                                  ),
                                  if (event.isMatched) ...[
                                    const Divider(height: 20),
                                    Text(
                                      '反映候補: ${event.holdingName} '
                                      '(${(event.matchScore * 100).round()}%)',
                                    ),
                                  ] else ...[
                                    const Divider(height: 20),
                                    const Text('保有銘柄を自動特定できませんでした'),
                                  ],
                                  const SizedBox(height: 8),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      TextButton(
                                        onPressed: () => _ignore(event),
                                        child: const Text('対象外'),
                                      ),
                                      if (event.isMatched) ...[
                                        const SizedBox(width: 8),
                                        FilledButton(
                                          onPressed: () => _apply(event),
                                          child: const Text('保有へ反映'),
                                        ),
                                      ],
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
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
