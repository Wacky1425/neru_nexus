import 'package:flutter/material.dart';

import '../core/refresh/app_refresh_controller.dart';
import '../core/network/api_client.dart';
import '../core/offline/offline_sync_store.dart';
import '../core/master/master_repository.dart';
import 'accounts/account_balance_page.dart';
import 'analytics/analytics_page.dart';
import 'home/home_page.dart';
import 'household/household_page.dart';
import 'settings/settings_page.dart';
import 'transactions/transactions_page.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> with WidgetsBindingObserver {
  int _currentIndex = 0;

  /// Keep already-opened tabs alive, but do not build unopened tabs yet.
  /// This avoids firing Home / Transactions / Analytics / Assets API requests
  /// all at once on app startup.
  late final List<Widget?> _pages;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _pages = List<Widget?>.filled(5, null);
    _pages[0] = _buildPage(0);
    AppRefreshController.setActiveTab(0);
    WidgetsBinding.instance.addPostFrameCallback((_) => _resumeOnlineWork());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _resumeOnlineWork();
    }
  }

  Future<void> _resumeOnlineWork() async {
    // Warm the master snapshot whenever connectivity is available. This makes
    // accounts/categories/payment methods available the next time the app is
    // opened completely offline, even if the transaction form was never
    // opened during the previous online session.
    try {
      await const MasterRepository().getMaster(forceRefresh: true);
    } catch (_) {
      // Offline is a normal state in R5. Existing local snapshots remain usable.
    }

    if (OfflineSyncStore.pendingCount.value > 0) {
      await ApiClient.flushOfflineQueue();
    }
    if (!mounted) return;
    AppRefreshController.refreshAll();
  }

  Future<void> _showSyncQueue(BuildContext context) async {
    var items = await OfflineSyncStore.pendingMutations();
    if (!context.mounted) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('同期キュー'),
          content: SizedBox(
            width: double.maxFinite,
            child: items.isEmpty
                ? const Text('同期待ちはありません')
                : ListView.separated(
                    shrinkWrap: true,
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const Divider(),
                    itemBuilder: (context, index) {
                      final item = items[index];
                      final status = item['status']?.toString() ?? 'pending';
                      final error = item['lastError']?.toString() ?? '';
                      final body = Map<String, dynamic>.from(item['body'] as Map? ?? const {});
                      final title = body['title']?.toString().trim();
                      final account = body['accountName']?.toString().trim();
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(
                          status == 'needs_attention'
                              ? Icons.error_outline
                              : Icons.cloud_upload_outlined,
                        ),
                        title: Text(
                          (title != null && title.isNotEmpty)
                              ? title
                              : item['action']?.toString() ?? '同期データ',
                        ),
                        subtitle: Text([
                          if (account != null && account.isNotEmpty) '利用口座: $account',
                          if (status == 'needs_attention') '要修正',
                          if (error.isNotEmpty) error,
                        ].join('\n')),
                        trailing: status == 'needs_attention'
                            ? PopupMenuButton<String>(
                                onSelected: (value) async {
                                  final id = item['id']?.toString() ?? '';
                                  if (value == 'retry') {
                                    await OfflineSyncStore.retryMutation(id);
                                    await ApiClient.flushOfflineQueue();
                                  } else if (value == 'discard') {
                                    await OfflineSyncStore.discardMutation(id);
                                  }
                                  items = await OfflineSyncStore.pendingMutations();
                                  if (context.mounted) setDialogState(() {});
                                  AppRefreshController.refreshAll();
                                },
                                itemBuilder: (_) => const [
                                  PopupMenuItem(value: 'retry', child: Text('再同期')),
                                  PopupMenuItem(value: 'discard', child: Text('破棄')),
                                ],
                              )
                            : null,
                      );
                    },
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('閉じる'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPage(int index) {
    switch (index) {
      case 0:
        return HomePage(
          onOpenTransactions: () => _openTab(1),
          onOpenHousehold: () => _openTab(2),
          onOpenAnalytics: () => _openTab(4),
          onOpenAssets: () => _openTab(3),
          onOpenSettings: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const SettingsPage()),
          ),
        );
      case 1:
        return const TransactionsPage();
      case 2:
        return const HouseholdPage();
      case 3:
        return const AccountBalancePage();
      case 4:
        return const AnalyticsPage();
      default:
        return const SizedBox.shrink();
    }
  }

  void _openTab(int index) {
    if (index < 0 || index > 4 || index == _currentIndex) {
      return;
    }

    setState(() {
      _pages[index] ??= _buildPage(index);
      _currentIndex = index;
    });

    AppRefreshController.setActiveTab(index);
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      // Androidの戻る操作でAppShell自体を閉じない
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) {
          return;
        }

        if (_currentIndex != 0) {
          _openTab(0);
        }
      },
      child: Scaffold(
        body: Column(
          children: [
            ValueListenableBuilder<int>(
              valueListenable: OfflineSyncStore.pendingCount,
              builder: (context, count, _) {
                if (count == 0) return const SizedBox.shrink();
                return Material(
                  child: SafeArea(
                    bottom: false,
                    child: ListTile(
                      dense: true,
                      leading: const Icon(Icons.cloud_upload_outlined),
                      title: ValueListenableBuilder<int>(
                        valueListenable: OfflineSyncStore.needsAttentionCount,
                        builder: (context, attention, _) => Text(
                          attention > 0
                              ? '同期待ち $count件（要修正 $attention件）'
                              : '同期待ち $count件',
                        ),
                      ),
                      subtitle: ValueListenableBuilder<String>(
                        valueListenable: OfflineSyncStore.lastError,
                        builder: (context, error, _) => Text(
                          error.isEmpty ? '通信が戻ると自動同期します' : '同期失敗: $error',
                        ),
                      ),
                      onTap: () => _showSyncQueue(context),
                      trailing: IconButton(
                        tooltip: '今すぐ同期',
                        onPressed: () async {
                          await ApiClient.flushOfflineQueue();
                          AppRefreshController.refreshAll();
                        },
                        icon: const Icon(Icons.sync),
                      ),
                    ),
                  ),
                );
              },
            ),
            Expanded(
              child: IndexedStack(
                index: _currentIndex,
                children: List<Widget>.generate(
                  5,
                  (index) => _pages[index] ?? const SizedBox.shrink(),
                ),
              ),
            ),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _currentIndex,
          onDestinationSelected: _openTab,
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home),
              label: 'ホーム',
            ),
            NavigationDestination(
              icon: Icon(Icons.receipt_long_outlined),
              selectedIcon: Icon(Icons.receipt_long),
              label: '取引',
            ),
            NavigationDestination(
              icon: Icon(Icons.savings_outlined),
              selectedIcon: Icon(Icons.savings),
              label: '家計',
            ),
            NavigationDestination(
              icon: Icon(Icons.account_balance_wallet_outlined),
              selectedIcon: Icon(Icons.account_balance_wallet),
              label: '資産',
            ),
            NavigationDestination(
              icon: Icon(Icons.bar_chart_outlined),
              selectedIcon: Icon(Icons.bar_chart),
              label: '分析',
            ),
          ],
        ),
      ),
    );
  }
}
