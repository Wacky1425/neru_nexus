import 'package:flutter/material.dart';

import '../accounts/account_management_page.dart';
import '../budget/budget_settings_page.dart';
import '../categories/category_management_page.dart';
import '../goals/goal_management_page.dart';
import '../settlement/settlement_status_page.dart';
import '../transactions/gmail_import_status_page.dart';
import '../transactions/ignored_transactions_page.dart';

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

          ListTile(
            leading: const Icon(Icons.flag_outlined),
            title: const Text('目的資金管理'),
            subtitle: const Text('旅行・引っ越し・結婚などの資金計画'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const GoalManagementPage()),
              );
            },
          ),

          const Divider(),

          const Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Text(
              '家計設定',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
            ),
          ),

          ListTile(
            leading: const Icon(Icons.account_balance_wallet_outlined),
            title: const Text('予算・目標設定'),
            subtitle: const Text('給与・支出予算・資産形成目標を設定'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const BudgetSettingsPage()),
              );
            },
          ),

          ListTile(
            leading: const Icon(Icons.link_outlined),
            title: const Text('カード照合状況'),
            subtitle: const Text('カード明細と銀行引落の一致状況を確認'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SettlementStatusPage()),
              );
            },
          ),

          const Divider(),

          const Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Text(
              'データ管理',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
            ),
          ),

          ListTile(
            leading: const Icon(Icons.visibility_off_outlined),
            title: const Text('除外済み取引'),
            subtitle: const Text('除外したGmail速報の確認・復元'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const IgnoredTransactionsPage(),
                ),
              );
            },
          ),

          ListTile(
            leading: const Icon(Icons.mail_outline),
            title: const Text('Gmail取込状況'),
            subtitle: const Text('Gmail速報の最終実行・取得状況を確認'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const GmailImportStatusPage(),
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
