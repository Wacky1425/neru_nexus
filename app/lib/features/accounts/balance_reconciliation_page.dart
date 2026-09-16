import 'package:flutter/material.dart';

import 'model/balance_reconciliation_model.dart';
import 'service/balance_reconciliation_service.dart';

class BalanceReconciliationPage extends StatefulWidget {
  const BalanceReconciliationPage({super.key});

  @override
  State<BalanceReconciliationPage> createState() =>
      _BalanceReconciliationPageState();
}

class _BalanceReconciliationPageState extends State<BalanceReconciliationPage> {
  final _service = const BalanceReconciliationService();

  BalanceReconciliationResult? _result;
  bool _loading = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final result = await _service.fetch();
      if (!mounted) return;
      setState(() => _result = result);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _reconcile(BalanceReconciliationAccount account) async {
    final submitted = await showDialog<_ReconciliationInput>(
      context: context,
      builder: (_) => _ReconciliationDialog(account: account),
    );

    if (submitted == null || !mounted) return;

    try {
      final now = DateTime.now();
      final asOfDate =
          '${now.year.toString().padLeft(4, '0')}-'
          '${now.month.toString().padLeft(2, '0')}-'
          '${now.day.toString().padLeft(2, '0')}';
      await _service.save(
        accountId: account.accountId,
        actualBalance: submitted.actualBalance,
        asOfDate: asOfDate,
        note: submitted.note,
      );
      await _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = _result;

    return Scaffold(
      appBar: AppBar(title: const Text('残高照合')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            if (_loading) const LinearProgressIndicator(),
            if (_loading) const SizedBox(height: 12),
            if (_error != null && result == null)
              _ErrorCard(error: _error!, onRetry: _load)
            else if (result != null) ...[
              _SummaryCard(result: result),
              const SizedBox(height: 16),
              ...result.items.map(
                (account) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _AccountReconciliationCard(
                    account: account,
                    onReconcile: account.baselineReady
                        ? () => _reconcile(account)
                        : null,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ReconciliationDialog extends StatefulWidget {
  const _ReconciliationDialog({required this.account});

  final BalanceReconciliationAccount account;

  @override
  State<_ReconciliationDialog> createState() => _ReconciliationDialogState();
}

class _ReconciliationDialogState extends State<_ReconciliationDialog> {
  late final TextEditingController _balanceController;
  late final TextEditingController _noteController;

  @override
  void initState() {
    super.initState();
    _balanceController = TextEditingController(
      text: widget.account.latestReconciliation?.actualBalance.toString() ?? '',
    );
    _noteController = TextEditingController();
  }

  @override
  void dispose() {
    _balanceController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  void _submit() {
    final raw = _balanceController.text
        .replaceAll(',', '')
        .replaceAll('¥', '')
        .replaceAll('￥', '')
        .trim();
    final value = int.tryParse(raw);
    if (value == null) return;
    Navigator.of(context).pop(
      _ReconciliationInput(
        actualBalance: value,
        note: _noteController.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('${widget.account.accountName}を照合'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Neru Nexus計算残高: ${_formatYen(widget.account.calculatedBalance)}'),
          const SizedBox(height: 12),
          TextField(
            controller: _balanceController,
            keyboardType: const TextInputType.numberWithOptions(signed: true),
            decoration: const InputDecoration(
              labelText: '実残高',
              helperText: '銀行・カード・証券側で確認した現在残高',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _noteController,
            decoration: const InputDecoration(labelText: 'メモ（任意）'),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('キャンセル'),
        ),
        FilledButton(onPressed: _submit, child: const Text('照合を保存')),
      ],
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.result});

  final BalanceReconciliationResult result;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '口座ごとの基準日から残高を再構築',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 8),
            const Text(
              '口座設定の基準残高 + 基準日より後の取引 = 計算残高。'
              '実残高との差が0円なら、その基準日以降のデータは一致しています。',
            ),
            const SizedBox(height: 12),
            Text('基準残高設定済み ${result.baselineReadyCount}/${result.totalCount}'),
            Text('照合済み ${result.checkedCount}/${result.totalCount}'),
            Text('一致 ${result.matchedCount}件 / 差額あり ${result.mismatchCount}件'),
          ],
        ),
      ),
    );
  }
}

class _AccountReconciliationCard extends StatelessWidget {
  const _AccountReconciliationCard({
    required this.account,
    required this.onReconcile,
  });

  final BalanceReconciliationAccount account;
  final VoidCallback? onReconcile;

  @override
  Widget build(BuildContext context) {
    final latest = account.latestReconciliation;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    account.accountName,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                ),
                Icon(
                  latest == null
                      ? Icons.help_outline
                      : latest.matched
                          ? Icons.check_circle_outline
                          : Icons.warning_amber_rounded,
                ),
              ],
            ),
            const SizedBox(height: 10),
            _row('基準日', account.openingBalanceDate.isEmpty ? '未設定' : account.openingBalanceDate),
            _row('基準残高', account.baselineReady
                ? _formatYen(account.openingBalance)
                : '未設定'),
            _row('計算残高', _formatYen(account.calculatedBalance)),
            if (latest != null) ...[
              _row('実残高', _formatYen(latest.actualBalance)),
              _row('差額', _formatSignedYen(latest.difference)),
              _row('照合日', latest.asOfDate),
            ] else
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('まだ実残高との照合をしていません。'),
              ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.tonal(
                onPressed: onReconcile,
                child: Text(
                  !account.baselineReady
                      ? '先に口座設定で基準日・基準残高を設定'
                      : latest == null
                          ? '実残高を入力して照合'
                          : 'もう一度照合',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 130, child: Text(label)),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Text(error.toString().replaceFirst('Exception: ', '')),
            const SizedBox(height: 12),
            FilledButton(onPressed: onRetry, child: const Text('再読み込み')),
          ],
        ),
      ),
    );
  }
}

class _ReconciliationInput {
  const _ReconciliationInput({
    required this.actualBalance,
    required this.note,
  });

  final int actualBalance;
  final String note;
}

String _formatYen(int value) => '¥${_withComma(value)}';

String _formatSignedYen(int value) {
  if (value == 0) return '¥0';
  final prefix = value > 0 ? '+' : '-';
  return '$prefix¥${_withComma(value.abs())}';
}

String _withComma(int value) {
  final text = value.toString();
  final buffer = StringBuffer();
  for (var i = 0; i < text.length; i++) {
    if (i > 0 && (text.length - i) % 3 == 0) buffer.write(',');
    buffer.write(text[i]);
  }
  return buffer.toString();
}
