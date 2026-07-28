import 'package:flutter/material.dart';

import 'core/theme/app_theme.dart';
import 'features/app_shell.dart';

class NeruNexusApp extends StatelessWidget {
  const NeruNexusApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Neru Nexus',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      home: const AppShell(),
    );
  }
}