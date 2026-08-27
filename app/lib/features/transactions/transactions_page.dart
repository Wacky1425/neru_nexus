import 'package:flutter/material.dart';

import 'model/transaction_model.dart';
import 'service/transaction_service.dart';
import 'transaction_form_page.dart';
import 'transaction_detail_page.dart';
import '../../core/refresh/app_refresh_controller.dart';
import '../review/review_page.dart';
import '../review/service/review_service.dart';

class TransactionsPage extends StatefulWidget {
  const TransactionsPage({super.key});

  @override
  State<TransactionsPage> createState() => _TransactionsPageState();
}

class _TransactionsPageState extends State<TransactionsPage> {
  final TextEditingController _searchController = TextEditingController();

  String _searchKeyword = '';
  String? _selectedYearMonth;
  String? _selectedMajorCategory;
  bool _reviewOnly = false;
  final TransactionService _transactionService = const TransactionService();

  Future<List<TransactionModel>>? _transactionsFuture;
  List<TransactionModel> _transactions = [];
  final ReviewService _reviewService = const ReviewService();

  Future<int>? _reviewCountFuture;

  @override
  void initState() {
    super.initState();

    _transactionsFuture = _fetchTransactions();

    _reviewCountFuture = _reviewService.fetchReviewCount();

    AppRefreshController.dataVersion.addListener(_handleAppRefresh);
  }

  void _handleAppRefresh() {
    if (!mounted) {
      return;
    }

    setState(() {
      _transactionsFuture = _fetchTransactions();

      _reviewCountFuture = _reviewService.fetchReviewCount();
    });
  }

  Future<List<TransactionModel>> _fetchTransactions() async {
    final transactions = await _transactionService.fetchTransactions(
      limit: 100,
      offset: 0,
      keyword: _searchKeyword,
      yearMonth: _selectedYearMonth,
      majorCategory: _selectedMajorCategory,
      reviewOnly: _reviewOnly,
    );

    _transactions = transactions;

    return transactions;
  }

  Future<void> _reload() async {
    final transactionsFuture = _fetchTransactions();

    setState(() {
      _transactionsFuture = transactionsFuture;
      _reviewCountFuture = _reviewService.fetchReviewCount();
    });

    await transactionsFuture;
  }

  Future<void> _applyTransactionResult(
    TransactionModel original,
    TransactionDetailResult result,
  ) async {
    final oldNeedsReview =
        original.status == '要確認' || original.settlementStatus == 'review';

    switch (result.type) {
      case TransactionDetailResultType.updated:
        final updated = result.transaction;

        if (updated == null) {
          return;
        }

        final index = _transactions.indexWhere(
          (item) => item.id == original.id,
        );

        if (index == -1) {
          return;
        }

        _transactions[index] = updated;

        // 日付変更時などの表示順も維持する
        _transactions.sort(
          (a, b) => b.transactionDate.compareTo(a.transactionDate),
        );

        final newNeedsReview =
            updated.status == '要確認' || updated.settlementStatus == 'review';

        setState(() {
          _transactionsFuture = Future.value(
            List<TransactionModel>.from(_transactions),
          );

          // 要確認状態に影響した場合だけ件数取得
          if (oldNeedsReview != newNeedsReview) {
            _reviewCountFuture = _reviewService.fetchReviewCount();
          }
        });

        break;

      case TransactionDetailResultType.deleted:
        _transactions.removeWhere((item) => item.id == original.id);

        setState(() {
          _transactionsFuture = Future.value(
            List<TransactionModel>.from(_transactions),
          );

          if (oldNeedsReview) {
            _reviewCountFuture = _reviewService.fetchReviewCount();
          }
        });

        break;
    }
  }

