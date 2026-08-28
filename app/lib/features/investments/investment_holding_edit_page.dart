import 'package:flutter/material.dart';

import '../accounts/model/account_balance_model.dart';
import 'model/investment_holding_model.dart';
import 'service/investment_holding_service.dart';

class InvestmentHoldingEditPage extends StatefulWidget {
  const InvestmentHoldingEditPage({
    super.key,
    required this.accounts,
    this.holding,
  });

  final List<AccountBalanceModel> accounts;
  final InvestmentHoldingModel? holding;

  @override
  State<InvestmentHoldingEditPage> createState() =>
      _InvestmentHoldingEditPageState();
}

class _InvestmentHoldingEditPageState
    extends State<InvestmentHoldingEditPage> {
  final _service = const InvestmentHoldingService();
  final _formKey = GlobalKey<FormState>();

  late String _accountId;
  late String _securityType;
  late String _priceProvider;

  late final TextEditingController _nameController;
  late final TextEditingController _symbolController;
  late final TextEditingController _quantityController;
  late final TextEditingController _priceUnitController;
  late final TextEditingController _averageCostController;
  late final TextEditingController _currentPriceController;
  late final TextEditingController _noteController;

  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final holding = widget.holding;
    _accountId = holding?.accountId ??
        (widget.accounts.isNotEmpty ? widget.accounts.first.accountId : '');
    _securityType = holding?.securityType ?? 'fund';
    _priceProvider = holding?.priceProvider ?? 'yahoo';
    _nameController = TextEditingController(text: holding?.name ?? '');
    _symbolController = TextEditingController(text: holding?.symbol ?? '');
    _quantityController = TextEditingController(
      text: holding == null ? '' : _numberText(holding.quantity),
    );
    _priceUnitController = TextEditingController(
      text: holding == null
          ? '10000'
          : _numberText(holding.priceUnit),
    );
    _averageCostController = TextEditingController(
      text: holding == null ? '' : _numberText(holding.averageCost),
    );
    _currentPriceController = TextEditingController(
      text: holding == null ? '' : _numberText(holding.currentPrice),
    );
    _noteController = TextEditingController(text: holding?.note ?? '');
  }

  static String _numberText(double value) {
    if (value == value.roundToDouble()) return value.toInt().toString();
    return value.toString();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _symbolController.dispose();
    _quantityController.dispose();
    _priceUnitController.dispose();
    _averageCostController.dispose();
    _currentPriceController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  double _parseNumber(TextEditingController controller) {
    return double.tryParse(controller.text.replaceAll(',', '').trim()) ?? 0;
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_accountId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('投資口座がありません')),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final holding = widget.holding;
      final args = (
        accountId: _accountId,
        securityType: _securityType,
        name: _nameController.text.trim(),
        symbol: _symbolController.text.trim(),
        priceProvider: _priceProvider,
        quantity: _parseNumber(_quantityController),
        priceUnit: _parseNumber(_priceUnitController),
        averageCost: _parseNumber(_averageCostController),
        currentPrice: _securityType == 'cash'
            ? 1.0
            : _parseNumber(_currentPriceController),
        note: _noteController.text.trim(),
      );

      if (holding == null) {
        await _service.createHolding(
          accountId: args.accountId,
          securityType: args.securityType,
          name: args.name,
          symbol: args.symbol,
          priceProvider: args.priceProvider,
          quantity: args.quantity,
          priceUnit: args.priceUnit,
          averageCost: args.averageCost,
          currentPrice: args.currentPrice,
          note: args.note,
        );
      } else {
        await _service.updateHolding(
          holdingId: holding.holdingId,
          accountId: args.accountId,
          securityType: args.securityType,
          name: args.name,
          symbol: args.symbol,
          priceProvider: args.priceProvider,
          quantity: args.quantity,
          priceUnit: args.priceUnit,
          averageCost: args.averageCost,
          currentPrice: args.currentPrice,
          note: args.note,
        );
      }

      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete() async {
    final holding = widget.holding;
    if (holding == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('保有銘柄を削除'),
        content: Text('${holding.name} を保有一覧から削除しますか？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('キャンセル'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('削除'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    setState(() => _saving = true);
    try {
      await _service.deactivateHolding(holding.holdingId);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _onSecurityTypeChanged(String value) {
    setState(() {
      _securityType = value;
      if (value == 'fund' && _priceUnitController.text.trim().isEmpty) {
        _priceUnitController.text = '10000';
      } else if (value != 'fund' &&
          _priceUnitController.text.trim() == '10000') {
        _priceUnitController.text = '1';
      }
      if (value == 'cash') {
        _priceProvider = 'manual';
        _priceUnitController.text = '1';
        _currentPriceController.text = '1';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.holding != null;

    return Scaffold(
      appBar: AppBar(
        title: Text(editing ? '保有銘柄を編集' : '保有銘柄を追加'),
        actions: [
          if (editing)
            IconButton(
              onPressed: _saving ? null : _delete,
              icon: const Icon(Icons.delete_outline),
              tooltip: '削除',
            ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            DropdownButtonFormField<String>(
              initialValue: _accountId.isEmpty ? null : _accountId,
              decoration: const InputDecoration(
                labelText: '証券口座',
                border: OutlineInputBorder(),
              ),
              items: widget.accounts
                  .map(
                    (account) => DropdownMenuItem(
                      value: account.accountId,
                      child: Text(account.accountName),
                    ),
                  )
                  .toList(),
              onChanged: (value) {
                if (value != null) setState(() => _accountId = value);
              },
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _securityType,
              decoration: const InputDecoration(
                labelText: '種類',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'stock', child: Text('株式 / ETF')),
                DropdownMenuItem(value: 'fund', child: Text('投資信託')),
                DropdownMenuItem(value: 'cash', child: Text('証券口座内の現金')),
                DropdownMenuItem(value: 'other', child: Text('その他')),
              ],
              onChanged: (value) {
                if (value != null) _onSecurityTypeChanged(value);
              },
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: '銘柄名',
                border: OutlineInputBorder(),
              ),
              validator: (value) => value == null || value.trim().isEmpty
                  ? '銘柄名を入力してください'
                  : null,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _quantityController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: _securityType == 'cash' ? '金額' : '保有数量 / 口数',
                border: const OutlineInputBorder(),
              ),
              validator: (value) {
                final number = double.tryParse(
                  (value ?? '').replaceAll(',', '').trim(),
                );
                return number == null || number < 0 ? '0以上の数値を入力してください' : null;
              },
            ),
            if (_securityType != 'cash') ...[
              const SizedBox(height: 16),
              TextFormField(
                controller: _averageCostController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: '平均取得単価',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _priceUnitController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: '価格単位',
                  helperText: '株式は1、投資信託で基準価額が1万口あたりなら10000',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _priceProvider,
                decoration: const InputDecoration(
                  labelText: '現在値の更新',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'yahoo', child: Text('自動（Yahoo Finance）')),
                  DropdownMenuItem(value: 'manual', child: Text('手動')),
                ],
                onChanged: (value) {
                  if (value != null) setState(() => _priceProvider = value);
                },
              ),
              if (_priceProvider == 'yahoo') ...[
                const SizedBox(height: 16),
                TextFormField(
                  controller: _symbolController,
                  decoration: const InputDecoration(
                    labelText: '価格シンボル',
                    helperText: '日本株の例: 7203.T。CSV連携時は自動設定予定',
                    border: OutlineInputBorder(),
                  ),
                  validator: (value) => _priceProvider == 'yahoo' &&
                          (value == null || value.trim().isEmpty)
                      ? '自動更新には価格シンボルが必要です'
                      : null,
                ),
              ],
              if (_priceProvider == 'manual') ...[
                const SizedBox(height: 16),
                TextFormField(
                  controller: _currentPriceController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: '現在値 / 基準価額',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ],
            const SizedBox(height: 16),
            TextField(
              controller: _noteController,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'メモ',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _saving ? null : _save,
              icon: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(editing ? '更新' : '追加'),
            ),
          ],
        ),
      ),
    );
  }
}
