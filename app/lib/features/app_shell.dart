import 'package:flutter/material.dart';

import '../core/refresh/app_refresh_controller.dart';
import 'accounts/account_balance_page.dart';
import 'analytics/analytics_page.dart';
import 'home/home_page.dart';
import 'import/import_page.dart';
import 'settings/settings_page.dart';
import 'transactions/transactions_page.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _currentIndex = 0;

  /// Keep already-opened tabs alive, but do not build unopened tabs yet.
  /// This avoids firing Home / Transactions / Analytics / Assets API requests
  /// all at once on app startup.
  late final List<Widget?> _pages;

  @override
  void initState() {
    super.initState();

    _pages = List<Widget?>.filled(6, null);
    _pages[0] = _buildPage(0);
    AppRefreshController.setActiveTab(0);
  }

  Widget _buildPage(int index) {
    switch (index) {
      case 0:
        return HomePage(
          onOpenTransactions: () => _openTab(1),
          onOpenAnalytics: () => _openTab(3),
          onOpenAssets: () => _openTab(4),
        );
      case 1:
        return const TransactionsPage();
      case 2:
        return const ImportPage();
      case 3:
        return const AnalyticsPage();
      case 4:
        return const AccountBalancePage();
      case 5:
        return const SettingsPage();
      default:
        return const SizedBox.shrink();
    }
  }

  void _openTab(int index) {
    if (index < 0 || index > 5 || index == _currentIndex) {
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
        body: IndexedStack(
          index: _currentIndex,
          children: List<Widget>.generate(
            6,
            (index) => _pages[index] ?? const SizedBox.shrink(),
          ),
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _currentIndex,
          onDestinationSelected: _openTab,
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home),
              label: 'Home',
            ),
            NavigationDestination(
              icon: Icon(Icons.receipt_long_outlined),
              selectedIcon: Icon(Icons.receipt_long),
              label: '取引',
            ),
            NavigationDestination(
              icon: Icon(Icons.upload_file_outlined),
              selectedIcon: Icon(Icons.upload_file),
              label: '取込',
            ),
            NavigationDestination(
              icon: Icon(Icons.bar_chart_outlined),
              selectedIcon: Icon(Icons.bar_chart),
              label: '分析',
            ),
            NavigationDestination(
              icon: Icon(Icons.account_balance_wallet_outlined),
              selectedIcon: Icon(Icons.account_balance_wallet),
              label: '資産',
            ),
            NavigationDestination(
              icon: Icon(Icons.settings_outlined),
              selectedIcon: Icon(Icons.settings),
              label: '設定',
            ),
          ],
        ),
      ),
    );
  }
}
