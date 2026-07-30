import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

class ExpensePieChart extends StatefulWidget {
  const ExpensePieChart({super.key, required this.categories});

  final List<Map<String, dynamic>> categories;

  @override
  State<ExpensePieChart> createState() => _ExpensePieChartState();
}

class _ExpensePieChartState extends State<ExpensePieChart> {
  int touchedIndex = -1;

  @override
  Widget build(BuildContext context) {
    if (widget.categories.isEmpty) {
      return const SizedBox.shrink();
    }

    final colors = <Color>[
      Colors.blue,
      Colors.orange,
      Colors.green,
      Colors.red,
      Colors.purple,
      Colors.teal,
      Colors.amber,
      Colors.pink,
    ];

    final total = widget.categories.fold<int>(
      0,
      (sum, item) => sum + ((item['amount'] as num?)?.toInt() ?? 0),
    );

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            const Text(
              '支出割合',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 20),

            SizedBox(
              height: 220,
              child: PieChart(
                PieChartData(
                  centerSpaceRadius: 45,
                  sectionsSpace: 2,
                  sections: List.generate(widget.categories.length, (index) {
                    final amount =
                        (widget.categories[index]['amount'] as num?)
                            ?.toDouble() ??
                        0;

                    final title = total == 0
                        ? '0%'
                        : '${(amount / total * 100).toStringAsFixed(0)}%';

                    return PieChartSectionData(
                      value: amount,
                      title: title,
                      radius: touchedIndex == index ? 85 : 70,
                      titleStyle: TextStyle(
                        fontSize: touchedIndex == index ? 18 : 12,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                      color: colors[index % colors.length],
                    );
                  }),
                  pieTouchData: PieTouchData(
                    touchCallback: (event, response) {
                      setState(() {
                        touchedIndex =
                            response?.touchedSection?.touchedSectionIndex ?? -1;
                      });
                    },
                  ),
                ),
              ),
            ),

            const SizedBox(height: 20),

            ...List.generate(widget.categories.length, (index) {
              final category = widget.categories[index];

              final color = colors[index % colors.length];

              final amount = (category['amount'] as num?)?.toInt() ?? 0;

              final isSelected = touchedIndex == index;

              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: GestureDetector(
                  onTap: () {
                    setState(() {
                      touchedIndex = touchedIndex == index ? -1 : index;
                    });
                  },
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? Theme.of(context).colorScheme.primaryContainer
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          width: isSelected ? 18 : 14,
                          height: isSelected ? 18 : 14,
                          decoration: BoxDecoration(
                            color: color,
                            shape: BoxShape.circle,
                          ),
                        ),

                        const SizedBox(width: 8),

                        Expanded(
                          child: Text(
                            category['category'].toString(),
                            style: TextStyle(
                              fontWeight: isSelected
                                  ? FontWeight.bold
                                  : FontWeight.normal,
                            ),
                          ),
                        ),

                        Text(
                          _formatYen(amount),
                          style: TextStyle(
                            fontWeight: isSelected
                                ? FontWeight.bold
                                : FontWeight.normal,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  static String _formatYen(int amount) {
    final formatted = amount.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );

    return '￥$formatted';
  }
}
