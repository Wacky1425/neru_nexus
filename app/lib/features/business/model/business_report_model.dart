class BusinessMonthSummary {
  const BusinessMonthSummary({
    required this.yearMonth,
    required this.income,
    required this.expenseGross,
    required this.deductibleExpense,
    required this.profit,
    required this.evidenceAttachedCount,
    required this.evidenceMissingCount,
    required this.reviewCount,
    required this.classificationMissingCount,
    required this.expenseRatioReviewCount,
    required this.readinessIssueCount,
    required this.readinessScore,
  });

  final String yearMonth;
  final int income;
  final int expenseGross;
  final int deductibleExpense;
  final int profit;
  final int evidenceAttachedCount;
  final int evidenceMissingCount;
  final int reviewCount;
  final int classificationMissingCount;
  final int expenseRatioReviewCount;
  final int readinessIssueCount;
  final int readinessScore;

  factory BusinessMonthSummary.fromJson(Map<String, dynamic> json) {
    return BusinessMonthSummary(
      yearMonth: json['yearMonth']?.toString() ?? '',
      income: _toInt(json['income']),
      expenseGross: _toInt(json['expenseGross']),
      deductibleExpense: _toInt(json['deductibleExpense']),
      profit: _toInt(json['profit']),
      evidenceAttachedCount: _toInt(json['evidenceAttachedCount']),
      evidenceMissingCount: _toInt(json['evidenceMissingCount']),
      reviewCount: _toInt(json['reviewCount']),
      classificationMissingCount: _toInt(json['classificationMissingCount']),
      expenseRatioReviewCount: _toInt(json['expenseRatioReviewCount']),
      readinessIssueCount: _toInt(json['readinessIssueCount']),
      readinessScore: _toInt(json['readinessScore']),
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
    required this.status,
    required this.classificationMissing,
    required this.needsReview,
    required this.expenseRatioNeedsReview,
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
  final String status;
  final bool classificationMissing;
  final bool needsReview;
  final bool expenseRatioNeedsReview;
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
      status: json['status']?.toString() ?? '',
      classificationMissing: json['classificationMissing'] == true,
      needsReview: json['needsReview'] == true,
      expenseRatioNeedsReview: json['expenseRatioNeedsReview'] == true,
      expenseRatio: _toDouble(json['expenseRatio']),
      expenseAmount: _toInt(json['expenseAmount']),
      note: json['note']?.toString() ?? '',
      evidenceUrl: json['evidenceUrl']?.toString() ?? '',
      accountName: json['accountName']?.toString() ?? '',
    );
  }
}


class BusinessTaxReadiness {
  const BusinessTaxReadiness({
    required this.score,
    required this.ready,
    required this.issueCount,
    required this.reviewCount,
    required this.classificationMissingCount,
    required this.evidenceMissingCount,
    required this.expenseRatioReviewCount,
  });

  final int score;
  final bool ready;
  final int issueCount;
  final int reviewCount;
  final int classificationMissingCount;
  final int evidenceMissingCount;
  final int expenseRatioReviewCount;

  factory BusinessTaxReadiness.fromJson(Map<String, dynamic> json) {
    return BusinessTaxReadiness(
      score: _toInt(json['score']),
      ready: json['ready'] == true,
      issueCount: _toInt(json['issueCount']),
      reviewCount: _toInt(json['reviewCount']),
      classificationMissingCount: _toInt(json['classificationMissingCount']),
      evidenceMissingCount: _toInt(json['evidenceMissingCount']),
      expenseRatioReviewCount: _toInt(json['expenseRatioReviewCount']),
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
    required this.effectiveExpenseRatio,
    required this.profitMargin,
    required this.evidenceCoverageRate,
    required this.evidenceAttachedCount,
    required this.evidenceMissingCount,
    required this.transactionCount,
    required this.expenseTransactionCount,
    required this.bestMonth,
    required this.worstMonth,
    required this.monthly,
    required this.categories,
    required this.evidenceMissingItems,
    required this.reviewItems,
    required this.classificationMissingItems,
    required this.expenseRatioReviewItems,
    required this.taxReadiness,
    required this.items,
  });

  final String year;
  final String yearMonth;
  final int income;
  final int expenseGross;
  final int deductibleExpense;
  final int profit;
  final double effectiveExpenseRatio;
  final double profitMargin;
  final double evidenceCoverageRate;
  final int evidenceAttachedCount;
  final int evidenceMissingCount;
  final int transactionCount;
  final int expenseTransactionCount;
  final BusinessMonthSummary? bestMonth;
  final BusinessMonthSummary? worstMonth;
  final List<BusinessMonthSummary> monthly;
  final List<BusinessCategorySummary> categories;
  final List<BusinessTransactionItem> evidenceMissingItems;
  final List<BusinessTransactionItem> reviewItems;
  final List<BusinessTransactionItem> classificationMissingItems;
  final List<BusinessTransactionItem> expenseRatioReviewItems;
  final BusinessTaxReadiness taxReadiness;
  final List<BusinessTransactionItem> items;

  factory BusinessReportModel.fromJson(Map<String, dynamic> json) {
    List<T> parseList<T>(
      dynamic value,
      T Function(Map<String, dynamic>) fromJson,
    ) {
      if (value is! List) return <T>[];
      return value
          .whereType<Map>()
          .map((item) => fromJson(Map<String, dynamic>.from(item)))
          .toList();
    }

    BusinessMonthSummary? parseMonth(dynamic value) {
      if (value is! Map) return null;
      return BusinessMonthSummary.fromJson(Map<String, dynamic>.from(value));
    }

    return BusinessReportModel(
      year: json['year']?.toString() ?? '',
      yearMonth: json['yearMonth']?.toString() ?? '',
      income: _toInt(json['income']),
      expenseGross: _toInt(json['expenseGross']),
      deductibleExpense: _toInt(json['deductibleExpense']),
      profit: _toInt(json['profit']),
      effectiveExpenseRatio: _toDouble(json['effectiveExpenseRatio']),
      profitMargin: _toDouble(json['profitMargin']),
      evidenceCoverageRate: _toDouble(json['evidenceCoverageRate']),
      evidenceAttachedCount: _toInt(json['evidenceAttachedCount']),
      evidenceMissingCount: _toInt(json['evidenceMissingCount']),
      transactionCount: _toInt(json['transactionCount']),
      expenseTransactionCount: _toInt(json['expenseTransactionCount']),
      bestMonth: parseMonth(json['bestMonth']),
      worstMonth: parseMonth(json['worstMonth']),
      monthly: parseList(json['monthly'], BusinessMonthSummary.fromJson),
      categories: parseList(json['categories'], BusinessCategorySummary.fromJson),
      evidenceMissingItems:
          parseList(json['evidenceMissingItems'], BusinessTransactionItem.fromJson),
      reviewItems:
          parseList(json['reviewItems'], BusinessTransactionItem.fromJson),
      classificationMissingItems:
          parseList(json['classificationMissingItems'], BusinessTransactionItem.fromJson),
      expenseRatioReviewItems:
          parseList(json['expenseRatioReviewItems'], BusinessTransactionItem.fromJson),
      taxReadiness: json['taxReadiness'] is Map
          ? BusinessTaxReadiness.fromJson(
              Map<String, dynamic>.from(json['taxReadiness'] as Map),
            )
          : const BusinessTaxReadiness(
              score: 100,
              ready: true,
              issueCount: 0,
              reviewCount: 0,
              classificationMissingCount: 0,
              evidenceMissingCount: 0,
              expenseRatioReviewCount: 0,
            ),
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

double _toDouble(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}
