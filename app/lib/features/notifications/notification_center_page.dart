import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../home/model/home_model.dart';
import '../home/service/home_service.dart';

class NotificationCenterPage extends StatefulWidget {
  const NotificationCenterPage({super.key, this.initialHome});
  final HomeModel? initialHome;

  @override
  State<NotificationCenterPage> createState() => _NotificationCenterPageState();
}

class _NotificationCenterPageState extends State<NotificationCenterPage> {
  static const _reviewKey = 'notification_review_enabled';
  static const _budgetKey = 'notification_budget_enabled';
  static const _cashKey = 'notification_cash_enabled';
  static const _formalKey = 'notification_formal_wait_enabled';

  final HomeService _service = const HomeService();
  late Future<HomeModel> _homeFuture;
  bool _review = true;
  bool _budget = true;
  bool _cash = true;
  bool _formal = true;

  @override
  void initState() {
    super.initState();
    _homeFuture = widget.initialHome == null
        ? _service.fetchHome()
        : Future.value(widget.initialHome!);
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _review = prefs.getBool(_reviewKey) ?? true;
      _budget = prefs.getBool(_budgetKey) ?? true;
      _cash = prefs.getBool(_cashKey) ?? true;
      _formal = prefs.getBool(_formalKey) ?? true;
    });
  }

  Future<void> _set(String key, bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(key, value);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('通知・自動チェック')),
      body: FutureBuilder<HomeModel>(
        future: _homeFuture,
        builder: (context, snapshot) {
          if (!snapshot.hasData && snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('通知判定を取得できませんでした\n${snapshot.error}'));
          }
          final home = snapshot.data;
          if (home == null) return const Center(child: Text('データがありません'));
          final notices = _buildNotices(home);

          return RefreshIndicator(
            onRefresh: () async {
              final next = _service.fetchHome();
              setState(() => _homeFuture = next);
              await next;
            },
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('現在の通知', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 6),
                        Text(notices.isEmpty ? 'いま対応が必要な通知はありません' : '${notices.length}件のチェック項目があります'),
                        const SizedBox(height: 14),
                        if (notices.isEmpty)
                          const ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.task_alt), title: Text('問題なし'), subtitle: Text('Homeの最新データから自動判定しました'))
                        else
                          ...notices.map((notice) => ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: Icon(notice.icon),
                            title: Text(notice.title, style: const TextStyle(fontWeight: FontWeight.bold)),
                            subtitle: Text(notice.message),
                          )),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                Text('自動チェック対象', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                _switchTile('要判断', '要判断の取引が残っているとき', _review, (v) { setState(() => _review = v); _set(_reviewKey, v); }),
                _switchTile('予算・支出ペース', '月末支出見込みが予算を超えるとき', _budget, (v) { setState(() => _budget = v); _set(_budgetKey, v); }),
                _switchTile('生活防衛資金', '確保できている現金が1か月分未満のとき', _cash, (v) { setState(() => _cash = v); _set(_cashKey, v); }),
                _switchTile('正式明細待ち', '速報が正式明細との照合待ちになっているとき', _formal, (v) { setState(() => _formal = v); _set(_formalKey, v); }),
                const SizedBox(height: 16),
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('この版ではHome更新時とこの画面を開いたときに最新データを自動判定します。OSのバックグラウンドPush通知は、端末側の常駐処理を増やさず安全に運用するため次期候補として分離しています。'),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _switchTile(String title, String subtitle, bool value, ValueChanged<bool> onChanged) {
    return SwitchListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
      title: Text(title),
      subtitle: Text(subtitle),
      value: value,
      onChanged: onChanged,
    );
  }

  List<_Notice> _buildNotices(HomeModel home) {
    final notices = <_Notice>[];
    if (_review && home.reviewCount > 0) {
      notices.add(_Notice(Icons.notification_important_outlined, '要判断 ${home.reviewCount}件', '取引の分類・照合を確認してください。'));
    }
    final projectedExpense = _int(home.homeForecast['projectedExpense']);
    final budget = home.fixedExpenseBudget + home.variableExpenseBudget;
    if (_budget && budget > 0 && projectedExpense > budget) {
      notices.add(_Notice(Icons.speed_outlined, '月末予算オーバー見込み', '支出見込み ${_yen(projectedExpense)} / 予算 ${_yen(budget)}'));
    }
    final coveredMonths = _double(home.emergencyFund['coveredMonths']);
    if (_cash && coveredMonths < 1) {
      notices.add(_Notice(Icons.shield_outlined, '生活防衛資金が1か月分未満', '現在 ${coveredMonths.toStringAsFixed(1)}か月分。追加投資より現金確保を優先する判定です。'));
    }
    if (_formal && home.formalWaitCount > 0) {
      notices.add(_Notice(Icons.hourglass_top_outlined, '正式明細待ち ${home.formalWaitCount}件', '通常は自動照合待ちです。件数が長期間減らない場合だけ確認してください。'));
    }
    return notices;
  }

  int _int(dynamic value) => value is num ? value.toInt() : int.tryParse('$value') ?? 0;
  double _double(dynamic value) => value is num ? value.toDouble() : double.tryParse('$value') ?? 0;
  String _yen(int value) => '¥${value.toString().replaceAllMapped(RegExp(r'(?<=\d)(?=(\d{3})+(?!\d))'), (m) => ',')}';
}

class _Notice {
  const _Notice(this.icon, this.title, this.message);
  final IconData icon;
  final String title;
  final String message;
}
