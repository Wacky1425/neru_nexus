import 'package:flutter/foundation.dart';

class AppRefreshController {
  AppRefreshController._();

  /// Data that affects Home / Transactions / Analytics.
  static final ValueNotifier<int> dataVersion = ValueNotifier<int>(0);

  /// Account balances can refresh independently from the other tabs.
  static final ValueNotifier<int> accountBalanceVersion = ValueNotifier<int>(0);

  /// Current AppShell tab. Pages use this to postpone expensive refreshes while
  /// they are off-screen, then refresh once when the user returns to the tab.
  static final ValueNotifier<int> activeTabIndex = ValueNotifier<int>(0);

  static void refreshAll() {
    dataVersion.value++;
  }

  static void refreshAccountBalances() {
    accountBalanceVersion.value++;
  }

  static void setActiveTab(int index) {
    if (activeTabIndex.value == index) {
      return;
    }

    activeTabIndex.value = index;
  }
}
