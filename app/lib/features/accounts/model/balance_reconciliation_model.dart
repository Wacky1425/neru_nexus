class BalanceReconciliationRecord {
  const BalanceReconciliationRecord({
    required this.reconciliationId,
    required this.checkedAt,
    required this.asOfDate,
    required this.calculatedBalance,
    required this.actualBalance,
    required this.difference,
    required this.matched,
    required this.note,
  });

  final String reconciliationId;
  final String checkedAt;
  final String asOfDate;
  final int calculatedBalance;
  final int actualBalance;
  final int difference;
  final bool matched;
  final String note;

  factory BalanceReconciliationRecord.fromJson(Map<String, dynamic> json) {
    return BalanceReconciliationRecord(
      reconciliationId: json['reconciliationId']?.toString() ?? '',
      checkedAt: json['checkedAt']?.toString() ?? '',
      asOfDate: json['asOfDate']?.toString() ?? '',
      calculatedBalance: _toInt(json['calculatedBalance']),
      actualBalance: _toInt(json['actualBalance']),
      difference: _toInt(json['difference']),
      matched: json['matched'] == true,
      note: json['note']?.toString() ?? '',
    );
  }
}

class BalanceReconciliationAccount {
  const BalanceReconciliationAccount({
    required this.accountId,
    required this.accountName,
    required this.isAsset,
    required this.isLiability,
    required this.assetType,
    required this.baselineDate,
    required this.openingBalance,
    required this.openingBalanceDate,
    required this.baselineReady,
    required this.calculatedBalance,
    required this.latestReconciliation,
  });

  final String accountId;
  final String accountName;
  final bool isAsset;
  final bool isLiability;
  final String assetType;
  final String baselineDate;
  final int openingBalance;
  final String openingBalanceDate;
  final bool baselineReady;
  final int calculatedBalance;
  final BalanceReconciliationRecord? latestReconciliation;

  factory BalanceReconciliationAccount.fromJson(Map<String, dynamic> json) {
    final latest = json['latestReconciliation'];
    return BalanceReconciliationAccount(
      accountId: json['accountId']?.toString() ?? '',
      accountName: json['accountName']?.toString() ?? '',
      isAsset: json['isAsset'] == true,
      isLiability: json['isLiability'] == true,
      assetType: json['assetType']?.toString() ?? '',
      baselineDate: json['baselineDate']?.toString() ?? '',
      openingBalance: _toInt(json['openingBalance']),
      openingBalanceDate: json['openingBalanceDate']?.toString() ?? '',
      baselineReady: json['baselineReady'] == true,
      calculatedBalance: _toInt(json['calculatedBalance']),
      latestReconciliation: latest is Map
          ? BalanceReconciliationRecord.fromJson(
              Map<String, dynamic>.from(latest),
            )
          : null,
    );
  }
}

class BalanceReconciliationResult {
  const BalanceReconciliationResult({
    required this.baselineDate,
    required this.items,
    required this.totalCount,
    required this.baselineReadyCount,
    required this.baselinePendingCount,
    required this.checkedCount,
    required this.uncheckedCount,
    required this.matchedCount,
    required this.mismatchCount,
  });

  final String baselineDate;
  final List<BalanceReconciliationAccount> items;
  final int totalCount;
  final int baselineReadyCount;
  final int baselinePendingCount;
  final int checkedCount;
  final int uncheckedCount;
  final int matchedCount;
  final int mismatchCount;

  factory BalanceReconciliationResult.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'];
    return BalanceReconciliationResult(
      baselineDate: json['baselineDate']?.toString() ?? '',
      items: rawItems is List
          ? rawItems
              .whereType<Map>()
              .map(
                (item) => BalanceReconciliationAccount.fromJson(
                  Map<String, dynamic>.from(item),
                ),
              )
              .toList()
          : const <BalanceReconciliationAccount>[],
      totalCount: _toInt(json['totalCount']),
      baselineReadyCount: _toInt(json['baselineReadyCount']),
      baselinePendingCount: _toInt(json['baselinePendingCount']),
      checkedCount: _toInt(json['checkedCount']),
      uncheckedCount: _toInt(json['uncheckedCount']),
      matchedCount: _toInt(json['matchedCount']),
      mismatchCount: _toInt(json['mismatchCount']),
    );
  }
}

int _toInt(dynamic value) {
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '') ?? 0;
}
