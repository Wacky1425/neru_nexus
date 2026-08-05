import 'package:flutter/material.dart';

import 'app.dart';
import 'core/master/master_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await const MasterRepository().getMaster();
  } catch (error) {
    debugPrint('Masterの初期取得に失敗しました: $error');
  }

  runApp(const NeruNexusApp());
}
