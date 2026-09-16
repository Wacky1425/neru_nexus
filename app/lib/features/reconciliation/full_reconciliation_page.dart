import 'package:flutter/material.dart';

import 'full_reconciliation_service.dart';

class FullReconciliationPage extends StatefulWidget {
  const FullReconciliationPage({super.key});

  @override
  State<FullReconciliationPage> createState() => _FullReconciliationPageState();
}

class _FullReconciliationPageState extends State<FullReconciliationPage> {
  final _service = const FullReconciliationService();
  FullReconciliationData? _data;
  Object? _error;
  bool _loading = true;

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
      final data = await _service.fetch();
      if (!mounted) return;
      setState(() => _data = data);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('全データ突合')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            if (_loading) const LinearProgressIndicator(),
            if (_loading) const SizedBox(height: 16),
            if (_error != null && _data == null)
              _ErrorCard(error: _error!, onRetry: _load)
            else if (_data != null) ...[
              _ReadinessCard(data: _data!),
              const SizedBox(height: 16),
              _SummaryCard(data: _data!),
              const SizedBox(height: 16),
              if (_data!.blockers.isNotEmpty)
                _IssueSection(
                  title: '実運用前に直す項目',
                  icon: Icons.error_outline,
                  items: _data!.blockers,
                ),
              if (_data!.blockers.isNotEmpty) const SizedBox(height: 16),
              if (_data!.warnings.isNotEmpty)
                _IssueSection(
                  title: '確認推奨',
                  icon: Icons.warning_amber_rounded,
                  items: _data!.warnings,
                ),
              if (_data!.warnings.isNotEmpty) const SizedBox(height: 16),
              _AccountSection(accounts: _data!.accounts),
              const SizedBox(height: 16),
              _IssueSection(
                title: '確認済み',
                icon: Icons.check_circle_outline,
                items: _data!.passes,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ReadinessCard extends StatelessWidget {
  const _ReadinessCard({required this.data});
  final FullReconciliationData data;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              data.readyForDailyUse ? '実運用開始OK' : '実運用前の確認が必要',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 8),
            Text('信頼度スコア ${data.score}%'),
            const SizedBox(height: 12),
            LinearProgressIndicator(value: data.score.clamp(0, 100) / 100),
            const SizedBox(height: 12),
            Text(
              data.readyForDailyUse
                  ? '残高・要確認・資金移動・基本整合性の主要チェックを通過しています。'
                  : '下の「実運用前に直す項目」を0件にすると、日常利用開始の判定になります。',
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.data});
  final FullReconciliationData data;

  @override
  Widget build(BuildContext context) {
    final s = data.summary;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('全体サマリー', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            _row('取引', '${s['transactionCount'] ?? 0}件'),
            _row('要確認', '${s['reviewCount'] ?? 0}件'),
            _row('追跡口座', '${s['trackedAccountCount'] ?? 0}口座'),
            _row('基準残高未設定', '${s['baselinePendingCount'] ?? 0}口座'),
            _row('残高未照合', '${s['uncheckedBalanceCount'] ?? 0}口座'),
            _row('残高不一致', '${s['mismatchBalanceCount'] ?? 0}口座'),
            _row('未確定の資金移動', '${s['malformedTransferCount'] ?? 0}件'),
            _row('カード照合 要確認', '${s['settlementReviewCount'] ?? 0}件'),
            _row('CSV取込履歴', '${s['importHistoryCount'] ?? 0}件'),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            Expanded(child: Text(label)),
            Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
          ],
        ),
      );
}

class _IssueSection extends StatelessWidget {
  const _IssueSection({required this.title, required this.icon, required this.items});
  final String title;
  final IconData icon;
  final List<FullReconciliationIssue> items;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [Icon(icon), const SizedBox(width: 8), Text(title, style: Theme.of(context).textTheme.titleMedium)]),
            const SizedBox(height: 8),
            for (final item in items)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(item.title),
                subtitle: item.detail.isEmpty ? null : Text(item.detail),
              ),
          ],
        ),
      ),
    );
  }
}

class _AccountSection extends StatelessWidget {
  const _AccountSection({required this.accounts});
  final List<FullReconciliationAccount> accounts;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('口座別照合', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final account in accounts)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(account.accountName),
                subtitle: Text(_status(account)),
                trailing: Icon(
                  account.matched ? Icons.check_circle : Icons.error_outline,
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _status(FullReconciliationAccount account) {
    if (!account.baselineReady) return '基準残高未設定';
    if (!account.checked) return '未照合';
    if (account.matched) return '一致';
    final difference = account.difference;
    return difference == null ? '不一致' : '差額 ${difference.toStringAsFixed(0)}円';
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
            Text('全データ突合を取得できませんでした\n$error'),
            const SizedBox(height: 12),
            FilledButton(onPressed: onRetry, child: const Text('再試行')),
          ],
        ),
      ),
    );
  }
}
