import 'package:flutter/material.dart';

import 'home_model.dart';
import 'home_service.dart';
import 'widgets/money_card.dart';

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
  }

  Future<void> _reload() async {
    setState(() {
      _homeFuture = _homeService.fetchHome();
    });

    await _homeFuture;
  }

  String _formatMoney(int value) {
    final text = value.abs().toString();
    final buffer = StringBuffer();

    for (int i = 0; i < text.length; i++) {
      final positionFromEnd = text.length - i;

      buffer.write(text[i]);

      if (
        positionFromEnd > 1 &&
        positionFromEnd % 3 == 1
      ) {
        buffer.write(',');
      }
    }

    final prefix = value < 0 ? '-¥' : '¥';

    return '$prefix$buffer';
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<HomeModel>(
      future: _homeFuture,
      builder: (context, snapshot) {
        if (
          snapshot.connectionState ==
          ConnectionState.waiting
        ) {
          return const Center(
            child: CircularProgressIndicator(),
          );
        }

        if (snapshot.hasError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.error_outline,
                    size: 48,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Homeデータを取得できませんでした',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    snapshot.error.toString(),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: _reload,
                    icon: const Icon(Icons.refresh),
                    label: const Text('再読み込み'),
                  ),
                ],
              ),
            ),
          );
        }

        final home = snapshot.data;

        if (home == null) {
          return const Center(
            child: Text('Homeデータがありません'),
          );
        }

        final healthTitle =
            home.moneyHealth['title']?.toString() ??
            '状態不明';

        final healthMessage =
            home.moneyHealth['message']?.toString() ??
            '';

        return RefreshIndicator(
          onRefresh: _reload,
          child: ListView(
            padding: const EdgeInsets.symmetric(
            horizontal: 24,
            vertical: 20,
          ),
            children: [
              Text(
                "おかえり、ネル👋",
                style: Theme.of(context)
                    .textTheme
                    .headlineMedium,
              ),
              Text(
                home.yearMonth,
                style: Theme.of(context)
                    .textTheme
                    .titleMedium,
              ),
              const SizedBox(height: 16),

              MoneyCard(
                title: 'あと使えるお金',
                amount: _formatMoney(
                  home.availableMoney,
                ),
                subAmount: '今日あと ${_formatMoney(home.dailyBudget)}',
                icon: Icons.account_balance_wallet,
              ),

              const SizedBox(height: 12),

              MoneyCard(
                title: '今月の貯金予測',
                amount: _formatMoney(
                  home.savingForecast,
                ),
                subAmount: '月末時点の予測',
                icon: Icons.savings_outlined,
              ),

              const SizedBox(height: 12),

              MoneyCard(
                title: '副業利益',
                amount: _formatMoney(
                  home.sideBusinessProfit,
                ),
                subAmount: '今月の事業収支',
                icon: Icons.work_outline,
              ),

              const SizedBox(height: 20),

              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment:
                        CrossAxisAlignment.start,
                    children: [
                      Text(
                        healthTitle,
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium,
                      ),
                      if (healthMessage.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(healthMessage),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

