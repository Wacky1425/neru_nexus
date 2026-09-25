import 'package:flutter/material.dart';

import '../../core/theme/app_layout.dart';

import '../budget/budget_settings_page.dart';
import '../goals/goal_management_page.dart';
import '../recurring/recurring_management_page.dart';

class HouseholdPage extends StatelessWidget {
  const HouseholdPage({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
        children: [
          const AppPageTitle('家計'),
          Text('計画する', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          Text('毎月のお金の使い方と、これから貯めるお金をここで管理します。', style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant, height: 1.45)),
          const SizedBox(height: 24),
          _HouseholdCard(icon: Icons.account_balance_wallet_outlined, title: '今月の予算・目標', subtitle: '給与・生活費・自由費・貯金・NISAの計画', onTap: () => _open(context, const BudgetSettingsPage())),
          const SizedBox(height: 12),
          _HouseholdCard(icon: Icons.flag_outlined, title: '目的資金', subtitle: '旅行・引っ越し・プレゼントなどの積立計画', onTap: () => _open(context, const GoalManagementPage())),
          const SizedBox(height: 12),
          _HouseholdCard(icon: Icons.autorenew_rounded, title: '固定費・定期支払い', subtitle: '毎月の支払い候補を確認・承認・無視', onTap: () => _open(context, const RecurringManagementPage())),
          const SizedBox(height: 20),
          ExpansionTile(
            tilePadding: const EdgeInsets.symmetric(horizontal: 4),
            childrenPadding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
            leading: Icon(Icons.lightbulb_outline, color: theme.colorScheme.primary),
            title: Text('家計の考え方', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
            subtitle: const Text('この画面で管理するお金の優先順位'),
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: Text('生活費を守りながら、目的資金・生活防衛資金・投資・自由費の順序を決める場所です。', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant, height: 1.45)),
              ),
            ],
          ),
        ],
      ),
      ),
    );
  }

  void _open(BuildContext context, Widget page) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
}

class _HouseholdCard extends StatelessWidget {
  const _HouseholdCard({required this.icon, required this.title, required this.subtitle, required this.onTap});
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
          child: Row(children: [
            Container(width: 48, height: 48, decoration: BoxDecoration(color: theme.colorScheme.primaryContainer, borderRadius: BorderRadius.circular(16)), child: Icon(icon, color: theme.colorScheme.onPrimaryContainer)),
            const SizedBox(width: 16),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              Text(subtitle, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant, height: 1.35)),
            ])),
            const SizedBox(width: 8), const Icon(Icons.chevron_right),
          ]),
        ),
      ),
    );
  }
}
