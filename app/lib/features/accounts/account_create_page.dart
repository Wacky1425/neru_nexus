import 'package:flutter/material.dart';

import 'service/account_balance_service.dart';

class AccountCreatePage extends StatefulWidget {
  const AccountCreatePage({super.key});

  @override
  State<AccountCreatePage> createState() => _AccountCreatePageState();
}

class _AccountCreatePageState extends State<AccountCreatePage> {
  final _service = const AccountBalanceService();

  final _accountNameController = TextEditingController();
  final _institutionController = TextEditingController();
  final _balanceController = TextEditingController(text: '0');

  String _paymentMethod = '銀行';
  String _wallet = '生活';
  String _assetType = 'cash';

  bool _isLiability = false;
  bool _saving = false;

  DateTime? _openingBalanceDate;

  @override
  void dispose() {
    _accountNameController.dispose();
    _institutionController.dispose();
    _balanceController.dispose();

    super.dispose();
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

    final accountName = _accountNameController.text.trim();

    final institution = _institutionController.text.trim();

    if (accountName.isEmpty) {
      _showMessage('口座名を入力してください');
      return;
    }

    final balanceText = _balanceController.text
        .replaceAll(',', '')
        .replaceAll('￥', '')
        .replaceAll('¥', '')
        .trim();

    final openingBalance = int.tryParse(balanceText);

    if (openingBalance == null) {
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
      await _service.createAccount(
        accountName: accountName,
        paymentMethod: _paymentMethod,
        wallet: _wallet,
        institution: institution,
        assetType: _isLiability ? 'liability' : _assetType,
        isAsset: !_isLiability,
        isLiability: _isLiability,
        openingBalance: openingBalance,
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
      appBar: AppBar(title: const Text('口座を追加')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _accountNameController,
            decoration: const InputDecoration(
              labelText: '口座名',
              hintText: '例：楽天カード',
              border: OutlineInputBorder(),
            ),
          ),

          const SizedBox(height: 20),

          DropdownButtonFormField<String>(
            initialValue: _paymentMethod,
            decoration: const InputDecoration(
              labelText: '種類',
              border: OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: '銀行', child: Text('銀行')),
              DropdownMenuItem(value: 'クレジットカード', child: Text('クレジットカード')),
              DropdownMenuItem(value: '電子マネー', child: Text('電子マネー')),
              DropdownMenuItem(value: '現金', child: Text('現金')),
              DropdownMenuItem(value: 'その他', child: Text('その他')),
            ],
            onChanged: (value) {
              if (value == null) {
                return;
              }

              setState(() {
                _paymentMethod = value;

                if (value == 'クレジットカード') {
                  _isLiability = true;
                } else {
                  _isLiability = false;
                }
              });
            },
          ),

          const SizedBox(height: 20),

          DropdownButtonFormField<String>(
            initialValue: _wallet,
            decoration: const InputDecoration(
              labelText: 'Wallet',
              border: OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: '生活', child: Text('生活')),
              DropdownMenuItem(value: '事業', child: Text('事業')),
            ],
            onChanged: (value) {
              if (value == null) {
                return;
              }

              setState(() {
                _wallet = value;
              });
            },
          ),

          const SizedBox(height: 20),

          TextField(
            controller: _institutionController,
            decoration: const InputDecoration(
              labelText: '金融機関',
              hintText: '例：楽天カード株式会社',
              border: OutlineInputBorder(),
            ),
          ),

          const SizedBox(height: 20),

          SegmentedButton<bool>(
            segments: const [
              ButtonSegment<bool>(
                value: false,
                label: Text('資産'),
                icon: Icon(Icons.account_balance_wallet_outlined),
              ),
              ButtonSegment<bool>(
                value: true,
                label: Text('負債'),
                icon: Icon(Icons.credit_card),
              ),
            ],
            selected: {_isLiability},
            onSelectionChanged: (selection) {
              setState(() {
                _isLiability = selection.first;
              });
            },
          ),

          const SizedBox(height: 20),

          if (!_isLiability)
            DropdownButtonFormField<String>(
              initialValue: _assetType,
              decoration: const InputDecoration(
                labelText: '資産区分',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'cash', child: Text('現金・預金')),
                DropdownMenuItem(value: 'investment', child: Text('投資')),
                DropdownMenuItem(value: 'other', child: Text('その他資産')),
              ],
              onChanged: (value) {
                if (value != null) {
                  setState(() => _assetType = value);
                }
              },
            ),

          if (!_isLiability) const SizedBox(height: 24),

          TextField(
            controller: _balanceController,
            keyboardType: const TextInputType.numberWithOptions(signed: true),
            decoration: const InputDecoration(
              labelText: '基準残高',
              prefixText: '￥ ',
              border: OutlineInputBorder(),
              helperText: '基準日の終了時点での残高',
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
                  : const Text('追加'),
            ),
          ),
        ],
      ),
    );
  }
}
