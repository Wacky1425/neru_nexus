import 'package:flutter/material.dart';

import 'model/transaction_model.dart';
import 'service/transaction_service.dart';
import 'transaction_form_page.dart';

enum TransactionDetailAction { edit, delete }

enum TransactionDetailResult { updated, deleted }

class TransactionDetailPage extends StatelessWidget {
  const TransactionDetailPage({super.key, required this.transaction});

  final TransactionModel transaction;

  @override
  Widget build(BuildContext context) {
    final isIncome = transaction.type == '収入';

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
                    isIncome ? '収入' : '支出',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    '${isIncome ? '+' : '-'}'
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
        ],
      ),
    );
  }

  Future<void> _editTransaction(BuildContext context) async {
    final result = await Navigator.of(context).push<TransactionFormResult>(
      MaterialPageRoute(
        builder: (_) => TransactionFormPage(initialTransaction: transaction),
      ),
    );

    if (result == null || !context.mounted) {
      return;
    }

    Navigator.of(context).pop(TransactionDetailResult.updated);
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

      // ダイアログやメニューのNavigator処理が
      // 完全に終わるのを少し待つ
      await Future<void>.delayed(const Duration(milliseconds: 100));

      if (!context.mounted) {
        return;
      }

      // 詳細画面を閉じる
      Navigator.of(context).pop(TransactionDetailResult.deleted);
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
