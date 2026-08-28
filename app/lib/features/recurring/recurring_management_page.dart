import 'package:flutter/material.dart';

import 'model/recurring_candidate_model.dart';
import 'service/recurring_service.dart';

class RecurringManagementPage extends StatefulWidget {
  const RecurringManagementPage({super.key});

  @override
  State<RecurringManagementPage> createState() => _RecurringManagementPageState();
}

class _RecurringManagementPageState extends State<RecurringManagementPage>
    with SingleTickerProviderStateMixin {
  final RecurringService _service = const RecurringService();
  late Future<RecurringCandidatesResult> _future;
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _future = _service.fetchCandidates();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    final future = _service.fetchCandidates();
    setState(() => _future = future);
    await future;
  }

  Future<void> _approve(RecurringCandidateModel item) async {
    var selectedType = item.recurringType.isNotEmpty
        ? item.recurringType
        : (item.suggestedType.isNotEmpty ? item.suggestedType : '固定費');
    final noteController = TextEditingController(text: item.note);

    final approved = await showDialog<bool>(
          context: context,
          builder: (context) => StatefulBuilder(
            builder: (context, setDialogState) => AlertDialog(
              title: Text('「${item.merchant}」を承認'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('平均 ${_money(item.avgAmount)} / 月'),
                  const SizedBox(height: 16),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: '固定費', label: Text('固定費')),
                      ButtonSegment(value: 'サブスク', label: Text('サブスク')),
                    ],
                    selected: {selectedType},
                    onSelectionChanged: (value) {
                      setDialogState(() => selectedType = value.first);
                    },
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: noteController,
                    decoration: const InputDecoration(
                      labelText: 'メモ（任意）',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('キャンセル'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(context, true),
                  child: const Text('承認'),
                ),
              ],
            ),
          ),
        ) ??
        false;

    if (!approved) {
      noteController.dispose();
      return;
    }

    try {
      await _service.updateCandidate(
        candidateKey: item.candidateKey,
        status: '承認',
        recurringType: selectedType,
        note: noteController.text.trim(),
      );
      noteController.dispose();
      if (!mounted) return;
      await _reload();
    } catch (error) {
      noteController.dispose();
      if (!mounted) return;
      _showError(error);
    }
  }

  Future<void> _ignore(RecurringCandidateModel item) async {
    try {
      await _service.updateCandidate(
        candidateKey: item.candidateKey,
        status: '無視',
        note: item.note,
      );
      if (!mounted) return;
      await _reload();
    } catch (error) {
      if (!mounted) return;
      _showError(error);
    }
  }

  Future<void> _restore(RecurringCandidateModel item) async {
    try {
      await _service.updateCandidate(
        candidateKey: item.candidateKey,
        status: '候補',
        note: item.note,
      );
      if (!mounted) return;
      await _reload();
    } catch (error) {
      if (!mounted) return;
      _showError(error);
    }
  }

  void _showError(Object error) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error.toString().replaceFirst('Exception: ', ''))),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('固定費・定期支払い'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: '候補'),
            Tab(text: '承認済み'),
            Tab(text: '無視'),
          ],
        ),
      ),
      body: FutureBuilder<RecurringCandidatesResult>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _ErrorView(error: snapshot.error!, onReload: _reload);
          }

          final result = snapshot.data ??
              const RecurringCandidatesResult(
                items: [],
                candidateCount: 0,
                approvedCount: 0,
                ignoredCount: 0,
                monthlyTotal: 0,
                yearlyEstimate: 0,
                currentMonthRemaining: 0,
                currentMonthRemainingCount: 0,
                currentMonthOverdueCount: 0,
              );

          return Column(
            children: [
              _RecurringSummary(result: result),
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
              _CandidateList(
                items: result.items.where((e) => e.isCandidate).toList(),
                emptyText: '新しい候補はありません',
                onRefresh: _reload,
                onApprove: _approve,
                onIgnore: _ignore,
              ),
              _CandidateList(
                items: result.items.where((e) => e.isApproved).toList(),
                emptyText: '承認済みの定期支払いはありません',
                onRefresh: _reload,
                onApprove: _approve,
                onRestore: _restore,
              ),
              _CandidateList(
                items: result.items.where((e) => e.isIgnored).toList(),
                emptyText: '無視した候補はありません',
                onRefresh: _reload,
                onRestore: _restore,
              ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _RecurringSummary extends StatelessWidget {
  const _RecurringSummary({required this.result});

  final RecurringCandidatesResult result;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: _SummaryValue(
                      label: '月額見込',
                      value: _money(result.monthlyTotal),
                    ),
                  ),
                  Expanded(
                    child: _SummaryValue(
                      label: '年間見込',
                      value: _money(result.yearlyEstimate),
                    ),
                  ),
                ],
              ),
              const Divider(height: 24),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      result.currentMonthRemainingCount > 0
                          ? '今月残り ${result.currentMonthRemainingCount}件・${_money(result.currentMonthRemaining)}'
                          : '今月分はすべて発生済み',
                    ),
                  ),
                  if (result.currentMonthOverdueCount > 0)
                    Chip(
                      avatar: const Icon(Icons.warning_amber_rounded, size: 18),
                      label: Text('目安日超過 ${result.currentMonthOverdueCount}件'),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SummaryValue extends StatelessWidget {
  const _SummaryValue({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 4),
        Text(
          value,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
      ],
    );
  }
}

