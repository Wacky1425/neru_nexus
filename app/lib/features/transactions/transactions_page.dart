import 'package:flutter/material.dart';

import 'transaction_form_page.dart';

class TransactionsPage extends StatefulWidget {
  const TransactionsPage({
    super.key,
  });

  @override
  State<TransactionsPage> createState() =>
      _TransactionsPageState();
}

class _TransactionsPageState
    extends State<TransactionsPage> {
  final List<TransactionFormResult> _transactions = [
    TransactionFormResult(
      date: DateTime.now(),
      type: TransactionType.expense,
      amount: 780,
      category: '食費',
      title: 'スーパー',
      paymentMethod: 'クレジットカード',
    ),
    TransactionFormResult(
      date: DateTime.now(),
      type: TransactionType.expense,
      amount: 200,
      category: '食費',
      title: '社食',
      paymentMethod: '現金',
    ),
    TransactionFormResult(
      date: DateTime.now().subtract(
        const Duration(days: 1),
      ),
      type: TransactionType.expense,
      amount: 540,
      category: '外食',
      title: '昼ごはん',
      paymentMethod: 'PayPay',
    ),
  ];

  int get _totalExpense {
    return _transactions
        .where(
          (transaction) =>
              transaction.type ==
              TransactionType.expense,
        )
        .fold(
          0,
          (total, transaction) =>
              total + transaction.amount,
        );
  }

  int get _totalIncome {
    return _transactions
        .where(
          (transaction) =>
              transaction.type ==
              TransactionType.income,
        )
        .fold(
          0,
          (total, transaction) =>
              total + transaction.amount,
        );
  }

  Future<void> _openTransactionForm() async {
    final result =
        await Navigator.of(context).push<
            TransactionFormResult>(
      MaterialPageRoute(
        builder: (context) {
          return const TransactionFormPage();
        },
      ),
    );

    if (result == null || !mounted) {
      return;
    }

    setState(() {
      _transactions.insert(0, result);

      _transactions.sort(
        (a, b) => b.date.compareTo(a.date),
      );
    });

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('取引を追加しました'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('取引'),
      ),
      body: _transactions.isEmpty
          ? _buildEmptyState(context)
          : RefreshIndicator(
              onRefresh: () async {},
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  16,
                  8,
                  16,
                  100,
                ),
                children: [
                  _MonthlySummaryCard(
                    income: _totalIncome,
                    expense: _totalExpense,
                  ),

                  const SizedBox(height: 20),

                  Text(
                    '取引履歴',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),

                  const SizedBox(height: 12),

                  ..._buildGroupedTransactions(
                    context,
                  ),
                ],
              ),
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openTransactionForm,
        icon: const Icon(Icons.add_rounded),
        label: const Text('取引を追加'),
      ),
    );
  }

  Widget _buildEmptyState(
    BuildContext context,
  ) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.receipt_long_outlined,
              size: 72,
              color: Theme.of(context)
                  .colorScheme
                  .outline,
            ),
            const SizedBox(height: 16),
            Text(
              '取引がまだありません',
              style: Theme.of(context)
                  .textTheme
                  .titleLarge
                  ?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              '右下のボタンから最初の取引を追加してください。',
              textAlign: TextAlign.center,
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _openTransactionForm,
              icon: const Icon(Icons.add),
              label: const Text('取引を追加'),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildGroupedTransactions(
    BuildContext context,
  ) {
    final grouped =
        <DateTime, List<TransactionFormResult>>{};

    for (final transaction in _transactions) {
      final date = DateTime(
        transaction.date.year,
        transaction.date.month,
        transaction.date.day,
      );

      grouped.putIfAbsent(date, () => []);
      grouped[date]!.add(transaction);
    }

    final dates = grouped.keys.toList()
      ..sort(
        (a, b) => b.compareTo(a),
      );

    final widgets = <Widget>[];

    for (final date in dates) {
      widgets.add(
        Padding(
          padding: const EdgeInsets.only(
            top: 8,
            bottom: 8,
          ),
          child: Text(
            _formatDateLabel(date),
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
        ),
      );

      widgets.add(
        Card(
          margin: EdgeInsets.zero,
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              for (
                var index = 0;
                index < grouped[date]!.length;
                index++
              ) ...[
                _TransactionTile(
                  transaction:
                      grouped[date]![index],
                ),
                if (
                  index <
                      grouped[date]!.length - 1
                )
                  const Divider(
                    height: 1,
                    indent: 68,
                  ),
              ],
            ],
          ),
        ),
      );

      widgets.add(
        const SizedBox(height: 12),
      );
    }

    return widgets;
  }

  static String _formatDateLabel(DateTime date) {
    final now = DateTime.now();

    final today = DateTime(
      now.year,
      now.month,
      now.day,
    );

    final yesterday = today.subtract(
      const Duration(days: 1),
    );

    if (date == today) {
      return '今日';
    }

    if (date == yesterday) {
      return '昨日';
    }

    return '${date.month}月${date.day}日';
  }
}

