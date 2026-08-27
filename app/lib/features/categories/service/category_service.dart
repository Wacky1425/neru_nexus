import '../../../core/network/api_client.dart';
import '../model/category_create_request.dart';

class CategoryService {
  const CategoryService();

  Future<void> createCategory(CategoryCreateRequest category) async {
    await ApiClient.post(
      action: 'category_create',
      body: category.toJson(),
    );
  }

  Future<void> updateCategory({
    required String subCategoryId,
    required String majorCategory,
    required String subCategory,
    required bool active,
  }) async {
    await ApiClient.post(
      action: 'category_update',
      body: {
        'subCategoryId': subCategoryId,
        'majorCategory': majorCategory,
        'subCategory': subCategory,
        'active': active,
      },
    );
  }

  Future<void> deactivateCategory({required String subCategoryId}) async {
    await ApiClient.post(
      action: 'category_deactivate',
      body: {'subCategoryId': subCategoryId},
    );
  }
}
