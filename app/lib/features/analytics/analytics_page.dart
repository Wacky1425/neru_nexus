import 'package:flutter/material.dart';

import '../../core/theme/app_layout.dart';

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

    if (AppRefreshController.activeTabIndex.value != 4) {
      _needsRefresh = true;
      return;
    }

    _reload().catchError((Object _) {});
  }

  void _handleActiveTabChanged() {
    if (!mounted || AppRefreshController.activeTabIndex.value != 4) {
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
      onError: (Object error, StackTrace stackTrace) {
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
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
              children: [
                if (snapshot.connectionState == ConnectionState.waiting) ...[
                  const LinearProgressIndicator(minHeight: 2),
                  const SizedBox(height: 12),
                ],

                const AppPageTitle('分析'),

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

                const SizedBox(height: 20),

                _DecisionOverviewCard(analytics: analytics),

                const SizedBox(height: 12),

                _CategoryChangeCard(
                  changes: analytics.categoryChanges,
                  comparisonDay: analytics.comparisonMode == 'same_day'
                      ? analytics.comparisonDay
                      : null,
                ),

                const SizedBox(height: 20),

                Column(
                  children: [
                    _PreviousMonthComparisonCard(
                      title: analytics.comparisonMode == 'same_day'
                          ? '収入の前月同日比'
                          : '収入の前月比',
                      currentAmount: analytics.totalIncome,
                      previousAmount: analytics.previousTotalIncome,
                      comparisonNote: _comparisonNote(analytics),
                    ),

                    const SizedBox(height: 8),

                    _PreviousMonthComparisonCard(
                      title: analytics.comparisonMode == 'same_day'
                          ? '支出の前月同日比'
                          : '支出の前月比',
                      currentAmount: analytics.totalExpense,
                      previousAmount: analytics.previousTotalExpense,
                      comparisonNote: _comparisonNote(analytics),
                    ),

                    const SizedBox(height: 8),

                    _PreviousMonthComparisonCard(
                      title: analytics.comparisonMode == 'same_day'
                          ? '収支の前月同日比'
                          : '収支の前月比',
                      currentAmount: analytics.balance,
                      previousAmount: analytics.previousBalance,
                      comparisonNote: _comparisonNote(analytics),
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
                        subtitle: Text(
                          _categorySubtitle(
                            category,
                            analytics.totalExpense,
                            sameDayComparison: analytics.comparisonMode == 'same_day',
                          ),
                        ),
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

  static String _categorySubtitle(
    Map<String, dynamic> category,
    int totalExpense, {
    bool sameDayComparison = false,
  }) {
    final amount = _toInt(category['amount']);
    final previous = _toInt(category['previousAmount']);
    final difference = amount - previous;
    final share = totalExpense > 0 ? amount / totalExpense * 100 : 0.0;

    if (previous == 0 && amount > 0) {
      return '構成比 ${share.toStringAsFixed(1)}% ・ ${sameDayComparison ? '前月同日まで' : '前月'}は支出なし';
    }

    final sign = difference > 0 ? '+' : difference < 0 ? '-' : '±';
    return '構成比 ${share.toStringAsFixed(1)}% ・ ${sameDayComparison ? '前月同日比' : '前月比'} $sign${_formatYen(difference.abs())}';
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

  static String? _comparisonNote(AnalyticsModel analytics) {
    if (analytics.comparisonMode != 'same_day' || analytics.comparisonDay == null) {
      return null;
    }
    final previous = analytics.previousYearMonth.split('-');
    final month = previous.length >= 2 ? int.tryParse(previous[1]) : null;
    return month == null
        ? '同じ日数までの実績で比較'
        : '${analytics.comparisonDay}日まで vs $month月${analytics.comparisonDay}日まで';
  }

  bool _canMoveToNextMonth() {
    final now = DateTime.now();

    final currentMonth = DateTime(now.year, now.month);

    return _selectedMonth.isBefore(currentMonth);
  }
}

class _DecisionOverviewCard extends StatelessWidget {
  const _DecisionOverviewCard({required this.analytics});

  final AnalyticsModel analytics;

  @override
  Widget build(BuildContext context) {
    final hasBudget = analytics.expenseBudget > 0;
    final usagePercent = analytics.budgetUsageRate * 100;
    final comparisonExpense = analytics.elapsedDays < analytics.daysInMonth
        ? analytics.projectedExpense
        : analytics.totalExpense;
    final averageDifference =
        comparisonExpense - analytics.averageExpense3Months;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '今月の判断材料',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            _InsightRow(
              icon: Icons.speed_outlined,
              title: '月末の支出見込み',
              value: _formatYen(analytics.projectedExpense),
              detail: analytics.elapsedDays < analytics.daysInMonth
                  ? '${analytics.elapsedDays}/${analytics.daysInMonth}日経過時点から単純推計'
                  : '確定した月間支出',
            ),
            const Divider(height: 24),
            _InsightRow(
              icon: Icons.history_outlined,
              title: analytics.elapsedDays < analytics.daysInMonth
                  ? '月末見込み vs 過去3か月平均'
                  : '過去3か月平均との比較',
              value: analytics.averageExpense3Months <= 0
                  ? '比較データなし'
                  : '${averageDifference > 0 ? '+' : averageDifference < 0 ? '-' : '±'}${_formatYen(averageDifference.abs())}',
              detail: analytics.averageExpense3Months <= 0
                  ? '比較できる過去月がありません'
                  : '過去3か月平均 ${_formatYen(analytics.averageExpense3Months)}'
                      '${analytics.elapsedDays < analytics.daysInMonth ? ' と月末見込みを比較' : ''}',
            ),
            const Divider(height: 24),
            _InsightRow(
              icon: Icons.savings_outlined,
              title: '生活費予算',
              value: hasBudget
                  ? '${usagePercent.toStringAsFixed(1)}% 使用'
                  : '予算未設定',
              detail: hasBudget
                  ? '${analytics.budgetRemaining >= 0 ? '残り' : '超過'} ${_formatYen(analytics.budgetRemaining.abs())} / ${_formatYen(analytics.expenseBudget)}'
                  : '予算設定から固定費・変動費予算を登録できます',
            ),
            if (hasBudget && analytics.budgetInherited) ...[
              const SizedBox(height: 8),
              Text(
                '${analytics.budgetInheritedFrom} の予算を引き継いでいます',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
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

class _CategoryChangeCard extends StatelessWidget {
  const _CategoryChangeCard({required this.changes, this.comparisonDay});

  final List<Map<String, dynamic>> changes;
  final int? comparisonDay;

  @override
  Widget build(BuildContext context) {
    if (changes.isEmpty) {
      return const SizedBox.shrink();
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '支出が変わったカテゴリ',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            Text(
              comparisonDay == null
                  ? '前月との差が大きい順'
                  : '$comparisonDay日までの前月同日との差が大きい順',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            ...changes.take(5).map((item) {
              final name = item['category']?.toString() ?? '未分類';
              final difference = (item['difference'] as num?)?.toInt() ?? 0;
              final current = (item['amount'] as num?)?.toInt() ?? 0;
              final increased = difference > 0;

              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    Icon(
                      increased
                          ? Icons.trending_up_rounded
                          : Icons.trending_down_rounded,
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(child: Text(name)),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '${increased ? '+' : '-'}${_formatYen(difference.abs())}',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        Text(
                          '今月 ${_formatYen(current)}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }),
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

class _InsightRow extends StatelessWidget {
  const _InsightRow({
    required this.icon,
    required this.title,
    required this.value,
    required this.detail,
  });

  final IconData icon;
  final String title;
  final String value;
  final String detail;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: 3),
              Text(
                value,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 2),
              Text(detail, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ],
    );
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
    this.comparisonNote,
  });

  final String title;
  final int currentAmount;
  final int previousAmount;
  final String? comparisonNote;

  @override
  Widget build(BuildContext context) {
    final difference = currentAmount - previousAmount;

    final percentage = previousAmount == 0
        ? null
        : (difference / previousAmount * 100);

    final differenceText = difference == 0
        ? '差なし'
        : '${difference > 0 ? '+' : '-'}'
              '${_formatYen(difference.abs())}';

    final percentageText = percentage == null
        ? ''
        : '（${percentage > 0 ? '+' : ''}${percentage.toStringAsFixed(1)}%）';

    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            const Icon(Icons.compare_arrows_rounded, size: 20),

            const SizedBox(width: 10),

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
                  if (comparisonNote != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      comparisonNote!,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
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
