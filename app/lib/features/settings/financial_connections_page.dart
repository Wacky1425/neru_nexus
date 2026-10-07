import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../transactions/model/transaction_model.dart';
import '../transactions/service/transaction_service.dart';

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
              child: Text('三井住友銀行のWebログイン状態を再利用し、ログイン後ページから残高・明細を取得します。'),
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

class _SmbcConnectionPageState extends State<SmbcConnectionPage> with WidgetsBindingObserver {
  static final Uri _smbcWebLoginUri = Uri.parse('https://direct.smbc.co.jp/ib/web/loginlogout/LLDLDILdirecttop.smbc');
  static const _secureStorage = FlutterSecureStorage();
  late final WebViewController _controller;
  bool _autoLoginAttempted = false;
  bool _loading = true;
  bool _analyzing = false;
  bool _waitingForSmbcApproval = false;
  bool _automationBusy = false;
  bool _launchingSmbcApp = false;
  String _currentUrl = '';
  String? _error;
  String? _pageTitle;
  String? _balance;
  String? _accountType;
  String? _diagnostic;
  List<_SmbcTransaction> _transactions = const [];
  List<_SmbcMatchResult> _matchResults = const [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (request) async {
          final uri = Uri.tryParse(request.url);
          if (uri == null) return NavigationDecision.prevent;
          if (uri.scheme == 'http' || uri.scheme == 'https') return NavigationDecision.navigate;
          try {
            if (mounted) {
              setState(() => _waitingForSmbcApproval = true);
            }
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
          // If a persisted session restored directly to the statement page,
          // parse it automatically. Re-authentication remains an explicit
          // SMBC/biometric step when the bank requires it.
          if (!_analyzing && _looksLikeStatementUrl(url)) {
            _analyzePage();
          } else {
            _recoverFromExpiredDirectSession();
            _tryAutoFillLogin();
            _advanceSmbcFlow();
          }
        },
        onWebResourceError: (error) {
          if (error.isForMainFrame != true || !mounted) return;
          setState(() { _loading = false; _error = error.description; });
        },
      ))
      ..loadRequest(_smbcWebLoginUri);

  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  bool _looksLikeStatementUrl(String url) =>
      url.contains('direct3.smbc.co.jp') && url.contains('/sp/web/top/');

  Future<void> _openLogin() async {
    _autoLoginAttempted = false;
    await _controller.loadRequest(_smbcWebLoginUri);
  }

  Future<void> _tryAutoFillLogin() async {
    if (_autoLoginAttempted) return;
    try {
      final raw = await _controller.runJavaScriptReturningResult(
        'document.body ? document.body.innerText : ""',
      );
      final text = _jsString(raw);
      if (!text.contains('SMBCダイレクトログイン') ||
          !text.contains('店番号') ||
          !text.contains('口座番号') ||
          !text.contains('ログイン暗証')) {
        return;
      }

      final branch = await _secureStorage.read(key: 'smbc_branch');
      final account = await _secureStorage.read(key: 'smbc_account');
      final pin = await _secureStorage.read(key: 'smbc_pin');
      if (branch == null || account == null || pin == null) {
        if (mounted) await _showCredentialSetup();
        return;
      }

      _autoLoginAttempted = true;
      final payload = jsonEncode({
        'branch': branch,
        'account': account,
        'pin': pin,
      });
      await _controller.runJavaScript('''
        (() => {
          const v = $payload;
          const inputs = [...document.querySelectorAll('input')];
          const visible = inputs.filter((e) => e.type !== 'hidden' && !e.disabled);
          const set = (el, value) => {
            if (!el) return;
            const setter = Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype, 'value'
            )?.set;
            if (setter) setter.call(el, value); else el.value = value;
            el.dispatchEvent(new Event('input', {bubbles:true}));
            el.dispatchEvent(new Event('change', {bubbles:true}));
          };
          const byHint = (words) => visible.find((e) => {
            const s = [e.name,e.id,e.placeholder,e.getAttribute('aria-label')]
              .filter(Boolean).join(' ').toLowerCase();
            return words.some((w) => s.includes(w));
          });
          const branch = byHint(['branch','tenban','店番']) || visible[0];
          const account = byHint(['account','kouza','口座']) || visible[1];
          const pin = byHint(['password','pin','ansho','暗証']) ||
            visible.find((e) => e.type === 'password') || visible[2];
          set(branch, v.branch); set(account, v.account); set(pin, v.pin);
          // Never search/click anchors here. Submit only the form that owns
          // the detected login fields so unrelated links (e.g. regulations)
          // can never be selected.
          const form = pin?.form || account?.form || branch?.form;
          if (!form || !branch || !account || !pin) return;
          if (!branch.value || !account.value || !pin.value) return;
          const submit = [...form.querySelectorAll(
            'button[type="submit"],input[type="submit"]'
          )].find((e) => !e.disabled);
          if (submit) {
            submit.click();
          } else if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          }
        })();
      ''');
      await Future<void>.delayed(const Duration(milliseconds: 700));
      await _advanceSmbcFlow();
    } catch (_) {
      // Leave the official page usable manually if its DOM changes.
    }
  }

