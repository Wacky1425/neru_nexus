import 'package:flutter/material.dart';

import 'model/transaction_model.dart';
import 'service/transaction_service.dart';
import 'transaction_form_page.dart';

enum TransactionDetailAction { edit, delete }

enum TransactionDetailResultType { updated, deleted }

class TransactionDetailResult {
  const TransactionDetailResult.updated(this.transaction)
    : type = TransactionDetailResultType.updated;

  const TransactionDetailResult.deleted()
    : type = TransactionDetailResultType.deleted,
      transaction = null;

  final TransactionDetailResultType type;
  final TransactionModel? transaction;
}

class TransactionDetailPage extends StatefulWidget {
  const TransactionDetailPage({
    super.key,
    required this.transaction,
    this.fromReview = false,
  });

  final TransactionModel transaction;
  final bool fromReview;

  @override
  State<TransactionDetailPage> createState() => _TransactionDetailPageState();
}

class _TransactionDetailPageState extends State<TransactionDetailPage> {
  final TransactionService _transactionService = const TransactionService();

  Future<List<TransactionModel>>? _settlementDetailsFuture;
  Future<List<SettlementCandidate>>? _settlementCandidatesFuture;

  bool _isConfirmingSettlement = false;

  TransactionModel get transaction => widget.transaction;

  bool get fromReview => widget.fromReview;

