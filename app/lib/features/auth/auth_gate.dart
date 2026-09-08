import 'package:flutter/material.dart';

import '../../core/auth/auth_session.dart';
import '../app_shell.dart';
import 'auth_service.dart';

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  final AuthService _service = const AuthService();

  bool _loading = true;
  bool _authenticated = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    AuthSession.authenticated.addListener(_onAuthStateChanged);
    _check();
  }

  @override
  void dispose() {
    AuthSession.authenticated.removeListener(_onAuthStateChanged);
    super.dispose();
  }

  void _onAuthStateChanged() {
    if (!mounted) return;

    final authenticated = AuthSession.authenticated.value;

    if (_authenticated != authenticated) {
      setState(() {
        _authenticated = authenticated;
        _loading = false;
      });
    }
  }

  Future<void> _check() async {
    setState(() {
      _loading = true;
      _error = '';
    });

    try {
      await AuthSession.initialize();

      if (!await AuthSession.isPaired()) {
        if (!mounted) return;
        setState(() {
          _authenticated = false;
          _loading = false;
        });
        return;
      }

      await _service.status();

      if (!mounted) return;
      setState(() {
        _authenticated = true;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _authenticated = false;
        _loading = false;
        _error = error.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_authenticated) {
      return const AppShell();
    }

    return PairingPage(
      initialError: _error,
      onPaired: () {
        setState(() {
          _authenticated = true;
          _error = '';
        });
      },
      onRetryExisting: _check,
    );
  }
}

class PairingPage extends StatefulWidget {
  const PairingPage({
    super.key,
    required this.onPaired,
    required this.onRetryExisting,
    this.initialError = '',
  });

  final VoidCallback onPaired;
  final Future<void> Function() onRetryExisting;
  final String initialError;

  @override
  State<PairingPage> createState() => _PairingPageState();
}

class _PairingPageState extends State<PairingPage> {
  final _codeController = TextEditingController();
  final _deviceNameController = TextEditingController(text: 'Neru Nexus端末');
  final AuthService _service = const AuthService();

  bool _saving = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _error = widget.initialError;
  }

  @override
  void dispose() {
    _codeController.dispose();
    _deviceNameController.dispose();
    super.dispose();
  }

  Future<void> _pair() async {
    final code = _codeController.text.replaceAll(RegExp(r'\D'), '');

    if (code.length != 8) {
      setState(() {
        _error = '8桁のペアリングコードを入力してください';
      });
      return;
    }

    setState(() {
      _saving = true;
      _error = '';
    });

    try {
      await _service.pair(
        pairingCode: code,
        deviceName: _deviceNameController.text,
      );

      if (!mounted) return;
      widget.onPaired();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = error.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('端末認証')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.phonelink_lock_outlined, size: 64),
                const SizedBox(height: 20),
                Text(
                  'Neru Nexusをこの端末とペアリング',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                const Text(
                  'Apps Scriptで createV204PairingCode() を実行し、'
                  '表示された8桁コードを10分以内に入力してください。',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _deviceNameController,
                  enabled: !_saving,
                  decoration: const InputDecoration(
                    labelText: '端末名',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _codeController,
                  enabled: !_saving,
                  keyboardType: TextInputType.number,
                  maxLength: 8,
                  decoration: const InputDecoration(
                    labelText: 'ペアリングコード',
                    border: OutlineInputBorder(),
                    counterText: '',
                  ),
                  onSubmitted: (_) => _pair(),
                ),
                if (_error.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: _saving ? null : _pair,
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.link),
                  label: const Text('この端末を認証'),
                ),
                if (widget.initialError.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: _saving ? null : widget.onRetryExisting,
                    child: const Text('保存済み認証でもう一度試す'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
