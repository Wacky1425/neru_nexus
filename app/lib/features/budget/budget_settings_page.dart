import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/refresh/app_refresh_controller.dart';
import '../../core/widgets/month_picker_dialog.dart';
import 'model/budget_model.dart';
import 'service/budget_service.dart';

class BudgetSettingsPage extends StatefulWidget {
  const BudgetSettingsPage({super.key});

  @override
  State<BudgetSettingsPage> createState() => _BudgetSettingsPageState();
}

class _BudgetSettingsPageState extends State<BudgetSettingsPage> {
  final BudgetService _service = const BudgetService();

  final _formKey = GlobalKey<FormState>();

  final _salaryController = TextEditingController();
  final _sideIncomeController = TextEditingController();

  final _fixedExpenseController = TextEditingController();
  final _variableExpenseController = TextEditingController();

  final _nisaController = TextEditingController();
  final _freeSpendingController = TextEditingController();
  final _savingsController = TextEditingController();

  late DateTime _selectedMonth;
  late Future<BudgetModel> _future;

  BudgetModel? _budget;

  bool _isSaving = false;

  @override
  void initState() {
    super.initState();

    final now = DateTime.now();

    _selectedMonth = DateTime(now.year, now.month);

    _future = _fetchBudget();
  }

  Future<BudgetModel> _fetchBudget() async {
    final budget = await _service.fetchBudget(
      yearMonth: _toYearMonth(_selectedMonth),
    );

    if (mounted) {
      _applyBudget(budget);
    }

    return budget;
  }

  void _applyBudget(BudgetModel budget) {
    _budget = budget;

    _salaryController.text = budget.salaryPlanned.toString();

    _sideIncomeController.text = budget.sideIncomePlanned.toString();

    _fixedExpenseController.text = budget.fixedExpenseBudget.toString();

    _variableExpenseController.text = budget.variableExpenseBudget.toString();

    _nisaController.text = budget.nisaTarget.toString();
    _freeSpendingController.text = budget.freeSpendingTarget.toString();
    _savingsController.text = budget.savingsTarget.toString();
  }

  Future<void> _reload() async {
    final future = _fetchBudget();

    setState(() {
      _future = future;
    });

    await future;
  }

  Future<void> _selectMonth() async {
    if (_isSaving) {
      return;
    }

    final selectedMonth = await showMonthPickerDialog(
      context: context,
      initialMonth: _selectedMonth,
      firstMonth: DateTime(2020, 1),
      lastMonth: DateTime(DateTime.now().year + 1, 12),
    );

    if (selectedMonth == null || !mounted) {
      return;
    }

    if (selectedMonth.year == _selectedMonth.year &&
        selectedMonth.month == _selectedMonth.month) {
      return;
    }

    FocusScope.of(context).unfocus();

    setState(() {
      _selectedMonth = DateTime(selectedMonth.year, selectedMonth.month);

      _future = _fetchBudget();
    });
  }

