import '../../../core/network/api_client.dart';
import '../model/home_model.dart';

class HomeService {
  const HomeService();

  Future<HomeModel> fetchHome() async {
    final data = await ApiClient.get(action: 'home');

    return HomeModel.fromJson(data);
  }
}
