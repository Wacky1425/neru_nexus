import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

class FinancialConnectionsPage extends StatelessWidget {
  const FinancialConnectionsPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('金融機関連携')),
        body: ListView(
          padding: const EdgeInsets.symmetric(vertical: 12),
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Text('三井住友銀行のログイン状態と、ログイン後ページからの残高取得を検証します。ID・パスワードは保存しません。'),
            ),
            ListTile(
              leading: const Icon(Icons.account_balance_outlined),
              title: const Text('三井住友銀行'),
              subtitle: const Text('SMBCダイレクトを開く・残高を解析'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SmbcConnectionPage()),
              ),
            ),
          ],
        ),
      );
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
  bool _analyzing = false;
  String _currentUrl = '';
  String? _error;
  String? _pageTitle;
  String? _balance;
  String? _accountType;
  String? _diagnostic;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (request) async {
          final uri = Uri.tryParse(request.url);
          if (uri == null) return NavigationDecision.prevent;
          if (uri.scheme == 'http' || uri.scheme == 'https') return NavigationDecision.navigate;
          try {
            final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
            if (!opened && mounted) {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('認証アプリを開けませんでした')));
            }
          } catch (_) {
            if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('認証アプリを開けませんでした')));
          }
          return NavigationDecision.prevent;
        },
        onPageStarted: (url) {
          if (!mounted) return;
          setState(() { _loading = true; _currentUrl = url; _error = null; });
        },
        onPageFinished: (url) {
          if (!mounted) return;
          setState(() { _loading = false; _currentUrl = url; });
        },
        onWebResourceError: (error) {
          if (error.isForMainFrame != true || !mounted) return;
          setState(() { _loading = false; _error = error.description; });
        },
      ))
      ..loadRequest(_smbcUri);
  }

  Future<void> _analyzePage() async {
    setState(() { _analyzing = true; _diagnostic = null; });
    try {
      final titleRaw = await _controller.runJavaScriptReturningResult('document.title || ""');
      final textRaw = await _controller.runJavaScriptReturningResult(
        'document.body ? document.body.innerText : ""',
      );
      final title = _jsString(titleRaw);
      final text = _jsString(textRaw).replaceAll('\r', '');
      final balance = _extractBalance(pageText);
      final accountType = _extractAccountType(pageText);
      final safe = _sanitize(pageText);
      if (!mounted) return;
      setState(() {
        _pageTitle = title;
        _balance = balance;
        _accountType = accountType;
        _diagnostic = safe.length > 1800 ? safe.substring(0, 1800) : safe;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _diagnostic = '解析に失敗しました: $e');
    } finally {
      if (mounted) setState(() => _analyzing = false);
    }
  }

  String _jsString(Object value) {
    var s = value.toString();
    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
      s = s.substring(1, s.length - 1)
          .replaceAll(r'\n', '\n')
          .replaceAll(r'\"', '"')
          .replaceAll(r'\\', r'\');
    }
    return s;
  }

  String? _extractBalance(String text) {
    final patterns = [
      RegExp(r'預金残高\s*([0-9,]+)\s*円'),
      RegExp(r'残高別普通[\s\S]{0,160}?([0-9,]+)\s*円'),
      RegExp(r'残高\s*([0-9,]+)\s*円'),
    ];
    for (final p in patterns) {
      final m = p.firstMatch(text);
      if (m != null) return m.group(1)?.replaceAll(',', '');
    }
    return null;
  }

  String? _extractAccountType(String text) {
    for (final type in const ['残高別普通', '普通預金', '普通', '貯蓄', '当座']) {
      if (text.contains(type)) return type;
    }
    return null;
  }

  String _sanitize(String text) {
    var s = text;
    s = s.replaceAll(RegExp(r'\b\d{7,8}\b'), '[口座番号]');
    s = s.replaceAll(RegExp(r'\b\d{10,}\b'), '[番号]');
    final lines = s.split('\n').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
    return lines.join('\n');
  }

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, result) async {
          if (didPop) return;
          if (await _controller.canGoBack()) {
            await _controller.goBack();
          } else if (context.mounted) {
            Navigator.of(context).pop(result);
          }
        },
        child: Scaffold(
          appBar: AppBar(
            title: const Text('三井住友銀行'),
            actions: [
              IconButton(tooltip: '再読み込み', onPressed: () => _controller.reload(), icon: const Icon(Icons.refresh)),
            ],
          ),
          body: Column(
            children: [
              Material(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Row(children: [
                    const Icon(Icons.lock_outline, size: 18),
                    const SizedBox(width: 8),
                    Expanded(child: Text(_currentUrl.isEmpty ? 'SMBC公式サイトを読み込み中' : _currentUrl,
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall)),
                  ]),
                ),
              ),
              if (_loading) const LinearProgressIndicator(),
              if (_error != null) Padding(padding: const EdgeInsets.all(8), child: Text('ページを開けませんでした: $_error')),
              Expanded(child: WebViewWidget(controller: _controller)),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
                  child: FilledButton.icon(
                    onPressed: _loading || _analyzing ? null : _analyzePage,
                    icon: _analyzing
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.manage_search),
                    label: Text(_analyzing ? '解析中…' : 'このページを解析'),
                  ),
                ),
              ),
            ],
          ),
          floatingActionButton: _diagnostic == null ? null : FloatingActionButton.extended(
            onPressed: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              builder: (_) => DraggableScrollableSheet(
                expand: false,
                initialChildSize: .65,
                maxChildSize: .9,
                builder: (_, controller) => ListView(
                  controller: controller,
                  padding: const EdgeInsets.all(20),
                  children: [
                    const Text('SMBC取得テスト', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 16),
                    Text('ページ: ${_pageTitle ?? "-"}'),
                    Text('口座種別: ${_accountType ?? "未検出"}'),
                    Text('残高: ${_balance == null ? "未検出" : "¥$_balance"}'),
                    const SizedBox(height: 16),
                    const Text('診断テキスト（端末内のみ）', style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    SelectableText(_diagnostic ?? ''),
                    const SizedBox(height: 12),
                    const Text('※ この版ではNeru Nexusの口座残高・取引データにはまだ反映しません。'),
                  ],
                ),
              ),
            ),
            icon: const Icon(Icons.fact_check_outlined),
            label: const Text('解析結果'),
          ),
        ),
      );
