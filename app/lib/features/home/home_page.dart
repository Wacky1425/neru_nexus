import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/refresh/app_refresh_controller.dart';
import 'model/home_model.dart';
import 'service/home_service.dart';
import 'widgets/money_card.dart';
import 'widgets/recent_transaction_card.dart';
import '../notifications/notification_center_page.dart';

class HomePage extends StatefulWidget {
  const HomePage({
    super.key,
    this.onOpenTransactions,
    this.onOpenHousehold,
    this.onOpenAnalytics,
    this.onOpenAssets,
    this.onOpenSettings,
  });

  final VoidCallback? onOpenTransactions;
  final VoidCallback? onOpenHousehold;
  final VoidCallback? onOpenAnalytics;
  final VoidCallback? onOpenAssets;
  final VoidCallback? onOpenSettings;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final HomeService _homeService = const HomeService();

  late Future<HomeModel> _homeFuture;
  Future<void>? _reloadFuture;
  bool _needsRefresh = false;
  bool _notifyReview = true;
  bool _notifyBudget = true;
  bool _notifyCash = true;
  bool _notifyFormal = true;

  @override
  void initState() {
    super.initState();

    _homeFuture = _homeService.fetchHome();
    _loadNotificationSettings();

    AppRefreshController.dataVersion.addListener(_handleAppRefresh);
    AppRefreshController.activeTabIndex.addListener(_handleActiveTabChanged);
  }

  @override
  void dispose() {
    AppRefreshController.dataVersion.removeListener(_handleAppRefresh);
    AppRefreshController.activeTabIndex.removeListener(_handleActiveTabChanged);

    super.dispose();
  }

  void _handleAppRefresh() {
    if (!mounted) {
      return;
    }

    if (AppRefreshController.activeTabIndex.value != 0) {
      _needsRefresh = true;
      return;
    }

    _reload().catchError((Object _) {});
  }

  void _handleActiveTabChanged() {
    if (!mounted || AppRefreshController.activeTabIndex.value != 0) {
      return;
    }

    if (_needsRefresh) {
      _needsRefresh = false;
      _reload().catchError((Object _) {});
    }
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


  Future<void> _loadNotificationSettings() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _notifyReview = prefs.getBool('notification_review_enabled') ?? true;
      _notifyBudget = prefs.getBool('notification_budget_enabled') ?? true;
      _notifyCash = prefs.getBool('notification_cash_enabled') ?? true;
      _notifyFormal = prefs.getBool('notification_formal_wait_enabled') ?? true;
    });
  }

  int _noticeCount(HomeModel home) {
    var count = 0;
    if (_notifyReview && home.reviewCount > 0) count++;
    if (_notifyFormal && home.formalWaitCount > 0) count++;
    final projected = home.homeForecast['projectedExpense'];
    final projectedExpense = projected is num ? projected.toInt() : int.tryParse('$projected') ?? 0;
    final budget = home.fixedExpenseBudget + home.variableExpenseBudget;
    if (_notifyBudget && budget > 0 && projectedExpense > budget) count++;
    final covered = home.emergencyFund['coveredMonths'];
    final coveredMonths = covered is num ? covered.toDouble() : double.tryParse('$covered') ?? 0;
    if (_notifyCash && coveredMonths < 1) count++;
    return count;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<HomeModel>(
      future: _homeFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting &&
            !snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }

        if (snapshot.hasError) {
          return _HomeErrorView(error: snapshot.error, onReload: _reload);
        }

        final home = snapshot.data;

        if (home == null) {
          return const Center(child: Text('Homeデータがありません'));
        }

        return SafeArea(
          bottom: false,
          child: RefreshIndicator(
          onRefresh: _reload,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
            children: [
              if (snapshot.connectionState == ConnectionState.waiting) ...[
                const LinearProgressIndicator(minHeight: 2),
                const SizedBox(height: 12),
              ],

              // ============================================================
              // Header
              // ============================================================
              _HomeHeader(
                yearMonth: _formatYearMonth(home.yearMonth),
                noticeCount: _noticeCount(home),
                onOpenSettings: widget.onOpenSettings,
                onOpenNotifications: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => NotificationCenterPage(initialHome: home),
                    ),
                  );
                  await _loadNotificationSettings();
                },
              ),

              const SizedBox(height: 18),

              // ============================================================
              // 今月の生活費
              // ============================================================
              _SectionLabel(
                title: '今月の生活費',
                icon: Icons.account_balance_wallet_outlined,
              ),

              const SizedBox(height: 12),

              _TappableCard(
                onTap: widget.onOpenAnalytics,
                child: MoneyCard(
                  title: '今月あと使える',
                  amount: _formatMoney(home.availableMoney),
                  subAmount:
                      '1日あたり '
                      '${_formatMoney(home.dailyBudget)}',
                  icon: Icons.wallet_outlined,
                ),
              ),

              const SizedBox(height: 12),

              _TodayOverviewCard(
                home: home,
                formatMoney: _formatMoney,
                onOpenTransactions: widget.onOpenTransactions,
                onOpenAssets: widget.onOpenAssets,
              ),

              const SizedBox(height: 12),

              _TappableCard(
                onTap: widget.onOpenHousehold,
                child: _MonthlyPlanSnapshotCard(
                  home: home,
                  formatMoney: _formatMoney,
                ),
              ),

              const SizedBox(height: 24),

              // ============================================================
              // 資産形成
              // ============================================================
              _SectionLabel(title: '資産形成', icon: Icons.auto_graph_outlined),

              const SizedBox(height: 12),

              _TappableCard(
                onTap: widget.onOpenHousehold,
                child: _AssetFormationSummaryCard(
                  home: home,
                  formatMoney: _formatMoney,
                ),
              ),

              const SizedBox(height: 24),

              const SizedBox(height: 8),

              // ============================================================
              // 最近の取引
              // ============================================================
              _SectionLabel(title: '最近の取引', icon: Icons.receipt_long_outlined),

              const SizedBox(height: 12),

              _TappableCard(
                onTap: widget.onOpenTransactions,
                child: RecentTransactionCard(
                  transactions: home.recentTransactions,
                ),
              ),
            ],
          ),
        ),
        );
      },
    );
  }
}

