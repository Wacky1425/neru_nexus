import 'package:flutter/material.dart';

import '../accounts/account_edit_page.dart';
import '../accounts/service/account_balance_service.dart';

import 'model/settlement_status_model.dart';
import 'service/settlement_service.dart';

enum _SettlementFilter { all, review, matched }

class SettlementStatusPage extends StatefulWidget {
  const SettlementStatusPage({super.key});

  @override
  State<SettlementStatusPage> createState() => _SettlementStatusPageState();
}

class _SettlementStatusPageState extends State<SettlementStatusPage> {
  final SettlementService _service = const SettlementService();

  final AccountBalanceService _accountService = const AccountBalanceService();

  bool _loading = true;
  bool _manualMatching = false;
  bool _manualUnmatching = false;
  bool _openingAccountSettings = false;

  String? _error;

  SettlementStatusesResponseModel? _data;

  _SettlementFilter _filter = _SettlementFilter.all;

  @override
  void initState() {
    super.initState();

    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final result = await _service.fetchStatuses();

      if (!mounted) {
        return;
      }

      setState(() {
        _data = result;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = error.toString();
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  // ============================================================
  // カード設定
  // ============================================================

  Future<void> _openCardSettings(SettlementStatusModel item) async {
    if (_openingAccountSettings) {
      return;
    }

    final cardAccount = item.cardAccount.trim();

    if (cardAccount.isEmpty) {
      _showMessage('カード口座を特定できないため設定を開けません');

      return;
    }

    setState(() {
      _openingAccountSettings = true;
    });

    try {
      var accountsResult = AccountBalanceService.cachedResult;

      accountsResult ??= await _accountService.fetchAccountBalances();

      final matchingAccounts = accountsResult.items
          .where((account) => account.accountName.trim() == cardAccount)
          .toList();

      if (matchingAccounts.isEmpty) {
        if (!mounted) {
          return;
        }

        _showMessage('$cardAccount の口座設定が見つかりません');

        return;
      }

      final account = matchingAccounts.firstWhere(
        (account) => account.isLiability,
        orElse: () => matchingAccounts.first,
      );

      if (!mounted) {
        return;
      }

      final result = await Navigator.of(context).push<Object?>(
        MaterialPageRoute(builder: (_) => AccountEditPage(account: account)),
      );

      if (!mounted) {
        return;
      }

      if (result is! AccountUpdateResult) {
        return;
      }

      AccountBalanceService.clearCache();

      await _load();

      if (!mounted) {
        return;
      }

      _showAccountUpdateResult(result);
    } catch (error) {
      if (!mounted) {
        return;
      }

      _showMessage(error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) {
        setState(() {
          _openingAccountSettings = false;
        });
      }
    }
  }

  void _showAccountUpdateResult(AccountUpdateResult result) {
    if (!result.billingSettingsChanged) {
      _showMessage('口座設定を更新しました');

      return;
    }

    final reconciliation = result.reconciliation;

    if (reconciliation == null) {
      _showMessage('カード請求設定を更新しました');

      return;
    }

    if (reconciliation.processedCount == 0) {
      _showMessage(
        'カード請求設定を更新しました\n'
        '再照合対象の未確定請求はありません',
      );

      return;
    }

    _showMessage(
      'カード請求設定を更新しました\n'
      '再照合 ${reconciliation.processedCount}件'
      ' ・ 自動照合 ${reconciliation.matchedCount}件'
      ' ・ 要確認 ${reconciliation.reviewCount}件',
    );
  }

  // ============================================================
  // 手動照合
  // ============================================================

  Future<void> _confirmManualMatch(SettlementStatusModel item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('手動で照合しますか？'),
          content: Text(
            '${item.cardAccount}\n\n'
            '銀行引落：${_yen(item.settlementAmount)}\n'
            'カード明細：${_yen(item.detailTotal)}\n'
            '差額：${_signedYen(item.difference)}\n\n'
            '差額がある状態でも、この請求として照合済みにします。\n'
            '収支・残高では銀行側の実際の引落額を正として扱います。',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop(false);
              },
              child: const Text('キャンセル'),
            ),
            FilledButton(
              onPressed: () {
                Navigator.of(context).pop(true);
              },
              child: const Text('照合する'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      return;
    }

    setState(() {
      _manualMatching = true;
    });

    try {
      await _service.manualMatch(settlementTransactionId: item.transactionId);

      if (!mounted) {
        return;
      }

      _showMessage('手動照合しました');

      await _load();
    } catch (error) {
      if (!mounted) {
        return;
      }

      _showMessage(
        '手動照合に失敗しました\n'
        '${error.toString().replaceFirst('Exception: ', '')}',
      );
    } finally {
      if (mounted) {
        setState(() {
          _manualMatching = false;
        });
      }
    }
  }

  // ============================================================
  // 手動照合解除
  // ============================================================

  Future<void> _confirmManualUnmatch(SettlementStatusModel item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('手動照合を解除しますか？'),
          content: Text(
            '${item.cardAccount}\n\n'
            '銀行引落：${_yen(item.settlementAmount)}\n'
            'カード明細：${_yen(item.detailTotal)}\n'
            '差額：${_signedYen(item.difference)}\n\n'
            '手動照合を解除すると、この請求は'
            '「要確認」に戻ります。\n\n'
            '紐付いているカード明細も未照合状態に戻ります。',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop(false);
              },
              child: const Text('キャンセル'),
            ),
            FilledButton(
              onPressed: () {
                Navigator.of(context).pop(true);
              },
              child: const Text('解除する'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      return;
    }

    setState(() {
      _manualUnmatching = true;
    });

    try {
      await _service.cancelManualMatch(
        settlementTransactionId: item.transactionId,
      );

      if (!mounted) {
        return;
      }

      await _load();

      if (!mounted) {
        return;
      }

      _showMessage(
        '手動照合を解除しました\n'
        'この請求を要確認に戻しました',
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      _showMessage(
        '手動照合の解除に失敗しました\n'
        '${error.toString().replaceFirst('Exception: ', '')}',
      );
    } finally {
      if (mounted) {
        setState(() {
          _manualUnmatching = false;
        });
      }
    }
  }

  // ============================================================
  // 明細BottomSheet
  // ============================================================

  Future<void> _showDetails(SettlementStatusModel item) async {
    final details = List<SettlementDetailModel>.from(item.detailItems);

    details.sort((a, b) => b.transactionDate.compareTo(a.transactionDate));

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) {
        return FractionallySizedBox(
          heightFactor: 0.88,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            item.cardAccount.isEmpty
                                ? 'カード明細'
                                : item.cardAccount,
                            style: Theme.of(context).textTheme.titleLarge
                                ?.copyWith(fontWeight: FontWeight.bold),
                          ),
                        ),
                        IconButton(
                          onPressed: () {
                            Navigator.of(context).pop();
                          },
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text('${item.billingYearMonth} 請求の対象明細'),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${item.detailCount}件',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                        Text(
                          _yen(item.detailTotal),
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const Divider(height: 1),

              Expanded(
                child: details.isEmpty
                    ? const Center(child: Text('対象明細の詳細データがありません'))
                    : ListView.separated(
                        itemCount: details.length,
                        separatorBuilder: (_, _) => const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final detail = details[index];

                          return _buildDetailTile(detail);
                        },
                      ),
              ),

              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(color: Theme.of(context).dividerColor),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '合計 ${details.length}件',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                    Text(
                      _yen(item.detailTotal),
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildDetailTile(SettlementDetailModel detail) {
    final title = detail.merchant.trim().isNotEmpty
        ? detail.merchant.trim()
        : detail.itemName.trim().isNotEmpty
        ? detail.itemName.trim()
        : '名称なし';

    final major = detail.majorCategory.trim();

    final sub = detail.subCategory.trim();

    final category = major.isNotEmpty && sub.isNotEmpty
        ? '$major / $sub'
        : sub.isNotEmpty
        ? sub
        : major;

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
      title: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(title, maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
          const SizedBox(width: 12),
          Text(
            _yen(detail.amount),
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_formatDetailDate(detail.transactionDate)),
          if (category.isNotEmpty) Text(category),
        ],
      ),
    );
  }

  String _formatDetailDate(String value) {
    final parts = value.split('-');

    if (parts.length == 3) {
      final month = int.tryParse(parts[1]);

      final day = int.tryParse(parts[2]);

      if (month != null && day != null) {
        return '$month/$day';
      }
    }

    return value.isEmpty ? '日付不明' : value;
  }

  // ============================================================
  // Build
  // ============================================================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('カード照合状況'),
        actions: [
          IconButton(
            onPressed:
                _loading ||
                    _manualMatching ||
                    _manualUnmatching ||
                    _openingAccountSettings
                ? null
                : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading && _data == null) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null && _data == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48),
              const SizedBox(height: 16),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _load, child: const Text('再試行')),
            ],
          ),
        ),
      );
    }

    final data = _data;

    if (data == null) {
      return const SizedBox.shrink();
    }

    final filtered = _filterItems(data.items);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          if (_loading) ...[
            const LinearProgressIndicator(),
            const SizedBox(height: 12),
          ],

          _buildSummary(data.summary),

          const SizedBox(height: 12),

          _buildFilterBar(data),

          const SizedBox(height: 16),

          if (filtered.isEmpty)
            _buildEmptyCard()
          else
            ...filtered.map(_buildSettlementCard),
        ],
      ),
    );
  }

  List<SettlementStatusModel> _filterItems(List<SettlementStatusModel> items) {
    switch (_filter) {
      case _SettlementFilter.all:
        return items;

      case _SettlementFilter.review:
        return items
            .where(
              (item) => item.status == 'review' || item.status == 'pending',
            )
            .toList();

      case _SettlementFilter.matched:
        return items
            .where(
              (item) =>
                  item.status == 'matched' || item.status == 'manual_matched',
            )
            .toList();
    }
  }

  Widget _buildFilterBar(SettlementStatusesResponseModel data) {
    final reviewCount = data.items
        .where((item) => item.status == 'review' || item.status == 'pending')
        .length;

    final matchedCount = data.items
        .where(
          (item) => item.status == 'matched' || item.status == 'manual_matched',
        )
        .length;

    return SegmentedButton<_SettlementFilter>(
      segments: [
        ButtonSegment(
          value: _SettlementFilter.all,
          label: Text('すべて ${data.items.length}'),
        ),
        ButtonSegment(
          value: _SettlementFilter.review,
          label: Text('要確認 $reviewCount'),
        ),
        ButtonSegment(
          value: _SettlementFilter.matched,
          label: Text('照合済み $matchedCount'),
        ),
      ],
      selected: {_filter},
      showSelectedIcon: false,
      onSelectionChanged: (selection) {
        setState(() {
          _filter = selection.first;
        });
      },
    );
  }

  Widget _buildSummary(SettlementStatusSummaryModel summary) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Wrap(
          spacing: 16,
          runSpacing: 8,
          children: [
            Text('全件 ${summary.totalCount}'),
            Text('自動照合 ${summary.matchedCount}'),
            Text('手動照合 ${summary.manualMatchedCount}'),
            Text('要確認 ${summary.reviewCount}'),
            if (summary.pendingCount > 0) Text('未照合 ${summary.pendingCount}'),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyCard() {
    return const Card(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Center(child: Text('該当する請求はありません')),
      ),
    );
  }

  Widget _buildSettlementCard(SettlementStatusModel item) {
    final busy =
        _manualMatching || _manualUnmatching || _openingAccountSettings;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.cardAccount.isEmpty ? 'カード不明' : item.cardAccount,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text('${item.billingYearMonth} 請求'),
                      Text('引落日 ${item.settlementDate}'),
                    ],
                  ),
                ),
                _buildStatusChip(item),
              ],
            ),

            if (item.cardAccount.isNotEmpty)
              TextButton.icon(
                onPressed: busy ? null : () => _openCardSettings(item),
                icon: const Icon(Icons.settings_outlined),
                label: const Text('カード設定'),
              ),

            const Divider(),

            _amountRow('銀行引落', item.settlementAmount),

            _amountRow('カード明細合計', item.detailTotal),

            _amountRow('差額', item.difference, signed: true),

            Row(
              children: [
                Expanded(child: Text('対象明細 ${item.detailCount}件')),
                if (item.detailItems.isNotEmpty)
                  TextButton(
                    onPressed: busy ? null : () => _showDetails(item),
                    child: const Text('明細を見る'),
                  ),
              ],
            ),

            // ==================================================
            // 要確認理由
            // ==================================================
            if (item.reason.isNotEmpty &&
                !item.isMatched &&
                !item.isManualMatched) ...[
              const SizedBox(height: 8),
              _buildReasonMessage(item),
            ],

            // ==================================================
            // 手動照合済み
            // ==================================================
            if (item.isManualMatched) ...[
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('銀行側の実際の引落額を正として手動確認済み'),
              ),

              const SizedBox(height: 8),

              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: busy ? null : () => _confirmManualUnmatch(item),
                  icon: _manualUnmatching
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.link_off),
                  label: const Text('手動照合を解除'),
                ),
              ),
            ],

            // ==================================================
            // 手動照合ボタン
            // ==================================================
            if (item.canManualMatch) ...[
              const SizedBox(height: 8),

              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: busy ? null : () => _confirmManualMatch(item),
                  icon: _manualMatching
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.link),
                  label: const Text('この内容で手動照合'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  // ============================================================
  // 要確認理由
  // ============================================================

  Widget _buildReasonMessage(SettlementStatusModel item) {
    String message;
    IconData icon;

    switch (item.reason) {
      case 'amount_mismatch':
        message = '銀行引落額とカード明細の合計が一致していません。';
        icon = Icons.warning_amber_outlined;
        break;

      case 'no_candidates':
        message = 'この請求月に該当するカード明細がありません。';
        icon = Icons.receipt_long_outlined;
        break;

      case 'card_account_unresolved':
        message = '引落先のカードを特定できません。';
        icon = Icons.help_outline;
        break;

      default:
        message = '照合内容を確認してください。';
        icon = Icons.info_outline;
    }

    final color = Theme.of(context).colorScheme.error;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.20)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(child: Text(message)),
        ],
      ),
    );
  }

  Widget _buildStatusChip(SettlementStatusModel item) {
    final label = switch (item.status) {
      'matched' => '自動照合',
      'manual_matched' => '手動照合',
      'review' => '要確認',
      'pending' => '未照合',
      _ => '未設定',
    };

    return Chip(label: Text(label));
  }

  Widget _amountRow(String label, int amount, {bool signed = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(child: Text(label)),
          Text(
            signed ? _signedYen(amount) : _yen(amount),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  String _yen(int value) {
    final text = value.abs().toString().replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
      (match) => '${match[1]},',
    );

    return value < 0 ? '-¥$text' : '¥$text';
  }

  String _signedYen(int value) {
    if (value == 0) {
      return '¥0';
    }

    final formatted = _yen(value.abs());

    return value > 0 ? '+$formatted' : '-$formatted';
  }
}