  Future<void> _save() async {
    if (_isSaving) {
      return;
    }

    FocusScope.of(context).unfocus();

    final isValid = _formKey.currentState?.validate() ?? false;

    if (!isValid) {
      return;
    }

    final salaryPlanned = _parseAmount(_salaryController.text);

    final sideIncomePlanned = _parseAmount(_sideIncomeController.text);

    final fixedExpenseBudget = _parseAmount(_fixedExpenseController.text);

    final variableExpenseBudget = _parseAmount(_variableExpenseController.text);

    final nisaTarget = _parseAmount(_nisaController.text);
    final freeSpendingTarget = _parseAmount(_freeSpendingController.text);
    final savingsTarget = _parseAmount(_savingsController.text);

    setState(() {
      _isSaving = true;
    });

    try {
      final updated = await _service.updateBudget(
        yearMonth: _toYearMonth(_selectedMonth),
        salaryPlanned: salaryPlanned,
        sideIncomePlanned: sideIncomePlanned,
        nisaTarget: nisaTarget,
        fixedExpenseBudget: fixedExpenseBudget,
        variableExpenseBudget: variableExpenseBudget,
        freeSpendingTarget: freeSpendingTarget,
        savingsTarget: savingsTarget,
      );

      if (!mounted) {
        return;
      }

      _applyBudget(updated);

      setState(() {
        _budget = updated;
        _future = Future.value(updated);
      });

      AppRefreshController.refreshAll();

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('予算・目標設定を保存しました')));
    } catch (error) {
      if (!mounted) {
        return;
      }

      final message = error.toString().replaceFirst('Exception: ', '');

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _salaryController.dispose();
    _sideIncomeController.dispose();

    _fixedExpenseController.dispose();
    _variableExpenseController.dispose();

    _nisaController.dispose();
    _freeSpendingController.dispose();
    _savingsController.dispose();

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('予算・目標設定')),
      body: FutureBuilder<BudgetModel>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _buildError(snapshot.error);
          }

          final budget = snapshot.data ?? _budget;

          if (budget == null) {
            return const Center(child: Text('予算データがありません'));
          }

          return AbsorbPointer(
            absorbing: _isSaving,
            child: Form(
              key: _formKey,
              child: RefreshIndicator(
                onRefresh: _reload,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
                  children: [
                    Center(
                      child: TextButton(
                        onPressed: _selectMonth,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _formatYearMonth(_selectedMonth),
                              style: Theme.of(context).textTheme.titleLarge
                                  ?.copyWith(fontWeight: FontWeight.bold),
                            ),
                            const SizedBox(width: 6),
                            const Icon(Icons.calendar_month_outlined, size: 20),
                          ],
                        ),
                      ),
                    ),

                    if (budget.inherited) ...[
                      const SizedBox(height: 8),

                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Row(
                            children: [
                              const Icon(Icons.history_rounded),

                              const SizedBox(width: 10),

                              Expanded(
                                child: Text(
                                  '${_formatYearMonthString(budget.inheritedFrom)}'
                                  'の設定を引き継いでいます',
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],

                    const SizedBox(height: 20),

                    _BudgetDecisionCard(budget: budget),

                    const SizedBox(height: 16),

                    _IntegratedPlanCard(budget: budget),

                    const SizedBox(height: 28),

                    const _SectionTitle(
                      title: '収入予定',
                      icon: Icons.payments_outlined,
                    ),

                    const SizedBox(height: 12),

                    _AmountField(controller: _salaryController, label: '給与予定'),

                    const SizedBox(height: 12),

                    _AmountField(
                      controller: _sideIncomeController,
                      label: '副業予定',
                    ),

                    const SizedBox(height: 28),

                    const _SectionTitle(
                      title: '支出予算',
                      icon: Icons.shopping_bag_outlined,
                    ),

                    const SizedBox(height: 12),

                    _AmountField(
                      controller: _fixedExpenseController,
                      label: '固定費予算',
                    ),

                    const SizedBox(height: 12),

                    _AmountField(
                      controller: _variableExpenseController,
                      label: '変動費予算',
                    ),

                    const SizedBox(height: 28),

                    const _SectionTitle(
                      title: '資産形成目標',
                      icon: Icons.savings_outlined,
                    ),

                    const SizedBox(height: 12),

                    _AmountField(controller: _nisaController, label: 'NISA積立'),

                    const SizedBox(height: 12),

                    _AmountField(
                      controller: _savingsController,
                      label: '追加貯金目標',
                    ),

                    const SizedBox(height: 12),

                    _AmountField(
                      controller: _freeSpendingController,
                      label: '自由費上限',
                    ),

                    const SizedBox(height: 6),
                    Text(
                      '追加貯金目標は目的資金・生活防衛資金とは別枠。自由費上限を0円にすると、残った余力を自由費の目安として表示します。',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: FilledButton.icon(
          onPressed: _isSaving ? null : _save,
          icon: _isSaving
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.save_outlined),
          label: Text(_isSaving ? '保存中...' : '保存する'),
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
        ),
      ),
    );
  }

  Widget _buildError(Object? error) {
    final message = error.toString().replaceFirst('Exception: ', '');

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48),

            const SizedBox(height: 12),

            const Text(
              '予算設定を取得できませんでした',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 8),

            Text(message, textAlign: TextAlign.center),

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

  static int _parseAmount(String text) {
    return int.tryParse(text.replaceAll(',', '')) ?? 0;
  }

  static String _toYearMonth(DateTime date) {
    return '${date.year}-'
        '${date.month.toString().padLeft(2, '0')}';
  }

  static String _formatYearMonth(DateTime date) {
    return '${date.year}年${date.month}月';
  }

  static String _formatYearMonthString(String value) {
    final parts = value.split('-');

    if (parts.length != 2) {
      return value;
    }

    return '${parts[0]}年'
        '${int.tryParse(parts[1]) ?? 0}月';
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, required this.icon});

  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon),

        const SizedBox(width: 8),

        Text(
          title,
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
        ),
      ],
    );
  }
}