// ============================================================================
// Header
// ============================================================================

class _HomeHeader extends StatelessWidget {
  const _HomeHeader({
    required this.yearMonth,
    required this.noticeCount,
    required this.onOpenNotifications,
    this.onOpenSettings,
  });

  final String yearMonth;
  final int noticeCount;
  final VoidCallback onOpenNotifications;
  final VoidCallback? onOpenSettings;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'おかえり、ネル',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(
                yearMonth,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: '通知・自動チェック',
          onPressed: onOpenNotifications,
          icon: Badge(
            isLabelVisible: noticeCount > 0,
            label: Text('$noticeCount'),
            child: const Icon(Icons.notifications_outlined),
          ),
        ),
        IconButton(
          tooltip: '設定',
          onPressed: onOpenSettings,
          icon: const Icon(Icons.settings_outlined),
        ),
      ],
    );
  }
}

// ============================================================================
// Section label
// ============================================================================

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.title, required this.icon});

  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 22),

        const SizedBox(width: 8),

        Text(
          title,
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
        ),
      ],
    );
  }
}

class _TodayOverviewCard extends StatelessWidget {
  const _TodayOverviewCard({
    required this.home,
    required this.formatMoney,
    this.onOpenTransactions,
    this.onOpenAssets,
  });

  final HomeModel home;
  final String Function(int) formatMoney;
  final VoidCallback? onOpenTransactions;
  final VoidCallback? onOpenAssets;