  bool _matchesCurrentFilters(TransactionModel transaction) {
    if (_reviewOnly) {
      final needsReview =
          transaction.status == '要確認' ||
          transaction.settlementStatus == 'review';

      if (!needsReview) {
        return false;
      }
    }

    final selectedYearMonth = _selectedYearMonth;

    if (selectedYearMonth != null && selectedYearMonth.isNotEmpty) {
      final transactionYearMonth = transaction.transactionDate.length >= 7
          ? transaction.transactionDate.substring(0, 7)
          : '';

      if (transactionYearMonth != selectedYearMonth) {
        return false;
      }
    }

    final selectedCategory = _selectedMajorCategory;

    if (selectedCategory != null &&
        selectedCategory.isNotEmpty &&
        transaction.majorCategory != selectedCategory) {
      return false;
    }

    final keyword = _searchKeyword.trim().toLowerCase();

    if (keyword.isNotEmpty) {
      final searchable = [
        transaction.merchant,
        transaction.itemName,
        transaction.majorCategory,
        transaction.subCategory,
        transaction.paymentMethod,
        transaction.accountName,
        transaction.note,
      ].join(' ').toLowerCase();

      if (!searchable.contains(keyword)) {
        return false;
      }
    }

    return true;
  }

  Future<void> _openTransactionForm() async {
    final result = await Navigator.of(context).push<TransactionFormPageResult>(
      MaterialPageRoute(
        builder: (context) {
          return const TransactionFormPage();
        },
      ),
    );

    if (result == null || !mounted) {
      return;
    }

    final created = result.transaction;

    final shouldShow = _matchesCurrentFilters(created);

    if (shouldShow) {
      _transactions.insert(0, created);

      _transactions.sort(
        (a, b) => b.transactionDate.compareTo(a.transactionDate),
      );
    }

    setState(() {
      _transactionsFuture = Future.value(
        List<TransactionModel>.from(_transactions),
      );

      if (created.status == '要確認' || created.settlementStatus == 'review') {
        _reviewCountFuture = _reviewService.fetchReviewCount();
      }
    });

    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('取引を追加しました')));
  }

  @override
  void dispose() {
    _searchController.dispose();
    AppRefreshController.dataVersion.removeListener(_handleAppRefresh);

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('取引'),
        actions: [
          FutureBuilder<int>(
            future: _reviewCountFuture,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 12),
                  child: Center(
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                );
              }

              if (snapshot.hasError) {
                return IconButton(
                  tooltip: '要確認件数の取得に失敗しました',
                  onPressed: () {
                    setState(() {
                      _reviewCountFuture = _reviewService.fetchReviewCount();
                    });
                  },
                  icon: const Icon(Icons.warning_amber_rounded),
                );
              }

              final count = snapshot.data ?? 0;

              return IconButton(
                tooltip: '要確認 $count件',
                onPressed: () async {
                  final changed = await Navigator.of(context).push<bool>(
                    MaterialPageRoute(builder: (_) => const ReviewPage()),
                  );

                  if (changed == true && mounted) {
                    await _reload();
                  }
                },
                icon: Badge(
                  isLabelVisible: count > 0,
                  label: Text(count > 99 ? '99+' : count.toString()),
                  child: const Icon(Icons.warning_amber_rounded),
                ),
              );
            },
          ),
        ],
      ),
      body: FutureBuilder<List<TransactionModel>>(
        future: _transactionsFuture ?? _fetchTransactions(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _buildErrorState(context, snapshot.error);
          }

          final transactions = snapshot.data ?? [];

          if (transactions.isEmpty) {
            return _buildEmptyState(context);
          }

          final yearMonths = _buildYearMonths(transactions);

          final majorCategories = _buildMajorCategories(transactions);

          final filteredTransactions = transactions;

          final totalIncome = _calculateTotalIncome(filteredTransactions);

          final totalExpense = _calculateTotalExpense(filteredTransactions);

          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        textInputAction: TextInputAction.search,
                        decoration: InputDecoration(
                          labelText: '取引を検索',
                          hintText: '店名・内容・カテゴリなど',
                          prefixIcon: const Icon(Icons.search),
                          suffixIcon: _searchController.text.isEmpty
                              ? null
                              : IconButton(
                                  onPressed: () {
                                    _searchController.clear();
                                    _searchKeyword = '';

                                    setState(() {});

                                    _reload();
                                  },
                                  icon: const Icon(Icons.clear),
                                ),
                          border: const OutlineInputBorder(),
                        ),
                        onChanged: (value) {
                          _searchKeyword = value;

                          setState(() {});
                        },
                        onSubmitted: (_) {
                          FocusScope.of(context).unfocus();
                          _reload();
                        },
                      ),
                    ),

                    const SizedBox(width: 8),

                    SizedBox(
                      height: 56,
                      child: FilledButton(
                        onPressed: () {
                          _searchKeyword = _searchController.text.trim();

                          FocusScope.of(context).unfocus();

                          _reload();
                        },
                        child: const Text('検索'),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 12),

                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: yearMonths.contains(_selectedYearMonth)
                            ? _selectedYearMonth
                            : null,
                        decoration: const InputDecoration(
                          labelText: '年月',
                          border: OutlineInputBorder(),
                        ),
                        items: [
                          const DropdownMenuItem<String>(
                            value: null,
                            child: Text('すべて'),
                          ),
                          ...yearMonths.map(
                            (yearMonth) => DropdownMenuItem<String>(
                              value: yearMonth,
                              child: Text(
                                '${yearMonth.replaceFirst('-', '年')}月',
                              ),
                            ),
                          ),
                        ],
                        onChanged: (value) {
                          setState(() {
                            _selectedYearMonth = value;
                          });
                          _reload();
                        },
                      ),
                    ),

                    const SizedBox(width: 12),

                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue:
                            majorCategories.contains(_selectedMajorCategory)
                            ? _selectedMajorCategory
                            : null,
                        decoration: const InputDecoration(
                          labelText: '大カテゴリ',
                          border: OutlineInputBorder(),
                        ),
                        items: [
                          const DropdownMenuItem<String>(
                            value: null,
                            child: Text('すべて'),
                          ),
                          ...majorCategories.map(
                            (category) => DropdownMenuItem<String>(
                              value: category,
                              child: Text(category),
                            ),
                          ),
                        ],
                        onChanged: (value) {
                          setState(() {
                            _selectedMajorCategory = value;
                          });
                          _reload();
                        },
                      ),
                    ),
                  ],
                ),

                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('要確認のみ表示'),
                  value: _reviewOnly,
                  onChanged: (value) {
                    setState(() {
                      _reviewOnly = value;
                    });
                    _reload();
                  },
                ),

                const SizedBox(height: 8),

                Text(
                  '${filteredTransactions.length}件表示',
                  style: Theme.of(context).textTheme.bodySmall,
                ),

                const SizedBox(height: 12),

                _MonthlySummaryCard(income: totalIncome, expense: totalExpense),

                const SizedBox(height: 20),

                Text(
                  '取引履歴',
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                ),

                const SizedBox(height: 12),

                ..._buildGroupedTransactions(context, filteredTransactions),
              ],
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openTransactionForm,
        icon: const Icon(Icons.add_rounded),
        label: const Text('取引を追加'),
      ),
    );
  }

  Widget _buildErrorState(BuildContext context, Object? error) {
    final message = error.toString().replaceFirst('Exception: ', '');

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.error_outline,
              size: 64,
              color: Theme.of(context).colorScheme.error,
            ),

            const SizedBox(height: 16),

            Text(
              '取引一覧を取得できませんでした',
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 8),

            Text(message, textAlign: TextAlign.center),

            const SizedBox(height: 24),

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

  Widget _buildEmptyState(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.65,
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.receipt_long_outlined,
                      size: 72,
                      color: Theme.of(context).colorScheme.outline,
                    ),

                    const SizedBox(height: 16),

                    Text(
                      '取引がまだありません',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),

                    const SizedBox(height: 8),

                    const Text(
                      '右下のボタンから取引を追加してください。',
                      textAlign: TextAlign.center,
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
            ),
          ),
        ],
      ),
    );
  }

  List<String> _buildYearMonths(List<TransactionModel> transactions) {
    final values = <String>{};

    for (final transaction in transactions) {
      final date = DateTime.tryParse(transaction.transactionDate);

      if (date == null) {
        continue;
      }

      values.add(
        '${date.year.toString().padLeft(4, '0')}-'
        '${date.month.toString().padLeft(2, '0')}',
      );
    }

    final result = values.toList()..sort((a, b) => b.compareTo(a));

    return result;
  }

  List<String> _buildMajorCategories(List<TransactionModel> transactions) {
    final values =
        transactions
            .map((transaction) => transaction.majorCategory.trim())
            .where((value) => value.isNotEmpty)
            .toSet()
            .toList()
          ..sort();

    return values;
  }

  List<Widget> _buildGroupedTransactions(
    BuildContext context,
    List<TransactionModel> transactions,
  ) {
    final grouped = <DateTime, List<TransactionModel>>{};

    for (final transaction in transactions) {
      final parsedDate = DateTime.tryParse(transaction.transactionDate);

      if (parsedDate == null) {
        continue;
      }

      final date = DateTime(parsedDate.year, parsedDate.month, parsedDate.day);

      grouped.putIfAbsent(date, () => []);

      grouped[date]!.add(transaction);
    }

    final dates = grouped.keys.toList()..sort((a, b) => b.compareTo(a));

    final widgets = <Widget>[];

    for (final date in dates) {
      widgets.add(
        Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 8),
          child: Text(
            _formatDateLabel(date),
            style: Theme.of(
              context,
            ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
          ),
        ),
      );

      final dailyTransactions = grouped[date]!;

      widgets.add(
        Card(
          margin: EdgeInsets.zero,
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              for (
                var index = 0;
                index < dailyTransactions.length;
                index++
              ) ...[
                _TransactionTile(
                  transaction: dailyTransactions[index],
                  onResult: (result) {
                    return _applyTransactionResult(
                      dailyTransactions[index],
                      result,
                    );
                  },
                ),
                if (index < dailyTransactions.length - 1)
                  const Divider(height: 1, indent: 68),
              ],
            ],
          ),
        ),
      );

      widgets.add(const SizedBox(height: 12));
    }

    if (widgets.isEmpty) {
      return [
        const Card(
          child: Padding(
            padding: EdgeInsets.all(20),
            child: Text('表示できる取引がありません'),
          ),
        ),
      ];
    }

    return widgets;
  }

  static int _calculateTotalIncome(List<TransactionModel> transactions) {
    return transactions
        .where((transaction) => transaction.type == '収入')
        .fold(0, (total, transaction) => total + transaction.amount);
  }

  static int _calculateTotalExpense(List<TransactionModel> transactions) {
    return transactions
        .where((transaction) => transaction.type == '支出')
        .fold(0, (total, transaction) => total + transaction.amount);
  }

  static String _formatDateLabel(DateTime date) {
    final now = DateTime.now();

    final today = DateTime(now.year, now.month, now.day);

    final yesterday = today.subtract(const Duration(days: 1));

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
  const _MonthlySummaryCard({required this.income, required this.expense});

  final int income;
  final int expense;

  @override
  Widget build(BuildContext context) {
    final balance = income - expense;

    final colorScheme = Theme.of(context).colorScheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '取得した取引の収支',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 16),

            Row(
              children: [
                Expanded(
                  child: _SummaryValue(
                    label: '収入',
                    amount: income,
                    icon: Icons.arrow_downward_rounded,
                    color: colorScheme.tertiary,
                  ),
                ),

                const SizedBox(width: 12),

                Expanded(
                  child: _SummaryValue(
                    label: '支出',
                    amount: expense,
                    icon: Icons.arrow_upward_rounded,
                    color: colorScheme.error,
                  ),
                ),
              ],
            ),

            const Divider(height: 32),

            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('差額', style: TextStyle(fontWeight: FontWeight.bold)),

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
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: color),

              const SizedBox(width: 4),

              Text(label, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),

          const SizedBox(height: 8),

          Text(
            _formatYen(amount),
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}