class _MonthlySummaryCard extends StatelessWidget {
  const _MonthlySummaryCard({
    required this.income,
    required this.expense,
  });

  final int income;
  final int expense;

  @override
  Widget build(BuildContext context) {
    final balance = income - expense;
    final colorScheme =
        Theme.of(context).colorScheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment:
              CrossAxisAlignment.start,
          children: [
            Text(
              '今月の収支',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),

            const SizedBox(height: 16),

            Row(
              children: [
                Expanded(
                  child: _SummaryValue(
                    label: '収入',
                    amount: income,
                    icon:
                        Icons.arrow_downward_rounded,
                    color: colorScheme.tertiary,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _SummaryValue(
                    label: '支出',
                    amount: expense,
                    icon:
                        Icons.arrow_upward_rounded,
                    color: colorScheme.error,
                  ),
                ),
              ],
            ),

            const Divider(height: 32),

            Row(
              mainAxisAlignment:
                  MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  '差額',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  _formatSignedYen(balance),
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: balance >= 0
                        ? colorScheme.primary
                        : colorScheme.error,
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
  const _SummaryValue({
    required this.label,
    required this.amount,
    required this.icon,
    required this.color,
  });

  final String label;
  final int amount;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(
          alpha: 0.1,
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment:
            CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                icon,
                size: 18,
                color: color,
              ),
              const SizedBox(width: 4),
              Text(
                label,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            _formatYen(amount),
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

class _TransactionTile extends StatelessWidget {
  const _TransactionTile({
    required this.transaction,
  });

  final TransactionFormResult transaction;

  @override
  Widget build(BuildContext context) {
    final isExpense =
        transaction.type ==
        TransactionType.expense;

    final colorScheme =
        Theme.of(context).colorScheme;

    final transactionColor = isExpense
        ? colorScheme.error
        : colorScheme.tertiary;

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 6,
      ),
      leading: CircleAvatar(
        backgroundColor:
            transactionColor.withValues(
          alpha: 0.12,
        ),
        child: Icon(
          _categoryIcon(
            transaction.category,
          ),
          color: transactionColor,
        ),
      ),
      title: Text(
        transaction.title,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          fontWeight: FontWeight.bold,
        ),
      ),
      subtitle: Text(
        '${transaction.category}'
        ' ・ '
        '${transaction.paymentMethod}',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: Text(
        '${isExpense ? '-' : '+'}'
        '${_formatYen(transaction.amount)}',
        style: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.bold,
          color: transactionColor,
        ),
      ),
    );
  }

  static IconData _categoryIcon(
    String category,
  ) {
    switch (category) {
      case '食費':
      case '外食':
        return Icons.restaurant_outlined;

      case '日用品':
        return Icons.shopping_bag_outlined;

      case '交通費':
        return Icons.train_outlined;

      case '娯楽':
        return Icons.sports_esports_outlined;

      case '衣服':
        return Icons.checkroom_outlined;

      case '美容':
        return Icons.content_cut_outlined;

      case '医療':
        return Icons.medical_services_outlined;

      case '通信費':
        return Icons.smartphone_outlined;

      case '水道光熱費':
        return Icons.bolt_outlined;

      case '家賃':
        return Icons.home_outlined;

      case '給与':
        return Icons.work_outline_rounded;

      case '副業':
        return Icons.computer_outlined;

      default:
        return Icons.receipt_long_outlined;
    }
  }
}

String _formatYen(int amount) {
  final formatted = amount
      .abs()
      .toString()
      .replaceAllMapped(
        RegExp(r'\B(?=(\d{3})+(?!\d))'),
        (_) => ',',
      );

  return '￥$formatted';
}

String _formatSignedYen(int amount) {
  final sign = amount > 0
      ? '+'
      : amount < 0
          ? '-'
          : '';

  return '$sign${_formatYen(amount)}';
}