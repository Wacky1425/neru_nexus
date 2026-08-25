import 'package:flutter/material.dart';

import 'model/account_balance_model.dart';
import 'service/account_balance_service.dart';

import '../settlement/settlement_status_page.dart';
import '../settlement/service/settlement_service.dart';

import '../../core/refresh/app_refresh_controller.dart';

class AccountBalancePage extends StatefulWidget {
  const AccountBalancePage({super.key});

  @override
  State<AccountBalancePage> createState() => _AccountBalancePageState();
}

class _AccountBalancePageState extends State<AccountBalancePage> {
  final _service = const AccountBalanceService();

  final _settlementService = const SettlementService();

  AccountBalancesResult? _result;

  bool _loading = false;
  bool _initialLoading = false;

  bool _settlementLoading = false;

  Object? _error;

  int _settlementReviewCount = 0;

  @override
  void initState() {
    super.initState();

    _result = AccountBalanceService.cachedResult;

    _initialLoading = _result == null;

    _settlementReviewCount = SettlementService.cachedReviewCount;

    AppRefreshController.accountBalanceVersion.addListener(
      _handleAccountBalanceRefresh,
    );

    _initialize();
  }

  // ============================================================
  // 初期化
  // ============================================================

  Future<void> _initialize() async {
    if (_result == null) {
      final stored = await AccountBalanceService.loadStoredCache();

      if (!mounted) {
        return;
      }

      if (stored != null) {
        setState(() {
          _result = stored;
          _initialLoading = false;
        });
      }
    }

    await _load();

    /*
     * 照合キャッシュがまだ無い場合だけ取得。
     *
     * 既に照合画面を開いたことがある場合は
     * キャッシュ件数をそのまま使う。
     */
    if (!SettlementService.hasCache) {
      await _loadSettlementStatus();
    }
  }

  // ============================================================
  // 口座残高
  // ============================================================

  Future<void> _load() async {
    if (_loading) {
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final result = await _service.fetchAccountBalances();

      if (!mounted) {
        return;
      }

      setState(() {
        _result = result;
        _initialLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = error;
        _initialLoading = false;
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _reload() async {
    await Future.wait([_load(), _loadSettlementStatus()]);
  }

  void _handleAccountBalanceRefresh() {
    AccountBalanceService.clearCache();

    if (!mounted) {
      return;
    }

    _load();
  }

  // ============================================================
  // カード照合件数
  // ============================================================

  Future<void> _loadSettlementStatus() async {
    if (_settlementLoading) {
      return;
    }

    setState(() {
      _settlementLoading = true;
    });

    try {
      await _settlementService.fetchStatuses();

      if (!mounted) {
        return;
      }

      setState(() {
        _settlementReviewCount = SettlementService.cachedReviewCount;
      });
    } catch (_) {
      /*
       * 資産画面全体をエラーにしない。
       *
       * 照合件数の取得だけ失敗した場合は
       * 前回値を維持する。
       */
    } finally {
      if (mounted) {
        setState(() {
          _settlementLoading = false;
        });
      }
    }
  }

  Future<void> _openSettlementStatus() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => const SettlementStatusPage()),
    );

    if (!mounted) {
      return;
    }

    /*
     * 照合画面で
     *
     * ・手動照合
     * ・解除
     * ・カード設定変更
     *
     * が発生している可能性があるため、
     * 戻ったらキャッシュ件数を反映。
     */
    setState(() {
      _settlementReviewCount = SettlementService.cachedReviewCount;
    });

    /*
     * 照合操作で負債残高も変わる可能性があるので
     * 残高も最新化。
     */
    await _load();
  }

  // ============================================================
  // dispose
  // ============================================================

  @override
  void dispose() {
    AppRefreshController.accountBalanceVersion.removeListener(
      _handleAccountBalanceRefresh,
    );

    super.dispose();
  }

  // ============================================================
  // Build
  // ============================================================

  @override
  Widget build(BuildContext context) {
    final result = _result;

    return Scaffold(
      appBar: AppBar(title: const Text('資産')),
      body: Builder(
        builder: (context) {
          if (_initialLoading && result == null) {
            return const Center(child: CircularProgressIndicator());
          }

          if (result == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, size: 48),

                    const SizedBox(height: 16),

                    Text(
                      _error?.toString() ?? '残高データを取得できませんでした',
                      textAlign: TextAlign.center,
                    ),

                    const SizedBox(height: 16),

                    FilledButton(
                      onPressed: _reload,
                      child: const Text('再読み込み'),
                    ),
                  ],
                ),
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                if (_loading) const LinearProgressIndicator(),

                if (_loading) const SizedBox(height: 12),

                _SummaryCard(result: result),

                const SizedBox(height: 16),

                // =================================================
                // カード照合
                // =================================================
                _SettlementCard(
                  reviewCount: _settlementReviewCount,
                  loading: _settlementLoading,
                  onTap: _openSettlementStatus,
                ),

                const SizedBox(height: 24),

                Text(
                  '口座',
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                ),

                const SizedBox(height: 12),

                ...result.items.map(
                  (account) => _AccountCard(account: account),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

// ============================================================
// 純資産サマリー
// ============================================================

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.result});

  final AccountBalancesResult result;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('純資産', style: Theme.of(context).textTheme.titleMedium),

            const SizedBox(height: 8),

            Text(
              _formatYen(result.netAssets),
              style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold),
            ),

            const Divider(height: 32),

            Row(
              children: [
                Expanded(
                  child: _SummaryValue(label: '資産', amount: result.totalAssets),
                ),

                Expanded(
                  child: _SummaryValue(
                    label: '負債',
                    amount: result.totalLiabilities,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryValue extends StatelessWidget {
  const _SummaryValue({required this.label, required this.amount});

  final String label;
  final int amount;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodyMedium),

        const SizedBox(height: 4),

        Text(
          _formatYen(amount),
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
      ],
    );
  }
}

// ============================================================
// カード照合導線
// ============================================================

class _SettlementCard extends StatelessWidget {
  const _SettlementCard({
    required this.reviewCount,
    required this.loading,
    required this.onTap,
  });

  final int reviewCount;
  final bool loading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final hasReview = reviewCount > 0;

    return Card(
      child: ListTile(
        onTap: onTap,
        leading: const CircleAvatar(child: Icon(Icons.credit_score_outlined)),
        title: const Text('カード照合'),
        subtitle: loading
            ? const Text('照合状況を確認中...')
            : hasReview
            ? Text('要確認 $reviewCount件')
            : const Text('要確認なし'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (loading)
              const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            else if (hasReview)
              Badge(
                label: Text(reviewCount.toString()),
                child: const Icon(Icons.warning_amber_outlined),
              )
            else
              const Icon(Icons.check_circle_outline),

            const SizedBox(width: 8),

            const Icon(Icons.chevron_right),
          ],
        ),
      ),
    );
  }
}

// ============================================================
// 口座カード
// ============================================================

class _AccountCard extends StatelessWidget {
  const _AccountCard({required this.account});

