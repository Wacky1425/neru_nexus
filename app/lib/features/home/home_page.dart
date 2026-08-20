import 'package:flutter/material.dart';

import '../../core/refresh/app_refresh_controller.dart';
import 'model/home_model.dart';
import 'service/home_service.dart';
import 'widgets/health_card.dart';
import 'widgets/money_card.dart';
import 'widgets/recent_transaction_card.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final HomeService _homeService = const HomeService();

  late Future<HomeModel> _homeFuture;

  @override
  void initState() {
    super.initState();

    _homeFuture = _homeService.fetchHome();

    AppRefreshController.dataVersion.addListener(_handleAppRefresh);
  }

  @override
  void dispose() {
    AppRefreshController.dataVersion.removeListener(_handleAppRefresh);

    super.dispose();
  }

  void _handleAppRefresh() {
    if (!mounted) {
      return;
    }

    setState(() {
      _homeFuture = _homeService.fetchHome();
    });
  }

  Future<void> _reload() async {
    final future = _homeService.fetchHome();

    setState(() {
      _homeFuture = future;
    });

    await future;
  }

  String _formatMoney(int value) {
    final text = value.abs().toString();

    final buffer = StringBuffer();

    for (int i = 0; i < text.length; i++) {
      final positionFromEnd = text.length - i;

      buffer.write(text[i]);

      if (positionFromEnd > 1 && positionFromEnd % 3 == 1) {
        buffer.write(',');
      }
    }

    return value < 0 ? '-¥$buffer' : '¥$buffer';
  }

  String _formatYearMonth(String yearMonth) {
    final parts = yearMonth.split('-');

    if (parts.length != 2) {
      return yearMonth;
    }

    final month = int.tryParse(parts[1]);

    if (month == null) {
      return yearMonth;
    }

    return '${parts[0]}年$month月';
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<HomeModel>(
      future: _homeFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        if (snapshot.hasError) {
          return _HomeErrorView(error: snapshot.error, onReload: _reload);
        }

        final home = snapshot.data;

        if (home == null) {
          return const Center(child: Text('Homeデータがありません'));
        }

        final healthTitle = home.moneyHealth['title']?.toString() ?? '状態不明';

        final healthMessage = home.moneyHealth['message']?.toString() ?? '';

        return RefreshIndicator(
          onRefresh: _reload,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 120),
            children: [
              _HomeHeader(yearMonth: _formatYearMonth(home.yearMonth)),

              const SizedBox(height: 24),

              // =========================
              // 今月使えるお金
              // =========================
              MoneyCard(
                title: '今月あと使える',
                amount: _formatMoney(home.availableMoney),
                subAmount:
                    '1日あたり '
                    '${_formatMoney(home.dailyBudget)}',
                icon: Icons.account_balance_wallet_outlined,
              ),

              const SizedBox(height: 12),

              MoneyCard(
                title: '今月の余剰見込み',
                amount: _formatMoney(home.monthlySurplus),
                subAmount: home.allocationMessage,
                icon: Icons.auto_graph_outlined,
              ),

              const SizedBox(height: 24),

              // =========================
              // おすすめ配分
              // =========================
              _AllocationCard(home: home, formatMoney: _formatMoney),

              const SizedBox(height: 24),

              // =========================
              // 目的資金
              // =========================
              if (home.goalFundingDetails.isNotEmpty) ...[
                _GoalFundingSection(
                  goals: home.goalFundingDetails,
                  formatMoney: _formatMoney,
                ),

                const SizedBox(height: 24),
              ],

              // =========================
              // 生活防衛資金
              // =========================
              _EmergencyFundCard(
                emergencyFund: home.emergencyFund,
                formatMoney: _formatMoney,
              ),

              const SizedBox(height: 24),

              // =========================
              // Money Health
              // =========================
              HealthCard(title: healthTitle, message: healthMessage),

              const SizedBox(height: 20),

              // =========================
              // 最近の取引
              // =========================
              RecentTransactionCard(transactions: home.recentTransactions),
            ],
          ),
        );
      },
    );
  }
}

class _HomeHeader extends StatelessWidget {
  const _HomeHeader({required this.yearMonth});

