import 'package:flutter/material.dart';

class RecentTransactionCard extends StatelessWidget {
  const RecentTransactionCard({
    super.key,
    required this.transactions,
  });

  final List<Map<String, dynamic>> transactions;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '🕒 最近の取引',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),

            if (transactions.isEmpty)
              const Text('最近の取引はありません')
            else
              ...transactions.map((transaction) {
                final merchant =
                    transaction['merchant']?.toString().trim() ?? '';

                final itemName =
                    transaction['itemName']?.toString().trim() ?? '';

                final displayName = merchant.isNotEmpty
                    ? merchant
                    : itemName.isNotEmpty
                        ? itemName
                        : '名称なし';

                final amount =
                    (transaction['amount'] as num?)?.toInt() ?? 0;

                final type =
                    transaction['type']?.toString().trim() ?? '';

                final isIncome = type == '収入';

                final amountText =
                    '${isIncome ? '+' : '-'}¥${_formatAmount(amount.abs())}';

                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        amountText,
                        style: Theme.of(context)
                            .textTheme
                            .bodyMedium
                            ?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                      ),
                    ],
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }

  static String _formatAmount(int amount) {
    return amount.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );
  }
}