class _AmountField extends StatelessWidget {
  const _AmountField({required this.controller, required this.label});

  final TextEditingController controller;
  final String label;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: TextInputType.number,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      decoration: InputDecoration(
        labelText: label,
        prefixText: '￥',
        border: const OutlineInputBorder(),
      ),
      validator: (value) {
        if (value == null || value.trim().isEmpty) {
          return '金額を入力してください';
        }

        final amount = int.tryParse(value);

        if (amount == null || amount < 0) {
          return '0円以上で入力してください';
        }

        return null;
      },
    );
  }
}


class _BudgetDecisionCard extends StatelessWidget {
  const _BudgetDecisionCard({required this.budget});

  final BudgetModel budget;

  @override
  Widget build(BuildContext context) {
    final hasBudget = budget.livingBudget > 0;
    final usage = budget.budgetUsageRate.clamp(0.0, 1.0);
    final projectedOver = budget.projectedExpense > budget.livingBudget && hasBudget;
    final freeCashNegative = budget.plannedFreeCash < 0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.speed_outlined),
                const SizedBox(width: 8),
                Text(
                  '今月の計画とペース',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _BudgetSummaryRow(label: '予定収入', value: _yen(budget.totalIncomePlanned)),
            _BudgetSummaryRow(label: '生活費予算', value: _yen(budget.livingBudget)),
            _BudgetSummaryRow(label: 'NISA積立', value: _yen(budget.nisaTarget)),
            _BudgetSummaryRow(
              label: '計画上の残り',
              value: _signedYen(budget.plannedFreeCash),
              emphasize: freeCashNegative,
            ),
            const Divider(height: 28),
            _BudgetSummaryRow(label: '現在の支出', value: _yen(budget.actualExpense)),
            _BudgetSummaryRow(
              label: '予算残り',
              value: _signedYen(budget.budgetRemaining),
              emphasize: budget.budgetRemaining < 0,
            ),
            _BudgetSummaryRow(
              label: '月末見込み',
              value: _yen(budget.projectedExpense),
              emphasize: projectedOver,
            ),
            if (hasBudget) ...[
              const SizedBox(height: 10),
              LinearProgressIndicator(value: usage),
              const SizedBox(height: 6),
              Text(
                '予算消化 ${(budget.budgetUsageRate * 100).toStringAsFixed(1)}%'
                '${budget.elapsedDays > 0 && budget.daysInMonth > 0 ? ' ・ ${budget.elapsedDays}/${budget.daysInMonth}日経過' : ''}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            if (projectedOver) ...[
              const SizedBox(height: 12),
              Text(
                'このペースでは月末に生活費予算を超える見込みです。',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.error,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  static String _yen(int value) => '￥${_comma(value)}';

  static String _signedYen(int value) {
    if (value < 0) return '-￥${_comma(value.abs())}';
    return '￥${_comma(value)}';
  }

  static String _comma(int value) {
    final text = value.toString();
    return text.replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );
  }
}

class _BudgetSummaryRow extends StatelessWidget {
  const _BudgetSummaryRow({
    required this.label,
    required this.value,
    this.emphasize = false,
  });

  final String label;
  final String value;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label)),
          Text(
            value,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: emphasize ? Theme.of(context).colorScheme.error : null,
            ),
          ),
        ],
      ),
    );
  }
}