  final String yearMonth;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'おかえり、ネル',
          style: Theme.of(
            context,
          ).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
        ),

        const SizedBox(height: 4),

        Text(
          yearMonth,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

class _AllocationCard extends StatelessWidget {
  const _AllocationCard({required this.home, required this.formatMoney});

  final HomeModel home;

  final String Function(int) formatMoney;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.pie_chart_outline),

                const SizedBox(width: 10),

                Expanded(
                  child: Text(
                    '今月のおすすめ配分',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 20),

            _MoneyRow(label: '目的資金', value: formatMoney(home.goalAllocation)),

            const SizedBox(height: 12),

            _MoneyRow(
              label: '生活防衛資金',
              value: formatMoney(home.emergencyCashAllocation),
            ),

            const SizedBox(height: 12),

            _MoneyRow(label: '基本NISA', value: formatMoney(home.baseNisa)),

            const SizedBox(height: 12),

            _MoneyRow(label: '追加NISA', value: formatMoney(home.additionalNisa)),

            const Divider(height: 28),

            _MoneyRow(
              label: 'NISA合計',
              value: formatMoney(home.totalNisa),
              emphasize: true,
            ),

            if (home.goalShortage > 0) ...[
              const SizedBox(height: 16),

              _InfoBox(
                icon: Icons.warning_amber_outlined,
                text:
                    '目的資金の必要ペースに '
                    '${formatMoney(home.goalShortage)} '
                    '不足しています。',
              ),
            ],

            if (home.unallocatedCash > 0) ...[
              const SizedBox(height: 16),

              _InfoBox(
                icon: Icons.savings_outlined,
                text:
                    '${formatMoney(home.unallocatedCash)} '
                    'が未配分で残っています。',
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _GoalFundingSection extends StatelessWidget {
  const _GoalFundingSection({required this.goals, required this.formatMoney});

  final List<Map<String, dynamic>> goals;

  final String Function(int) formatMoney;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '目的資金',
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
        ),

        const SizedBox(height: 12),

        for (int i = 0; i < goals.length; i++) ...[
          _GoalFundingCard(goal: goals[i], formatMoney: formatMoney),

          if (i < goals.length - 1) const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class _GoalFundingCard extends StatelessWidget {
  const _GoalFundingCard({required this.goal, required this.formatMoney});

  final Map<String, dynamic> goal;

  final String Function(int) formatMoney;

  int _toInt(dynamic value) {
    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  @override
  Widget build(BuildContext context) {
    final name = goal['goalName']?.toString() ?? '目的資金';

    final remaining = _toInt(goal['remainingAmount']);

    final requiredThisMonth = _toInt(goal['requiredThisMonth']);

    final allocatedThisMonth = _toInt(goal['allocatedThisMonth']);

    final shortage = _toInt(goal['shortageThisMonth']);

    final remainingMonths = _toInt(goal['remainingMonths']);

    final onTrack = goal['onTrack'] == true;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    name,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),

                _StatusChip(label: onTrack ? '順調' : '不足', positive: onTrack),
              ],
            ),

            const SizedBox(height: 12),

            _MoneyRow(label: 'あと必要', value: formatMoney(remaining)),

            const SizedBox(height: 8),

            _MoneyRow(label: '今月必要', value: formatMoney(requiredThisMonth)),

            const SizedBox(height: 8),

            _MoneyRow(label: '今月確保', value: formatMoney(allocatedThisMonth)),

            if (shortage > 0) ...[
              const SizedBox(height: 8),

              _MoneyRow(
                label: '不足',
                value: formatMoney(shortage),
                emphasize: true,
              ),
            ],

            const SizedBox(height: 12),

            Text(
              remainingMonths <= 0 ? '予定時期に到達しています' : 'あと約$remainingMonthsか月',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmergencyFundCard extends StatelessWidget {
  const _EmergencyFundCard({
    required this.emergencyFund,
    required this.formatMoney,
  });

  final Map<String, dynamic> emergencyFund;

  final String Function(int) formatMoney;

  int _toInt(dynamic value) {
    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  double _toDouble(dynamic value) {
    if (value is num) {
      return value.toDouble();
    }

    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  @override
  Widget build(BuildContext context) {
    final monthlyEssential = _toInt(emergencyFund['monthlyEssentialCost']);

    final targetAmount = _toInt(emergencyFund['targetAmount']);

    final shortage = _toInt(emergencyFund['shortage']);

    final coveredMonths = _toDouble(emergencyFund['coveredMonths']);

    final targetMonths = _toInt(emergencyFund['targetMonths']);

    final progress = targetMonths <= 0
        ? 0.0
        : (coveredMonths / targetMonths).clamp(0.0, 1.0);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.shield_outlined),

                const SizedBox(width: 10),

                Expanded(
                  child: Text(
                    '生活防衛資金',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),

                Text(
                  '${coveredMonths.toStringAsFixed(1)}'
                  ' / $targetMonthsか月',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ],
            ),

            const SizedBox(height: 16),

            LinearProgressIndicator(value: progress),

            const SizedBox(height: 16),

            _MoneyRow(
              label: '最低生活費',
              value: '${formatMoney(monthlyEssential)} / 月',
            ),

            const SizedBox(height: 8),

            _MoneyRow(label: '目標額', value: formatMoney(targetAmount)),

            const SizedBox(height: 8),

            _MoneyRow(label: 'あと必要', value: formatMoney(shortage)),
          ],
        ),
      ),
    );
  }
}

class _MoneyRow extends StatelessWidget {
  const _MoneyRow({
    required this.label,
    required this.value,
    this.emphasize = false,
  });

  final String label;
  final String value;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(label)),

        const SizedBox(width: 12),

        Text(
          value,
          style: TextStyle(
            fontWeight: emphasize ? FontWeight.bold : FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.positive});

  final String label;
  final bool positive;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: positive
            ? colorScheme.primaryContainer
            : colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
          fontWeight: FontWeight.bold,
          color: positive
              ? colorScheme.onPrimaryContainer
              : colorScheme.onErrorContainer,
        ),
      ),
    );
  }
}

class _InfoBox extends StatelessWidget {
  const _InfoBox({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20),

          const SizedBox(width: 10),

          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}

class _HomeErrorView extends StatelessWidget {
  const _HomeErrorView({required this.error, required this.onReload});

  final Object? error;
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

            const SizedBox(height: 16),

            Text(
              'Homeデータを取得できませんでした',
              style: Theme.of(context).textTheme.titleMedium,
            ),

            const SizedBox(height: 8),

            Text(
              error.toString().replaceFirst('Exception: ', ''),
              textAlign: TextAlign.center,
            ),

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
