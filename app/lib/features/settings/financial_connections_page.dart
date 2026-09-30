import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class FinancialConnectionsPage extends StatelessWidget {
  const FinancialConnectionsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('金融機関連携')),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 12),
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Text(
              'まずは三井住友銀行で、WebViewのログイン状態がアプリ再起動後も維持されるか検証します。'
              'Neru NexusはID・パスワードを保存しません。',
            ),
          ),
          ListTile(
            leading: const Icon(Icons.account_balance_outlined),
            title: const Text('三井住友銀行'),
            subtitle: const Text('SMBCダイレクトを開いてログイン状態を確認'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const SmbcConnectionPage()),
            ),
          ),
        ],
      ),
    );
  }
}

class SmbcConnectionPage extends StatefulWidget {
  const SmbcConnectionPage({super.key});

  @override
  State<SmbcConnectionPage> createState() => _SmbcConnectionPageState();
}

class _SmbcConnectionPageState extends State<SmbcConnectionPage> {
  static final Uri _smbcUri = Uri.parse('https://www.smbc.co.jp/kojin/direct/');

  late final WebViewController _controller;
  bool _loading = true;
  String _currentUrl = '';
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) async {
            final uri = Uri.tryParse(request.url);
            if (uri == null) return NavigationDecision.prevent;
            if (uri.scheme == 'http' || uri.scheme == 'https') {
              return NavigationDecision.navigate;
            }
            try {
              final opened = await launchUrl(
                uri,
                mode: LaunchMode.externalApplication,
              );
              if (!opened && mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('認証アプリを開けませんでした')),
                );
              }
            } catch (_) {
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('認証アプリを開けませんでした')),
                );
              }
            }
            return NavigationDecision.prevent;
          },
          onPageStarted: (url) {
            if (!mounted) return;
            setState(() {
              _loading = true;
              _currentUrl = url;
              _error = null;
            });
          },
          onPageFinished: (url) {
            if (!mounted) return;
            setState(() {
              _loading = false;
              _currentUrl = url;
            });
          },
          onWebResourceError: (error) {
            if (error.isForMainFrame != true || !mounted) return;
            setState(() {
              _loading = false;
              _error = error.description;
            });
          },
        ),
      )
      ..loadRequest(_smbcUri);
  }

  Future<void> _reload() => _controller.reload();

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        if (await _controller.canGoBack()) {
          await _controller.goBack();
          return;
        }
        if (context.mounted) Navigator.of(context).pop(result);
      },
      child: Scaffold(
      appBar: AppBar(
        title: const Text('三井住友銀行'),
        actions: [
          IconButton(
            tooltip: '再読み込み',
            onPressed: _reload,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Column(
        children: [
          Material(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Row(
                children: [
                  const Icon(Icons.lock_outline, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _currentUrl.isEmpty ? 'SMBC公式サイトを読み込み中' : _currentUrl,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_loading) const LinearProgressIndicator(),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text('ページを開けませんでした: $_error'),
            ),
          Expanded(child: WebViewWidget(controller: _controller)),
        ],
      ),
    ),
    );
  }
}
