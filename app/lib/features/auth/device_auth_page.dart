import 'package:flutter/material.dart';

import '../../core/auth/auth_session.dart';
import 'auth_service.dart';

class DeviceAuthPage extends StatefulWidget {
  const DeviceAuthPage({super.key});

  @override
  State<DeviceAuthPage> createState() => _DeviceAuthPageState();
}

class _DeviceAuthPageState extends State<DeviceAuthPage> {
  final AuthService _service = const AuthService();

  DeviceAuthStatus? _status;
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = '';
    });

    try {
      final status = await _service.status();

      if (!mounted) return;
      setState(() {
        _status = status;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _revoke() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('端末認証を解除'),
        content: const Text(
          'この端末の認証トークンを無効化します。'
          '次回起動時に新しいペアリングコードが必要になります。',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('キャンセル'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('解除'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() {
      _loading = true;
      _error = '';
    });

    try {
      await _service.revoke();

      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;

    return Scaffold(
      appBar: AppBar(title: const Text('端末認証')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_error.isNotEmpty)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        _error,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  ),
                ListTile(
                  leading: const Icon(Icons.verified_user_outlined),
                  title: const Text('認証状態'),
                  subtitle: Text(
                    status?.paired == true ? '認証済み' : '確認できません',
                  ),
                ),
                ListTile(
                  leading: const Icon(Icons.devices_outlined),
                  title: const Text('端末名'),
                  subtitle: Text(
                    status?.deviceName.isNotEmpty == true
                        ? status!.deviceName
                        : AuthSession.deviceName,
                  ),
                ),
                ListTile(
                  leading: const Icon(Icons.badge_outlined),
                  title: const Text('端末ID'),
                  subtitle: Text(
                    status?.deviceId.isNotEmpty == true
                        ? status!.deviceId
                        : AuthSession.deviceId,
                  ),
                ),
                ListTile(
                  leading: const Icon(Icons.schedule_outlined),
                  title: const Text('認証有効期限'),
                  subtitle: Text(
                    status?.expiresAt.isNotEmpty == true
                        ? status!.expiresAt
                        : AuthSession.expiresAt,
                  ),
                ),
                const SizedBox(height: 20),
                OutlinedButton.icon(
                  onPressed: _revoke,
                  icon: const Icon(Icons.link_off),
                  label: const Text('この端末の認証を解除'),
                ),
              ],
            ),
    );
  }
}
