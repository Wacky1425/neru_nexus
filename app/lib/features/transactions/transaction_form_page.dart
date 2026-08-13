import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'service/transaction_service.dart';
import 'model/transaction_model.dart';
import '../../core/master/master_repository.dart';
import '../master/model/master_model.dart';
import '../categories/widgets/add_category_dialog.dart';

class TransactionFormResult {
  const TransactionFormResult({
    required this.date,
    required this.type,
    required this.amount,
    required this.majorCategory,
    required this.subCategory,
    required this.title,
    required this.paymentMethod,
    required this.accountName,
    required this.status,
    this.memo,
    this.fromAccount,
    this.toAccount,
  });

  final DateTime date;
  final TransactionType type;
  final int amount;
  final String majorCategory;
  final String subCategory;
  final String title;
  final String paymentMethod;
  final String accountName;
  final String status;
  final String? memo;
  final String? fromAccount;
  final String? toAccount;
}

enum TransactionType { expense, income, transfer }

class TransactionFormPage extends StatefulWidget {
  const TransactionFormPage({
    super.key,
    this.initialTransaction,
    this.fromReview = false,
  });

  final TransactionModel? initialTransaction;

  final bool fromReview;

  @override
  State<TransactionFormPage> createState() => _TransactionFormPageState();
}

class _TransactionFormPageState extends State<TransactionFormPage> {
  final _formKey = GlobalKey<FormState>();

  final _amountController = TextEditingController();

  final _titleController = TextEditingController();

  final _memoController = TextEditingController();

  final _transactionService = const TransactionService();

  final MasterRepository _masterRepository = const MasterRepository();

  late Future<MasterModel> _masterFuture;

  MasterModel? _master;

  TransactionType _selectedType = TransactionType.expense;

  DateTime _selectedDate = DateTime.now();

  String _selectedMajorCategory = '食費';

  String _selectedSubCategory = 'スーパー';

  String _selectedPaymentMethod = 'クレジットカード';

  String _selectedAccountId = '';
  String _selectedAccountName = '';

  String _selectedFromAccountId = '';
  String _selectedFromAccountName = '';

  String _selectedToAccountId = '';
  String _selectedToAccountName = '';
  bool _isConfirmed = false;

  bool _isSaving = false;
  bool _saveRule = false;

  static const Map<String, List<String>> _fallbackExpenseCategoryMap = {
    '食費': ['スーパー', 'コンビニ', '外食', 'カフェ', 'その他'],
    '交通費': ['電車', 'バス', 'タクシー', 'ガソリン', '高速料金', 'その他'],
    '日用品': ['ドラッグストア', '生活用品', 'その他'],
    '娯楽': ['ゲーム', '映画', '旅行', 'サブスク', 'その他'],
    '衣服': ['服', '靴', 'アクセサリー', 'その他'],
    '美容': ['美容院', '化粧品', 'その他'],
    '医療': ['病院', '薬', 'その他'],
    '通信費': ['携帯', 'ネット', 'その他'],
    '水道光熱費': ['電気', 'ガス', '水道'],
    '家賃': ['家賃'],
    'その他': ['その他'],
  };

  static const Map<String, List<String>> _fallbackIncomeCategoryMap = {
    '給与': ['給与'],
    '副業': ['副業'],
    '臨時収入': ['ポイント', '返金', 'お祝い', 'その他'],
  };

  static const List<String> _fallbackPaymentMethods = [
    'クレジットカード',
    '現金',
    'PayPay',
    '楽天ペイ',
    '交通系IC',
    '口座振替',
    'その他',
  ];

  Map<String, List<String>> get _categoryMap {
    final master = _master;

    if (master != null) {
      final map = _categoryMapFromMaster(master);

      if (map.isNotEmpty) {
        return map;
      }
    }

    return _selectedType == TransactionType.expense
        ? _fallbackExpenseCategoryMap
        : _fallbackIncomeCategoryMap;
  }

  List<AccountMaster> get _accounts {
    final master = _master;
    if (master == null) {
      return const [];
    }

    return master.accounts.where((e) => e.active).toList();
  }

  List<String> get _paymentMethods {
    final methods = _master?.paymentMethods ?? const [];

    if (methods.isNotEmpty) {
      return methods;
    }

    return _fallbackPaymentMethods;
  }

  List<String> get _subCategories {
    return _categoryMap[_selectedMajorCategory] ?? [];
  }

