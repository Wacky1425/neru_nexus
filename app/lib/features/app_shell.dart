import 'package:flutter/material.dart';

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

  void _openTab(int index) {
    if (index < 0 || index > 5) {
      return;
    }

    setState(() {
      _currentIndex = index;
    });
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      HomePage(
        onOpenTransactions: () => _openTab(1),
        onOpenAnalytics: () => _openTab(3),
        onOpenAssets: () => _openTab(4),
      ),
      const TransactionsPage(),
      const ImportPage(),
      const AnalyticsPage(),
      AccountBalancePage(),
      const SettingsPage(),
    ];

    return PopScope(
      // Androidの戻る操作でAppShell自体を閉じない
      canPop: false,

      onPopInvokedWithResult: (didPop, result) {
        if (didPop) {
          return;
        }

        // Home以外にいる場合
        // → Homeへ戻る
        if (_currentIndex != 0) {
          setState(() {
            _currentIndex = 0;
          });

          return;
        }

        // Homeにいる場合
        // → 何もしない
        // Androidの戻る操作でもアプリを終了しない
      },

      child: Scaffold(
        body: IndexedStack(index: _currentIndex, children: pages),

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
