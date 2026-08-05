class CategoryMaster {
  const CategoryMaster({
    required this.type,
    required this.majorCategoryId,
    required this.majorCategory,
    required this.subCategoryId,
    required this.subCategory,
    required this.isExpenseTarget,
    required this.active,
    required this.sortOrder,
    required this.note,
  });

  final String type;
  final String majorCategoryId;
  final String majorCategory;
  final String subCategoryId;
  final String subCategory;
  final bool isExpenseTarget;
  final bool active;
  final int sortOrder;
  final String note;

  factory CategoryMaster.fromJson(Map<String, dynamic> json) {
    return CategoryMaster(
      type: json['type']?.toString() ?? '',
      majorCategoryId: json['majorCategoryId']?.toString() ?? '',
      majorCategory: json['majorCategory']?.toString() ?? '',
      subCategoryId: json['subCategoryId']?.toString() ?? '',
      subCategory: json['subCategory']?.toString() ?? '',
      isExpenseTarget: json['isExpenseTarget'] == true,
      active: json['active'] == true,
      sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 999,
      note: json['note']?.toString() ?? '',
    );
  }
}

class AccountMaster {
  const AccountMaster({
    required this.accountId,
    required this.accountName,
    required this.paymentMethod,
    required this.wallet,
    required this.institution,
    required this.isAsset,
    required this.isLiability,
    required this.active,
    required this.sortOrder,
    required this.note,
  });

  final String accountId;
  final String accountName;
  final String paymentMethod;
  final String wallet;
  final String institution;
  final bool isAsset;
  final bool isLiability;
  final bool active;
  final int sortOrder;
  final String note;

  factory AccountMaster.fromJson(Map<String, dynamic> json) {
    return AccountMaster(
      accountId: json['accountId']?.toString().trim() ?? '',
      accountName: json['accountName']?.toString().trim() ?? '',
      paymentMethod: json['paymentMethod']?.toString().trim() ?? '',
      wallet: json['wallet']?.toString().trim() ?? '',
      institution: json['institution']?.toString().trim() ?? '',
      isAsset: _toBool(json['isAsset']),
      isLiability: _toBool(json['isLiability']),
      active: _toBool(json['active'], defaultValue: true),
      sortOrder: _toInt(json['sortOrder']),
      note: json['note']?.toString().trim() ?? '',
    );
  }

  static bool _toBool(dynamic value, {bool defaultValue = false}) {
    if (value == null) {
      return defaultValue;
    }

    if (value is bool) {
      return value;
    }

    if (value is num) {
      return value != 0;
    }

    final text = value.toString().trim().toLowerCase();

    if (text == 'true' || text == '1') {
      return true;
    }

    if (text == 'false' || text == '0') {
      return false;
    }

    return defaultValue;
  }

  static int _toInt(dynamic value) {
    if (value is int) {
      return value;
    }

    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '') ?? 999;
  }
}

class MasterModel {
  const MasterModel({
    required this.categories,
    required this.accounts,
    required this.transactionTypes,
    required this.transactionStatuses,
    required this.settings,
  });

  final List<CategoryMaster> categories;
  final List<AccountMaster> accounts;
  final List<String> transactionTypes;
  final List<String> transactionStatuses;
  final Map<String, dynamic> settings;

  factory MasterModel.fromJson(Map<String, dynamic> json) {
    return MasterModel(
      categories: _toCategoryList(json['categories']['items']),
      accounts: _toAccountList(json['accounts']),
      transactionTypes: _toStringList(json['transactionTypes']),
      transactionStatuses: _toStringList(json['transactionStatuses']),
      settings: _toMap(json['settings']),
    );
  }

  List<CategoryMaster> get expenseCategories {
    return categories.where((e) => e.type == '支出').toList();
  }

  List<CategoryMaster> get incomeCategories {
    return categories.where((e) => e.type == '収入').toList();
  }

  static List<CategoryMaster> _toCategoryList(dynamic value) {
    if (value is! List) {
      return [];
    }

    return value
        .whereType<Map>()
        .map((e) => CategoryMaster.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  static Map<String, dynamic> _toMap(dynamic value) {
    if (value is! Map) {
      return {};
    }

    return Map<String, dynamic>.from(value);
  }

  static List<String> _toStringList(dynamic value) {
    if (value is! List) {
      return [];
    }

    return value
        .map((item) => item?.toString().trim() ?? '')
        .where((item) => item.isNotEmpty)
        .toList();
  }

  static List<AccountMaster> _toAccountList(dynamic value) {
    if (value is! List) {
      return [];
    }

    final accounts = value
        .whereType<Map>()
        .map((item) => AccountMaster.fromJson(Map<String, dynamic>.from(item)))
        .where(
          (account) =>
              account.accountId.isNotEmpty && account.accountName.isNotEmpty,
        )
        .toList();

    accounts.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

    return accounts;
  }

  List<String> get paymentMethods {
    final result = <String>[];

    for (final account in accounts) {
      final value = account.paymentMethod.trim();

      if (value.isNotEmpty && !result.contains(value)) {
        result.add(value);
      }
    }

    return result;
  }

  List<String> get wallets {
    final result = <String>[];

    for (final account in accounts) {
      final value = account.wallet.trim();

      if (value.isNotEmpty && !result.contains(value)) {
        result.add(value);
      }
    }

    return result;
  }
}
