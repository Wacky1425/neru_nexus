import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/constants/api_constants.dart';
import '../transaction_form_page.dart';

class TransactionService {
  const TransactionService();

  Future<void> createTransaction({
    required TransactionFormResult transaction,
  }) async {
    final uri = Uri.parse(
      ApiConstants.baseUrl,
    );

    final response = await http.post(
      uri,
      headers: const {
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'action': 'transaction_create',
        'key': ApiConstants.apiKey,
        'transactionDate': _formatDate(
          transaction.date,
        ),
        'type': transaction.type ==
                TransactionType.expense
            ? '支出'
            : '収入',
        'amount': transaction.amount,
        'category': transaction.category,
        'title': transaction.title,
        'paymentMethod':
            transaction.paymentMethod,
        'memo': transaction.memo ?? '',
      }),
    );

    if (response.statusCode != 200) {
      throw Exception(
        '取引の登録に失敗しました: '
        '${response.statusCode}',
      );
    }

    final dynamic decodedValue;

    try {
      decodedValue = jsonDecode(response.body);
    } on FormatException {
      throw Exception(
        '取引登録APIから不正なレスポンスが返されました',
      );
    }

    if (decodedValue is! Map) {
      throw Exception(
        '取引登録APIの形式が正しくありません',
      );
    }

    final decoded =
        Map<String, dynamic>.from(decodedValue);

    if (decoded['success'] != true) {
      final error = decoded['error'];

      if (error is Map) {
        throw Exception(
          error['message']?.toString() ??
              '取引の登録に失敗しました',
        );
      }

      throw Exception(
        error?.toString() ??
            '取引の登録に失敗しました',
      );
    }

    final data = decoded['data'];

    if (data is! Map) {
      throw Exception(
        '取引登録APIのデータ形式が正しくありません',
      );
    }

    final addedCount = _toInt(
      data['addedCount'],
    );

    if (addedCount <= 0) {
      throw Exception(
        '取引が登録されませんでした',
      );
    }
  }

  static String _formatDate(DateTime date) {
    final year =
        date.year.toString().padLeft(4, '0');

    final month =
        date.month.toString().padLeft(2, '0');

    final day =
        date.day.toString().padLeft(2, '0');

    return '$year-$month-$day';
  }

  static int _toInt(dynamic value) {
    if (value is int) {
      return value;
    }

    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(
          value?.toString() ?? '',
        ) ??
        0;
  }
}