import '../../features/master/model/master_model.dart';

class MasterCache {
  MasterCache._();

  static final MasterCache instance = MasterCache._();

  MasterModel? _master;

  MasterModel? get master => _master;

  bool get hasData => _master != null;

  void setMaster(MasterModel master) {
    _master = master;
  }

  void clear() {
    _master = null;
  }
}
