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
    setState(() { loading = true; error = null; });
    try {
      final package = await PackageInfo.fromPlatform();
      final response = await ApiClient.get(action: 'app_update_info');
      final data = response['data'];
      if (!mounted) return;
      setState(() {
        currentVersion = package.version;
        currentBuild = int.tryParse(package.buildNumber) ?? 0;
        release = data is Map ? Map<String, dynamic>.from(data) : {};
      });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  int get latestBuild => int.tryParse('${release['buildNumber'] ?? 0}') ?? 0;

  Future<void> download() async {
    final uri = Uri.tryParse('${release['apkUrl'] ?? ''}'.trim());
    if (uri == null || uri.scheme != 'https') return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final hasUpdate = latestBuild > currentBuild;
    return Scaffold(
      appBar: AppBar(title: const Text('アプリ更新')),
      body: RefreshIndicator(
        onRefresh: load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Text('現在: $currentVersion ($currentBuild)'),
            Text('最新: ${release['version'] ?? '-'} ($latestBuild)'),
            const SizedBox(height: 16),
            if (loading) const Center(child: CircularProgressIndicator())
            else if (error != null) Text('更新情報を取得できませんでした\n$error')
            else if (hasUpdate)
              FilledButton.icon(
                onPressed: download,
                icon: const Icon(Icons.download_outlined),
                label: const Text('最新版APKをダウンロード'),
              )
            else
              const Text('最新版です'),
            if ('${release['releaseNotes'] ?? ''}'.trim().isNotEmpty) ...[
              const SizedBox(height: 16),
              const Text('更新内容', style: TextStyle(fontWeight: FontWeight.bold)),
              Text('${release['releaseNotes']}'),
            ],
          ],
        ),
      ),
    );
  }
}
