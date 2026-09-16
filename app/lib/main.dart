import 'package:flutter/material.dart';

import 'app.dart';
import 'core/offline/offline_sync_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await OfflineSyncStore.initialize();
  runApp(const NeruNexusApp());
}
