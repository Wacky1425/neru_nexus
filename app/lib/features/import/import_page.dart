import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'service/import_service.dart';
import 'package:charset/charset.dart';
import '../../core/refresh/app_refresh_controller.dart';

class ImportPage extends StatefulWidget {
  const ImportPage({super.key});

  @override
  State<ImportPage> createState() => _ImportPageState();
}

class _ImportPageState extends State<ImportPage> {
  String? _selectedFileName;
  Uint8List? _selectedFileBytes;

  bool _isImporting = false;

  int? _addedCount;
  int? _skippedCount;
  String? _detectedCsvType;
  String? _errorMessage;
  final _importService = const ImportService();

  Future<void> _selectCsvFile() async {
    if (_isImporting) {
      return;
    }

    try {
      final result = await FilePicker.platform.pickFiles(
        dialogTitle: 'CSVファイルを選択',
        type: FileType.custom,
        allowedExtensions: const ['csv'],
        allowMultiple: false,
        withData: true,
      );

      if (result == null || result.files.isEmpty) {
        return;
      }

      final file = result.files.single;
      final bytes = file.bytes;

      if (bytes == null || bytes.isEmpty) {
        throw Exception('CSVファイルを読み込めませんでした');
      }

      if (!mounted) {
        return;
      }

      setState(() {
        _selectedFileName = file.name;
        _selectedFileBytes = bytes;

        _addedCount = null;
        _skippedCount = null;
        _detectedCsvType = null;
        _errorMessage = null;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _selectedFileName = null;
        _selectedFileBytes = null;

        _errorMessage = error.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  String _decodeCsv(Uint8List bytes) {
    if (bytes.isEmpty) {
      throw Exception('CSVファイルが空です');
    }

    // UTF-8 BOM付き
    if (bytes.length >= 3 &&
        bytes[0] == 0xEF &&
        bytes[1] == 0xBB &&
        bytes[2] == 0xBF) {
      return utf8.decode(bytes.sublist(3), allowMalformed: false);
    }

    // まずUTF-8として読む
    try {
      return utf8.decode(bytes, allowMalformed: false);
    } on FormatException {
      // UTF-8でなければShift_JISとして読む
      try {
        return shiftJis.decode(bytes);
      } catch (_) {
        throw Exception(
          'CSVの文字コードを読み取れませんでした。'
          'UTF-8またはShift_JIS形式のCSVを選択してください。',
        );
      }
    }
  }

  Future<void> _importCsv() async {
    if (_selectedFileName == null ||
        _selectedFileBytes == null ||
        _isImporting) {
      return;
    }

    setState(() {
      _isImporting = true;
      _errorMessage = null;
      _addedCount = null;
      _skippedCount = null;
      _detectedCsvType = null;
    });

    try {
      final csvText = _decodeCsv(_selectedFileBytes!);

      final result = await _importService.importCsv(csvText: csvText);

      if (!mounted) {
        return;
      }

      setState(() {
        _detectedCsvType = result.csvType;
        _addedCount = result.addedCount;
        _skippedCount = result.skippedCount;

        // 取込成功後は選択中CSVを解除
        _selectedFileName = null;
        _selectedFileBytes = null;
      });

      AppRefreshController.refreshAll();

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${result.addedCount}件追加・'
            '${result.skippedCount}件重複スキップしました',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _errorMessage = error.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() {
          _isImporting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('CSV取込')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
          children: [
            Text(
              '明細CSVを取り込む',
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 8),

            Text(
              'Olive、三井住友銀行、PayPayなどの'
              'CSVを選択すると、形式を自動判定して'
              '取引へ登録します。',
              style: Theme.of(context).textTheme.bodyMedium,
            ),

            const SizedBox(height: 24),

            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'CSVファイル',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),

                    const SizedBox(height: 12),

                    OutlinedButton.icon(
                      onPressed: _isImporting ? null : _selectCsvFile,
                      icon: const Icon(Icons.upload_file_outlined),
                      label: const Text('ファイルを選択'),
                    ),

                    const SizedBox(height: 16),

                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: Theme.of(context).colorScheme.outlineVariant,
                        ),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.description_outlined),

                          const SizedBox(width: 12),

                          Expanded(
                            child: Text(
                              _selectedFileName ??
                                  'CSVファイルが'
                                      '選択されていません',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            FilledButton.icon(
              onPressed: _selectedFileName == null || _isImporting
                  ? null
                  : _importCsv,
              icon: _isImporting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.download_done_outlined),
              label: Text(_isImporting ? '取込中...' : '取り込む'),
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
              ),
            ),

            if (_errorMessage != null) ...[
              const SizedBox(height: 20),

              Card(
                child: ListTile(
                  leading: Icon(
                    Icons.error_outline,
                    color: Theme.of(context).colorScheme.error,
                  ),
                  title: const Text('取込に失敗しました'),
                  subtitle: Text(_errorMessage!),
                ),
              ),
            ],

            if (_addedCount != null && _skippedCount != null) ...[
              const SizedBox(height: 20),

              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '取込結果',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.bold),
                      ),

                      const SizedBox(height: 16),

                      _ResultRow(
                        label: '判定形式',
                        value: _detectedCsvType ?? '不明',
                      ),

                      const SizedBox(height: 12),

                      _ResultRow(label: '追加', value: '$_addedCount件'),

                      const SizedBox(height: 12),

                      _ResultRow(label: '重複スキップ', value: '$_skippedCount件'),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ResultRow extends StatelessWidget {
  const _ResultRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
      ],
    );
  }
}