  @override
  void initState() {
    super.initState();

    _masterFuture = _loadMaster();

    final tx = widget.initialTransaction;

    if (tx == null) {
      return;
    }

    _selectedType = switch (tx.type) {
      '収入' => TransactionType.income,
      '移動' => TransactionType.transfer,
      _ => TransactionType.expense,
    };

    if (_selectedType == TransactionType.transfer) {
      _selectedFromAccountName = tx.fromAccount.trim();

      _selectedToAccountName = tx.toAccount.trim();
    }

    _selectedDate = DateTime.tryParse(tx.transactionDate) ?? DateTime.now();

    _amountController.text = tx.amount.toString();

    _titleController.text = tx.itemName;

    final majorCategory = tx.majorCategory.trim();
    final subCategory = tx.subCategory.trim();

    if (_categoryMap.containsKey(majorCategory)) {
      _selectedMajorCategory = majorCategory;
    } else {
      _selectedMajorCategory = _categoryMap.keys.first;
    }

    final candidates = _categoryMap[_selectedMajorCategory] ?? const <String>[];

    if (candidates.contains(subCategory)) {
      _selectedSubCategory = subCategory;
    } else if (candidates.contains('その他')) {
      _selectedSubCategory = 'その他';
    } else if (candidates.isNotEmpty) {
      _selectedSubCategory = candidates.first;
    }

    if (_paymentMethods.contains(tx.paymentMethod)) {
      _selectedPaymentMethod = tx.paymentMethod;
    }

    _isConfirmed = tx.status == '確定';

    _memoController.text = tx.note;
  }

  Future<MasterModel> _loadMaster() async {
    final master = await _masterRepository.getMaster();

    if (!mounted) {
      return master;
    }

    setState(() {
      _master = master;

      _applyMasterDefaults(master);

      _applyInitialTransferAccounts();
    });

    return master;
  }

  void _applyInitialTransferAccounts() {
    final tx = widget.initialTransaction;

    if (tx == null || _selectedType != TransactionType.transfer) {
      return;
    }

    final fromAccountName = tx.fromAccount.trim();

    final toAccountName = tx.toAccount.trim();

    if (fromAccountName.isNotEmpty) {
      for (final account in _accounts) {
        if (account.accountName == fromAccountName) {
          _selectedFromAccountId = account.accountId;

          _selectedFromAccountName = account.accountName;

          break;
        }
      }
    }

    if (toAccountName.isNotEmpty) {
      for (final account in _accounts) {
        if (account.accountName == toAccountName) {
          _selectedToAccountId = account.accountId;

          _selectedToAccountName = account.accountName;

          break;
        }
      }
    }
  }

  void _applyMasterDefaults(MasterModel master) {
    final categoryMap = _categoryMapFromMaster(master);

    if (categoryMap.isEmpty) {
      return;
    }

    final transaction = widget.initialTransaction;

    if (transaction == null) {
      if (!categoryMap.containsKey(_selectedMajorCategory)) {
        _selectedMajorCategory = categoryMap.keys.first;
      }

      final subCategories =
          categoryMap[_selectedMajorCategory] ?? const <String>[];

      if (!subCategories.contains(_selectedSubCategory)) {
        _selectedSubCategory = subCategories.isNotEmpty
            ? subCategories.first
            : '';
      }
    } else {
      final major = transaction.majorCategory.trim();

      final sub = transaction.subCategory.trim();

      if (categoryMap.containsKey(major)) {
        _selectedMajorCategory = major;
      } else {
        _selectedMajorCategory = categoryMap.keys.first;
      }

      final subCategories =
          categoryMap[_selectedMajorCategory] ?? const <String>[];

      if (subCategories.contains(sub)) {
        _selectedSubCategory = sub;
      } else if (subCategories.contains('その他')) {
        _selectedSubCategory = 'その他';
      } else {
        _selectedSubCategory = subCategories.isNotEmpty
            ? subCategories.first
            : '';
      }
    }

    final paymentMethods = master.paymentMethods;

    if (paymentMethods.isNotEmpty &&
        !paymentMethods.contains(_selectedPaymentMethod)) {
      final currentPaymentMethod = transaction?.paymentMethod.trim() ?? '';

      if (paymentMethods.contains(currentPaymentMethod)) {
        _selectedPaymentMethod = currentPaymentMethod;
      } else {
        _selectedPaymentMethod = paymentMethods.first;
      }
    }

    if (_accounts.isNotEmpty) {
      final currentAccountName = transaction?.accountName.trim() ?? '';

      AccountMaster? matchedAccount;

      if (currentAccountName.isNotEmpty) {
        for (final account in _accounts) {
          if (account.accountName == currentAccountName) {
            matchedAccount = account;
            break;
          }
        }
      }

      final account = matchedAccount ?? _accounts.first;

      _selectedAccountId = account.accountId;
      _selectedAccountName = account.accountName;

      if (_selectedType != TransactionType.transfer) {
        _selectedPaymentMethod = account.paymentMethod;
      }
    }
  }

