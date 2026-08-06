import 'package:flutter/material.dart';

import '../../master/model/master_model.dart';
import '../model/category_create_request.dart';
import '../service/category_service.dart';

class CategoryCreateResult {
  const CategoryCreateResult({
    required this.type,
    required this.majorCategory,
    required this.subCategory,
  });

  final String type;
  final String majorCategory;
  final String subCategory;
}

class AddCategoryDialog extends StatefulWidget {
  const AddCategoryDialog({
    super.key,
    required this.master,
    required this.initialType,
    this.initialMajorCategory,
  });

  final MasterModel master;
  final String initialType;
  final String? initialMajorCategory;

  @override
  State<AddCategoryDialog> createState() => _AddCategoryDialogState();
}

class _AddCategoryDialogState extends State<AddCategoryDialog> {
  final _formKey = GlobalKey<FormState>();
  final _categoryService = const CategoryService();

  final _newMajorController = TextEditingController();
  final _subCategoryController = TextEditingController();

  late String _selectedType;
  String? _selectedMajorCategory;

  bool _createNewMajor = false;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();

    _selectedType = widget.initialType;

    final majorCategories = _majorCategoriesForType(_selectedType);

    final initialMajor = widget.initialMajorCategory?.trim();

    if (initialMajor != null && majorCategories.contains(initialMajor)) {
      _selectedMajorCategory = initialMajor;
    } else if (majorCategories.isNotEmpty) {
      _selectedMajorCategory = majorCategories.first;
    }
  }

  @override
  void dispose() {
    _newMajorController.dispose();
    _subCategoryController.dispose();

    super.dispose();
  }

  List<String> _majorCategoriesForType(String type) {
    final result = <String>[];

    for (final category in widget.master.categories) {
      if (category.type != type || !category.active) {
        continue;
      }

      final value = category.majorCategory.trim();

      if (value.isNotEmpty && !result.contains(value)) {
        result.add(value);
      }
    }

    return result;
  }

  List<String> get _transactionTypes {
    final types = widget.master.transactionTypes;

    if (types.isNotEmpty) {
      return types;
    }

    return const ['支出', '収入'];
  }

  String get _resolvedMajorCategory {
    if (_createNewMajor) {
      return _newMajorController.text.trim();
    }

    return _selectedMajorCategory?.trim() ?? '';
  }

  Future<void> _save() async {
    if (_isSaving || !_formKey.currentState!.validate()) {
      return;
    }

    final majorCategory = _resolvedMajorCategory;

    final subCategory = _subCategoryController.text.trim();

    setState(() {
      _isSaving = true;
    });

    try {
      await _categoryService.createCategory(
        CategoryCreateRequest(
          type: _selectedType,
          majorCategory: majorCategory,
          subCategory: subCategory,
        ),
      );

      if (!mounted) {
        return;
      }

      Navigator.of(context).pop(
        CategoryCreateResult(
          type: _selectedType,
          majorCategory: majorCategory,
          subCategory: subCategory,
        ),
      );
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
    final majorCategories = _majorCategoriesForType(_selectedType);

    return AlertDialog(
      title: const Text('カテゴリを追加'),
      content: SizedBox(
        width: 420,
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: _transactionTypes.contains(_selectedType)
                      ? _selectedType
                      : null,
                  decoration: const InputDecoration(
                    labelText: '取引種別',
                    border: OutlineInputBorder(),
                  ),
                  items: _transactionTypes
                      .map(
                        (type) => DropdownMenuItem<String>(
                          value: type,
                          child: Text(type),
                        ),
                      )
                      .toList(),
                  onChanged: _isSaving
                      ? null
                      : (value) {
                          if (value == null) {
                            return;
                          }

                          final categories = _majorCategoriesForType(value);

                          setState(() {
                            _selectedType = value;

                            _selectedMajorCategory = categories.isNotEmpty
                                ? categories.first
                                : null;
                          });
                        },
                ),

                const SizedBox(height: 16),

                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('新しい大カテゴリを作る'),
                  value: _createNewMajor,
                  onChanged: _isSaving
                      ? null
                      : (value) {
                          setState(() {
                            _createNewMajor = value;
                          });
                        },
                ),

                const SizedBox(height: 8),

                if (_createNewMajor)
                  TextFormField(
                    controller: _newMajorController,
                    decoration: const InputDecoration(
                      labelText: '新しい大カテゴリ名',
                      hintText: '例：ペット',
                      border: OutlineInputBorder(),
                    ),
                    validator: (value) {
                      if (!_createNewMajor) {
                        return null;
                      }

                      if (value == null || value.trim().isEmpty) {
                        return '大カテゴリ名を入力してください';
                      }

                      return null;
                    },
                  )
                else
                  DropdownButtonFormField<String>(
                    key: ValueKey('major-$_selectedType'),
                    initialValue:
                        majorCategories.contains(_selectedMajorCategory)
                        ? _selectedMajorCategory
                        : null,
                    decoration: const InputDecoration(
                      labelText: '既存の大カテゴリ',
                      border: OutlineInputBorder(),
                    ),
                    items: majorCategories
                        .map(
                          (category) => DropdownMenuItem<String>(
                            value: category,
                            child: Text(category),
                          ),
                        )
                        .toList(),
                    onChanged: _isSaving
                        ? null
                        : (value) {
                            if (value == null) {
                              return;
                            }

                            setState(() {
                              _selectedMajorCategory = value;
                            });
                          },
                    validator: (value) {
                      if (_createNewMajor) {
                        return null;
                      }

                      if (value == null || value.trim().isEmpty) {
                        return '大カテゴリを選択してください';
                      }

                      return null;
                    },
                  ),

                const SizedBox(height: 16),

                TextFormField(
                  controller: _subCategoryController,
                  autofocus: true,
                  decoration: const InputDecoration(
                    labelText: '小カテゴリ名',
                    hintText: '例：キャンプ用品',
                    border: OutlineInputBorder(),
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return '小カテゴリ名を入力してください';
                    }

                    return null;
                  },
                ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isSaving
              ? null
              : () {
                  Navigator.of(context).pop();
                },
          child: const Text('キャンセル'),
        ),
        FilledButton(
          onPressed: _isSaving ? null : _save,
          child: _isSaving
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('追加する'),
        ),
      ],
    );
  }
}
