import 'package:flutter/material.dart';

import 'model/account_balance_model.dart';
import 'service/account_balance_service.dart';

class AccountBalancePage extends StatefulWidget {
  const AccountBalancePage({super.key});

  @override
  State<AccountBalancePage> createState() => _AccountBalancePageState();
}

class _AccountBalancePageState extends State<AccountBalancePage> {
  final _service = const AccountBalanceService();

  late Future<AccountBalancesResult> _future;

  @override
  void initState() {
    super.initState();

    _future = _service.fetchAccountBalances();
  }

  Future<void> _reload() async {
    setState(() {
      _future = _service.fetchAccountBalances();
    });

    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('資産')),
      body: FutureBuilder<AccountBalancesResult>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, size: 48),
                    const SizedBox(height: 16),
                    Text(
                      snapshot.error.toString(),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _reload,
                      child: const Text('再読み込み'),
                    ),
                  ],
                ),
              ),
            );
          }

          final result = snapshot.data;

          if (result == null) {
            return const Center(child: Text('残高データがありません'));
          }

          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                _SummaryCard(result: result),

                const SizedBox(height: 24),

                Text(
                  '口座',
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                ),

                const SizedBox(height: 12),

                ...result.items.map(
                  (account) => _AccountCard(account: account),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.result});

  final AccountBalancesResult result;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('純資産', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              _formatYen(result.netAssets),
              style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold),
            ),
            const Divider(height: 32),
            Row(
              children: [
                Expanded(
                  child: _SummaryValue(label: '資産', amount: result.totalAssets),
                ),
                Expanded(
                  child: _SummaryValue(
                    label: '負債',
                    amount: result.totalLiabilities,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryValue extends StatelessWidget {
  const _SummaryValue({required this.label, required this.amount});

  final String label;
  final int amount;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 4),
        Text(
          _formatYen(amount),
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
      ],
    );
  }
}

class _AccountCard extends StatelessWidget {
  const _AccountCard({required this.account});

  final AccountBalanceModel account;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: CircleAvatar(
          child: Icon(
            account.isLiability
                ? Icons.credit_card
                : Icons.account_balance_wallet_outlined,
          ),
        ),
        title: Text(account.accountName),
        subtitle: Text(account.isLiability ? '負債' : '資産'),
        trailing: Text(
          _formatYen(account.currentBalance),
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
      ),
    );
  }
}

String _formatYen(int amount) {
  final negative = amount < 0;

  final formatted = amount.abs().toString().replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => ',',
  );

  return '${negative ? '-' : ''}￥$formatted';
}
