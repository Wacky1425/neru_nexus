import 'package:flutter/material.dart';

import 'model/goal_model.dart';
import 'service/goal_service.dart';

class GoalManagementPage extends StatefulWidget {
  const GoalManagementPage({super.key});

  @override
  State<GoalManagementPage> createState() => _GoalManagementPageState();
}

class _GoalManagementPageState extends State<GoalManagementPage> {
  final GoalService _goalService = const GoalService();

  late Future<List<GoalModel>> _future;

  @override
  void initState() {
    super.initState();

    _future = _goalService.fetchGoals();
  }

  Future<void> _reload() async {
    final future = _goalService.fetchGoals();

    setState(() {
      _future = future;
    });

    await future;
  }

  Future<void> _openEditor({GoalModel? goal}) async {
    final changed = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => GoalEditPage(goal: goal)));

    if (changed == true && mounted) {
      await _reload();
    }
  }

  Future<void> _deactivate(GoalModel goal) async {
    final confirmed =
        await showDialog<bool>(
          context: context,
          builder: (context) {
            return AlertDialog(
              title: const Text('目的資金を削除'),
              content: Text(
                '「${goal.goalName}」を'
                '一覧から削除しますか？',
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.of(context).pop(false);
                  },
                  child: const Text('キャンセル'),
                ),
                FilledButton(
                  onPressed: () {
                    Navigator.of(context).pop(true);
                  },
                  child: const Text('削除'),
                ),
              ],
            );
          },
        ) ??
        false;

    if (!confirmed) {
      return;
    }

    try {
      await _goalService.deactivateGoal(goal.goalId);

      if (!mounted) {
        return;
      }

      await _reload();

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('目的資金を削除しました')));
    } catch (error) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error.toString().replaceFirst('Exception: ', '')),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('目的資金管理')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          _openEditor();
        },
        icon: const Icon(Icons.add),
        label: const Text('追加'),
      ),
      body: FutureBuilder<List<GoalModel>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, size: 48),
                    const SizedBox(height: 12),
                    const Text('目的資金を取得できませんでした'),
                    const SizedBox(height: 8),
                    Text(
                      snapshot.error.toString().replaceFirst('Exception: ', ''),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: _reload,
                      icon: const Icon(Icons.refresh),
                      label: const Text('再読み込み'),
                    ),
                  ],
                ),
              ),
            );
          }

          final goals = snapshot.data ?? const <GoalModel>[];

          if (goals.isEmpty) {
            return RefreshIndicator(
              onRefresh: _reload,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(24),
                children: [
                  const SizedBox(height: 140),
                  Icon(
                    Icons.flag_outlined,
                    size: 56,
                    color: Theme.of(context).colorScheme.outline,
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    '目的資金はまだありません',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    '旅行・帰省・引っ越し・結婚など、'
                    '将来使う予定のお金を登録できます。',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              itemCount: goals.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final goal = goals[index];

                return _GoalCard(
                  goal: goal,
                  onTap: () {
                    _openEditor(goal: goal);
                  },
                  onDelete: () {
                    _deactivate(goal);
                  },
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _GoalCard extends StatelessWidget {
  const _GoalCard({
    required this.goal,
    required this.onTap,
    required this.onDelete,
  });

  final GoalModel goal;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final target = goal.targetAmount <= 0 ? 1 : goal.targetAmount;

    final progress = (goal.reservedCash / target).clamp(0.0, 1.0);

    final remaining = (goal.targetAmount - goal.reservedCash).clamp(
      0,
      goal.targetAmount,
    );

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      goal.goalName,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  PopupMenuButton<String>(
                    onSelected: (value) {
                      if (value == 'delete') {
                        onDelete();
                      }
                    },
                    itemBuilder: (context) => [
                      const PopupMenuItem(value: 'delete', child: Text('削除')),
                    ],
                  ),
                ],
              ),

              const SizedBox(height: 4),

              Text(
                [
                  if (goal.goalType.isNotEmpty) goal.goalType,
                  if (goal.targetDate.isNotEmpty) _formatDate(goal.targetDate),
                  if (goal.certainty.isNotEmpty) '確度 ${goal.certainty}',
                ].join(' ・ '),
                style: Theme.of(context).textTheme.bodySmall,
              ),

              const SizedBox(height: 16),

              LinearProgressIndicator(value: progress),

              const SizedBox(height: 10),

              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${_formatMoney(goal.reservedCash)}'
                      ' / '
                      '${_formatMoney(goal.targetAmount)}',
                    ),
                  ),
                  Text(
                    'あと ${_formatMoney(remaining)}',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _formatDate(String value) {
    final date = DateTime.tryParse(value);

    if (date == null) {
      return value;
    }

    return '${date.year}年'
        '${date.month}月';
  }

  static String _formatMoney(int value) {
    final formatted = value.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );

    return '￥$formatted';
  }
}

class GoalEditPage extends StatefulWidget {
  const GoalEditPage({super.key, this.goal});

  final GoalModel? goal;

  @override
  State<GoalEditPage> createState() => _GoalEditPageState();
}

class _GoalEditPageState extends State<GoalEditPage> {
  final GoalService _goalService = const GoalService();

  late final TextEditingController _nameController;

  late final TextEditingController _amountController;

  late final TextEditingController _reservedCashController;

  late final TextEditingController _noteController;

  String _goalType = 'その他';
  String _certainty = '中';
  int _priority = 1;

  DateTime? _targetDate;

  bool _saving = false;

  static const _goalTypes = ['旅行', '帰省', '引っ越し', '結婚', '家具・家電', '車', 'その他'];

  static const _certainties = ['低', '中', '高'];

  @override
  void initState() {
    super.initState();

    final goal = widget.goal;

    _nameController = TextEditingController(text: goal?.goalName ?? '');

    _amountController = TextEditingController(
      text: goal == null ? '' : goal.targetAmount.toString(),
    );

    _reservedCashController = TextEditingController(
      text: goal == null ? '0' : goal.reservedCash.toString(),
    );

    _noteController = TextEditingController(text: goal?.note ?? '');

    if (goal != null) {
      if (_goalTypes.contains(goal.goalType)) {
        _goalType = goal.goalType;
      }

      if (_certainties.contains(goal.certainty)) {
        _certainty = goal.certainty;
      }

      _priority = goal.priority <= 0 ? 1 : goal.priority;

      _targetDate = DateTime.tryParse(goal.targetDate);
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _amountController.dispose();
    _reservedCashController.dispose();
    _noteController.dispose();

    super.dispose();
  }

  Future<void> _selectTargetDate() async {
    final now = DateTime.now();

    final selected = await showDatePicker(
      context: context,
      initialDate: _targetDate ?? DateTime(now.year + 1, now.month, 1),
      firstDate: DateTime(now.year, now.month, 1),
      lastDate: DateTime(now.year + 30, 12, 31),
    );

    if (selected == null) {
      return;
    }

    setState(() {
      _targetDate = selected;
    });
  }

  Future<void> _save() async {
    if (_saving) {
      return;
    }

    final name = _nameController.text.trim();

    if (name.isEmpty) {
      _showError('目的名を入力してください');
      return;
    }

    final targetAmount =
        int.tryParse(_amountController.text.replaceAll(',', '').trim()) ?? 0;

    if (targetAmount <= 0) {
      _showError('目標金額を入力してください');
      return;
    }

    if (_targetDate == null) {
      _showError('予定日を選択してください');
      return;
    }

    final reservedCash =
        int.tryParse(_reservedCashController.text.replaceAll(',', '').trim()) ??
        0;

    setState(() {
      _saving = true;
    });

    try {
      final targetDate =
          '${_targetDate!.year}-'
          '${_targetDate!.month.toString().padLeft(2, '0')}-'
          '${_targetDate!.day.toString().padLeft(2, '0')}';

      final goal = widget.goal;

      if (goal == null) {
        await _goalService.createGoal(
          goalName: name,
          goalType: _goalType,
          targetAmount: targetAmount,
          targetDate: targetDate,
          certainty: _certainty,
          reservedCash: reservedCash,
          priority: _priority,
          note: _noteController.text.trim(),
        );
      } else {
        await _goalService.updateGoal(
          goalId: goal.goalId,
          goalName: name,
          goalType: _goalType,
          targetAmount: targetAmount,
          targetDate: targetDate,
          certainty: _certainty,
          reservedCash: reservedCash,
          priority: _priority,
          note: _noteController.text.trim(),
        );
      }

      if (!mounted) {
        return;
      }

      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) {
        return;
      }

      _showError(error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.goal == null ? '目的資金を追加' : '目的資金を編集')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(
              labelText: '目的名',
              hintText: '例：引っ越し',
              border: OutlineInputBorder(),
            ),
          ),

          const SizedBox(height: 16),

          DropdownButtonFormField<String>(
            initialValue: _goalType,
            decoration: const InputDecoration(
              labelText: '種類',
              border: OutlineInputBorder(),
            ),
            items: _goalTypes
                .map(
                  (value) => DropdownMenuItem(value: value, child: Text(value)),
                )
                .toList(),
            onChanged: (value) {
              if (value == null) {
                return;
              }

              setState(() {
                _goalType = value;
              });
            },
          ),

          const SizedBox(height: 16),

          TextField(
            controller: _amountController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: '目標金額',
              suffixText: '円',
              border: OutlineInputBorder(),
            ),
          ),

          const SizedBox(height: 16),

          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('予定日'),
            subtitle: Text(
              _targetDate == null
                  ? '未設定'
                  : '${_targetDate!.year}年'
                        '${_targetDate!.month}月'
                        '${_targetDate!.day}日',
            ),
            trailing: const Icon(Icons.calendar_month),
            onTap: _selectTargetDate,
          ),

          const SizedBox(height: 8),

          DropdownButtonFormField<String>(
            initialValue: _certainty,
            decoration: const InputDecoration(
              labelText: '予定の確度',
              border: OutlineInputBorder(),
            ),
            items: _certainties
                .map(
                  (value) => DropdownMenuItem(value: value, child: Text(value)),
                )
                .toList(),
            onChanged: (value) {
              if (value == null) {
                return;
              }

              setState(() {
                _certainty = value;
              });
            },
          ),

          const SizedBox(height: 16),

          TextField(
            controller: _reservedCashController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'すでに確保している現金',
              suffixText: '円',
              border: OutlineInputBorder(),
            ),
          ),

          const SizedBox(height: 16),

          DropdownButtonFormField<int>(
            initialValue: _priority,
            decoration: const InputDecoration(
              labelText: '優先度',
              border: OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: 1, child: Text('低')),
              DropdownMenuItem(value: 2, child: Text('中')),
              DropdownMenuItem(value: 3, child: Text('高')),
            ],
            onChanged: (value) {
              if (value == null) {
                return;
              }

              setState(() {
                _priority = value;
              });
            },
          ),

          const SizedBox(height: 16),

          TextField(
            controller: _noteController,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'メモ',
              border: OutlineInputBorder(),
            ),
          ),

          const SizedBox(height: 28),

          FilledButton.icon(
            onPressed: _saving ? null : _save,
            icon: _saving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save_outlined),
            label: Text(_saving ? '保存中...' : '保存'),
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
          ),
        ],
      ),
    );
  }
}
