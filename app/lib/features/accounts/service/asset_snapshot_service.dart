import '../../../core/network/api_client.dart';
import '../model/asset_snapshot_model.dart';

class AssetSnapshotService {
  const AssetSnapshotService();

  Future<AssetTrendResult> fetchTrend({int months = 12}) async {
    final data = await ApiClient.get(
      action: 'asset_trend',
      queryParameters: {'months': months.toString()},
    );
    return AssetTrendResult.fromJson(data);
  }

  Future<AssetSnapshotModel> captureNow() async {
    final data = await ApiClient.post(action: 'asset_snapshot_capture');
    return AssetSnapshotModel.fromJson(data);
  }
}
