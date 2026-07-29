import 'package:flutter/material.dart';

class DreamCard extends StatelessWidget {
  const DreamCard({
    super.key,
    required this.title,
    required this.current,
    required this.goal,
  });

  final String title;
  final int current;
  final int goal;

  @override
  Widget build(BuildContext context) {
    final progress =
        goal == 0 ? 0.0 : current / goal;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment:
              CrossAxisAlignment.start,
          children: [

            Row(
              children: [

                const Icon(Icons.flag),

                const SizedBox(width: 8),

                Text(
                  "Dream",
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge,
                ),
              ],
            ),

            const SizedBox(height: 20),

            Text(
              title,
              style: Theme.of(context)
                  .textTheme
                  .titleMedium,
            ),

            const SizedBox(height: 12),

            LinearProgressIndicator(
              value: progress,
              minHeight: 10,
              borderRadius:
                  BorderRadius.circular(20),
            ),

            const SizedBox(height: 12),

            Text(
              "${(progress * 100).toStringAsFixed(0)} %",
            ),

            const SizedBox(height: 6),

            Text(
              "あと ¥${_formatYen(goal - current)}",
            ),
          ],
        ),
      ),
    );
  }

  static String _formatYen(dynamic value) {
  final amount = value is num
      ? value.toInt()
      : int.tryParse(value?.toString() ?? '') ?? 0;

  final formatted = amount.toString().replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => ',',
  );

  return '￥$formatted';
}
}