import 'package:flutter/material.dart';

import 'model/account_balance_model.dart';
import 'service/account_balance_service.dart';
import 'account_edit_page.dart';
import 'account_create_page.dart';

class AccountManagementPage extends StatefulWidget {
  const AccountManagementPage({super.key});

  @override
  State<AccountManagementPage> createState() => _AccountManagementPageState();
}

class _AccountManagementPageState extends State<AccountManagementPage> {
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
      appBar: AppBar(title: const Text('口座管理')),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          final created = await Navigator.of(context).push<bool>(
            MaterialPageRoute(builder: (_) => const AccountCreatePage()),
          );

          if (created == true && mounted) {
            await _reload();
          }
        },
        child: const Icon(Icons.add),
      ),
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

          if (result == null || result.items.isEmpty) {
            return const Center(child: Text('口座がありません'));
          }

          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: result.items.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final account = result.items[index];

                return _AccountTile(
                  account: account,
                  onTap: () async {
                    final editResult = await Navigator.of(context)
                        .push<Object?>(
                          MaterialPageRoute(
                            builder: (_) => AccountEditPage(account: account),
                          ),
                        );

                    if (!mounted) {
                      return;
                    }

                    if (editResult is AccountUpdateResult ||
                        editResult is AccountEditDeletedResult) {
                      await _reload();
                    }
                  },
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _AccountTile extends StatelessWidget {
  const _AccountTile({required this.account, required this.onTap});

  final AccountBalanceModel account;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dateText = account.openingBalanceDate.isEmpty
        ? '未設定'
        : account.openingBalanceDate;

    return ListTile(
      leading: CircleAvatar(
        child: Icon(
          account.isLiability
              ? Icons.credit_card
              : Icons.account_balance_outlined,
        ),
      ),
      title: Text(account.accountName),
      subtitle: Text(
        '基準残高 ${_formatYen(account.openingBalance)}'
        ' ・ 基準日 $dateText',
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
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
