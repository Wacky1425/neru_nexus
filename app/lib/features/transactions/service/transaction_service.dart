import '../../../core/network/api_client.dart';
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

    return TransactionPageResult(
      items: _parseTransactions(data['items'], errorLabel: '取引一覧'),
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
        'type': transaction.type == TransactionType.expense ? '支出' : '収入',
        'amount': transaction.amount,
        'majorCategory': transaction.majorCategory,
        'subCategory': transaction.subCategory,
        'title': transaction.title,
        'paymentMethod': transaction.paymentMethod,
        'status': transaction.status,
        'memo': transaction.memo,
        'purposeType': transaction.purposeType,
        'expenseRatio': transaction.expenseRatio,
        'evidenceUrl': transaction.evidenceUrl,
        'accountName': transaction.accountName,
      },
    );

    if (_toInt(data['addedCount']) <= 0) {
      throw Exception('取引が登録されませんでした');
    }

    final created = _parseTransaction(data['transaction'], '登録後の取引');
    AppRefreshController.refreshAccountBalances();
    return created;
  }

  Future<TransactionModel> updateTransaction({
    required String id,
    required TransactionFormResult transaction,
    bool saveRule = false,
    String merchant = '',
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
        'title': transaction.title,
        'paymentMethod': transaction.paymentMethod,
        'accountName': transaction.accountName ?? '',
        'status': transaction.status,
        'memo': transaction.memo,
        'purposeType': transaction.purposeType,
        'expenseRatio': transaction.expenseRatio,
        'evidenceUrl': transaction.evidenceUrl,
        'saveRule': saveRule,
        'merchant': merchant,
        'fromAccount': transaction.fromAccount ?? '',
        'toAccount': transaction.toAccount ?? '',
      },
    );

    if (data['updated'] != true) throw Exception('取引が更新されませんでした');

    final updated = _parseTransaction(data['transaction'], '更新後の取引');
    AppRefreshController.refreshAccountBalances();
    return updated;
  }

  Future<void> deleteTransaction({required String id}) async {
    final data = await _postIdAction(
      id: id,
      emptyIdMessage: '削除対象の取引IDがありません',
      action: 'transaction_delete',
    );
    if (data['deleted'] != true) throw Exception('取引が削除されませんでした');
    AppRefreshController.refreshAccountBalances();
  }

  Future<void> ignoreTransaction({required String id}) async {
    final data = await _postIdAction(
      id: id,
      emptyIdMessage: '除外対象の取引IDがありません',
      action: 'transaction_ignore',
    );
    if (data['ignored'] != true) throw Exception('取引が除外されませんでした');
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
    if (data['confirmed'] != true) throw Exception('取引が手動確定されませんでした');
    AppRefreshController.refreshAccountBalances();
  }

  Future<void> restoreIgnoredTransaction({required String id}) async {
    final data = await _postIdAction(
      id: id,
      emptyIdMessage: '復元対象の取引IDがありません',
      action: 'transaction_restore_ignored',
    );
    if (data['restored'] != true) throw Exception('取引が復元されませんでした');
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
  }) {
    final trimmedId = id.trim();
    if (trimmedId.isEmpty) throw Exception(emptyIdMessage);
    return ApiClient.post(action: action, body: {'id': trimmedId});
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
