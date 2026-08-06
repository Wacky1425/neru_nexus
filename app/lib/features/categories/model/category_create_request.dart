class CategoryCreateRequest {
  const CategoryCreateRequest({
    required this.type,
    required this.majorCategory,
    required this.subCategory,
  });

  final String type;
  final String majorCategory;
  final String subCategory;

  Map<String, dynamic> toJson() {
    return {
      'type': type,
      'majorCategory': majorCategory,
      'subCategory': subCategory,
    };
  }
}