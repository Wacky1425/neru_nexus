import 'package:flutter/material.dart';

import '../import/import_page.dart';
import '../import/model/import_history_model.dart';
import '../import/service/import_history_service.dart';
import '../transactions/model/transaction_model.dart';
import '../transactions/transaction_detail_page.dart';
import '../transactions/transaction_form_page.dart';
import 'service/review_service.dart';

class ReviewPage extends StatefulWidget {
  const ReviewPage({super.key});

  @override
  State<ReviewPage> createState() => _ReviewPageState();
}

class _ReviewPageState extends State<ReviewPage> {
  final ReviewService _service = const ReviewService();
  final ImportHistoryService _historyService = const ImportHistoryService();

  ReviewQueueMode _mode = ReviewQueueMode.userReview;
  late Future<ReviewTransactionsResult> _userFuture;
  late Future<ReviewTransactionsResult> _formalFuture;
  late Future<ImportHistoryData> _historyFuture;
  late Future<List<ReconciliationHistoryItem>> _reconciliationFuture;
  bool _hasChanged = false;
  String _query = '';
  ReviewReasonFilter _reasonFilter = ReviewReasonFilter.all;

  @override
  void initState() {
    super.initState();
    _loadFutures();
  }

  void _loadFutures() {
    _userFuture = _service.fetchReviewTransactions();
    _formalFuture = _service.fetchReviewTransactions(
      queueMode: ReviewQueueMode.formalWait,
    );
    _historyFuture = _historyService.fetchHistory(limit: 10);
    _reconciliationFuture = _service.fetchReconciliationHistory(limit: 8);
  }

  Future<void> _reload() async {
    setState(_loadFutures);
    await Future.wait<dynamic>([_userFuture, _formalFuture, _historyFuture, _reconciliationFuture]);
  }

  void _closePage() => Navigator.of(context).pop(_hasChanged);

  Future<void> _quickClassify(TransactionModel transaction) async {
    final result = await Navigator.of(context).push<TransactionFormPageResult>(
      MaterialPageRoute(
        builder: (_) => TransactionFormPage(
          initialTransaction: transaction,
          fromReview: true,
        ),
      ),
    );
    if (result == null || !mounted) return;
    _hasChanged = true;
    await _reload();
  }

  bool _matchesReason(TransactionModel transaction) {
    return switch (_reasonFilter) {
      ReviewReasonFilter.all => true,
      ReviewReasonFilter.category => transaction.settlementStatus != 'review',
      ReviewReasonFilter.settlement => transaction.settlementStatus == 'review',
    };
  }

  bool _matchesQuery(TransactionModel transaction) {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return true;
    return [
      transaction.itemName, transaction.merchant, transaction.majorCategory,
      transaction.subCategory, transaction.sourceType, transaction.paymentMethod,
      transaction.accountName, transaction.note,
    ].any((value) => value.toLowerCase().contains(q));
  }

