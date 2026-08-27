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

  late final TextEditingController _accountNameController;

  late final TextEditingController _paymentMethodController;

  late final TextEditingController _institutionController;

  late final TextEditingController _balanceController;

  late String _wallet;

  late bool _isAsset;
  late bool _isLiability;

  late int _closingDay;
  late int _paymentDay;
  late int _paymentMonthOffset;

  DateTime? _openingBalanceDate;

  bool _saving = false;
  bool _deleting = false;

  @override
  void initState() {
    super.initState();

    final account = widget.account;

    _accountNameController = TextEditingController(text: account.accountName);

    _paymentMethodController = TextEditingController(
      text: account.paymentMethod,
    );

    _institutionController = TextEditingController(text: account.institution);

    _balanceController = TextEditingController(
      text: account.openingBalance.toString(),
    );

    _wallet = account.wallet.isEmpty ? '生活' : account.wallet;

    _isAsset = account.isAsset;

    _isLiability = account.isLiability;

    _closingDay = account.closingDay;

    _paymentDay = account.paymentDay;

    _paymentMonthOffset = account.paymentMonthOffset;

    _openingBalanceDate = _parseDate(account.openingBalanceDate);
  }

  @override
  void dispose() {
    _accountNameController.dispose();
    _paymentMethodController.dispose();
    _institutionController.dispose();
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
    if (_saving || _deleting) {
      return;
    }

    final accountName = _accountNameController.text.trim();

    final paymentMethod = _paymentMethodController.text.trim();

    final institution = _institutionController.text.trim();

    if (accountName.isEmpty) {
      _showMessage('口座名を入力してください');
      return;
    }

    if (paymentMethod.isEmpty) {
      _showMessage('支払方法を入力してください');
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

    if (_isAsset && _isLiability) {
      _showMessage('資産と負債を同時には選択できません');
      return;
    }

    if (_isLiability) {
      if (_closingDay < 1 || _closingDay > 31) {
        _showMessage('締め日を設定してください');
        return;
      }

      if (_paymentDay < 1 || _paymentDay > 31) {
        _showMessage('支払日を設定してください');
        return;
      }
    }

    setState(() {
      _saving = true;
    });

    try {
      final result = await _service.updateAccount(
        accountId: widget.account.accountId,
        accountName: accountName,
        paymentMethod: paymentMethod,
        wallet: _wallet,
        institution: institution,
        isAsset: _isAsset,
        isLiability: _isLiability,
        openingBalance: balance,
        openingBalanceDate: _formatApiDate(date),
        closingDay: _isLiability ? _closingDay : 0,
        paymentDay: _isLiability ? _paymentDay : 0,
        paymentMonthOffset: _isLiability ? _paymentMonthOffset : 0,
      );

      if (!mounted) {
        return;
      }

      Navigator.of(context).pop(result);
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

  Future<void> _delete() async {
    if (_saving || _deleting) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('口座を削除しますか？'),
          content: Text(
            '${widget.account.accountName}を'
            '口座一覧から削除します。\n\n'
            '過去の取引は削除されません。',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop(false);
              },
              child: const Text('キャンセル'),
            ),
            FilledButton(
              onPressed: () {
                Navigator.of(context).pop(true);
              },
              child: const Text('削除'),
            ),
          ],
        );
      },
    );

    if (confirmed != true || !mounted) {
      return;
    }

    setState(() {
      _deleting = true;
    });

    try {
      await _service.deactivateAccount(accountId: widget.account.accountId);

      if (!mounted) {
        return;
      }

      Navigator.of(context).pop(const AccountEditDeletedResult());
    } catch (error) {
      if (!mounted) {
        return;
      }

      _showMessage(error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) {
        setState(() {
          _deleting = false;
        });
      }
    }
  }

  void _setAccountType({required bool asset, required bool liability}) {
    setState(() {
      _isAsset = asset;
      _isLiability = liability;
    });
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

  String _closingDayText(int value) {
    if (value == 31) {
      return '月末';
    }

    return '$value日';
  }

  @override
  Widget build(BuildContext context) {
    final busy = _saving || _deleting;

    return Scaffold(
      appBar: AppBar(title: const Text('口座設定')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _accountNameController,
            enabled: !busy,
            decoration: const InputDecoration(
              labelText: '口座名',
              border: OutlineInputBorder(),
            ),
          ),

          const SizedBox(height: 16),

          TextField(
            controller: _paymentMethodController,
            enabled: !busy,
            decoration: const InputDecoration(
              labelText: '支払方法',
              border: OutlineInputBorder(),
            ),
          ),

          const SizedBox(height: 16),

          TextField(
            controller: _institutionController,
            enabled: !busy,
            decoration: const InputDecoration(
              labelText: '金融機関',
              border: OutlineInputBorder(),
            ),
          ),

          const SizedBox(height: 16),

          DropdownButtonFormField<String>(
            initialValue: _wallet,
            decoration: const InputDecoration(
              labelText: 'ウォレット',
              border: OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: '生活', child: Text('生活')),
              DropdownMenuItem(value: '事業', child: Text('事業')),
            ],
            onChanged: busy
                ? null
                : (value) {
                    if (value == null) {
                      return;
                    }

                    setState(() {
                      _wallet = value;
                    });
                  },
          ),

          const SizedBox(height: 24),

          Text('口座種別', style: Theme.of(context).textTheme.titleMedium),

          const SizedBox(height: 8),

          SegmentedButton<String>(
            segments: const [
              ButtonSegment(
                value: 'asset',
                label: Text('資産'),
                icon: Icon(Icons.account_balance_wallet_outlined),
              ),
              ButtonSegment(
                value: 'liability',
                label: Text('負債'),
                icon: Icon(Icons.credit_card),
              ),
              ButtonSegment(value: 'none', label: Text('その他')),
            ],
            selected: {
              _isAsset
                  ? 'asset'
                  : _isLiability
                  ? 'liability'
                  : 'none',
            },
            onSelectionChanged: busy
                ? null
                : (selection) {
                    final value = selection.first;

                    if (value == 'asset') {
                      _setAccountType(asset: true, liability: false);
                    } else if (value == 'liability') {
                      _setAccountType(asset: false, liability: true);
                    } else {
                      _setAccountType(asset: false, liability: false);
                    }
                  },
          ),

          if (_isLiability) ...[
            const SizedBox(height: 24),

            const Divider(),

            const SizedBox(height: 12),

            Text('カード請求設定', style: Theme.of(context).textTheme.titleMedium),

            const SizedBox(height: 6),

            Text(
              'カード明細と銀行引落の'
              '自動照合に使用します。',
              style: Theme.of(context).textTheme.bodySmall,
            ),

            const SizedBox(height: 16),

            DropdownButtonFormField<int>(
              initialValue: _closingDay > 0 ? _closingDay : null,
              decoration: const InputDecoration(
                labelText: '締め日',
                border: OutlineInputBorder(),
              ),
              hint: const Text('締め日を選択'),
              items: List.generate(31, (index) {
                final value = index + 1;

                return DropdownMenuItem(
                  value: value,
                  child: Text(_closingDayText(value)),
                );
              }),
              onChanged: busy
                  ? null
                  : (value) {
                      if (value == null) {
                        return;
                      }

                      setState(() {
                        _closingDay = value;
                      });
                    },
            ),

            const SizedBox(height: 16),

            DropdownButtonFormField<int>(
              initialValue: _paymentDay > 0 ? _paymentDay : null,
              decoration: const InputDecoration(
                labelText: '支払日',
                border: OutlineInputBorder(),
              ),
              hint: const Text('支払日を選択'),
              items: List.generate(31, (index) {
                final value = index + 1;

                return DropdownMenuItem(value: value, child: Text('$value日'));
              }),
              onChanged: busy
                  ? null
                  : (value) {
                      if (value == null) {
                        return;
                      }

                      setState(() {
                        _paymentDay = value;
                      });
                    },
            ),

            const SizedBox(height: 16),

            DropdownButtonFormField<int>(
              initialValue: _paymentMonthOffset,
              decoration: const InputDecoration(
                labelText: '支払月',
                border: OutlineInputBorder(),
                helperText: '締め月から何か月後に支払うか',
              ),
              items: const [
                DropdownMenuItem(value: 0, child: Text('当月')),
                DropdownMenuItem(value: 1, child: Text('翌月')),
                DropdownMenuItem(value: 2, child: Text('翌々月')),
              ],
              onChanged: busy
                  ? null
                  : (value) {
                      if (value == null) {
                        return;
                      }

                      setState(() {
                        _paymentMonthOffset = value;
                      });
                    },
            ),
          ],

          const SizedBox(height: 24),

          TextField(
            controller: _balanceController,
            enabled: !busy,
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
            onTap: busy ? null : _selectDate,
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
            onPressed: busy ? null : _save,
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

          const SizedBox(height: 24),

          const Divider(),

          const SizedBox(height: 12),

          TextButton.icon(
            onPressed: busy ? null : _delete,
            icon: _deleting
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.delete_outline),
            label: const Text('口座を削除'),
            style: TextButton.styleFrom(
              foregroundColor: Theme.of(context).colorScheme.error,
            ),
          ),
        ],
      ),
    );
  }
}

/// AccountEditPageから「削除された」ことだけ返すための型。
class AccountEditDeletedResult {
  const AccountEditDeletedResult();
}
