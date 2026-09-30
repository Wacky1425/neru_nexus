import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/network/api_client.dart';

class AppUpdatePage extends StatefulWidget {
  const AppUpdatePage({super.key});

  @override
  State<AppUpdatePage> createState() => _AppUpdatePageState();
}

class _AppUpdatePageState extends State<AppUpdatePage> {
  bool loading = true;
  String currentVersion = '-';
  int currentBuild = 0;
  Map<String, dynamic> release = {};
  String? error;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });

    try {
      final package = await PackageInfo.fromPlatform();
      if (mounted) {
        setState(() {
          currentVersion = package.version;
          currentBuild = int.tryParse(package.buildNumber) ?? 0;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = '現在のアプリ情報を取得できませんでした\n$e');
      }
    }

    try {
      // ApiClient already unwraps the server's { data: ... } envelope.
      final data = await ApiClient.get(action: 'app_update_info');
      if (!mounted) return;
      setState(() {
        release = Map<String, dynamic>.from(data);
        error = null;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          error =
              '最新版の確認に失敗しました。通信状態を確認して再読み込みしてください。\n$e';
        });
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  int get latestBuild =>
      int.tryParse('${release['buildNumber'] ?? 0}') ?? 0;

  Future<void> download() async {
    final uri = Uri.tryParse('${release['apkUrl'] ?? ''}'.trim());
    if (uri == null || uri.scheme != 'https') return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final hasRemoteInfo = release.isNotEmpty && latestBuild > 0;
    final hasUpdate = hasRemoteInfo && latestBuild > currentBuild;

    return Scaffold(
      appBar: AppBar(title: const Text('アプリ更新')),
      body: RefreshIndicator(
        onRefresh: load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Text('現在: $currentVersion ($currentBuild)'),
            Text(
              hasRemoteInfo
                  ? '最新: ${release['version'] ?? '-'} ($latestBuild)'
                  : '最新: 確認できません',
            ),
            const SizedBox(height: 16),
            if (loading)
              const Center(child: CircularProgressIndicator())
            else ...[
              if (error != null) ...[
                Text(error!),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: load,
                  icon: const Icon(Icons.refresh),
                  label: const Text('再読み込み'),
                ),
              ] else if (hasUpdate)
                FilledButton.icon(
                  onPressed: download,
                  icon: const Icon(Icons.download_outlined),
                  label: const Text('最新版APKをダウンロード'),
                )
              else if (hasRemoteInfo)
                const Text('最新版です'),
            ],
            if ('${release['releaseNotes'] ?? ''}'.trim().isNotEmpty) ...[
              const SizedBox(height: 16),
              const Text(
                '更新内容',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              Text('${release['releaseNotes']}'),
            ],
          ],
        ),
      ),
    );
  }
}