  Map<String, List<String>> _categoryMapFromMaster(MasterModel master) {
    final typeName = _selectedType == TransactionType.income ? '収入' : '支出';

    final categories =
        master.categories
            .where((category) => category.type == typeName && category.active)
            .toList()
          ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

    final result = <String, List<String>>{};

    for (final category in categories) {
      final majorCategory = category.majorCategory.trim();

      final subCategory = category.subCategory.trim();

      if (majorCategory.isEmpty || subCategory.isEmpty) {
        continue;
      }

      final subCategories = result.putIfAbsent(majorCategory, () => <String>[]);

      if (!subCategories.contains(subCategory)) {
        subCategories.add(subCategory);
      }
    }

    return result;
  }

  @override
  void dispose() {
    _amountController.dispose();
    _titleController.dispose();
    _memoController.dispose();

    super.dispose();
  }

  Future<void> _selectDate() async {
    if (_isSaving) {
      return;
    }

    final selectedDate = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );

    if (selectedDate == null || !mounted) {
      return;
    }

    setState(() {
      _selectedDate = selectedDate;
    });
  }

  void _changeType(TransactionType type) {
    if (_isSaving) {
      return;
    }

    setState(() {
      _selectedType = type;

      _selectedMajorCategory = _categoryMap.keys.first;

      _selectedSubCategory = _subCategories.isNotEmpty
          ? _subCategories.first
          : 'その他';
    });
  }

  Future<void> _saveTransaction() async {
    if (_isSaving) {
      return;
    }

    FocusScope.of(context).unfocus();

    final isValid = _formKey.currentState?.validate() ?? false;

    if (!isValid) {
      return;
    }

    final amount = int.tryParse(_amountController.text.replaceAll(',', ''));

    if (amount == null || amount <= 0) {
      return;
    }

    final result = TransactionFormResult(
      date: _selectedDate,
      type: _selectedType,
      amount: amount,
      majorCategory: _selectedMajorCategory,
      subCategory: _selectedSubCategory,
      title: _titleController.text.trim(),
      paymentMethod: _selectedPaymentMethod,
      accountName: _selectedAccountName,
      status: _isConfirmed ? '確定' : '要確認',
      memo: _memoController.text.trim().isEmpty
          ? null
          : _memoController.text.trim(),
      fromAccount: _selectedType == TransactionType.transfer
          ? _selectedFromAccountName
          : null,

      toAccount: _selectedType == TransactionType.transfer
          ? _selectedToAccountName
          : null,
    );

    setState(() {
      _isSaving = true;
    });

    try {
      final initialTransaction = widget.initialTransaction;

      if (initialTransaction == null) {
        await _transactionService.createTransaction(transaction: result);
      } else {
        await _transactionService.updateTransaction(
          id: initialTransaction.id,
          transaction: result,
          saveRule: widget.fromReview && _saveRule,
          merchant: initialTransaction.merchant.trim(),
        );
      }

      if (!mounted) {
        return;
      }

      Navigator.of(context).pop(result);
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
          _isSaving = false;
        });
      }
    }
  }

  Future<void> _openAddCategoryDialog() async {
    final master = _master;

    if (master == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('マスターデータを取得できていません')));

      return;
    }

    final result = await showDialog<CategoryCreateResult>(
      context: context,
      builder: (dialogContext) {
        return AddCategoryDialog(
          master: master,
          initialType: _selectedType == TransactionType.income ? '収入' : '支出',
          initialMajorCategory: _selectedMajorCategory,
        );
      },
    );

    if (result == null || !mounted) {
      return;
    }

    try {
      final refreshedMaster = await _masterRepository.getMaster(
        forceRefresh: true,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _master = refreshedMaster;

        _selectedMajorCategory = result.majorCategory;

        _selectedSubCategory = result.subCategory;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${result.majorCategory} / '
            '${result.subCategory}を追加しました',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      final message = error.toString().replaceFirst('Exception: ', '');

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'カテゴリは追加されましたが、'
            '一覧の更新に失敗しました：$message',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return PopScope(
      canPop: !_isSaving,
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.initialTransaction == null ? '取引を追加' : '取引を編集'),
        ),
        body: SafeArea(
          child: AbsorbPointer(
            absorbing: _isSaving,
            child: Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
                children: [
                  SegmentedButton<TransactionType>(
                    segments: const [
                      ButtonSegment(
                        value: TransactionType.expense,
                        label: Text('支出'),
                        icon: Icon(Icons.arrow_upward_rounded),
                      ),
                      ButtonSegment(
                        value: TransactionType.income,
                        label: Text('収入'),
                        icon: Icon(Icons.arrow_downward_rounded),
                      ),
                      ButtonSegment(
                        value: TransactionType.transfer,
                        label: Text('移動'),
                        icon: Icon(Icons.swap_horiz_rounded),
                      ),
                    ],
                    selected: {_selectedType},
                    onSelectionChanged: (selection) {
                      _changeType(selection.first);
                    },
                  ),

                  const SizedBox(height: 24),

                  Text(
                    '金額',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),

                  const SizedBox(height: 8),

                  TextFormField(
                    controller: _amountController,
                    autofocus: true,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                    ),
                    decoration: const InputDecoration(
                      prefixText: '￥',
                      hintText: '0',
                      border: OutlineInputBorder(),
                    ),
                    validator: (value) {
                      final amount = int.tryParse(
                        value?.replaceAll(',', '') ?? '',
                      );

                      if (amount == null || amount <= 0) {
                        return '1円以上の金額を入力してください';
                      }

                      return null;
                    },
                  ),

                  const SizedBox(height: 24),

                  Text(
                    '日付',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),

                  const SizedBox(height: 8),

                  InkWell(
                    onTap: _selectDate,
                    borderRadius: BorderRadius.circular(12),
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        prefixIcon: Icon(Icons.calendar_today_outlined),
                        border: OutlineInputBorder(),
                      ),
                      child: Text(_formatDate(_selectedDate)),
                    ),
                  ),

                  const SizedBox(height: 20),

                  DropdownButtonFormField<String>(
                    key: ValueKey(
                      '${_selectedType.name}-'
                      '$_selectedMajorCategory',
                    ),
                    initialValue:
                        _categoryMap.containsKey(_selectedMajorCategory)
                        ? _selectedMajorCategory
                        : null,
                    decoration: const InputDecoration(
                      labelText: '大カテゴリ',
                      prefixIcon: Icon(Icons.category_outlined),
                      border: OutlineInputBorder(),
                    ),
                    items: _categoryMap.keys
                        .toSet()
                        .map(
                          (category) => DropdownMenuItem<String>(
                            value: category,
                            child: Text(category),
                          ),
                        )
                        .toList(),
                    onChanged: (value) {
                      if (value == null) {
                        return;
                      }

                      setState(() {
                        _selectedMajorCategory = value;

                        final subCategories =
                            _categoryMap[value] ?? const <String>[];

                        _selectedSubCategory = subCategories.isNotEmpty
                            ? subCategories.first
                            : '';
                      });
                    },
                  ),

                  const SizedBox(height: 20),

                  DropdownButtonFormField<String>(
                    key: ValueKey(
                      '${_selectedType.name}-'
                      '$_selectedMajorCategory-'
                      '$_selectedSubCategory',
                    ),
                    initialValue: _subCategories.contains(_selectedSubCategory)
                        ? _selectedSubCategory
                        : null,
                    decoration: const InputDecoration(
                      labelText: '小カテゴリ',
                      prefixIcon: Icon(Icons.subdirectory_arrow_right),
                      border: OutlineInputBorder(),
                    ),
                    items: _subCategories
                        .toSet()
                        .map(
                          (category) => DropdownMenuItem<String>(
                            value: category,
                            child: Text(category),
                          ),
                        )
                        .toList(),
                    onChanged: (value) {
                      if (value == null) {
                        return;
                      }

                      setState(() {
                        _selectedSubCategory = value;
                      });
                    },
                  ),

                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(
                      onPressed: _isSaving ? null : _openAddCategoryDialog,
                      icon: const Icon(Icons.add),
                      label: const Text('カテゴリを追加'),
                    ),
                  ),

                  if (widget.fromReview) ...[
                    const SizedBox(height: 8),

                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _saveRule,
                      onChanged: _isSaving
                          ? null
                          : (value) {
                              setState(() {
                                _saveRule = value ?? false;
                                if (_saveRule) {
                                  _isConfirmed = true;
                                }
                              });
                            },
                      title: const Text('今後もこの取引先を同じ分類にする'),
                      subtitle: const Text('次回から同じ取引先を自動で分類します'),
                      controlAffinity: ListTileControlAffinity.leading,
                    ),
                  ],

                  const SizedBox(height: 12),

                  TextFormField(
                    controller: _titleController,
                    decoration: const InputDecoration(
                      labelText: '内容・店名',
                      hintText: '例：スーパー、昼ごはん',
                      prefixIcon: Icon(Icons.receipt_long_outlined),
                      border: OutlineInputBorder(),
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return '内容を入力してください';
                      }

                      return null;
                    },
                  ),

                  const SizedBox(height: 20),

                  if (_selectedType == TransactionType.transfer) ...[
                    DropdownButtonFormField<String>(
                      value: _selectedFromAccountId.isEmpty
                          ? null
                          : _selectedFromAccountId,
                      decoration: const InputDecoration(
                        labelText: '移動元口座',
                        prefixIcon: Icon(Icons.account_balance),
                        border: OutlineInputBorder(),
                      ),
                      items: _accounts
                          .map(
                            (account) => DropdownMenuItem(
                              value: account.accountId,
                              child: Text(account.accountName),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        if (value == null) return;

                        final account = _accounts.firstWhere(
                          (e) => e.accountId == value,
                        );

                        setState(() {
                          _selectedFromAccountId = account.accountId;
                          _selectedFromAccountName = account.accountName;
                        });
                      },
                      validator: (value) {
                        if (_selectedType == TransactionType.transfer &&
                            (value == null || value.isEmpty)) {
                          return '移動元口座を選択してください';
                        }

                        return null;
                      },
                    ),

                    const SizedBox(height: 20),

                    DropdownButtonFormField<String>(
                      value: _selectedToAccountId.isEmpty
                          ? null
                          : _selectedToAccountId,
                      decoration: const InputDecoration(
                        labelText: '移動先口座',
                        prefixIcon: Icon(Icons.account_balance_wallet_outlined),
                        border: OutlineInputBorder(),
                      ),
                      items: _accounts
                          .where(
                            (account) =>
                                account.accountId != _selectedFromAccountId,
                          )
                          .map(
                            (account) => DropdownMenuItem(
                              value: account.accountId,
                              child: Text(account.accountName),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        if (value == null) return;

                        final account = _accounts.firstWhere(
                          (e) => e.accountId == value,
                        );

                        setState(() {
                          _selectedToAccountId = account.accountId;
                          _selectedToAccountName = account.accountName;
                        });
                      },
                      validator: (value) {
                        if (_selectedType == TransactionType.transfer &&
                            (value == null || value.isEmpty)) {
                          return '移動先口座を選択してください';
                        }

                        return null;
                      },
                    ),
                  ] else ...[
                    DropdownButtonFormField<String>(
                      value: _selectedAccountId.isEmpty
                          ? null
                          : _selectedAccountId,
                      decoration: const InputDecoration(
                        labelText: '利用口座',
                        prefixIcon: Icon(Icons.account_balance),
                        border: OutlineInputBorder(),
                      ),
                      items: _accounts
                          .map(
                            (account) => DropdownMenuItem(
                              value: account.accountId,
                              child: Text(account.accountName),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        if (value == null) return;

                        final account = _accounts.firstWhere(
                          (e) => e.accountId == value,
                        );

                        setState(() {
                          _selectedAccountId = account.accountId;
                          _selectedAccountName = account.accountName;
                          _selectedPaymentMethod = account.paymentMethod;
                        });
                      },
                    ),
                  ],

                  const SizedBox(height: 20),

                  SwitchListTile(
                    value: _isConfirmed,
                    onChanged: _isSaving
                        ? null
                        : (value) {
                            setState(() {
                              _isConfirmed = value;

                              if (!value) {
                                _saveRule = false;
                              }
                            });
                          },
                  ),

                  const SizedBox(height: 20),

                  TextFormField(
                    controller: _memoController,
                    minLines: 3,
                    maxLines: 5,
                    decoration: const InputDecoration(
                      labelText: 'メモ',
                      hintText: '任意',
                      alignLabelWithHint: true,
                      prefixIcon: Icon(Icons.notes_rounded),
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        bottomNavigationBar: SafeArea(
          minimum: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: FilledButton.icon(
            onPressed: _isSaving ? null : _saveTransaction,
            icon: _isSaving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save_outlined),
            label: Text(
              _isSaving
                  ? '保存中...'
                  : widget.initialTransaction == null
                  ? '保存する'
                  : '更新する',
            ),
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
              backgroundColor: _selectedType == TransactionType.expense
                  ? colorScheme.primary
                  : colorScheme.tertiary,
            ),
          ),
        ),
      ),
    );
  }

  static String _formatDate(DateTime date) {
    return '${date.year}年'
        '${date.month}月'
        '${date.day}日';
  }
}
