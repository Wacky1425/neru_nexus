import 'package:flutter/material.dart';

import 'model/account_balance_model.dart';
import 'service/account_balance_service.dart';

class AccountEditPage extends StatefulWidget {
  const AccountEditPage({super.key, required this.account});

  final AccountBalanceModel account;

  @override
  State<AccountEditPage> createState() => _AccountEditPageState();
}

class _AccountEditPageState extends State<AccountEditPage> {
  final _service = const AccountBalanceService();

  late final TextEditingController _balanceController;

  DateTime? _openingBalanceDate;

  bool _saving = false;

  @override
  void initState() {
    super.initState();

    _balanceController = TextEditingController(
      text: widget.account.openingBalance.toString(),
    );

    _openingBalanceDate = _parseDate(widget.account.openingBalanceDate);
  }

  @override
  void dispose() {
    _balanceController.dispose();
    super.dispose();
  }

  DateTime? _parseDate(String value) {
    if (value.trim().isEmpty) {
      return null;
    }

    return DateTime.tryParse(value);
  }

  Future<void> _selectDate() async {
    final now = DateTime.now();

    final selected = await showDatePicker(
      context: context,
      initialDate: _openingBalanceDate ?? now,
      firstDate: DateTime(2000),
      lastDate: DateTime(now.year + 10),
    );

    if (selected == null) {
      return;
    }

    setState(() {
      _openingBalanceDate = selected;
    });
  }

  Future<void> _save() async {
    if (_saving) {
      return;
    }

    final balanceText = _balanceController.text
        .replaceAll(',', '')
        .replaceAll('￥', '')
        .replaceAll('¥', '')
        .trim();

    final balance = int.tryParse(balanceText);

    if (balance == null) {
      _showMessage('基準残高を正しく入力してください');
      return;
    }

    final date = _openingBalanceDate;

    if (date == null) {
      _showMessage('基準日を選択してください');
      return;
    }

    setState(() {
      _saving = true;
    });

    try {
      await _service.updateOpeningBalance(
        accountId: widget.account.accountId,
        openingBalance: balance,
        openingBalanceDate: _formatApiDate(date),
      );

      if (!mounted) {
        return;
      }

      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) {
        return;
      }

      _showMessage(error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  String _formatApiDate(DateTime date) {
    final year = date.year.toString().padLeft(4, '0');
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');

    return '$year-$month-$day';
  }

  String _formatDisplayDate(DateTime date) {
    return '${date.year}年'
        '${date.month}月'
        '${date.day}日';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('口座設定')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            widget.account.accountName,
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 8),

          if (widget.account.institution.isNotEmpty)
            Text(
              widget.account.institution,
              style: Theme.of(context).textTheme.bodyMedium,
            ),

          const SizedBox(height: 32),

          TextField(
            controller: _balanceController,
            keyboardType: const TextInputType.numberWithOptions(signed: true),
            decoration: const InputDecoration(
              labelText: '基準残高',
              prefixText: '￥ ',
              border: OutlineInputBorder(),
              helperText: 'この基準日時点での実際の残高',
            ),
          ),

          const SizedBox(height: 24),

          InkWell(
            onTap: _selectDate,
            borderRadius: BorderRadius.circular(12),
            child: InputDecorator(
              decoration: const InputDecoration(
                labelText: '基準日',
                border: OutlineInputBorder(),
                suffixIcon: Icon(Icons.calendar_month_outlined),
              ),
              child: Text(
                _openingBalanceDate == null
                    ? '基準日を選択'
                    : _formatDisplayDate(_openingBalanceDate!),
              ),
            ),
          ),

          const SizedBox(height: 32),

          FilledButton(
            onPressed: _saving ? null : _save,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 14),
              child: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('保存'),
            ),
          ),
        ],
      ),
    );
  }
}