class _IntegratedPlanCard extends StatelessWidget {
  const _IntegratedPlanCard({required this.budget});

  final BudgetModel budget;

  @override
  Widget build(BuildContext context) {
    final hasCurrentAllocation =
        budget.emergencyTargetAmount > 0 ||
        budget.goalFundingDetails.isNotEmpty ||
        budget.emergencyStage.isNotEmpty;
    final shortage = budget.planShortage > 0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.account_balance_wallet_outlined),
                const SizedBox(width: 8),
                Text(
                  '家計計画の全体像',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              '生活費・目的資金・生活防衛資金・投資を確保したあとに、自由に使える目安を確認します。',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            _BudgetSummaryRow(label: '予定収入', value: _yen(budget.totalIncomePlanned)),
            _BudgetSummaryRow(label: '生活費予算', value: '-${_yen(budget.livingBudget)}'),
            if (budget.goalRequired > 0)
              _BudgetSummaryRow(
                label: '目的資金（今月必要）',
                value: '-${_yen(budget.goalRequired)}',
                emphasize: budget.goalShortage > 0,
              ),
            if (budget.emergencyCashAllocation > 0)
              _BudgetSummaryRow(
                label: '生活防衛資金へ',
                value: '-${_yen(budget.emergencyCashAllocation)}',
              ),
            _BudgetSummaryRow(label: 'NISA予定', value: '-${_yen(budget.nisaTarget)}'),
            if (budget.savingsTarget > 0)
              _BudgetSummaryRow(
                label: '追加貯金目標',
                value: '-${_yen(budget.savingsTarget)}',
              ),
            if (budget.freeSpendingTarget > 0)
              _BudgetSummaryRow(
                label: '自由費上限',
                value: '-${_yen(budget.freeSpendingTarget)}',
              ),
            const Divider(height: 28),
            _BudgetSummaryRow(
              label: budget.freeSpendingTarget > 0 ? '自由費として使える額' : '自由費の目安',
              value: _yen(budget.discretionaryBudget),
              emphasize: shortage,
            ),
            if (budget.unassignedCash > 0 && !shortage) ...[
              const SizedBox(height: 6),
              Text(
                '未割当 ${_yen(budget.unassignedCash)} は、追加貯金・自由費・投資のどこへ回すか後から決められます。',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            if (shortage) ...[
              const SizedBox(height: 10),
              Text(
                '現在の計画は予定収入を${_yen(budget.planShortage)}上回っています。生活費・積立・目的資金のどこを調整するか確認してください。',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.error,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            if (hasCurrentAllocation) ...[
              const Divider(height: 28),
              Text(
                '生活防衛資金',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              _BudgetSummaryRow(
                label: '確保済み',
                value: _yen(budget.emergencyProtectedCash),
              ),
              _BudgetSummaryRow(
                label: '目標',
                value: _yen(budget.emergencyTargetAmount),
              ),
              if (budget.emergencyTargetMonths > 0)
                Text(
                  '${budget.emergencyCoveredMonths.toStringAsFixed(1)}か月分 / 目標${budget.emergencyTargetMonths}か月分',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              if (budget.emergencyShortage > 0) ...[
                const SizedBox(height: 4),
                Text(
                  '目標まであと ${_yen(budget.emergencyShortage)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ],
            if (budget.goalFundingDetails.isNotEmpty) ...[
              const Divider(height: 28),
              Text(
                '目的資金',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              for (final goal in budget.goalFundingDetails.take(3))
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          goal['goalName']?.toString() ?? '目的資金',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        '今月 ${_yen(_toInt(goal['requiredThisMonth']))}',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
            ],
            if (!hasCurrentAllocation) ...[
              const SizedBox(height: 12),
              Text(
                '生活防衛資金と目的資金の現在残高を使う配分は、現在月を開いたときに表示します。',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }

  static int _toInt(dynamic value) => (value as num?)?.toInt() ?? 0;

  static String _yen(int value) => '￥${_comma(value)}';

  static String _comma(int value) {
    return value.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );
  }
}
