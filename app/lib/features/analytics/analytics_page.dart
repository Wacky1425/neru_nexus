import 'package:flutter/material.dart';

import 'model/analytics_model.dart';
import 'service/analytics_service.dart';
import 'widgets/expense_pie_chart.dart';
import 'widgets/monthly_expense_chart.dart';
import '../../core/refresh/app_refresh_controller.dart';
import '../../core/widgets/month_picker_dialog.dart';

class AnalyticsPage extends StatefulWidget {
  const AnalyticsPage({super.key});

  @override
  State<AnalyticsPage> createState() => _AnalyticsPageState();
}

class _AnalyticsPageState extends State<AnalyticsPage> {
  late DateTime _selectedMonth;
  late Future<AnalyticsModel> _analyticsFuture;
  Future<void>? _reloadFuture;
  bool _needsRefresh = false;

  @override
  void initState() {
    super.initState();

    final now = DateTime.now();

    _selectedMonth = DateTime(now.year, now.month);

    _analyticsFuture = _fetchSelectedMonth();

    AppRefreshController.dataVersion.addListener(_handleAppRefresh);
    AppRefreshController.activeTabIndex.addListener(_handleActiveTabChanged);
  }

  void _handleAppRefresh() {
    if (!mounted) {
      return;
    }

    if (AppRefreshController.activeTabIndex.value != 3) {
      _needsRefresh = true;
      return;
    }

    _reload().catchError((Object _) {});
  }

  void _handleActiveTabChanged() {
    if (!mounted || AppRefreshController.activeTabIndex.value != 3) {
      return;
    }

    if (_needsRefresh) {
      _needsRefresh = false;
      _reload().catchError((Object _) {});
    }
  }

  Future<AnalyticsModel> _fetchSelectedMonth() {
    return const AnalyticsService().fetchAnalytics(
      yearMonth: _toYearMonth(_selectedMonth),
    );
  }

  void _changeMonth(int difference) {
    setState(() {
      _selectedMonth = DateTime(
        _selectedMonth.year,
        _selectedMonth.month + difference,
      );

      _analyticsFuture = _fetchSelectedMonth();
    });
  }

  Future<void> _selectMonth() async {
    final selectedMonth = await showMonthPickerDialog(
      context: context,
      initialMonth: _selectedMonth,
      firstMonth: DateTime(2020, 1),
      lastMonth: DateTime.now(),
    );

    if (selectedMonth == null || !mounted) {
      return;
    }

    if (selectedMonth.year == _selectedMonth.year &&
        selectedMonth.month == _selectedMonth.month) {
      return;
    }

    setState(() {
      _selectedMonth = DateTime(selectedMonth.year, selectedMonth.month);

      _analyticsFuture = _fetchSelectedMonth();
    });
  }

  Future<void> _reload() {
    final running = _reloadFuture;

    if (running != null) {
      return running;
    }

    final future = _performReload();
    _reloadFuture = future;

    void clearReloadFuture() {
      if (identical(_reloadFuture, future)) {
        _reloadFuture = null;
      }
    }

    future.then<void>(
      (_) => clearReloadFuture(),
      onError: (Object _, StackTrace __) {
        clearReloadFuture();
      },
    );

    return future;
  }

  Future<void> _performReload() async {
    final future = _fetchSelectedMonth();

    setState(() {
      _analyticsFuture = future;
    });

    await future;
  }

