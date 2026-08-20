import 'package:flutter/material.dart';

import '../transactions/model/transaction_model.dart';
import '../transactions/service/transaction_service.dart';
import '../transactions/transaction_detail_page.dart';

class ImportResultTransactionsPage extends StatefulWidget {
  const ImportResultTransactionsPage({super.key, required this.importBatch});

  final String importBatch;

  @override
  State<ImportResultTransactionsPage> createState() =>
      _ImportResultTransactionsPageState();
}

class _ImportResultTransactionsPageState
    extends State<ImportResultTransactionsPage> {
  final TransactionService _transactionService = const TransactionService();

  late Future<List<TransactionModel>> _future;

  @override
  void initState() {
    super.initState();

    _future = _fetchTransactions();
  }

  Future<List<TransactionModel>> _fetchTransactions() {
    return _transactionService.fetchTransactions(
      limit: 200,
      offset: 0,
      importBatch: widget.importBatch,
    );
  }

  Future<void> _reload() async {
    final future = _fetchTransactions();

    setState(() {
      _future = future;
    });

    await future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('取込結果')),
      body: FutureBuilder<List<TransactionModel>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _buildError(snapshot.error);
          }

          final transactions = snapshot.data ?? const <TransactionModel>[];

          if (transactions.isEmpty) {
            return RefreshIndicator(
              onRefresh: _reload,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  SizedBox(
                    height: MediaQuery.sizeOf(context).height * 0.65,
                    child: const Center(child: Text('今回追加された取引はありません')),
                  ),
                ],
              ),
            );
          }

          final totalAmount = transactions.fold<int>(
            0,
            (sum, transaction) => sum + transaction.amount,
          );

          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              itemCount: transactions.length + 1,
              separatorBuilder: (context, index) {
                return const Divider(height: 1);
              },
              itemBuilder: (context, index) {
                if (index == 0) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${transactions.length}件',
                          style: Theme.of(context).textTheme.titleLarge
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),

                        const SizedBox(height: 4),

                        Text(
                          '合計 ${_formatYen(totalAmount)}',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ],
                    ),
                  );
                }

                final transaction = transactions[index - 1];

                final displayName = transaction.merchant.trim().isNotEmpty
                    ? transaction.merchant.trim()
                    : transaction.itemName.trim().isNotEmpty
                    ? transaction.itemName.trim()
                    : '名称なし';

                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  title: Text(
                    displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text(
                    '${transaction.transactionDate}'
                    ' ・ '
                    '${transaction.majorCategory}'
                    ' / '
                    '${transaction.subCategory}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: Text(
                    _formatYen(transaction.amount),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  onTap: () async {
                    final result = await Navigator.of(context)
                        .push<TransactionDetailResult>(
                          MaterialPageRoute(
                            builder: (_) =>
                                TransactionDetailPage(transaction: transaction),
                          ),
                        );

                    if (result != null && mounted) {
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

  Widget _buildError(Object? error) {
    final message = error.toString().replaceFirst('Exception: ', '');

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48),

            const SizedBox(height: 12),

            const Text(
              '取込結果を取得できませんでした',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 8),

            Text(message, textAlign: TextAlign.center),

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

  static String _formatYen(int amount) {
    final formatted = amount.abs().toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );

    final sign = amount < 0 ? '-' : '';

    return '$sign￥$formatted';
  }
}
