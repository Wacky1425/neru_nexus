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

  final _savingController = TextEditingController();
  final _nisaController = TextEditingController();
  final _dreamController = TextEditingController();

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

    _savingController.text = budget.savingTarget.toString();

    _nisaController.text = budget.nisaTarget.toString();

    _dreamController.text = budget.dreamTarget.toString();
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

    final savingTarget = _parseAmount(_savingController.text);

    final nisaTarget = _parseAmount(_nisaController.text);

    final dreamTarget = _parseAmount(_dreamController.text);

    setState(() {
      _isSaving = true;
    });

    try {
      final updated = await _service.updateBudget(
        yearMonth: _toYearMonth(_selectedMonth),
        salaryPlanned: salaryPlanned,
        sideIncomePlanned: sideIncomePlanned,
        savingTarget: savingTarget,
        nisaTarget: nisaTarget,
        fixedExpenseBudget: fixedExpenseBudget,
        variableExpenseBudget: variableExpenseBudget,
        dreamTarget: dreamTarget,
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

    _savingController.dispose();
    _nisaController.dispose();
    _dreamController.dispose();

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

                    const SizedBox(height: 24),

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

                    _AmountField(
                      controller: _savingController,
                      label: '現金貯蓄目標',
                    ),

                    const SizedBox(height: 12),

                    _AmountField(controller: _nisaController, label: 'NISA積立'),

                    const SizedBox(height: 12),

                    _AmountField(controller: _dreamController, label: '夢積立'),

                    const SizedBox(height: 16),

                    ValueListenableBuilder<TextEditingValue>(
                      valueListenable: _savingController,
                      builder: (context, savingValue, _) {
                        return ValueListenableBuilder<TextEditingValue>(
                          valueListenable: _nisaController,
                          builder: (context, nisaValue, _) {
                            return ValueListenableBuilder<TextEditingValue>(
                              valueListenable: _dreamController,
                              builder: (context, dreamValue, _) {
                                final total =
                                    _parseAmount(savingValue.text) +
                                    _parseAmount(nisaValue.text) +
                                    _parseAmount(dreamValue.text);

                                return Card(
                                  child: ListTile(
                                    title: const Text(
                                      '資産形成目標 合計',
                                      style: TextStyle(
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    trailing: Text(
                                      _formatYen(total),
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleMedium
                                          ?.copyWith(
                                            fontWeight: FontWeight.bold,
                                          ),
                                    ),
                                  ),
                                );
                              },
                            );
                          },
                        );
                      },
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

  static String _formatYen(int amount) {
    final formatted = amount.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );

    return '￥$formatted';
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