  @override
  void initState() {
    super.initState();

    if (transaction.settlementStatus == 'matched' &&
        transaction.settlementId.isNotEmpty &&
        transaction.type == '移動' &&
        transaction.subCategory == 'クレカ引落') {
      _settlementDetailsFuture = _transactionService.fetchTransactions(
        limit: 200,
        offset: 0,
        settlementId: transaction.settlementId,
      );
    }
    if (transaction.settlementStatus == 'review' &&
        transaction.type == '移動' &&
        transaction.subCategory == 'クレカ引落') {
      _settlementCandidatesFuture = _transactionService
          .fetchSettlementCandidates(transactionId: transaction.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isIncome = transaction.type == '収入';
    final isTransfer = transaction.type == '移動';

    return Scaffold(
      appBar: AppBar(
        title: const Text('取引詳細'),
        actions: [
          PopupMenuButton<TransactionDetailAction>(
            onSelected: (action) async {
              switch (action) {
                case TransactionDetailAction.edit:
                  await _editTransaction(context);
                  break;

                case TransactionDetailAction.delete:
                  await _deleteTransaction(context);
                  break;
              }
            },
            itemBuilder: (context) => const [
              PopupMenuItem(
                value: TransactionDetailAction.edit,
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.edit_outlined),
                  title: Text('編集'),
                ),
              ),
              PopupMenuItem(
                value: TransactionDetailAction.delete,
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.delete_outline),
                  title: Text('削除'),
                ),
              ),
            ],
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Text(
                    isTransfer
                        ? '移動'
                        : isIncome
                        ? '収入'
                        : '支出',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    '${isTransfer
                        ? ''
                        : isIncome
                        ? '+'
                        : '-'}'
                    '${_formatYen(transaction.amount)}',
                    style: const TextStyle(
                      fontSize: 34,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 20),

          _Item(title: '日付', value: transaction.transactionDate),
          _Item(title: '内容', value: _displayName(transaction)),
          _Item(title: '大カテゴリ', value: transaction.majorCategory),
          _Item(title: '小カテゴリ', value: transaction.subCategory),
          _Item(title: '支払方法', value: transaction.paymentMethod),
          _Item(title: 'Wallet', value: transaction.wallet),
          _Item(title: 'Intent', value: transaction.intent),
          _Item(title: '状態', value: transaction.status),
          if (transaction.type == '移動' && transaction.fromAccount.isNotEmpty)
            _Item(title: '移動元', value: transaction.fromAccount),

          if (transaction.type == '移動' && transaction.toAccount.isNotEmpty)
            _Item(title: '移動先', value: transaction.toAccount),
          if (transaction.settlementStatus.isNotEmpty)
            _Item(
              title: '照合状態',
              value: switch (transaction.settlementStatus) {
                'pending' => '明細待ち',
                'matched' => '照合済み',
                'review' => '要確認',
                _ => transaction.settlementStatus,
              },
            ),
          if (transaction.note.trim().isNotEmpty)
            _Item(title: 'メモ', value: transaction.note),

          if (_settlementDetailsFuture != null) ...[
            const SizedBox(height: 24),

            Text(
              'この引落の内訳',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 12),

            if (_settlementCandidatesFuture != null) ...[
              const SizedBox(height: 24),

              Text(
                '照合候補',
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 12),

              FutureBuilder<List<SettlementCandidate>>(
                future: _settlementCandidatesFuture,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(
                      child: Padding(
                        padding: EdgeInsets.all(20),
                        child: CircularProgressIndicator(),
                      ),
                    );
                  }

                  if (snapshot.hasError) {
                    return const Card(
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Text('照合候補を取得できませんでした'),
                      ),
                    );
                  }

                  final candidates = snapshot.data ?? [];

                  if (candidates.isEmpty) {
                    return const Card(
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Text('照合候補がありません'),
                      ),
                    );
                  }

                  return Column(
                    children: candidates.map((candidate) {
                      return Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                candidate.cardAccount,
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),

                              const SizedBox(height: 8),

                              Text(
                                '${candidate.firstDate}'
                                ' ～ '
                                '${candidate.lastDate}',
                              ),

                              Text(
                                '明細：'
                                '${candidate.detailCount}件',
                              ),

                              Text(
                                '明細合計：'
                                '${_formatYen(candidate.totalAmount)}',
                              ),

                              Text(
                                '引落額：'
                                '${_formatYen(candidate.settlementAmount)}',
                              ),

                              Text(
                                '差額：'
                                '${_formatSignedYen(candidate.difference)}',
                              ),

                              const SizedBox(height: 12),

                              SizedBox(
                                width: double.infinity,
                                child: FilledButton(
                                  onPressed: _isConfirmingSettlement
                                      ? null
                                      : () {
                                          _confirmSettlement(candidate);
                                        },
                                  child: const Text('この明細と紐付ける'),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    }).toList(),
                  );
                },
              ),
            ],

            FutureBuilder<List<TransactionModel>>(
              future: _settlementDetailsFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(20),
                      child: CircularProgressIndicator(),
                    ),
                  );
                }

                if (snapshot.hasError) {
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text('明細を取得できませんでした'),
                    ),
                  );
                }

                final items = (snapshot.data ?? [])
                    .where(
                      (item) => item.id != transaction.id && item.type != '移動',
                    )
                    .toList();

                if (items.isEmpty) {
                  return const Card(
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Text('紐付いたカード明細がありません'),
                    ),
                  );
                }

                final total = items.fold<int>(
                  0,
                  (sum, item) => sum + item.amount,
                );

                return Card(
                  child: Column(
                    children: [
                      for (var i = 0; i < items.length; i++) ...[
                        ListTile(
                          title: Text(_displayName(items[i])),
                          subtitle: Text(items[i].transactionDate),
                          trailing: Text(_formatYen(items[i].amount)),
                        ),

                        if (i < items.length - 1) const Divider(height: 1),
                      ],

                      const Divider(height: 1),

                      ListTile(
                        title: const Text(
                          '合計',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                        trailing: Text(
                          _formatYen(total),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _editTransaction(BuildContext context) async {
    final result = await Navigator.of(context).push<TransactionFormPageResult>(
      MaterialPageRoute(
        builder: (_) => TransactionFormPage(
          initialTransaction: transaction,
          fromReview: fromReview,
        ),
      ),
    );

    if (result == null || !context.mounted) {
      return;
    }

    final updatedTransaction = result?.transaction;

    if (updatedTransaction == null) {
      return;
    }

    if (!context.mounted) {
      return;
    }

    Navigator.of(
      context,
    ).pop(TransactionDetailResult.updated(updatedTransaction));
  }

  Future<void> _deleteTransaction(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('取引を削除しますか？'),
          content: Text('${_displayName(transaction)}を削除します。'),
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
      await const TransactionService().deleteTransaction(id: transaction.id);

      if (!context.mounted) {
        return;
      }

      // 詳細画面を閉じる
      Navigator.of(context).pop(TransactionDetailResult.deleted());
    } catch (error) {
      if (!context.mounted) {
        return;
      }

      final message = error.toString().replaceFirst('Exception: ', '');

      messenger.showSnackBar(SnackBar(content: Text(message)));
    }
  }

  static String _displayName(TransactionModel transaction) {
    if (transaction.itemName.trim().isNotEmpty) {
      return transaction.itemName.trim();
    }

    if (transaction.merchant.trim().isNotEmpty) {
      return transaction.merchant.trim();
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

  Future<void> _confirmSettlement(SettlementCandidate candidate) async {
    if (_isConfirmingSettlement) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('このカード明細と紐付けますか？'),
          content: Text(
            '${candidate.cardAccount}\n'
            '${candidate.firstDate}'
            ' ～ ${candidate.lastDate}\n\n'
            '引落額：'
            '${_formatYen(transaction.amount)}\n'
            '明細合計：'
            '${_formatYen(candidate.totalAmount)}\n'
            '差額：'
            '${_formatSignedYen(candidate.difference)}',
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
              child: const Text('紐付ける'),
            ),
          ],
        );
      },
    );

    if (confirmed != true || !mounted) {
      return;
    }

    setState(() {
      _isConfirmingSettlement = true;
    });

    try {
      await _transactionService.confirmSettlement(
        settlementTransactionId: transaction.id,
        importBatch: candidate.importBatch,
      );

      if (!mounted) {
        return;
      }

      Navigator.of(context).pop(TransactionDetailResult.updated);
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
          _isConfirmingSettlement = false;
        });
      }
    }
  }

  static String _formatSignedYen(int amount) {
    if (amount == 0) {
      return '￥0';
    }

    final sign = amount > 0 ? '+' : '-';

    return '$sign${_formatYen(amount.abs())}';
  }
}

class _Item extends StatelessWidget {
  const _Item({required this.title, required this.value});

  final String title;
  final String value;

  @override
  Widget build(BuildContext context) {
    final displayValue = value.trim().isEmpty ? '未設定' : value.trim();

    return Card(
      child: ListTile(title: Text(title), subtitle: Text(displayValue)),
    );
  }
}