  Future<void> _showCredentialSetup() async {
    if (!mounted) return;
    final branch = TextEditingController();
    final account = TextEditingController();
    final pin = TextEditingController();
    final save = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        title: const Text('SMBCログイン情報を保存'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                '初回だけ入力します。端末のセキュアストレージに保存し、GASやGitHubには送信しません。',
              ),
              const SizedBox(height: 12),
              TextField(
                controller: branch,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: '店番号'),
              ),
              TextField(
                controller: account,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: '口座番号'),
              ),
              TextField(
                controller: pin,
                keyboardType: TextInputType.number,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'ログイン暗証'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('今回は手入力'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('保存してログイン'),
          ),
        ],
      ),
    );
    if (save != true) return;
    if (branch.text.trim().isEmpty ||
        account.text.trim().isEmpty ||
        pin.text.isEmpty) {
      return;
    }
    await _secureStorage.write(key: 'smbc_branch', value: branch.text.trim());
    await _secureStorage.write(key: 'smbc_account', value: account.text.trim());
    await _secureStorage.write(key: 'smbc_pin', value: pin.text);
    _autoLoginAttempted = false;
    await _tryAutoFillLogin();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _waitingForSmbcApproval) {
      _waitingForSmbcApproval = false;
      _launchingSmbcApp = false;
      _continueAfterSmbcApproval();
    }
  }

  Future<void> _continueAfterSmbcApproval() async {
    // SMBC's browser flow requires returning to the original browser after
    // approval. Detect the confirmation page and press its completion action.
    await Future<void>.delayed(const Duration(milliseconds: 700));
    try {
      final raw = await _controller.runJavaScriptReturningResult(
        'document.body ? document.body.innerText : ""',
      );
      final text = _jsString(raw);
      if (text.contains('承認操作を完了しました') ||
          text.contains('ログインの確認') ||
          text.contains('アプリで承認')) {
        await _controller.runJavaScript(r'''
          (() => {
            const labels = ['承認操作を完了しました', '確認', '次へ'];
            const nodes = [...document.querySelectorAll('button, input[type="button"], input[type="submit"], a')];
            const target = nodes.find((el) => {
              const label = (el.innerText || el.value || el.textContent || '').trim();
              return labels.some((x) => label.includes(x));
            });
            if (target) target.click();
          })();
        ''');
      }
      await Future<void>.delayed(const Duration(milliseconds: 700));
      await _advanceSmbcFlow();
    } catch (_) {
      // If SMBC changed the confirmation DOM, leave the page visible so the
      // user can finish manually instead of guessing another action.
    }
  }

  Future<void> _advanceSmbcFlow() async {
    if (_automationBusy || _analyzing) return;
    _automationBusy = true;
    try {
      final raw = await _controller.runJavaScriptReturningResult(
        'document.body ? document.body.innerText : ""',
      );
      final text = _jsString(raw);
      if (!_launchingSmbcApp &&
          (text.contains('三井住友銀行アプリ') || text.contains('アプリで承認')) &&
          (text.contains('起動') || text.contains('承認'))) {
        _launchingSmbcApp = true;
        await _controller.runJavaScript(r'''
          (() => {
            const nodes = [...document.querySelectorAll('button,a,input[type="button"],input[type="submit"]')];
            const target = nodes.find((e) => {
              const s = (e.innerText || e.value || e.textContent || '').trim();
              return (s.includes('三井住友銀行アプリ') || s.includes('アプリ')) &&
                     (s.includes('起動') || s.includes('承認') || s.includes('開く'));
            });
            if (target) target.click();
          })();
        ''');
        return;
      }

      if (text.contains('承認操作を完了しました')) {
        await _controller.runJavaScript(r'''
          (() => {
            const nodes = [...document.querySelectorAll('button,input[type="submit"],input[type="button"],a')];
            const target = nodes.find((e) =>
              ((e.innerText || e.value || e.textContent || '').trim())
                .includes('承認操作を完了しました'));
            if (target) target.click();
          })();
        ''');
        return;
      }

      // Do not guess account-navigation links from page text. The SMBC login
      // page itself contains "普通預金規定", which previously matched the broad
      // "普通預金" rule and sent the WebView to the regulations page.
      // Account selection will be automated only after its actual DOM has been
      // identified on a confirmed authenticated page.
    } catch (_) {
      // Keep the current official page visible if SMBC changes its DOM.
    } finally {
      _automationBusy = false;
    }
  }

  Future<void> _recoverFromExpiredDirectSession() async {
    try {
      final raw = await _controller.runJavaScriptReturningResult(
        'document.body ? document.body.innerText : ""',
      );
      final text = _jsString(raw);
      if (text.contains('もう一度ログインからお手続きし直してください') ||
          text.contains('SMBCダイレクトのログインはこちら')) {
        await _openLogin();
      }
    } catch (_) {
      // A normal login page may block DOM access while navigating. No action needed.
    }
  }

  Future<void> _analyzePage() async {
    setState(() { _analyzing = true; _diagnostic = null; });
    try {
      final titleRaw = await _controller.runJavaScriptReturningResult('document.title || ""');
      final textRaw = await _controller.runJavaScriptReturningResult(
        'document.body ? document.body.innerText : ""',
      );
      final title = _jsString(titleRaw);
      final pageText = _jsString(textRaw).replaceAll('\r', '');
      final balance = _extractBalance(pageText);
      final accountType = _extractAccountType(pageText);
      final transactions = _extractTransactions(pageText);
      final matchResults = await _matchTransactions(transactions);
      final safe = _sanitize(pageText);
      if (!mounted) return;
      setState(() {
        _pageTitle = title;
        _balance = balance;
        _accountType = accountType;
        _transactions = transactions;
        _matchResults = matchResults;
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
    final raw = value is String ? value : value.toString();
    // On Android, runJavaScriptReturningResult may return a JSON-encoded
    // JavaScript string (quotes + literal \\n). Decode it before parsing DOM text.
    if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is String) return decoded;
      } catch (_) {
        // Fall through: some WebView versions already return the plain string.
      }
    }
    return raw;
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

  List<_SmbcTransaction> _extractTransactions(String text) {
    final lines = text.replaceAll('\r', '').split('\n').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
    final result = <_SmbcTransaction>[];
    int? year;
    final yearMonthPattern = RegExp(r'^(20\d{2})年(\d{1,2})月');
    final dayPattern = RegExp(r'^(\d{1,2})月(\d{1,2})日');
    final amountPattern = RegExp(r'^([0-9,]+)円');
    final balancePattern = RegExp(r'^残高([0-9,]+)円');
    for (var i = 0; i < lines.length; i++) {
      final ym = yearMonthPattern.firstMatch(lines[i]);
      if (ym != null) { year = int.parse(ym.group(1)!); continue; }
      final dm = dayPattern.firstMatch(lines[i]);
      if (dm == null || year == null || i < 1 || i + 2 >= lines.length) continue;
      final amountMatch = amountPattern.firstMatch(lines[i + 1]);
      final balanceMatch = balancePattern.firstMatch(lines[i + 2]);
      if (amountMatch == null || balanceMatch == null) continue;
      result.add(_SmbcTransaction(
        date: DateTime(year, int.parse(dm.group(1)!), int.parse(dm.group(2)!)),
        description: lines[i - 1],
        amount: int.parse(amountMatch.group(1)!.replaceAll(',', '')),
        runningBalance: int.parse(balanceMatch.group(1)!.replaceAll(',', '')),
      ));
    }
    for (var i = 0; i + 1 < result.length; i++) {
      final delta = result[i].runningBalance - result[i + 1].runningBalance;
      if (delta.abs() == result[i].amount) result[i].signedAmount = delta;
    }
    return result;
  }

  Future<List<_SmbcMatchResult>> _matchTransactions(List<_SmbcTransaction> bankItems) async {
    if (bankItems.isEmpty) return const [];
    final service = const TransactionService();
    final months = bankItems.map((e) => '${e.date.year}-${e.date.month.toString().padLeft(2, '0')}').toSet();
    final existing = <TransactionModel>[];
    for (final month in months) {
      final page = await service.fetchTransactionPage(limit: 500, yearMonth: month);
      existing.addAll(page.items);
    }
    return bankItems.map((bank) {
      final exact = existing.where((tx) {
        final date = DateTime.tryParse(tx.transactionDate.replaceFirst(' ', 'T'));
        return date != null &&
            date.year == bank.date.year &&
            date.month == bank.date.month &&
            date.day == bank.date.day &&
            tx.amount.abs() == bank.amount;
      }).toList();
      if (exact.isNotEmpty) {
        return _SmbcMatchResult(bank: bank, status: _SmbcMatchStatus.matched, candidates: exact);
      }
      final near = existing.where((tx) {
        final date = DateTime.tryParse(tx.transactionDate.replaceFirst(' ', 'T'));
        if (date == null || tx.amount.abs() != bank.amount) return false;
        final bankDay = DateTime(bank.date.year, bank.date.month, bank.date.day);
        final txDay = DateTime(date.year, date.month, date.day);
        return bankDay.difference(txDay).inDays.abs() <= 3;
      }).toList();
      if (near.isNotEmpty) {
        return _SmbcMatchResult(bank: bank, status: _SmbcMatchStatus.review, candidates: near);
      }
      return _SmbcMatchResult(bank: bank, status: _SmbcMatchStatus.newCandidate, candidates: const []);
    }).toList();
  }

  String _sanitize(String text) {
    var s = text;
    s = s.replaceAll(RegExp(r'(?<!\d)\d{7,8}(?!\d)'), '[口座番号]');
    s = s.replaceAll(RegExp(r'(?<!\d)\d{10,}(?!\d)'), '[番号]');
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
            leading: IconButton(
              tooltip: 'Neru Nexusへ戻る',
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.close),
            ),
            title: const Text('三井住友銀行'),
            actions: [
              IconButton(
                tooltip: 'Webログイン',
                onPressed: _openLogin,
                icon: const Icon(Icons.login),
              ),
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
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    children: [
                      Text('ログイン状態を復元できませんでした: $_error'),
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        onPressed: _openLogin,
                        icon: const Icon(Icons.login),
                        label: const Text('Webでログイン'),
                      ),
                    ],
                  ),
                ),
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
                    Text('構造化明細: ${_transactions.length}件'),
                    Text('一致済み: ${_matchResults.where((e) => e.status == _SmbcMatchStatus.matched).length}件'),
                    Text('新規候補: ${_matchResults.where((e) => e.status == _SmbcMatchStatus.newCandidate).length}件'),
                    Text('要確認: ${_matchResults.where((e) => e.status == _SmbcMatchStatus.review).length}件'),
                    const SizedBox(height: 16),
                    const Text('照合プレビュー', style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    ..._matchResults.map((result) => Card(
                      child: ListTile(
                        dense: true,
                        leading: Icon(switch (result.status) {
                          _SmbcMatchStatus.matched => Icons.check_circle_outline,
                          _SmbcMatchStatus.newCandidate => Icons.add_circle_outline,
                          _SmbcMatchStatus.review => Icons.help_outline,
                        }),
                        title: Text(result.bank.description),
                        subtitle: Text(
                          '${result.bank.date.year}/${result.bank.date.month.toString().padLeft(2, '0')}/${result.bank.date.day.toString().padLeft(2, '0')}'
                          '  残高 ¥${result.bank.runningBalance}'
                          '${result.candidates.isEmpty ? '' : '  候補${result.candidates.length}件'}',
                        ),
                        trailing: Text(
                          '${result.bank.signedAmount != null && result.bank.signedAmount! > 0 ? '+' : result.bank.signedAmount != null ? '-' : ''}¥${result.bank.amount}',
                        ),
                      ),
                    )),
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
}


class _SmbcTransaction {
  _SmbcTransaction({required this.date, required this.description, required this.amount, required this.runningBalance});
  final DateTime date;
  final String description;
  final int amount;
  final int runningBalance;
  int? signedAmount;
}


enum _SmbcMatchStatus { matched, newCandidate, review }

class _SmbcMatchResult {
  const _SmbcMatchResult({required this.bank, required this.status, required this.candidates});
  final _SmbcTransaction bank;
  final _SmbcMatchStatus status;
  final List<TransactionModel> candidates;
}
