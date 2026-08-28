import '../../../core/network/api_client.dart';
import '../model/business_report_model.dart';

class BusinessReportService {
  const BusinessReportService();

  Future<BusinessReportModel> fetchReport({
    required int year,
    String? yearMonth,
  }) async {
    final parameters = <String, String>{'year': year.toString()};
    if (yearMonth != null && yearMonth.trim().isNotEmpty) {
      parameters['yearMonth'] = yearMonth.trim();
    }
    final data = await ApiClient.get(
      action: 'business_report',
      queryParameters: parameters,
    );
    return BusinessReportModel.fromJson(data);
  }

  Future<BusinessExportResult> createTaxExport({required int year}) async {
    final data = await ApiClient.post(
      action: 'business_tax_export_create',
      body: {'year': year.toString()},
    );
    return BusinessExportResult.fromJson(data);
  }
}
