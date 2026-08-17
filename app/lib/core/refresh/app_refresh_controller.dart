import 'package:flutter/foundation.dart';

class AppRefreshController {
  AppRefreshController._();

  static final ValueNotifier<int> dataVersion = ValueNotifier<int>(0);

  static final ValueNotifier<int> accountBalanceVersion = ValueNotifier<int>(0);

  static void refreshAll() {
    dataVersion.value++;
  }

  static void refreshAccountBalances() {
    accountBalanceVersion.value++;
  }
}
