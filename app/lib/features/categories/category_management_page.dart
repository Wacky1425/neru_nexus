import 'package:flutter/material.dart';

import '../../core/master/master_repository.dart';
import '../master/model/master_model.dart';
import 'widgets/add_category_dialog.dart';
import 'widgets/edit_category_dialog.dart';

class CategoryManagementPage extends StatefulWidget {
  const CategoryManagementPage({super.key});

  @override
  State<CategoryManagementPage> createState() => _CategoryManagementPageState();
}

class _CategoryManagementPageState extends State<CategoryManagementPage> {
  final MasterRepository _masterRepository = const MasterRepository();

  late Future<MasterModel> _masterFuture;

  String _selectedType = '支出';

  @override
  void initState() {
    super.initState();

    _masterFuture = _masterRepository.getMaster();
  }

  Future<void> _reload() async {
    final future = _masterRepository.getMaster(forceRefresh: true);

    setState(() {
      _masterFuture = future;
    });

    await future;
  }

  Future<void> _openAddCategory(MasterModel master) async {
    final result = await showDialog<CategoryCreateResult>(
      context: context,
      builder: (_) {
        return AddCategoryDialog(master: master, initialType: _selectedType);
      },
    );

    if (result == null || !mounted) {
      return;
    }

    setState(() {
      _selectedType = result.type;
    });

    await _reload();
  }

  Future<void> _openEditCategory(CategoryMaster category) async {
    final changed = await showDialog<bool>(
      context: context,
      builder: (_) {
        return EditCategoryDialog(category: category);
      },
    );

    if (changed != true || !mounted) {
      return;
    }

    await _reload();

    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('カテゴリを更新しました')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('カテゴリ管理')),
      body: FutureBuilder<MasterModel>(
        future: _masterFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _ErrorState(error: snapshot.error, onRetry: _reload);
          }

          final master = snapshot.data;

          if (master == null) {
            return const Center(child: Text('カテゴリデータがありません'));
          }

          final transactionTypes = master.transactionTypes.isNotEmpty
              ? master.transactionTypes
              : const ['支出', '収入'];

          if (!transactionTypes.contains(_selectedType)) {
            _selectedType = transactionTypes.first;
          }

          final categories =
              master.categories
                  .where(
                    (category) =>
                        category.type == _selectedType && category.active,
                  )
                  .toList()
                ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

          final grouped = <String, List<CategoryMaster>>{};

          for (final category in categories) {
            grouped.putIfAbsent(category.majorCategory, () => []);

            grouped[category.majorCategory]!.add(category);
          }

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: DropdownButtonFormField<String>(
                  initialValue: _selectedType,
                  decoration: const InputDecoration(
                    labelText: '取引種別',
                    border: OutlineInputBorder(),
                  ),
                  items: transactionTypes
                      .map(
                        (type) => DropdownMenuItem<String>(
                          value: type,
                          child: Text(type),
                        ),
                      )
                      .toList(),
                  onChanged: (value) {
                    if (value == null) {
                      return;
                    }

                    setState(() {
                      _selectedType = value;
                    });
                  },
                ),
              ),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: _reload,
                  child: grouped.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: const [
                            SizedBox(
                              height: 300,
                              child: Center(child: Text('カテゴリがありません')),
                            ),
                          ],
                        )
                      : ListView(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                          children: grouped.entries
                              .map(
                                (entry) => _CategoryGroupCard(
                                  majorCategory: entry.key,
                                  categories: entry.value,
                                  onEdit: _openEditCategory,
                                ),
                              )
                              .toList(),
                        ),
                ),
              ),
            ],
          );
        },
      ),
      floatingActionButton: FutureBuilder<MasterModel>(
        future: _masterFuture,
        builder: (context, snapshot) {
          final master = snapshot.data;

          return FloatingActionButton.extended(
            onPressed: master == null
                ? null
                : () {
                    _openAddCategory(master);
                  },
            icon: const Icon(Icons.add),
            label: const Text('カテゴリ追加'),
          );
        },
      ),
    );
  }
}

class _CategoryGroupCard extends StatelessWidget {
  const _CategoryGroupCard({
    required this.majorCategory,
    required this.categories,
    required this.onEdit,
  });

  final String majorCategory;
  final List<CategoryMaster> categories;
  final Future<void> Function(CategoryMaster category) onEdit;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ExpansionTile(
        title: Text(
          majorCategory,
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: Text('${categories.length}件'),
        children: categories
            .map(
              (category) => ListTile(
                title: Text(category.subCategory),
                subtitle: Text(
                  category.active
                      ? category.subCategoryId
                      : '${category.subCategoryId}・無効',
                ),
                trailing: const Icon(Icons.edit_outlined),
                onTap: () {
                  onEdit(category);
                },
              ),
            )
            .toList(),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.error, required this.onRetry});

  final Object? error;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    final message = error.toString().replaceFirst('Exception: ', '');

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
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
