import '../../../core/network/api_client.dart';
import '../model/master_model.dart';

class MasterService {
  const MasterService();

  Future<MasterModel> fetchMaster() async {
    final data = await ApiClient.get(action: 'master');

    return MasterModel.fromJson(data);
  }
}
