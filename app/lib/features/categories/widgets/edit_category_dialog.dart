import 'package:flutter/material.dart';

import '../../master/model/master_model.dart';
import '../service/category_service.dart';

class EditCategoryDialog extends StatefulWidget {
  const EditCategoryDialog({super.key, required this.category});

  final CategoryMaster category;

  @override
  State<EditCategoryDialog> createState() => _EditCategoryDialogState();
}

class _EditCategoryDialogState extends State<EditCategoryDialog> {
  final _formKey = GlobalKey<FormState>();
  final _service = const CategoryService();

  late final TextEditingController _majorController;

  late final TextEditingController _subController;

  late bool _active;

  bool _isSaving = false;

  @override
  void initState() {
    super.initState();

    _majorController = TextEditingController(
      text: widget.category.majorCategory,
    );

    _subController = TextEditingController(text: widget.category.subCategory);

    _active = widget.category.active;
  }

  @override
  void dispose() {
    _majorController.dispose();
    _subController.dispose();

    super.dispose();
  }

  Future<void> _save() async {
    if (_isSaving || !_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isSaving = true;
    });

    try {
      await _service.updateCategory(
        subCategoryId: widget.category.subCategoryId,
        majorCategory: _majorController.text.trim(),
        subCategory: _subController.text.trim(),
        active: _active,
      );

      if (!mounted) {
        return;
      }

      Navigator.of(context).pop(true);
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
    return AlertDialog(
      title: const Text('カテゴリ編集'),
      content: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: _majorController,
                enabled: !_isSaving,
                decoration: const InputDecoration(
                  labelText: '大カテゴリ',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return '大カテゴリを入力してください';
                  }

                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _subController,
                enabled: !_isSaving,
                decoration: const InputDecoration(
                  labelText: '小カテゴリ',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return '小カテゴリを入力してください';
                  }

                  return null;
                },
              ),
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('有効'),
                subtitle: Text(
                  _active ? '入力画面の選択肢に表示します' : '過去データは残し、新規入力では非表示にします',
                ),
                value: _active,
                onChanged: _isSaving
                    ? null
                    : (value) {
                        setState(() {
                          _active = value;
                        });
                      },
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isSaving
              ? null
              : () {
                  Navigator.of(context).pop(false);
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
              : const Text('保存'),
        ),
      ],
    );
  }
}
