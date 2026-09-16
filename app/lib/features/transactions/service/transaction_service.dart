import '../../../core/network/api_client.dart';
import '../../../core/offline/offline_sync_store.dart';
import '../../../core/refresh/app_refresh_controller.dart';
import '../model/gmail_import_status_model.dart';
import '../model/transaction_model.dart';
import '../transaction_form_page.dart';

class TransactionPageResult {
  const TransactionPageResult({
    required this.items,
    required this.total,
    required this.limit,
    required this.offset,
    required this.hasMore,
  });

  final List<TransactionModel> items;
  final int total;
  final int limit;
  final int offset;
  final bool hasMore;
}

class TransactionService {
  const TransactionService();

  Future<List<TransactionModel>> fetchTransactions({
    int limit = 100,
    int offset = 0,
    String? yearMonth,
    String? keyword,
    String? majorCategory,
    String? settlementId,
    String? importBatch,
    bool reviewOnly = false,
  }) async {
    final page = await fetchTransactionPage(
      limit: limit,
      offset: offset,
      yearMonth: yearMonth,
      keyword: keyword,
      majorCategory: majorCategory,
      settlementId: settlementId,
      importBatch: importBatch,
      reviewOnly: reviewOnly,
    );

    return page.items;
  }

  Future<TransactionPageResult> fetchTransactionPage({
    int limit = 100,
    int offset = 0,
    String? yearMonth,
    String? keyword,
    String? majorCategory,
    String? settlementId,
    String? importBatch,
    bool reviewOnly = false,
  }) async {
    final parameters = <String, String>{
      'limit': limit.toString(),
      'offset': offset.toString(),
      'reviewOnly': reviewOnly.toString(),
    };

    void addIfPresent(String key, String? value) {
      final trimmed = value?.trim() ?? '';
      if (trimmed.isNotEmpty) parameters[key] = trimmed;
    }

    addIfPresent('yearMonth', yearMonth);
    addIfPresent('keyword', keyword);
    addIfPresent('majorCategory', majorCategory);
    addIfPresent('settlementId', settlementId);
    addIfPresent('importBatch', importBatch);

    final data = await ApiClient.get(
      action: 'transactions',
      queryParameters: parameters,
    );

    final rawItems = data['items'];
    if (rawItems is! List) throw Exception('取引一覧APIのitems形式が正しくありません');
    final maps = rawItems.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    // Transport-only unit tests inject ApiClient.clientFactoryForTesting and do
    // not initialize Flutter platform bindings. Offline overlays are a device
    // persistence concern, so keep them out of that test path.
    final overlaid = ApiClient.isTransportTest
        ? maps
        : await OfflineSyncStore.applyTransactionOverlays(maps);
    return TransactionPageResult(
      items: overlaid.map(TransactionModel.fromJson).toList(),
      total: _toInt(data['total']),
      limit: _toInt(data['limit']),
      offset: _toInt(data['offset']),
      hasMore: data['hasMore'] == true,
    );
  }

  Future<TransactionModel> createTransaction({
    required TransactionFormResult transaction,
  }) async {
    final data = await ApiClient.post(
      action: 'transaction_create',
      body: {
        'transactionDate': _formatDate(transaction.date),
        'type': switch (transaction.type) {
          TransactionType.expense => '支出',
          TransactionType.income => '収入',
          TransactionType.transfer => '移動',
        },
        'amount': transaction.amount,
        'majorCategory': transaction.majorCategory,
        'subCategory': transaction.subCategory,
        'majorCategoryId': transaction.majorCategoryId,
        'subCategoryId': transaction.subCategoryId,
        'title': transaction.title,
        'paymentMethod': transaction.paymentMethod,
        'status': transaction.status,
        'memo': transaction.memo,
        'purposeType': transaction.purposeType,
        'expenseRatio': transaction.expenseRatio,
        'evidenceUrl': transaction.evidenceUrl,
        'accountName': transaction.accountName,
        'accountId': transaction.accountId,
        'fromAccount': transaction.fromAccount ?? '',
        'fromAccountId': transaction.fromAccountId,
        'toAccount': transaction.toAccount ?? '',
        'toAccountId': transaction.toAccountId,
      },
    );

    if (data['queued'] == true) {
      final created = _offlineTransaction(
        id: 'offline-${DateTime.now().microsecondsSinceEpoch}',
        transaction: transaction,
      );
      AppRefreshController.refreshAccountBalances();
      return created;
    }
    if (_toInt(data['addedCount']) <= 0) throw Exception('取引が登録されませんでした');

    final created = _parseTransaction(data['transaction'], '登録後の取引');
    AppRefreshController.refreshAccountBalances();
    return created;
  }

