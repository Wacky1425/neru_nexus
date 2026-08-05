import 'package:flutter/material.dart';

import 'model/analytics_model.dart';
import 'service/analytics_service.dart';
import 'widgets/expense_pie_chart.dart';
import 'widgets/monthly_expense_chart.dart';
import '../../core/refresh/app_refresh_controller.dart';

class AnalyticsPage extends StatefulWidget {
  const AnalyticsPage({super.key});

  @override
  State<AnalyticsPage> createState() => _AnalyticsPageState();
}

class _AnalyticsPageState extends State<AnalyticsPage> {
  late DateTime _selectedMonth;
  late Future<AnalyticsModel> _analyticsFuture;

  @override
  void initState() {
    super.initState();

    final now = DateTime.now();

    _selectedMonth = DateTime(now.year, now.month);

    _analyticsFuture = _fetchSelectedMonth();

    AppRefreshController.dataVersion.addListener(_handleAppRefresh);
  }

  void _handleAppRefresh() {
    if (!mounted) {
      return;
    }

    setState(() {
      _analyticsFuture = _fetchSelectedMonth();
    });
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

  Future<void> _reload() async {
    setState(() {
      _analyticsFuture = _fetchSelectedMonth();
    });

    await _analyticsFuture;
  }

  @override
  void dispose() {
    AppRefreshController.dataVersion.removeListener(_handleAppRefresh);

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: FutureBuilder<AnalyticsModel>(
        future: _analyticsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
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

                    Text(
                      _formatYearMonth(_selectedMonth),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
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

                _SummaryCard(
                  title: '今月の支出',
                  amount: analytics.totalExpense,
                  icon: Icons.payments_outlined,
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
