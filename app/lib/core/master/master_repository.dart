import '../../features/master/model/master_model.dart';
import '../../features/master/service/master_service.dart';
import 'master_cache.dart';

class MasterRepository {
  const MasterRepository({this.service = const MasterService()});

  final MasterService service;

  Future<MasterModel> getMaster({bool forceRefresh = false}) async {
    final cache = MasterCache.instance;

    if (!forceRefresh && cache.master != null) {
      return cache.master!;
    }

    final master = await service.fetchMaster();

    cache.setMaster(master);

    return master;
  }

  void clearCache() {
    MasterCache.instance.clear();
  }
}
