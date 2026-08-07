import 'package:flutter/material.dart';

import '../transactions/model/transaction_model.dart';
import '../transactions/transaction_detail_page.dart';
import 'service/review_service.dart';

class ReviewPage extends StatefulWidget {
  const ReviewPage({super.key});

  @override
  State<ReviewPage> createState() => _ReviewPageState();
}

class _ReviewPageState extends State<ReviewPage> {
  final ReviewService _service = const ReviewService();

  late Future<ReviewTransactionsResult> _future;

  bool _hasChanged = false;

  @override
  void initState() {
    super.initState();

    _future = _service.fetchReviewTransactions();
  }

  Future<void> _reload() async {
    final future = _service.fetchReviewTransactions();

    setState(() {
      _future = future;
    });

    await future;
  }

  void _closePage() {
    Navigator.of(context).pop(_hasChanged);
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) {
          return;
        }

        _closePage();
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('要確認'),
          leading: IconButton(
            onPressed: _closePage,
            icon: const Icon(Icons.arrow_back),
          ),
        ),
        body: FutureBuilder<ReviewTransactionsResult>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }

            if (snapshot.hasError) {
              return _buildErrorState(context, snapshot.error);
            }

            final result = snapshot.data;

            if (result == null) {
              return const Center(child: Text('要確認データがありません'));
            }

            final items = result.items;
            final total = result.total;

            if (items.isEmpty) {
              return RefreshIndicator(
                onRefresh: _reload,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    SizedBox(
                      height: MediaQuery.sizeOf(context).height * 0.65,
                      child: const Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.check_circle_outline, size: 64),
                            SizedBox(height: 16),
                            Text(
                              '要確認はありません',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
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
              onRefresh: _reload,
              child: ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                itemCount: items.length + 1,
                separatorBuilder: (context, index) {
                  return const Divider(height: 1);
                },
                itemBuilder: (context, index) {
                  if (index == 0) {
                    return Padding(
                      padding: const EdgeInsets.only(top: 8, bottom: 16),
                      child: Text(
                        '要確認 $total件',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                    );
                  }
                  final transaction = items[index - 1];

                  final displayName = transaction.itemName.trim().isNotEmpty
                      ? transaction.itemName.trim()
                      : transaction.merchant.trim().isNotEmpty
                      ? transaction.merchant.trim()
                      : '名称なし';

                  return ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 6,
                    ),
                    leading: const CircleAvatar(
                      child: Icon(Icons.warning_amber_rounded),
                    ),
                    title: Text(
                      displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: Text(
                      '${transaction.majorCategory}'
                      ' / '
                      '${transaction.subCategory}',
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _formatYen(transaction.amount),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(width: 8),
                        const Icon(Icons.chevron_right),
                      ],
                    ),
                    onTap: () async {
                      final result = await Navigator.of(context)
                          .push<TransactionDetailResult>(
                            MaterialPageRoute(
                              builder: (_) => TransactionDetailPage(
                                transaction: transaction,
                                 fromReview: true,
                              ),
                            ),
                          );

                      if (result == null || !mounted) {
                        return;
                      }

                      _hasChanged = true;

                      await _reload();
                    },
                  );
                },
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildErrorState(BuildContext context, Object? error) {
    final message = error.toString().replaceFirst('Exception: ', '');

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.error_outline,
              size: 48,
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(height: 12),
            const Text(
              '要確認一覧を取得できませんでした',
              textAlign: TextAlign.center,
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
