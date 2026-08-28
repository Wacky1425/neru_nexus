
import 'package:flutter/material.dart';

import '../../core/master/master_repository.dart';
import '../master/model/master_model.dart';
import 'model/classification_rule_model.dart';
import 'service/classification_rule_service.dart';

class ClassificationRuleManagementPage extends StatefulWidget {
  const ClassificationRuleManagementPage({super.key});

  @override
  State<ClassificationRuleManagementPage> createState() =>
      _ClassificationRuleManagementPageState();
}

class _ClassificationRuleManagementPageState
    extends State<ClassificationRuleManagementPage>
    with SingleTickerProviderStateMixin {
  final ClassificationRuleService _service = const ClassificationRuleService();
  final MasterRepository _masterRepository = const MasterRepository();

  late final TabController _tabController;
  bool _loading = true;
  Object? _error;
  List<ClassificationRuleModel> _rules = const [];
  List<MerchantClassificationSuggestion> _suggestions = const [];
  MasterModel? _master;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _reload();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        _service.fetchRules(),
        _service.fetchSuggestions(),
        _masterRepository.getMaster(),
      ]);
      if (!mounted) return;
      setState(() {
        _rules = results[0] as List<ClassificationRuleModel>;
        _suggestions = results[1] as List<MerchantClassificationSuggestion>;
        _master = results[2] as MasterModel;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  Future<void> _editRule([ClassificationRuleModel? rule]) async {
    final master = _master;
    if (master == null) return;
    final changed = await showDialog<bool>(
      context: context,
      builder: (_) => _RuleEditDialog(rule: rule, master: master),
    );
    if (changed == true) await _reload();
  }

  Future<void> _deleteRule(ClassificationRuleModel rule) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('ルールを削除'),
        content: Text('「${rule.keyword}」の分類ルールを削除しますか？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('キャンセル'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('削除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _service.deleteRule(rule.rowNumber);
    await _reload();
  }

  Future<void> _promote(MerchantClassificationSuggestion suggestion) async {
    try {
      await _service.promoteSuggestion(suggestion);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${suggestion.merchant} のルールを登録しました')),
      );
      await _reload();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error.toString().replaceFirst('Exception: ', '')),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('分類ルール'),
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(text: 'ルール ${_rules.length}'),
            Tab(text: '候補 ${_suggestions.length}'),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _loading ? null : () => _editRule(),
        icon: const Icon(Icons.add),
        label: const Text('ルール追加'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorView(error: _error!, onRetry: _reload)
              : TabBarView(
                  controller: _tabController,
                  children: [
                    RefreshIndicator(
                      onRefresh: _reload,
                      child: _rules.isEmpty
                          ? const _EmptyList(text: '分類ルールがありません')
                          : ListView.builder(
                              padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
                              itemCount: _rules.length,
                              itemBuilder: (context, index) {
                                final rule = _rules[index];
                                return Card(
                                  child: ListTile(
                                    leading: const Icon(Icons.rule_outlined),
                                    title: Text(rule.keyword),
                                    subtitle: Text(
                                      '${_ruleTypeLabel(rule.ruleType)} ・ '
                                      '${rule.typeResult} / ${rule.majorCategory} / '
                                      '${rule.subCategory}'
                                      '${rule.purposeType == "経費" ? " ・ 経費 ${(rule.expenseRatio * 100).round()}%" : ""}',
                                    ),
                                    isThreeLine: true,
                                    onTap: () => _editRule(rule),
                                    trailing: PopupMenuButton<String>(
                                      onSelected: (value) {
                                        if (value == 'edit') _editRule(rule);
                                        if (value == 'delete') _deleteRule(rule);
                                      },
                                      itemBuilder: (_) => const [
                                        PopupMenuItem(
                                          value: 'edit',
                                          child: Text('編集'),
                                        ),
                                        PopupMenuItem(
                                          value: 'delete',
                                          child: Text('削除'),
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                    ),
                    RefreshIndicator(
                      onRefresh: _reload,
                      child: _suggestions.isEmpty
                          ? const _EmptyList(
                              text: 'まだ十分に一貫した分類候補がありません',
                            )
                          : ListView.builder(
                              padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
                              itemCount: _suggestions.length,
                              itemBuilder: (context, index) {
                                final item = _suggestions[index];
                                final percent = (item.confidence * 100).round();
                                return Card(
                                  child: Padding(
                                    padding: const EdgeInsets.all(14),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Expanded(
                                              child: Text(
                                                item.merchant,
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .titleMedium
                                                    ?.copyWith(
                                                      fontWeight:
                                                          FontWeight.bold,
                                                    ),
                                              ),
                                            ),
                                            Text('$percent%'),
                                          ],
                                        ),
                                        const SizedBox(height: 6),
                                        Text(
                                          '${item.matchedCount}/${item.sampleCount}件が '
                                          '${item.typeResult} / ${item.majorCategory} / '
                                          '${item.subCategory}',
                                        ),
                                        const SizedBox(height: 10),
                                        Align(
                                          alignment: Alignment.centerRight,
                                          child: FilledButton.icon(
                                            onPressed: () => _promote(item),
                                            icon: const Icon(Icons.add_task),
                                            label: const Text('ルール登録'),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                    ),
                  ],
                ),
    );
  }

  static String _ruleTypeLabel(String value) => switch (value) {
        'equals' => '完全一致',
        'starts_with' => '前方一致',
        _ => '部分一致',
      };
}

class _RuleEditDialog extends StatefulWidget {
  const _RuleEditDialog({required this.rule, required this.master});

  final ClassificationRuleModel? rule;
  final MasterModel master;

  @override
  State<_RuleEditDialog> createState() => _RuleEditDialogState();
}

class _RuleEditDialogState extends State<_RuleEditDialog> {
  final ClassificationRuleService _service = const ClassificationRuleService();
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _keyword;
  late final TextEditingController _note;
  late String _ruleType;
  late String _type;
  late String _major;
  late String _sub;
  late String _purpose;
  late double _expenseRatio;
  bool _saving = false;

  Map<String, List<String>> get _categories {
    final map = <String, List<String>>{};
    for (final category in widget.master.categories.where(
      (category) => category.active && category.type == _type,
    )) {
      map.putIfAbsent(category.majorCategory, () => <String>[]);
      if (!map[category.majorCategory]!.contains(category.subCategory)) {
        map[category.majorCategory]!.add(category.subCategory);
      }
    }
    if (map.isEmpty) {
      return _type == '収入'
          ? {'収入': ['要確認']}
          : _type == '移動'
              ? {
                  '移動': [
                    '口座移動',
                    '電子マネーチャージ',
                    'クレカ引落',
                    '証券口座移動',
                    '現金引出',
                    '個人間送金',
                  ]
                }
              : {'その他': ['要確認']};
    }
    return map;
  }

  @override
  void initState() {
    super.initState();
    final rule = widget.rule;
    _keyword = TextEditingController(text: rule?.keyword ?? '');
    _note = TextEditingController(text: rule?.note ?? '');
    _ruleType = rule?.ruleType ?? 'equals';
    _type = rule?.typeResult ?? '支出';
    _purpose = rule?.purposeType ?? '私用';
    _expenseRatio = rule?.expenseRatio ?? 0;
    final map = _categories;
    _major = map.containsKey(rule?.majorCategory)
        ? rule!.majorCategory
        : map.keys.first;
    final subs = map[_major] ?? const <String>[];
    _sub = subs.contains(rule?.subCategory)
        ? rule!.subCategory
        : (subs.isEmpty ? '' : subs.first);
  }

  @override
  void dispose() {
    _keyword.dispose();
    _note.dispose();
    super.dispose();
  }

  void _changeType(String value) {
    setState(() {
      _type = value;
      final map = _categories;
      _major = map.keys.first;
      _sub = map[_major]!.first;
      if (_type != '支出') {
        _purpose = _type == '収入' ? '私用' : '私用';
        _expenseRatio = 0;
      }
    });
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false) || _saving) return;
    setState(() => _saving = true);
    try {
      final purpose = _type == '支出' ? _purpose : '私用';
      final payload = <String, dynamic>{
        'rowNumber': widget.rule?.rowNumber ?? 0,
        'priority': widget.rule?.priority ?? 0,
        'matchTarget': 'merchant',
        'keyword': _keyword.text.trim(),
        'ruleType': _ruleType,
        'typeResult': _type,
        'majorCategory': _major,
        'subCategory': _sub,
        'purposeType': purpose,
        'expenseRatio':
            _type == '支出' && purpose == '経費' ? _expenseRatio : 0,
        'statusResult': '確定',
        'note': _note.text.trim(),
        'walletResult':
            purpose == '経費' || purpose == '事業収入' ? '事業' : '生活',
        'intentResult': _type == '移動' ? '移動' : (_type == '収入' ? '収入' : 'その他'),
      };
      final current = widget.rule;
      if (current == null) {
        await _service.createRule(payload);
      } else {
        await _service.updateRule(
          ClassificationRuleModel(
            rowNumber: current.rowNumber,
            priority: current.priority,
            matchTarget: 'merchant',
            keyword: payload['keyword'] as String,
            ruleType: _ruleType,
            typeResult: _type,
            majorCategory: _major,
            subCategory: _sub,
            purposeType: purpose,
            expenseRatio: payload['expenseRatio'] as double,
            statusResult: '確定',
            note: _note.text.trim(),
            walletResult: payload['walletResult'] as String,
            intentResult: payload['intentResult'] as String,
          ),
        );
      }
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error.toString().replaceFirst('Exception: ', '')),
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final map = _categories;
    final subs = map[_major] ?? const <String>[];
    return AlertDialog(
      title: Text(widget.rule == null ? '分類ルールを追加' : '分類ルールを編集'),
      content: SizedBox(
        width: 480,
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  controller: _keyword,
                  decoration: const InputDecoration(
                    labelText: '店名・キーワード',
                    border: OutlineInputBorder(),
                  ),
                  validator: (value) =>
                      (value?.trim().isEmpty ?? true) ? '入力してください' : null,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _ruleType,
                  decoration: const InputDecoration(
                    labelText: '一致方法',
                    border: OutlineInputBorder(),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'equals', child: Text('完全一致')),
                    DropdownMenuItem(
                      value: 'starts_with',
                      child: Text('前方一致'),
                    ),
                    DropdownMenuItem(value: 'contains', child: Text('部分一致')),
                  ],
                  onChanged: (value) =>
                      setState(() => _ruleType = value ?? 'equals'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _type,
                  decoration: const InputDecoration(
                    labelText: '取引種別',
                    border: OutlineInputBorder(),
                  ),
                  items: const [
                    DropdownMenuItem(value: '支出', child: Text('支出')),
                    DropdownMenuItem(value: '収入', child: Text('収入')),
                    DropdownMenuItem(value: '移動', child: Text('移動')),
                  ],
                  onChanged: (value) {
                    if (value != null) _changeType(value);
                  },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _major,
                  decoration: const InputDecoration(
                    labelText: '大カテゴリ',
                    border: OutlineInputBorder(),
                  ),
                  items: map.keys
                      .map((value) =>
                          DropdownMenuItem(value: value, child: Text(value)))
                      .toList(),
                  onChanged: (value) {
                    if (value == null) return;
                    setState(() {
                      _major = value;
                      _sub = map[value]!.first;
                    });
                  },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: subs.contains(_sub) ? _sub : subs.first,
                  decoration: const InputDecoration(
                    labelText: '小カテゴリ',
                    border: OutlineInputBorder(),
                  ),
                  items: subs
                      .map((value) =>
                          DropdownMenuItem(value: value, child: Text(value)))
                      .toList(),
                  onChanged: (value) =>
                      setState(() => _sub = value ?? subs.first),
                ),
                if (_type == '支出') ...[
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _purpose,
                    decoration: const InputDecoration(
                      labelText: '用途',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(value: '私用', child: Text('私用')),
                      DropdownMenuItem(value: '経費', child: Text('経費')),
                    ],
                    onChanged: (value) =>
                        setState(() => _purpose = value ?? '私用'),
                  ),
                  if (_purpose == '経費') ...[
                    const SizedBox(height: 8),
                    Text('経費率 ${(_expenseRatio * 100).round()}%'),
                    Slider(
                      value: _expenseRatio,
                      divisions: 20,
                      onChanged: (value) =>
                          setState(() => _expenseRatio = value),
                    ),
                  ],
                ],
                const SizedBox(height: 12),
                TextFormField(
                  controller: _note,
                  decoration: const InputDecoration(
                    labelText: 'メモ',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _saving ? null : () => Navigator.pop(context, false),
          child: const Text('キャンセル'),
        ),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: Text(_saving ? '保存中…' : '保存'),
        ),
      ],
    );
  }
}

class _EmptyList extends StatelessWidget {
  const _EmptyList({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        SizedBox(
          height: 320,
          child: Center(child: Text(text)),
        ),
      ],
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry});
  final Object error;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48),
            const SizedBox(height: 12),
            Text(
              error.toString().replaceFirst('Exception: ', ''),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('再読み込み'),
            ),
          ],
        ),
      ),
    );
  }
}
