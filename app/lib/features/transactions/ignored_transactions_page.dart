import 'package:flutter/material.dart';

import 'model/transaction_model.dart';
import 'service/transaction_service.dart';

class IgnoredTransactionsPage extends StatefulWidget {
  const IgnoredTransactionsPage({super.key});

  @override
  State<IgnoredTransactionsPage> createState() =>
      _IgnoredTransactionsPageState();
}

class _IgnoredTransactionsPageState extends State<IgnoredTransactionsPage> {
  final TransactionService _transactionService = const TransactionService();

  late Future<List<TransactionModel>> _future;

  final Set<String> _restoringIds = {};

  @override
  void initState() {
    super.initState();

    _future = _load();
  }

  Future<List<TransactionModel>> _load() {
    return _transactionService.fetchIgnoredTransactions(limit: 200, offset: 0);
  }

  Future<void> _refresh() async {
    final future = _load();

    setState(() {
      _future = future;
    });

    await future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('除外済み取引')),
      body: FutureBuilder<List<TransactionModel>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            final message = snapshot.error.toString().replaceFirst(
              'Exception: ',
              '',
            );

            return RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  SizedBox(
                    height: MediaQuery.sizeOf(context).height * 0.65,
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.error_outline, size: 48),
                            const SizedBox(height: 16),
                            Text(
                              '除外済み取引を取得できませんでした',
                              style: Theme.of(context).textTheme.titleMedium,
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              message,
                              style: Theme.of(context).textTheme.bodySmall,
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 20),
                            FilledButton.icon(
                              onPressed: _refresh,
                              icon: const Icon(Icons.refresh),
                              label: const Text('再読み込み'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            );
          }

          final items = snapshot.data ?? const <TransactionModel>[];

          if (items.isEmpty) {
            return RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  SizedBox(
                    height: MediaQuery.sizeOf(context).height * 0.65,
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.visibility_off_outlined,
                            size: 52,
                            color: Theme.of(context).colorScheme.outline,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            '除外済みの取引はありません',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 6),
                          Text(
                            '速報から除外した取引がここに表示されます',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: items.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final transaction = items[index];

                return _IgnoredTransactionTile(
                  transaction: transaction,
                  restoring: _restoringIds.contains(transaction.id),
                  onRestore: () => _restoreTransaction(transaction),
                );
              },
            ),
          );
        },
      ),
    );
  }

  Future<void> _restoreTransaction(TransactionModel transaction) async {
    if (_restoringIds.contains(transaction.id)) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('この取引を復元しますか？'),
          content: Text(
            '${_displayName(transaction)}を'
            '速報として通常の取引一覧へ戻します。\n\n'
            '復元後は再び集計・残高にも反映されます。',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop(false);
              },
              child: const Text('キャンセル'),
            ),
            FilledButton(
              onPressed: () {
                Navigator.of(dialogContext).pop(true);
              },
              child: const Text('復元する'),
            ),
          ],
        );
      },
    );

    if (confirmed != true || !mounted) {
      return;
    }

    setState(() {
      _restoringIds.add(transaction.id);
    });

    try {
      await _transactionService.restoreIgnoredTransaction(id: transaction.id);

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${_displayName(transaction)}を復元しました')),
      );

      await _refresh();
    } catch (error) {
      if (!mounted) {
        return;
      }

      final message = error.toString().replaceFirst('Exception: ', '');

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    } finally {
      if (mounted) {
        setState(() {
          _restoringIds.remove(transaction.id);
        });
      }
    }
  }

  static String _displayName(TransactionModel transaction) {
    if (transaction.merchant.trim().isNotEmpty) {
      return transaction.merchant.trim();
    }

    if (transaction.itemName.trim().isNotEmpty) {
      return transaction.itemName.trim();
    }

    return '名称なし';
  }
}

class _IgnoredTransactionTile extends StatelessWidget {
  const _IgnoredTransactionTile({
    required this.transaction,
    required this.restoring,
    required this.onRestore,
  });

  final TransactionModel transaction;
  final bool restoring;
  final VoidCallback onRestore;

  @override
  Widget build(BuildContext context) {
    final isIncome = transaction.type == '収入';

    final isTransfer = transaction.type == '移動';

    final colorScheme = Theme.of(context).colorScheme;

    final transactionColor = isTransfer
        ? colorScheme.primary
        : isIncome
        ? colorScheme.tertiary
        : colorScheme.error;

    final displayName = _displayName(transaction);

    final category = transaction.subCategory.trim().isNotEmpty
        ? transaction.subCategory.trim()
        : transaction.majorCategory.trim().isNotEmpty
        ? transaction.majorCategory.trim()
        : '未分類';

    final subtitleParts = <String>[transaction.transactionDate, category];

    if (transaction.paymentMethod.trim().isNotEmpty) {
      subtitleParts.add(transaction.paymentMethod.trim());
    }

    return ListTile(
      contentPadding: const EdgeInsets.fromLTRB(16, 8, 8, 8),

      leading: CircleAvatar(
        backgroundColor: transactionColor.withValues(alpha: 0.12),
        child: Icon(Icons.visibility_off_outlined, color: transactionColor),
      ),

      title: Text(
        displayName,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.bold),
      ),

      subtitle: Text(
        subtitleParts.join(' ・ '),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),

      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '${isTransfer
                ? ''
                : isIncome
                ? '+'
                : '-'}'
            '${_formatYen(transaction.amount)}',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: transactionColor,
            ),
          ),

          const SizedBox(width: 4),

          if (restoring)
            const SizedBox(
              width: 40,
              height: 40,
              child: Padding(
                padding: EdgeInsets.all(10),
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else
            IconButton(
              tooltip: '復元',
              onPressed: onRestore,
              icon: const Icon(Icons.restore),
            ),
        ],
      ),
    );
  }

  static String _displayName(TransactionModel transaction) {
    if (transaction.merchant.trim().isNotEmpty) {
      return transaction.merchant.trim();
    }

    if (transaction.itemName.trim().isNotEmpty) {
      return transaction.itemName.trim();
    }

    return '名称なし';
  }

  static String _formatYen(int amount) {
    final formatted = amount.abs().toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );

    return '￥$formatted';
  }
}
