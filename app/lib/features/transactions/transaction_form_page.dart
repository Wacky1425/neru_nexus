import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'service/transaction_service.dart';
import 'model/transaction_model.dart';

class TransactionFormResult {
  const TransactionFormResult({
    required this.date,
    required this.type,
    required this.amount,
    required this.majorCategory,
    required this.subCategory,
    required this.title,
    required this.paymentMethod,
    this.memo,
  });

  final DateTime date;
  final TransactionType type;
  final int amount;
  final String majorCategory;
  final String subCategory;
  final String title;
  final String paymentMethod;
  final String? memo;
}

enum TransactionType { expense, income }

class TransactionFormPage extends StatefulWidget {
  const TransactionFormPage({super.key, this.initialTransaction});

  final TransactionModel? initialTransaction;

  @override
  State<TransactionFormPage> createState() => _TransactionFormPageState();
}

class _TransactionFormPageState extends State<TransactionFormPage> {
  final _formKey = GlobalKey<FormState>();

  final _amountController = TextEditingController();

  final _titleController = TextEditingController();

  final _memoController = TextEditingController();

  final _transactionService = const TransactionService();

  TransactionType _selectedType = TransactionType.expense;

  DateTime _selectedDate = DateTime.now();

  String _selectedMajorCategory = '食費';

  String _selectedSubCategory = 'スーパー';

  String _selectedPaymentMethod = 'クレジットカード';

  bool _isSaving = false;

  static const Map<String, List<String>> _expenseCategoryMap = {
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

  static const Map<String, List<String>> _incomeCategoryMap = {
    '給与': ['給与'],

    '副業': ['副業'],

    '臨時収入': ['ポイント', '返金', 'お祝い', 'その他'],
  };

  static const _paymentMethods = [
    'クレジットカード',
    '現金',
    'PayPay',
    '楽天ペイ',
    '交通系IC',
    '口座振替',
    'その他',
  ];

  Map<String, List<String>> get _categoryMap {
    return _selectedType == TransactionType.expense
        ? _expenseCategoryMap
        : _incomeCategoryMap;
  }

  List<String> get _subCategories {
    return _categoryMap[_selectedMajorCategory] ?? [];
  }

  @override
  void initState() {
    super.initState();

    final tx = widget.initialTransaction;

    if (tx == null) {
      return;
    }

    _selectedType = tx.type == '収入'
        ? TransactionType.income
        : TransactionType.expense;

    _selectedDate = DateTime.tryParse(tx.transactionDate) ?? DateTime.now();

    _amountController.text = tx.amount.toString();

    _titleController.text = tx.itemName;

    final majorCategory = tx.majorCategory.trim();
    final subCategory = tx.subCategory.trim();

    if (_categoryMap.containsKey(majorCategory)) {
      _selectedMajorCategory = majorCategory;

      final candidates = _categoryMap[_selectedMajorCategory] ?? [];

      if (candidates.contains(subCategory)) {
        _selectedSubCategory = subCategory;
      } else if (candidates.isNotEmpty) {
        _selectedSubCategory = candidates.first;
      }
    }

    if (_paymentMethods.contains(tx.paymentMethod)) {
      _selectedPaymentMethod = tx.paymentMethod;
    }

    _memoController.text = "";
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
      memo: _memoController.text.trim().isEmpty
          ? null
          : _memoController.text.trim(),
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
                    initialValue: _selectedMajorCategory,
                    decoration: const InputDecoration(
                      labelText: '大カテゴリ',
                      prefixIcon: Icon(Icons.category_outlined),
                      border: OutlineInputBorder(),
                    ),
                    items: _categoryMap.keys
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

                        _selectedSubCategory = _subCategories.isNotEmpty
                            ? _subCategories.first
                            : 'その他';
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
                    initialValue: _selectedSubCategory,
                    decoration: const InputDecoration(
                      labelText: '小カテゴリ',
                      prefixIcon: Icon(Icons.subdirectory_arrow_right),
                      border: OutlineInputBorder(),
                    ),
                    items: _subCategories
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

                  const SizedBox(height: 20),

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

                  DropdownButtonFormField<String>(
                    initialValue: _selectedPaymentMethod,
                    decoration: const InputDecoration(
                      labelText: '支払方法',
                      prefixIcon: Icon(Icons.account_balance_wallet_outlined),
                      border: OutlineInputBorder(),
                    ),
                    items: _paymentMethods
                        .map(
                          (paymentMethod) => DropdownMenuItem<String>(
                            value: paymentMethod,
                            child: Text(paymentMethod),
                          ),
                        )
                        .toList(),
                    onChanged: (value) {
                      if (value == null) {
                        return;
                      }

                      setState(() {
                        _selectedPaymentMethod = value;
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
