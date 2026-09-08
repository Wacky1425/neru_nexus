import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'model/investment_plan_model.dart';
import 'service/investment_plan_service.dart';

class InvestmentPlannerPage extends StatefulWidget {
  const InvestmentPlannerPage({super.key});

  @override
  State<InvestmentPlannerPage> createState() => _InvestmentPlannerPageState();
}

class _InvestmentPlannerPageState extends State<InvestmentPlannerPage> {
  final _service = const InvestmentPlanService();

  late String _yearMonth;
  InvestmentPlannerResult? _result;
  bool _loading = true;
  Object? _error;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _yearMonth =
        '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}';
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _result == null;
      _error = null;
    });
    try {
      final result = await _service.fetchPlanner(yearMonth: _yearMonth);
      if (!mounted) return;
      setState(() => _result = result);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _moveMonth(int delta) {
    final parts = _yearMonth.split('-');
    final current = DateTime(
      int.parse(parts[0]),
      int.parse(parts[1]),
      1,
    );
    final next = DateTime(current.year, current.month + delta, 1);
    setState(() {
      _yearMonth =
          '${next.year.toString().padLeft(4, '0')}-${next.month.toString().padLeft(2, '0')}';
      _result = null;
    });
    _load();
  }

  Future<void> _editPlan([InvestmentPlanItem? item]) async {
    final result = _result;
    if (result == null || result.holdings.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('先に保有銘柄を登録してください')),
      );
      return;
    }

    final holdingIds = result.holdings.map((e) => e.holdingId).toSet();
    var holdingId =
        item != null && holdingIds.contains(item.holdingId)
            ? item.holdingId
            : result.holdings.first.holdingId;
    var nisaType = item?.nisaType == 'nisa' ? 'nisa' : 'taxable';

    final amountController = TextEditingController(
      text: item == null ? '' : item.plannedAmount.toString(),
    );
    final noteController = TextEditingController(text: item?.note ?? '');
    final formKey = GlobalKey<FormState>();

    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: Text(item == null ? '投資プランを追加' : '投資プランを編集'),
              content: SizedBox(
                width: 420,
                child: Form(
                  key: formKey,
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        DropdownButtonFormField<String>(
                          initialValue: holdingId,
                          decoration: const InputDecoration(labelText: '銘柄'),
                          items: result.holdings
                              .map(
                                (holding) => DropdownMenuItem(
                                  value: holding.holdingId,
                                  child: Text(holding.name),
                                ),
                              )
                              .toList(),
                          onChanged: item == null
                              ? (value) {
                                  if (value != null) {
                                    setDialogState(() => holdingId = value);
                                  }
                                }
                              : null,
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: amountController,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                            labelText: '今月の予定額',
                            prefixText: '¥',
                          ),
                          validator: (value) {
                            final amount = int.tryParse(
                              (value ?? '').replaceAll(',', ''),
                            );
                            if (amount == null || amount <= 0) {
                              return '1円以上で入力してください';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 12),
                        DropdownButtonFormField<String>(
                          initialValue: nisaType,
                          decoration: const InputDecoration(labelText: '口座区分'),
                          items: const [
                            DropdownMenuItem(
                              value: 'nisa',
                              child: Text('NISA予定'),
                            ),
                            DropdownMenuItem(
                              value: 'taxable',
                              child: Text('課税口座など'),
                            ),
                          ],
                          onChanged: (value) {
                            if (value != null) {
                              setDialogState(() => nisaType = value);
                            }
                          },
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: noteController,
                          decoration: const InputDecoration(labelText: 'メモ'),
                          maxLines: 2,
                        ),
                        const SizedBox(height: 10),
                        const Text(
                          'ここで作るのは投資予定です。SBI証券への注文は送信されません。',
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(dialogContext, false),
                  child: const Text('キャンセル'),
                ),
                FilledButton(
                  onPressed: () async {
                    if (!(formKey.currentState?.validate() ?? false)) return;
                    final amount = int.parse(
                      amountController.text.replaceAll(',', ''),
                    );
                    try {
                      final updated = await _service.savePlan(
                        planId: item?.planId ?? '',
                        yearMonth: _yearMonth,
                        holdingId: holdingId,
                        plannedAmount: amount,
                        nisaType: nisaType,
                        note: noteController.text.trim(),
                      );
                      if (!mounted) return;
                      setState(() => _result = updated);
                      if (dialogContext.mounted) {
                        Navigator.pop(dialogContext, true);
                      }
                    } catch (error) {
                      if (!dialogContext.mounted) return;
                      ScaffoldMessenger.of(dialogContext).showSnackBar(
                        SnackBar(content: Text(error.toString())),
                      );
                    }
                  },
                  child: const Text('保存'),
                ),
              ],
            );
          },
        );
      },
    );

    amountController.dispose();
    noteController.dispose();

    if (saved == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('投資プランを保存しました')),
      );
    }
  }

  Future<void> _deletePlan(InvestmentPlanItem item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('投資プランを削除'),
        content: Text('${item.holdingName} の今月プランを削除しますか？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('キャンセル'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('削除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      final updated = await _service.deactivatePlan(planId: item.planId);
      if (!mounted) return;
      setState(() => _result = updated);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = _result;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Investment Planner'),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: result == null ? null : () => _editPlan(),
        icon: const Icon(Icons.add),
        label: const Text('予定を追加'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
          children: [
            _MonthSelector(
              yearMonth: _yearMonth,
              onPrevious: () => _moveMonth(-1),
              onNext: () => _moveMonth(1),
            ),
            const SizedBox(height: 12),
            if (_loading && result == null)
              const SizedBox(
                height: 280,
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null && result == null)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      Text(_error.toString()),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: _load,
                        child: const Text('再読み込み'),
                      ),
                    ],
                  ),
                ),
              )
            else if (result != null) ...[
              _PlannerSummaryCard(result: result),
              const SizedBox(height: 16),
              if (result.items.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'この月の投資予定はまだありません。\n「予定を追加」から銘柄ごとの金額を決められます。',
                      textAlign: TextAlign.center,
                    ),
                  ),
                )
              else
                ...result.items.map(
                  (item) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _PlanCard(
                      item: item,
                      onEdit: () => _editPlan(item),
                      onDelete: () => _deletePlan(item),
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

class _MonthSelector extends StatelessWidget {
  const _MonthSelector({
    required this.yearMonth,
    required this.onPrevious,
    required this.onNext,
  });

  final String yearMonth;
  final VoidCallback onPrevious;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        IconButton(
          onPressed: onPrevious,
          icon: const Icon(Icons.chevron_left),
        ),
        Expanded(
          child: Text(
            yearMonth,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
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

class _PlannerSummaryCard extends StatelessWidget {
  const _PlannerSummaryCard({required this.result});

  final InvestmentPlannerResult result;

  @override
  Widget build(BuildContext context) {
    final recommended = result.recommendedAmount;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '今月投資に回せる目安',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 6),
            Text(
              _yen(recommended),
              style: const TextStyle(
                fontSize: 30,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '家計・目的資金・生活防衛資金を反映したNeru Nexusの資金配分目安',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const Divider(height: 28),
            Row(
              children: [
                Expanded(
                  child: _SummaryValue(
                    label: '予定',
                    value: _yen(result.plannedTotal),
                  ),
                ),
                Expanded(
                  child: _SummaryValue(
                    label: 'SBI実績',
                    value: _yen(result.actualTotal),
                  ),
                ),
                Expanded(
                  child: _SummaryValue(
                    label: '予定残り',
                    value: _yen(result.remainingPlanned),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            LinearProgressIndicator(
              value: recommended > 0
                  ? (result.actualTotal / recommended).clamp(0, 1).toDouble()
                  : 0,
            ),
            const SizedBox(height: 8),
            Text(
              '目安に対する残り余力 ${_yen(result.remainingCapacity)}'
              ' ・ SBI約定反映 ${result.actualEventCount}件',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (result.plannedOverRecommended > 0) ...[
              const SizedBox(height: 10),
              Text(
                '予定額が家計からの目安を ${_yen(result.plannedOverRecommended)} 上回っています。',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.error,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            if (result.baseNisa > 0 || result.additionalNisa > 0) ...[
              const SizedBox(height: 10),
              Text(
                '基本NISA ${_yen(result.baseNisa)}'
                ' ・ 追加余地 ${_yen(result.additionalNisa)}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
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
        const SizedBox(height: 3),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
      ],
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.item,
    required this.onEdit,
    required this.onDelete,
  });

  final InvestmentPlanItem item;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final progress = item.progressRate.clamp(0, 1).toDouble();
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onEdit,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      item.holdingName.isEmpty ? item.holdingId : item.holdingName,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  if (item.nisaType == 'nisa')
                    const Chip(label: Text('NISA')),
                  IconButton(
                    tooltip: '削除',
                    onPressed: onDelete,
                    icon: const Icon(Icons.delete_outline),
                  ),
                ],
              ),
              if (item.accountName.isNotEmpty)
                Text(
                  item.accountName,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _SummaryValue(
                      label: '予定',
                      value: _yen(item.plannedAmount),
                    ),
                  ),
                  Expanded(
                    child: _SummaryValue(
                      label: '実績',
                      value: _yen(item.actualAmount),
                    ),
                  ),
                  Expanded(
                    child: _SummaryValue(
                      label: '残り',
                      value: _yen(item.remainingAmount),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              LinearProgressIndicator(value: progress),
              if (item.note.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(item.note),
              ],
              const SizedBox(height: 8),
              Text(
                'SBI証券の反映済み買付通知を自動集計。売却は投資額に含めません。',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _yen(int value) => '¥${NumberFormat('#,##0').format(value)}';