  Future<TransactionModel> updateTransaction({
    required String id,
    required TransactionFormResult transaction,
    bool saveRule = false,
    String merchant = '',
    String baseRevision = '',
  }) async {
    if (id.trim().isEmpty) throw Exception('更新対象の取引IDがありません');

    final data = await ApiClient.post(
      action: 'transaction_update',
      body: {
        'id': id,
        'transactionDate': _formatDate(transaction.date),
        'type': switch (transaction.type) {
          TransactionType.expense => '支出',
          TransactionType.income => '収入',
          TransactionType.transfer => '移動',
        },
        'amount': transaction.amount,
        'majorCategory': transaction.majorCategory,
        'subCategory': transaction.subCategory,
        'majorCategoryId': transaction.majorCategoryId,
        'subCategoryId': transaction.subCategoryId,
        'title': transaction.title,
        'paymentMethod': transaction.paymentMethod,
        'accountName': transaction.accountName ?? '',
        'accountId': transaction.accountId,
        'status': transaction.status,
        'memo': transaction.memo,
        'purposeType': transaction.purposeType,
        'expenseRatio': transaction.expenseRatio,
        'evidenceUrl': transaction.evidenceUrl,
        'saveRule': saveRule,
        'merchant': merchant,
        'baseRevision': baseRevision,
        'fromAccount': transaction.fromAccount ?? '',
        'fromAccountId': transaction.fromAccountId,
        'toAccount': transaction.toAccount ?? '',
        'toAccountId': transaction.toAccountId,
      },
    );

    if (data['queued'] == true) {
      final updated = _offlineTransaction(id: id, transaction: transaction, merchant: merchant);
      AppRefreshController.refreshAccountBalances();
      return updated;
    }
    if (data['updated'] != true) throw Exception('取引が更新されませんでした');

    final updated = _parseTransaction(data['transaction'], '更新後の取引');
    AppRefreshController.refreshAccountBalances();
    return updated;
  }

  Future<void> deleteTransaction({required String id, String baseRevision = ''}) async {
    final data = await _postIdAction(
      id: id,
      emptyIdMessage: '削除対象の取引IDがありません',
      action: 'transaction_delete',
      extraBody: {'baseRevision': baseRevision},
    );
    if (data['deleted'] != true && data['queued'] != true) throw Exception('取引が削除されませんでした');
    AppRefreshController.refreshAccountBalances();
  }

  Future<void> ignoreTransaction({required String id}) async {
    final data = await _postIdAction(
      id: id,
      emptyIdMessage: '除外対象の取引IDがありません',
      action: 'transaction_ignore',
    );
    if (data['ignored'] != true && data['queued'] != true) throw Exception('取引が除外されませんでした');
    AppRefreshController.refreshAccountBalances();
  }

  Future<void> confirmSettlement({
    required String settlementTransactionId,
    required String importBatch,
  }) async {
    if (settlementTransactionId.trim().isEmpty) {
      throw Exception('引落取引IDがありません');
    }
    if (importBatch.trim().isEmpty) {
      throw Exception('カード明細の取込情報がありません');
    }

    await ApiClient.post(
      action: 'settlement_confirm',
      body: {
        'settlementTransactionId': settlementTransactionId,
        'importBatch': importBatch,
      },
    );
  }

