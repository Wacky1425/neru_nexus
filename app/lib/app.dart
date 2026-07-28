import 'package:flutter/material.dart';

import 'features/app_shell.dart';

class NeruNexusApp extends StatelessWidget {
  const NeruNexusApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Neru Nexus',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: Colors.indigo,
      ),
      home: const AppShell(),
    );
  }
}