  @override
  Widget build(BuildContext context) {
    final forecastBalance = _int(home.homeForecast['projectedBalance']);
    final isTight = home.availableMoney < 0 || forecastBalance < 0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '今日の判断',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 14),
            _HomeDecisionRow(
              icon: isTight
                  ? Icons.warning_amber_rounded
                  : Icons.check_circle_outline,
              title: isTight ? '今月は支出ペースに注意' : '今月の生活費は計画内',
              subtitle: '月末収支見込 ${formatMoney(forecastBalance)}',
            ),
            const Divider(height: 28),
            InkWell(
              onTap: home.reviewCount > 0 ? onOpenTransactions : null,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: _HomeDecisionRow(
                  icon: home.reviewCount > 0
                      ? Icons.notification_important_outlined
                      : Icons.task_alt_outlined,
                  title: home.reviewCount > 0
                      ? '要確認が ${home.reviewCount}件あります'
                      : '要確認はありません',
                  subtitle: home.reviewCount > 0
                      ? home.formalWaitCount > 0
                          ? '正式明細待ち ${home.formalWaitCount}件は自動照合待ち'
                          : 'タップして取引を確認'
                      : home.formalWaitCount > 0
                          ? '正式明細待ち ${home.formalWaitCount}件（自動照合待ち）'
                          : '取引データは整理済み',
                ),
              ),
            ),
            const Divider(height: 28),
            InkWell(
              onTap: onOpenAssets,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: _HomeDecisionRow(
                  icon: Icons.account_balance_outlined,
                  title: '純資産 ${formatMoney(home.netAssets)}',
                  subtitle:
                      '資産 ${formatMoney(home.totalAssets)} / 負債 ${formatMoney(home.totalLiabilities)}',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  int _int(dynamic value) {
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}

class _HomeDecisionRow extends StatelessWidget {
  const _HomeDecisionRow({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 22),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 3),
              Text(
                subtitle,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ============================================================================
// おすすめ配分
// ============================================================================


class _MonthlyPlanSnapshotCard extends StatelessWidget {
  const _MonthlyPlanSnapshotCard({
    required this.home,
    required this.formatMoney,
  });

  final HomeModel home;
  final String Function(int) formatMoney;

  @override
  Widget build(BuildContext context) {
    final livingBudget = home.fixedExpenseBudget + home.variableExpenseBudget;
    final actualExpense = home.fixedExpenseActual + home.variableExpenseActual;
    final usageRate = livingBudget > 0 ? actualExpense / livingBudget : 0.0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.flag_outlined),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '今月の計画',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _MoneyRow(
              label: '生活費',
              value: livingBudget > 0
                  ? '${formatMoney(actualExpense)} / ${formatMoney(livingBudget)}'
                  : formatMoney(actualExpense),
              emphasize: livingBudget > 0 && actualExpense > livingBudget,
            ),
            if (livingBudget > 0) ...[
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: usageRate.clamp(0.0, 1.0),
                  minHeight: 7,
                ),
              ),
            ],
            const SizedBox(height: 12),
            _MoneyRow(label: 'NISA予定', value: formatMoney(home.baseNisa)),
            if (home.homeForecast.isNotEmpty) ...[
              const SizedBox(height: 8),
              _MoneyRow(
                label: '月末支出見込',
                value: formatMoney(
                  (home.homeForecast['projectedExpense'] as num?)?.toInt() ?? 0,
                ),
              ),
            ],
            if (home.savingsTarget > 0) ...[
              const SizedBox(height: 8),
              _MoneyRow(
                label: '追加貯金目標',
                value: formatMoney(home.savingsTarget),
              ),
            ],
            if (home.freeSpendingTarget > 0) ...[
              const SizedBox(height: 8),
              _MoneyRow(
                label: '自由費上限',
                value: formatMoney(home.freeSpendingTarget),
              ),
            ],
            const SizedBox(height: 10),
            Text(
              home.budgetInherited && home.budgetInheritedFrom.isNotEmpty
                  ? '${home.budgetInheritedFrom} の予算を引き継いでいます'
                  : 'タップして今月の予算・目標を調整',
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

class _AssetFormationSummaryCard extends StatelessWidget {
  const _AssetFormationSummaryCard({
    required this.home,
    required this.formatMoney,
  });

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
            _MoneyRow(
              label: '今月の余剰見込み',
              value: formatMoney(home.monthlySurplus),
              emphasize: home.monthlySurplus < 0,
            ),
            const SizedBox(height: 14),
            _MoneyRow(label: '目的資金', value: formatMoney(home.goalAllocation)),
            const SizedBox(height: 8),
            _MoneyRow(
              label: '生活防衛資金',
              value: formatMoney(home.emergencyCashAllocation),
            ),
            const SizedBox(height: 8),
            _MoneyRow(label: 'NISA', value: formatMoney(home.totalNisa)),
            if (home.unallocatedCash > 0) ...[
              const SizedBox(height: 8),
              _MoneyRow(label: '未配分', value: formatMoney(home.unallocatedCash)),
            ],
            const SizedBox(height: 10),
            Text(
              'タップして予算・目標を調整',
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

// ============================================================================
// Goal summary
// ============================================================================

// ============================================================================
// Emergency Fund
// ============================================================================

// ============================================================================
// Common
// ============================================================================

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

class _TappableCard extends StatelessWidget {
  const _TappableCard({required this.child, required this.onTap});

  final Widget child;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    if (onTap == null) {
      return child;
    }

    return Stack(
      children: [
        child,

        Positioned.fill(
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),

        const Positioned(
          top: 10,
          right: 10,
          child: IgnorePointer(child: Icon(Icons.chevron_right, size: 20)),
        ),
      ],
    );
  }
}

// ============================================================================
// Error
// ============================================================================

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