class _TransactionTile extends StatelessWidget {
  const _TransactionTile({required this.transaction, required this.onResult});

  final TransactionModel transaction;

  final Future<void> Function(TransactionDetailResult result) onResult;

  @override
  Widget build(BuildContext context) {
    final isIncome = transaction.type == '収入';

    final colorScheme = Theme.of(context).colorScheme;

    final transactionColor = isIncome
        ? colorScheme.tertiary
        : colorScheme.error;

    final displayName = transaction.merchant.trim().isNotEmpty
        ? transaction.merchant.trim()
        : transaction.itemName.trim().isNotEmpty
        ? transaction.itemName.trim()
        : '名称なし';

    final category = transaction.subCategory.trim().isNotEmpty
        ? transaction.subCategory.trim()
        : transaction.majorCategory.trim().isNotEmpty
        ? transaction.majorCategory.trim()
        : '未分類';

    final subtitleParts = <String>[category];

    if (transaction.paymentMethod.trim().isNotEmpty) {
      subtitleParts.add(transaction.paymentMethod.trim());
    }

    return ListTile(
      onTap: () async {
        final result = await Navigator.of(context)
            .push<TransactionDetailResult>(
              MaterialPageRoute(
                builder: (_) => TransactionDetailPage(transaction: transaction),
              ),
            );

        if (result != null) {
          await onResult(result);
        }
      },

      onLongPress: () {
        _showActionSheet(context);
      },

      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),

      leading: CircleAvatar(
        backgroundColor: transactionColor.withValues(alpha: 0.12),
        child: Icon(_categoryIcon(category), color: transactionColor),
      ),

      title: Row(
        children: [
          Expanded(
            child: Text(
              displayName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),

          if (transaction.isPreliminary) ...[
            const SizedBox(width: 8),

            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: colorScheme.secondaryContainer,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '速報',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: colorScheme.onSecondaryContainer,
                ),
              ),
            ),
          ],
        ],
      ),

      subtitle: Text(
        subtitleParts.join(' ・ '),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),

      trailing: Text(
        '${isIncome ? '+' : '-'}'
        '${_formatYen(transaction.amount)}',
        style: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.bold,
          color: transactionColor,
        ),
      ),
    );
  }

  Future<void> _showActionSheet(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        final displayName = transaction.merchant.trim().isNotEmpty
            ? transaction.merchant.trim()
            : transaction.itemName.trim().isNotEmpty
            ? transaction.itemName.trim()
            : '名称なし';

        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 4, 24, 12),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(sheetContext).textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.bold),
                  ),
                ),
              ),

              ListTile(
                leading: const Icon(Icons.edit_outlined),
                title: const Text('編集'),
                onTap: () async {
                  Navigator.of(sheetContext).pop();

                  final result = await Navigator.of(context)
                      .push<TransactionFormPageResult>(
                        MaterialPageRoute(
                          builder: (_) => TransactionFormPage(
                            initialTransaction: transaction,
                          ),
                        ),
                      );

                  if (result != null) {
                    await onResult(
                      TransactionDetailResult.updated(result.transaction),
                    );
                  }
                },
              ),

              ListTile(
                leading: Icon(
                  Icons.delete_outline,
                  color: Theme.of(sheetContext).colorScheme.error,
                ),
                title: Text(
                  '削除',
                  style: TextStyle(
                    color: Theme.of(sheetContext).colorScheme.error,
                  ),
                ),
                onTap: () async {
                  Navigator.of(sheetContext).pop();

                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (dialogContext) {
                      return AlertDialog(
                        title: const Text('取引を削除しますか？'),
                        content: Text('$displayNameを削除します。'),
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
                            child: const Text('削除する'),
                          ),
                        ],
                      );
                    },
                  );

                  if (confirmed != true || !context.mounted) {
                    return;
                  }

                  try {
                    await const TransactionService().deleteTransaction(
                      id: transaction.id,
                    );

                    if (!context.mounted) {
                      return;
                    }

                    await onResult(const TransactionDetailResult.deleted());
                  } catch (error) {
                    if (!context.mounted) {
                      return;
                    }

                    final message = error.toString().replaceFirst(
                      'Exception: ',
                      '',
                    );

                    ScaffoldMessenger.of(
                      context,
                    ).showSnackBar(SnackBar(content: Text(message)));
                  }
                },
              ),

              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  static IconData _categoryIcon(String category) {
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
  final formatted = amount.abs().toString().replaceAllMapped(
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
