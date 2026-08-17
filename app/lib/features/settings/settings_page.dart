import 'package:flutter/material.dart';

import '../accounts/account_management_page.dart';
import '../categories/category_management_page.dart';

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('設定')),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 12),
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Text(
              'マスタ管理',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.category_outlined),
            title: const Text('カテゴリ管理'),
            subtitle: const Text('カテゴリの追加・確認'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const CategoryManagementPage(),
                ),
              );
            },
          ),

          ListTile(
            leading: const Icon(Icons.account_balance_outlined),
            title: const Text('口座管理'),
            subtitle: const Text('口座・基準残高の設定'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const AccountManagementPage(),
                ),
              );
            },
          ),
          
          const Divider(),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Text(
              'アプリ',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
            ),
          ),
          const ListTile(
            leading: Icon(Icons.info_outline),
            title: Text('アプリ情報'),
            subtitle: Text('Neru Nexus'),
          ),
        ],
      ),
    );
  }
}
