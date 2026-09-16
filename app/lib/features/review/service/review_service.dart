import '../../../core/network/api_client.dart';
import '../../transactions/model/transaction_model.dart';

enum ReviewQueueMode { userReview, formalWait }

class ReviewTransactionsResult {
  const ReviewTransactionsResult({
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

class ReviewService {
  const ReviewService();

  Future<ReviewTransactionsResult> fetchReviewTransactions({
    int limit = 100,
    int offset = 0,
    ReviewQueueMode queueMode = ReviewQueueMode.userReview,
  }) async {
    final data = await ApiClient.get(
      action: 'review_transactions',
      queryParameters: {
        'limit': limit.toString(),
        'offset': offset.toString(),
        'queueMode': queueMode == ReviewQueueMode.formalWait
            ? 'formal_wait'
            : 'user_review',
      },
    );

    final itemsValue = data['items'];

    if (itemsValue is! List) {
      throw Exception('要確認一覧APIのitems形式が正しくありません');
    }

    final items = itemsValue.map((item) {
      if (item is! Map) {
        throw Exception('要確認取引の形式が正しくありません');
      }

      return TransactionModel.fromJson(Map<String, dynamic>.from(item));
    }).toList();

    return ReviewTransactionsResult(
      items: items,
      total: _toInt(data['total']),
      limit: _toInt(data['limit']),
      offset: _toInt(data['offset']),
      hasMore: data['hasMore'] == true,
    );
  }

  Future<int> fetchReviewCount() async {
    final data = await ApiClient.get(action: 'review_count');
    return _toInt(data['count']);
  }

  static int _toInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}

class ReconciliationHistoryItem {
  const ReconciliationHistoryItem({
    required this.preliminaryDate,
    required this.preliminaryMerchant,
    required this.amount,
    required this.sourceType,
    required this.formalDate,
    required this.formalMerchant,
    required this.formalSourceType,
  });

  final String preliminaryDate;
  final String preliminaryMerchant;
  final int amount;
  final String sourceType;
  final String formalDate;
  final String formalMerchant;
  final String formalSourceType;

  factory ReconciliationHistoryItem.fromJson(Map<String, dynamic> json) {
    return ReconciliationHistoryItem(
      preliminaryDate: json['preliminaryDate']?.toString() ?? '',
      preliminaryMerchant: json['preliminaryMerchant']?.toString() ?? '',
      amount: ReviewService._toInt(json['amount']),
      sourceType: json['sourceType']?.toString() ?? '',
      formalDate: json['formalDate']?.toString() ?? '',
      formalMerchant: json['formalMerchant']?.toString() ?? '',
      formalSourceType: json['formalSourceType']?.toString() ?? '',
    );
  }
}

extension ReviewReconciliationHistory on ReviewService {
  Future<List<ReconciliationHistoryItem>> fetchReconciliationHistory({int limit = 10}) async {
    final data = await ApiClient.get(
      action: 'reconciliation_history',
      queryParameters: {'limit': limit.toString()},
    );
    final raw = data['items'];
    if (raw is! List) throw Exception('照合履歴APIのitems形式が正しくありません');
    return raw.map((item) => ReconciliationHistoryItem.fromJson(Map<String, dynamic>.from(item as Map))).toList();
  }
}