  @override
  void dispose() {
    AppRefreshController.dataVersion.removeListener(_handleAppRefresh);
    AppRefreshController.activeTabIndex.removeListener(_handleActiveTabChanged);

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: FutureBuilder<AnalyticsModel>(
        future: _analyticsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting &&
              !snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _buildError(context, snapshot.error);
          }

          final analytics = snapshot.data;

          if (analytics == null) {
            return _buildError(context, 'Analyticsデータがありません');
          }

          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                if (snapshot.connectionState == ConnectionState.waiting) ...[
                  const LinearProgressIndicator(minHeight: 2),
                  const SizedBox(height: 12),
                ],

                Text(
                  'Analytics',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),

                const SizedBox(height: 4),

                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton(
                      onPressed: () => _changeMonth(-1),
                      icon: const Icon(Icons.chevron_left),
                    ),

                    TextButton(
                      onPressed: _selectMonth,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            _formatYearMonth(_selectedMonth),
                            style: Theme.of(context).textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(width: 4),
                          const Icon(Icons.calendar_month_outlined, size: 18),
                        ],
                      ),
                    ),

                    IconButton(
                      onPressed: _canMoveToNextMonth()
                          ? () => _changeMonth(1)
                          : null,
                      icon: const Icon(Icons.chevron_right),
                    ),
                  ],
                ),

                const SizedBox(height: 20),

                Row(
                  children: [
                    Expanded(
                      child: _SummaryCard(
                        title: '収入',
                        amount: analytics.totalIncome,
                        icon: Icons.arrow_downward_rounded,
                      ),
                    ),

                    const SizedBox(width: 12),

                    Expanded(
                      child: _SummaryCard(
                        title: '支出',
                        amount: analytics.totalExpense,
                        icon: Icons.arrow_upward_rounded,
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 12),

                _SummaryCard(
                  title: '収支',
                  amount: analytics.balance,
                  icon: Icons.account_balance_wallet_outlined,
                ),

                const SizedBox(height: 12),

                Column(
                  children: [
                    _PreviousMonthComparisonCard(
                      title: '収入の前月比',
                      currentAmount: analytics.totalIncome,
                      previousAmount: analytics.previousTotalIncome,
                    ),

                    const SizedBox(height: 8),

                    _PreviousMonthComparisonCard(
                      title: '支出の前月比',
                      currentAmount: analytics.totalExpense,
                      previousAmount: analytics.previousTotalExpense,
                    ),

                    const SizedBox(height: 8),

                    _PreviousMonthComparisonCard(
                      title: '収支の前月比',
                      currentAmount: analytics.balance,
                      previousAmount: analytics.previousBalance,
                    ),
                  ],
                ),

                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _SummaryCard(
                        title: '固定費',
                        amount: analytics.fixedExpense,
                        icon: Icons.lock_outline,
                      ),
                    ),

                    const SizedBox(width: 12),

                    Expanded(
                      child: _SummaryCard(
                        title: '変動費',
                        amount: analytics.variableExpense,
                        icon: Icons.shopping_bag_outlined,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                ExpensePieChart(categories: analytics.categories),

                const SizedBox(height: 24),

                MonthlyExpenseChart(monthlyTrend: analytics.monthlyTrend),

                const SizedBox(height: 24),

                Text('カテゴリ別支出', style: Theme.of(context).textTheme.titleLarge),

                const SizedBox(height: 12),

                if (analytics.categories.isEmpty)
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(20),
                      child: Text('対象月の支出はありません'),
                    ),
                  )
                else
                  ...analytics.categories.map((category) {
                    final name = category['category']?.toString() ?? '未分類';

                    final amount = _toInt(category['amount']);

                    return Card(
                      child: ListTile(
                        leading: const CircleAvatar(
                          child: Icon(Icons.category_outlined),
                        ),
                        title: Text(name),
                        trailing: Text(
                          _formatYen(amount),
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),
                      ),
                    );
                  }),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildError(BuildContext context, Object? error) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48),

            const SizedBox(height: 12),

            Text(
              'Analyticsデータを取得できませんでした',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),

            const SizedBox(height: 8),

            Text(error.toString(), textAlign: TextAlign.center),

            const SizedBox(height: 16),

            FilledButton(
              onPressed: () {
                setState(() {
                  _analyticsFuture = _fetchSelectedMonth();
                });
              },
              child: const Text('再読み込み'),
            ),
          ],
        ),
      ),
    );
  }

  static int _toInt(dynamic value) {
    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  static String _formatYen(int amount) {
    final formatted = amount.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );

    return '￥$formatted';
  }

  static String _toYearMonth(DateTime date) {
    final month = date.month.toString().padLeft(2, '0');

    return '${date.year}-$month';
  }

  static String _formatYearMonth(DateTime date) {
    return '${date.year}年${date.month}月';
  }

  bool _canMoveToNextMonth() {
    final now = DateTime.now();

    final currentMonth = DateTime(now.year, now.month);

    return _selectedMonth.isBefore(currentMonth);
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.title,
    required this.amount,
    required this.icon,
  });

  final String title;
  final int amount;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon),

            const SizedBox(height: 12),

            Text(title, style: Theme.of(context).textTheme.bodyMedium),

            const SizedBox(height: 4),

            Text(
              _formatYen(amount),
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }

  static String _formatYen(int amount) {
    final formatted = amount.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );

    return '￥$formatted';
  }
}

class _PreviousMonthComparisonCard extends StatelessWidget {
  const _PreviousMonthComparisonCard({
    required this.title,
    required this.currentAmount,
    required this.previousAmount,
  });

  final String title;
  final int currentAmount;
  final int previousAmount;

  @override
  Widget build(BuildContext context) {
    final difference = currentAmount - previousAmount;

    final percentage = previousAmount == 0
        ? null
        : (difference / previousAmount * 100);

    final differenceText = difference == 0
        ? '前月と同じ'
        : '${difference > 0 ? '+' : '-'}'
              '${_formatYen(difference.abs())}';

    final percentageText = percentage == null
        ? ''
        : '（${percentage > 0 ? '+' : ''}${percentage.toStringAsFixed(1)}%）';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Icon(Icons.compare_arrows_rounded),

            const SizedBox(width: 12),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.bodyMedium),

                  const SizedBox(height: 4),

                  Text(
                    '$differenceText$percentageText',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _formatYen(int amount) {
    final formatted = amount.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );

    return '￥$formatted';
  }
}
