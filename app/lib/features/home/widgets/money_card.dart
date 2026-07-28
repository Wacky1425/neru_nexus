import 'package:flutter/material.dart';

class MoneyCard extends StatelessWidget {
  const MoneyCard({
    super.key,
    required this.title,
    required this.amount,
    required this.subAmount,
    required this.icon,
  });

  final String title;
  final String amount;
  final String subAmount;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Icon(
              icon,
              size: 34,
            ),

            const SizedBox(width: 20),

            Expanded(
              child: Column(
                crossAxisAlignment:
                    CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Theme.of(context)
                        .textTheme
                        .bodyLarge,
                  ),

                  const SizedBox(height: 6),

                  Text(
                    amount,
                    style: Theme.of(context)
                        .textTheme
                        .headlineMedium
                        ?.copyWith(
                          fontWeight:
                              FontWeight.bold,
                        ),
                  ),
                  const SizedBox(height: 8),

                  Text(
                    subAmount,
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(
                          color: Colors.grey.shade600,
                        ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}