  Future<void> _openTransaction(
    TransactionModel transaction, {
    required bool fromReview,
  }) async {
    final result = await Navigator.of(context).push<TransactionDetailResult>(
      MaterialPageRoute(
        builder: (_) => TransactionDetailPage(
          transaction: transaction,
          fromReview: fromReview,
        ),
      ),
    );
    if (result == null || !mounted) return;
    _hasChanged = true;
    await _reload();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) _closePage();
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('要確認・取込'),
          leading: IconButton(
            onPressed: _closePage,
            icon: const Icon(Icons.arrow_back),
          ),
          actions: [
            IconButton(
              tooltip: '更新',
              onPressed: _reload,
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        body: RefreshIndicator(
          onRefresh: _reload,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              _buildQueueSummary(),
              const SizedBox(height: 12),
              _buildImportAuditCard(),
              const SizedBox(height: 12),
              _buildReconciliationHistoryCard(),
              const SizedBox(height: 20),
              SegmentedButton<ReviewQueueMode>(
                segments: const [
                  ButtonSegment(
                    value: ReviewQueueMode.userReview,
                    icon: Icon(Icons.rule_rounded),
                    label: Text('要判断'),
                  ),
                  ButtonSegment(
                    value: ReviewQueueMode.formalWait,
                    icon: Icon(Icons.schedule_rounded),
                    label: Text('明細待ち'),
                  ),
                ],
                selected: {_mode},
                onSelectionChanged: (value) {
                  setState(() => _mode = value.first);
                },
              ),
              const SizedBox(height: 12),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 180),
                child: _buildQueue(key: ValueKey(_mode)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildQueueSummary() {
    return FutureBuilder<List<ReviewTransactionsResult>>(
      future: Future.wait([_userFuture, _formalFuture]),
      builder: (context, snapshot) {
        final userCount = snapshot.data?.first.total;
        final formalCount = snapshot.data != null && snapshot.data!.length > 1
            ? snapshot.data![1].total
            : null;
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('日常運用キュー', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 6),
                const Text('自分で判断する取引と、自動照合を待つ速報を分けて表示します。'),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: _CountBox(
                        label: '要判断',
                        value: userCount,
                        icon: Icons.rule_rounded,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _CountBox(
                        label: '正式明細待ち',
                        value: formalCount,
                        icon: Icons.schedule_rounded,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildImportAuditCard() {
    return FutureBuilder<ImportHistoryData>(
      future: _historyFuture,
      builder: (context, snapshot) {
        final history = snapshot.data?.histories;
        final latest = history != null && history.isNotEmpty ? history.first : null;
        return Card(
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            leading: const CircleAvatar(child: Icon(Icons.fact_check_outlined)),
            title: const Text('取込監査'),
            subtitle: snapshot.hasError
                ? const Text('取込履歴を取得できませんでした')
                : latest == null
                    ? const Text('取込履歴はまだありません')
                    : Text(_importSummary(latest)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ImportPage()),
              );
              if (mounted) await _reload();
            },
          ),
        );
      },
    );
  }

  Widget _buildReconciliationHistoryCard() {
    return FutureBuilder<List<ReconciliationHistoryItem>>(
      future: _reconciliationFuture,
      builder: (context, snapshot) {
        final items = snapshot.data ?? const <ReconciliationHistoryItem>[];
        return Card(
          child: ExpansionTile(
            leading: const CircleAvatar(child: Icon(Icons.link_rounded)),
            title: const Text('速報 → 正式明細の照合履歴'),
            subtitle: snapshot.hasError
                ? const Text('照合履歴を取得できませんでした')
                : Text(items.isEmpty ? '照合済み履歴はまだありません' : '最近の自動照合 ${items.length}件'),
            children: snapshot.hasError || items.isEmpty
                ? const []
                : items.map((item) {
                    final before = item.preliminaryMerchant.trim().isEmpty ? '速報' : item.preliminaryMerchant.trim();
                    final after = item.formalMerchant.trim().isEmpty ? '正式明細' : item.formalMerchant.trim();
                    return ListTile(
                      dense: true,
                      leading: const Icon(Icons.check_circle_outline),
                      title: Text('$before → $after', maxLines: 2, overflow: TextOverflow.ellipsis),
                      subtitle: Text('${item.preliminaryDate} → ${item.formalDate} ・ ${item.sourceType}'),
                      trailing: Text(_formatYen(item.amount), style: const TextStyle(fontWeight: FontWeight.bold)),
                    );
                  }).toList(),
          ),
        );
      },
    );
  }

  String _importSummary(ImportHistoryModel item) {
    final when = item.importedAt;
    final date = when == null
        ? '日時不明'
        : '${when.month}/${when.day} ${when.hour.toString().padLeft(2, '0')}:${when.minute.toString().padLeft(2, '0')}';
    final account = item.accountName.trim().isEmpty ? item.csvType : item.accountName;
    final duplicate = item.skippedCount > 0 ? '・重複${item.skippedCount}件' : '';
    return '最新 $date  $account\n追加${item.addedCount}件$duplicate・除外${item.ignoredCount}件';
  }

  Widget _buildQueue({Key? key}) {
    final formal = _mode == ReviewQueueMode.formalWait;
    final future = formal ? _formalFuture : _userFuture;
    return FutureBuilder<ReviewTransactionsResult>(
      key: key,
      future: future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.all(40),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        if (snapshot.hasError) return _buildErrorState(snapshot.error);
        final result = snapshot.data;
        if (result == null || result.items.isEmpty) {
          return _buildEmptyState(formal);
        }
        final categoryCount = result.items.where((e) => e.settlementStatus != 'review').length;
        final settlementCount = result.items.where((e) => e.settlementStatus == 'review').length;
        final staleCount = result.items.where((e) => e.isStalePreliminary).length;
        final visibleItems = result.items
            .where((e) => formal || _matchesReason(e))
            .where(_matchesQuery)
            .toList();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
              child: Text(
                formal
                    ? '正式明細待ち ${result.total}件'
                    : '要判断 ${result.total}件',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            if (formal) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
                child: Text(
                  'ここは原則操作不要です。正式CSVを取り込むと自動照合されます。',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              if (staleCount > 0)
                Card(
                  child: ListTile(
                    leading: Icon(Icons.warning_amber_rounded, color: Theme.of(context).colorScheme.error),
                    title: Text('30日以上待機 $staleCount件'),
                    subtitle: const Text('長期間照合されない速報だけ確認してください。'),
                  ),
                ),
            ] else ...[
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  ChoiceChip(
                    label: Text('すべて ${result.total}'),
                    selected: _reasonFilter == ReviewReasonFilter.all,
                    onSelected: (_) => setState(() => _reasonFilter = ReviewReasonFilter.all),
                  ),
                  ChoiceChip(
                    label: Text('分類 $categoryCount'),
                    selected: _reasonFilter == ReviewReasonFilter.category,
                    onSelected: (_) => setState(() => _reasonFilter = ReviewReasonFilter.category),
                  ),
                  ChoiceChip(
                    label: Text('照合 $settlementCount'),
                    selected: _reasonFilter == ReviewReasonFilter.settlement,
                    onSelected: (_) => setState(() => _reasonFilter = ReviewReasonFilter.settlement),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextField(
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  hintText: '店名・カテゴリ・支払方法で絞り込み',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                onChanged: (value) => setState(() => _query = value),
              ),
              const SizedBox(height: 8),
              Text(
                visibleItems.length == result.total
                    ? '上から順に処理できます'
                    : '${visibleItems.length}件を表示',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 4),
            ],
            if (visibleItems.isEmpty)
              const Card(child: Padding(
                padding: EdgeInsets.all(20),
                child: Center(child: Text('条件に一致する取引はありません')),
              ))
            else
              ...visibleItems.map((transaction) => _buildTransactionCard(transaction, formal)),
          ],
        );
      },
    );
  }

  Widget _buildTransactionCard(TransactionModel transaction, bool formal) {
    final isSettlementReview = transaction.settlementStatus == 'review';
    final displayName = transaction.itemName.trim().isNotEmpty
        ? transaction.itemName.trim()
        : transaction.merchant.trim().isNotEmpty
            ? transaction.merchant.trim()
            : '名称なし';
    final reason = formal
        ? '正式CSVとの自動照合待ち'
        : isSettlementReview
            ? '移動先またはクレカ照合を確認'
            : 'カテゴリを確認';
    final source = transaction.sourceType.trim();

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        leading: CircleAvatar(
          child: Icon(formal
              ? Icons.schedule_rounded
              : isSettlementReview
                  ? Icons.swap_horiz_rounded
                  : Icons.warning_amber_rounded),
        ),
        title: Text(displayName, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${transaction.transactionDate} ・ ${transaction.majorCategory} / ${transaction.subCategory}'),
            const SizedBox(height: 3),
            Text(reason),
            if (source.isNotEmpty)
              Text(
                formal ? '速報: $source' : '取込元: $source',
                style: Theme.of(context).textTheme.bodySmall,
              ),
          ],
        ),
        trailing: formal
            ? Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(_formatYen(transaction.amount),
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  const Icon(Icons.chevron_right, size: 20),
                ],
              )
            : Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(_formatYen(transaction.amount),
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 2),
                  TextButton(
                    onPressed: () => _quickClassify(transaction),
                    style: TextButton.styleFrom(
                      minimumSize: const Size(0, 28),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      visualDensity: VisualDensity.compact,
                    ),
                    child: Text(isSettlementReview ? '確認する' : '分類する'),
                  ),
                ],
              ),
        onTap: () => _openTransaction(transaction, fromReview: !formal),
      ),
    );
  }

  Widget _buildEmptyState(bool formal) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 20),
        child: Center(
          child: Column(
            children: [
              const Icon(Icons.check_circle_outline, size: 52),
              const SizedBox(height: 12),
              Text(
                formal ? '正式明細待ちはありません' : '要判断はありません',
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildErrorState(Object? error) {
    final message = error.toString().replaceFirst('Exception: ', '');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Icon(Icons.error_outline, size: 44, color: Theme.of(context).colorScheme.error),
            const SizedBox(height: 10),
            const Text('キューを取得できませんでした', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton.icon(onPressed: _reload, icon: const Icon(Icons.refresh), label: const Text('再読み込み')),
          ],
        ),
      ),
    );
  }

  static String _formatYen(int amount) {
    final formatted = amount.abs().toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );
    final sign = amount < 0 ? '-' : '';
    return '$sign￥$formatted';
  }
}

enum ReviewReasonFilter { all, category, settlement }

class _CountBox extends StatelessWidget {
  const _CountBox({required this.label, required this.value, required this.icon});
  final String label;
  final int? value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20),
          const SizedBox(height: 8),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 2),
          Text(value == null ? '…' : '$value件', style: Theme.of(context).textTheme.titleLarge),
        ],
      ),
    );
  }
}
