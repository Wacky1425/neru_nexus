import 'package:flutter/material.dart';

import '../../core/constants/api_constants.dart';
import 'system_diagnostics_model.dart';
import 'system_service.dart';

class SystemDiagnosticsPage extends StatefulWidget {
  const SystemDiagnosticsPage({super.key});

  @override
  State<SystemDiagnosticsPage> createState() => _SystemDiagnosticsPageState();
}

class _SystemDiagnosticsPageState extends State<SystemDiagnosticsPage> {
  final _service = const SystemService();
  late Future<SystemDiagnosticsModel> _future;
  bool _working = false;

  @override
  void initState() {
    super.initState();
    _future = _service.fetchDiagnostics();
  }

  Future<void> _reload() async {
    final future = _service.fetchDiagnostics();
    setState(() => _future = future);
    await future;
  }

  Future<void> _createBackup() async {
    if (_working) return;
    setState(() => _working = true);
    try {
      final result = await _service.createBackup();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('バックアップを作成しました: ${result['fileName'] ?? ''}')),
      );
      await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('システム診断'),
        actions: [IconButton(onPressed: _reload, icon: const Icon(Icons.refresh))],
      ),
      body: FutureBuilder<SystemDiagnosticsModel>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting && !snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(snapshot.error.toString().replaceFirst('Exception: ', '')),
              ),
            );
          }
          final data = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
            children: [
              Card(
                child: ListTile(
                  leading: Icon(
                    data.integrityOk ? Icons.verified_outlined : Icons.error_outline,
                    color: data.integrityOk ? null : Theme.of(context).colorScheme.error,
                  ),
                  title: Text(data.integrityOk ? 'データ整合性: OK' : 'データ整合性: 要確認'),
                  subtitle: Text('API v${data.apiVersion} / App API v${ApiConstants.apiVersion}'),
                ),
              ),
              const SizedBox(height: 12),
              ...data.checks.map((check) => Card(
                    child: ListTile(
                      dense: true,
                      leading: Icon(check.ok ? Icons.check_circle_outline : Icons.cancel_outlined),
                      title: Text(check.name),
                      subtitle: Text(check.detail),
                    ),
                  )),
              if (data.warnings.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text('警告', style: Theme.of(context).textTheme.titleMedium),
                ...data.warnings.map((e) => ListTile(leading: const Icon(Icons.warning_amber), title: Text(e))),
              ],
              const SizedBox(height: 20),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('バックアップ', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 8),
                      Text(data.latestBackupName.isEmpty
                          ? 'まだバックアップがありません'
                          : '最新: ${data.latestBackupName}\n${data.latestBackupCreatedAt}'),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: _working ? null : _createBackup,
                          icon: const Icon(Icons.backup_outlined),
                          label: Text(_working ? '作成中...' : '今すぐバックアップ'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (data.recentErrors.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text('最近のAPIエラー', style: Theme.of(context).textTheme.titleMedium),
                ...data.recentErrors.map((e) => Card(
                      child: ListTile(
                        title: Text(e.action.isEmpty ? 'API' : e.action),
                        subtitle: Text('${e.loggedAt}\n${e.message}'),
                      ),
                    )),
              ],
            ],
          );
        },
      ),
    );
  }
}