  Future<List<SettlementCandidate>> fetchSettlementCandidates({
    required String transactionId,
  }) async {
    if (transactionId.trim().isEmpty) return [];

    final data = await ApiClient.get(
      action: 'settlement_candidates',
      queryParameters: {'transactionId': transactionId.trim()},
    );
    final items = data['items'];
    if (items is! List) return [];

    return items
        .whereType<Map>()
        .map((item) => SettlementCandidate.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<List<TransactionModel>> fetchIgnoredTransactions({
    int limit = 100,
    int offset = 0,
  }) async {
    final data = await ApiClient.get(
      action: 'ignored_transactions',
      queryParameters: {
        'limit': limit.toString(),
        'offset': offset.toString(),
      },
    );
    return _parseTransactions(data['items'], errorLabel: '除外済み取引');
  }

  Future<void> manualConfirmTransaction({required String id}) async {
    final data = await _postIdAction(
      id: id,
      emptyIdMessage: '確定対象の取引IDがありません',
      action: 'transaction_manual_confirm',
    );
    if (data['confirmed'] != true && data['queued'] != true) throw Exception('取引が手動確定されませんでした');
    AppRefreshController.refreshAccountBalances();
  }

  Future<void> restoreIgnoredTransaction({required String id}) async {
    final data = await _postIdAction(
      id: id,
      emptyIdMessage: '復元対象の取引IDがありません',
      action: 'transaction_restore_ignored',
    );
    if (data['restored'] != true && data['queued'] != true) throw Exception('取引が復元されませんでした');
    AppRefreshController.refreshAccountBalances();
  }

  Future<GmailImportStatusModel> fetchGmailImportStatus() async {
    final data = await ApiClient.get(action: 'gmail_import_status');
    return GmailImportStatusModel.fromJson(data);
  }

  static Future<Map<String, dynamic>> _postIdAction({
    required String id,
    required String emptyIdMessage,
    required String action,
    Map<String, dynamic> extraBody = const {},
  }) {
    final trimmedId = id.trim();
    if (trimmedId.isEmpty) throw Exception(emptyIdMessage);
    return ApiClient.post(action: action, body: {'id': trimmedId, ...extraBody});
  }

  static TransactionModel _parseTransaction(dynamic value, String label) {
    if (value is! Map) throw Exception('$labelデータを取得できませんでした');
    return TransactionModel.fromJson(Map<String, dynamic>.from(value));
  }

  static List<TransactionModel> _parseTransactions(
    dynamic value, {
    required String errorLabel,
  }) {
    if (value is! List) throw Exception('${errorLabel}APIのitems形式が正しくありません');
    return value.map((item) {
      if (item is! Map) throw Exception('$errorLabelデータの形式が正しくありません');
      return TransactionModel.fromJson(Map<String, dynamic>.from(item));
    }).toList();
  }

  static TransactionModel _offlineTransaction({
    required String id,
    required TransactionFormResult transaction,
    String merchant = '',
  }) {
    return TransactionModel.fromJson({
      'id': id,
      'transactionDate': _formatDate(transaction.date),
      'merchant': merchant,
      'itemName': transaction.title,
      'amount': transaction.amount,
      'type': switch (transaction.type) {
        TransactionType.expense => '支出',
        TransactionType.income => '収入',
        TransactionType.transfer => '移動',
      },
      'majorCategory': transaction.majorCategory,
      'subCategory': transaction.subCategory,
      'majorCategoryId': transaction.majorCategoryId,
      'subCategoryId': transaction.subCategoryId,
      'status': transaction.status,
      'purposeType': transaction.purposeType,
      'expenseRatio': transaction.expenseRatio,
      'expenseAmount': transaction.type == TransactionType.expense ? transaction.amount : 0,
      'evidenceUrl': transaction.evidenceUrl,
      'paymentMethod': transaction.paymentMethod,
      'accountName': transaction.accountName ?? '',
      'accountId': transaction.accountId,
      'fromAccount': transaction.fromAccount ?? '',
      'fromAccountId': transaction.fromAccountId,
      'toAccount': transaction.toAccount ?? '',
      'toAccountId': transaction.toAccountId,
      'note': transaction.memo,
      'sourceType': 'Neru Nexus App',
      'sourceStatus': 'offline_pending',
    });
  }

  static String _formatDate(DateTime date) {
    final year = date.year.toString().padLeft(4, '0');
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    return '$year-$month-$day';
  }

  static int _toInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}