class _CandidateList extends StatelessWidget {
  const _CandidateList({
    required this.items,
    required this.emptyText,
    required this.onRefresh,
    this.onApprove,
    this.onIgnore,
    this.onRestore,
  });

  final List<RecurringCandidateModel> items;
  final String emptyText;
  final Future<void> Function() onRefresh;
  final Future<void> Function(RecurringCandidateModel)? onApprove;
  final Future<void> Function(RecurringCandidateModel)? onIgnore;
  final Future<void> Function(RecurringCandidateModel)? onRestore;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return RefreshIndicator(
        onRefresh: onRefresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            const SizedBox(height: 160),
            const Icon(Icons.autorenew_rounded, size: 52),
            const SizedBox(height: 16),
            Text(emptyText, textAlign: TextAlign.center),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: items.length,
        separatorBuilder: (context, index) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          final item = items[index];
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
                          item.merchant,
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),
                      ),
                      if (item.isApproved)
                        Chip(label: Text(item.recurringType)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text('${_money(item.avgAmount)} / 月 ・ ${item.monthCount}か月検出'),
                  if (item.minAmount != item.maxAmount)
                    Text('範囲 ${_money(item.minAmount)}〜${_money(item.maxAmount)}'),
                  if (item.category.trim().isNotEmpty) Text(item.category),
                  Text('${item.firstMonth} 〜 ${item.lastMonth}'),
                  if (item.expectedDay > 0)
                    Text('支払目安 毎月${item.expectedDay}日ごろ'),
                  if (item.yearlyEstimate > 0)
                    Text('年間見込 ${_money(item.yearlyEstimate)}'),
                  if (item.note.trim().isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text('メモ: ${item.note}'),
                  ],
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: [
                      if (onApprove != null)
                        FilledButton.tonal(
                          onPressed: () => onApprove!(item),
                          child: Text(item.isApproved ? '種類・メモ変更' : '承認'),
                        ),
                      if (onIgnore != null)
                        TextButton(
                          onPressed: () => onIgnore!(item),
                          child: const Text('無視'),
                        ),
                      if (onRestore != null)
                        TextButton(
                          onPressed: () => onRestore!(item),
                          child: Text(item.isIgnored ? '候補に戻す' : '承認を解除'),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onReload});
  final Object error;
  final Future<void> Function() onReload;

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
            const Text('定期支払い候補を取得できませんでした'),
            const SizedBox(height: 8),
            Text(error.toString().replaceFirst('Exception: ', ''),
                textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onReload,
              icon: const Icon(Icons.refresh),
              label: const Text('再読み込み'),
            ),
          ],
        ),
      ),
    );
  }
}

String _money(int value) => '${value.toString().replaceAllMapped(
      RegExp(r'(?=(\d{3})+(?!\d))'),
      (match) => ',',
    )}円';
