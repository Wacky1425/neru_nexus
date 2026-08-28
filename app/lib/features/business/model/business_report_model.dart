class BusinessMonthSummary {
  const BusinessMonthSummary({
    required this.yearMonth,
    required this.income,
    required this.expenseGross,
    required this.deductibleExpense,
    required this.profit,
  });

  final String yearMonth;
  final int income;
  final int expenseGross;
  final int deductibleExpense;
  final int profit;

  factory BusinessMonthSummary.fromJson(Map<String, dynamic> json) {
    return BusinessMonthSummary(
      yearMonth: json['yearMonth']?.toString() ?? '',
      income: _toInt(json['income']),
      expenseGross: _toInt(json['expenseGross']),
      deductibleExpense: _toInt(json['deductibleExpense']),
      profit: _toInt(json['profit']),
    );
  }
}

class BusinessCategorySummary {
  const BusinessCategorySummary({
    required this.majorCategory,
    required this.subCategory,
    required this.grossAmount,
    required this.deductibleAmount,
    required this.count,
  });

  final String majorCategory;
  final String subCategory;
  final int grossAmount;
  final int deductibleAmount;
  final int count;

  factory BusinessCategorySummary.fromJson(Map<String, dynamic> json) {
    return BusinessCategorySummary(
      majorCategory: json['majorCategory']?.toString() ?? '',
      subCategory: json['subCategory']?.toString() ?? '',
      grossAmount: _toInt(json['grossAmount']),
      deductibleAmount: _toInt(json['deductibleAmount']),
      count: _toInt(json['count']),
    );
  }
}

class BusinessTransactionItem {
  const BusinessTransactionItem({
    required this.id,
    required this.transactionDate,
    required this.type,
    required this.merchant,
    required this.itemName,
    required this.amount,
    required this.majorCategory,
    required this.subCategory,
    required this.purposeType,
    required this.expenseRatio,
    required this.expenseAmount,
    required this.note,
    required this.evidenceUrl,
    required this.accountName,
  });

  final String id;
  final String transactionDate;
  final String type;
  final String merchant;
  final String itemName;
  final int amount;
  final String majorCategory;
  final String subCategory;
  final String purposeType;
  final double expenseRatio;
  final int expenseAmount;
  final String note;
  final String evidenceUrl;
  final String accountName;

  factory BusinessTransactionItem.fromJson(Map<String, dynamic> json) {
    return BusinessTransactionItem(
      id: json['id']?.toString() ?? '',
      transactionDate: json['transactionDate']?.toString() ?? '',
      type: json['type']?.toString() ?? '',
      merchant: json['merchant']?.toString() ?? '',
      itemName: json['itemName']?.toString() ?? '',
      amount: _toInt(json['amount']),
      majorCategory: json['majorCategory']?.toString() ?? '',
      subCategory: json['subCategory']?.toString() ?? '',
      purposeType: json['purposeType']?.toString() ?? '',
      expenseRatio: (json['expenseRatio'] as num?)?.toDouble() ?? 0,
      expenseAmount: _toInt(json['expenseAmount']),
      note: json['note']?.toString() ?? '',
      evidenceUrl: json['evidenceUrl']?.toString() ?? '',
      accountName: json['accountName']?.toString() ?? '',
    );
  }
}

class BusinessReportModel {
  const BusinessReportModel({
    required this.year,
    required this.yearMonth,
    required this.income,
    required this.expenseGross,
    required this.deductibleExpense,
    required this.profit,
    required this.evidenceAttachedCount,
    required this.evidenceMissingCount,
    required this.transactionCount,
    required this.monthly,
    required this.categories,
    required this.items,
  });

  final String year;
  final String yearMonth;
  final int income;
  final int expenseGross;
  final int deductibleExpense;
  final int profit;
  final int evidenceAttachedCount;
  final int evidenceMissingCount;
  final int transactionCount;
  final List<BusinessMonthSummary> monthly;
  final List<BusinessCategorySummary> categories;
  final List<BusinessTransactionItem> items;

  factory BusinessReportModel.fromJson(Map<String, dynamic> json) {
    List<T> parseList<T>(dynamic value, T Function(Map<String, dynamic>) fromJson) {
      if (value is! List) return <T>[];
      return value.whereType<Map>().map((item) => fromJson(Map<String, dynamic>.from(item))).toList();
    }

    return BusinessReportModel(
      year: json['year']?.toString() ?? '',
      yearMonth: json['yearMonth']?.toString() ?? '',
      income: _toInt(json['income']),
      expenseGross: _toInt(json['expenseGross']),
      deductibleExpense: _toInt(json['deductibleExpense']),
      profit: _toInt(json['profit']),
      evidenceAttachedCount: _toInt(json['evidenceAttachedCount']),
      evidenceMissingCount: _toInt(json['evidenceMissingCount']),
      transactionCount: _toInt(json['transactionCount']),
      monthly: parseList(json['monthly'], BusinessMonthSummary.fromJson),
      categories: parseList(json['categories'], BusinessCategorySummary.fromJson),
      items: parseList(json['items'], BusinessTransactionItem.fromJson),
    );
  }
}

class BusinessExportResult {
  const BusinessExportResult({
    required this.year,
    required this.filename,
    required this.fileUrl,
    required this.rowCount,
  });

  final String year;
  final String filename;
  final String fileUrl;
  final int rowCount;

  factory BusinessExportResult.fromJson(Map<String, dynamic> json) {
    return BusinessExportResult(
      year: json['year']?.toString() ?? '',
      filename: json['filename']?.toString() ?? '',
      fileUrl: json['fileUrl']?.toString() ?? '',
      rowCount: _toInt(json['rowCount']),
    );
  }
}

int _toInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '') ?? 0;
}