  final AccountBalanceModel account;

  @override
  Widget build(BuildContext context) {
    /*
     * 資産口座は従来表示。
     *
     * 負債口座は
     *
     * ・未払残高
     * ・次回請求
     * ・それ以降
     *
     * を表示する。
     */
    if (!account.isLiability) {
      return _buildAssetCard(context);
    }

    return _buildLiabilityCard(context);
  }

  // ============================================================
  // 資産
  // ============================================================

  Widget _buildAssetCard(BuildContext context) {
    return Card(
      child: ListTile(
        leading: const CircleAvatar(
          child: Icon(Icons.account_balance_wallet_outlined),
        ),
        title: Text(account.accountName),
        subtitle: const Text('資産'),
        trailing: Text(
          _formatYen(account.currentBalance),
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
      ),
    );
  }

  // ============================================================
  // 負債 / クレジットカード
  // ============================================================

  Widget _buildLiabilityCard(BuildContext context) {
    final hasNextBilling =
        account.nextBillingYearMonth.isNotEmpty &&
        account.nextBillingAmount > 0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ----------------------------------------------------
            // カード名
            // ----------------------------------------------------
            Row(
              children: [
                const CircleAvatar(child: Icon(Icons.credit_card)),

                const SizedBox(width: 12),

                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        account.accountName,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.bold),
                      ),

                      const SizedBox(height: 2),

                      Text(
                        '負債',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 18),

            // ----------------------------------------------------
            // 未払残高
            // ----------------------------------------------------
            _AccountAmountRow(
              label: '未払残高',
              value: _formatYen(account.currentBalance),
              emphasize: true,
            ),

            const Divider(height: 28),

            // ----------------------------------------------------
            // 次回請求
            // ----------------------------------------------------
            if (hasNextBilling) ...[
              _AccountAmountRow(
                label: account.paymentDay > 0
                    ? '次回請求 ${int.tryParse(account.nextBillingYearMonth.split('-').last) ?? 0}月${account.paymentDay}日'
                    : '次回請求 ${_formatYearMonth(account.nextBillingYearMonth)}',
                value: _formatYen(account.nextBillingAmount),
              ),

              const SizedBox(height: 10),

              _AccountAmountRow(
                label: 'それ以降',
                value: _formatYen(account.laterBillingAmount),
              ),
            ] else ...[
              Row(
                children: [
                  Icon(
                    Icons.check_circle_outline,
                    size: 18,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),

                  const SizedBox(width: 8),

                  Text(
                    '未照合の請求予定はありません',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ============================================================
// 口座カード 金額行
// ============================================================

class _AccountAmountRow extends StatelessWidget {
  const _AccountAmountRow({
    required this.label,
    required this.value,
    this.emphasize = false,
  });

  final String label;
  final String value;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              fontWeight: emphasize ? FontWeight.w600 : FontWeight.normal,
            ),
          ),
        ),

        const SizedBox(width: 12),

        Text(
          value,
          style: TextStyle(
            fontSize: emphasize ? 18 : 15,
            fontWeight: FontWeight.bold,
          ),
        ),
      ],
    );
  }
}

// ============================================================
// 年月
// ============================================================

String _formatYearMonth(String yearMonth) {
  final parts = yearMonth.split('-');

  if (parts.length != 2) {
    return yearMonth;
  }

  final year = int.tryParse(parts[0]);
  final month = int.tryParse(parts[1]);

  if (year == null || month == null) {
    return yearMonth;
  }

  return '$year年$month月';
}

// ============================================================
// 金額
// ============================================================

String _formatYen(int amount) {
  final negative = amount < 0;

  final formatted = amount.abs().toString().replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => ',',
  );

  return '${negative ? '-' : ''}￥$formatted';
}
