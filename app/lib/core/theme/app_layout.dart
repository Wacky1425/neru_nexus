import 'package:flutter/material.dart';

/// Shared layout tokens for the five primary Neru Nexus tabs.
abstract final class AppLayout {
  static const double pageHorizontal = 20;
  static const double pageTop = 12;
  static const double pageBottom = 120;
  static const double sectionGap = 24;
  static const double cardGap = 12;
  static const double cardRadius = 22;
  static const EdgeInsets cardPadding = EdgeInsets.all(20);
}

class AppPageTitle extends StatelessWidget {
  const AppPageTitle(this.title, {super.key, this.actions = const []});
  final String title;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: -0.5,
            ),
          ),
        ),
        ...actions,
      ],
    ),
  );
}
