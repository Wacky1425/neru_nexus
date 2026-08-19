import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

class MonthlyExpenseChart extends StatelessWidget {
  const MonthlyExpenseChart({super.key, required this.monthlyTrend});

  final List<Map<String, dynamic>> monthlyTrend;

  @override
  Widget build(BuildContext context) {
    if (monthlyTrend.isEmpty) {
      return const SizedBox.shrink();
    }

    final expenseSpots = List.generate(monthlyTrend.length, (index) {
      final expense = (monthlyTrend[index]['expense'] as num?)?.toDouble() ?? 0;

      return FlSpot(index.toDouble(), expense);
    });

    final incomeSpots = List.generate(monthlyTrend.length, (index) {
      final income = (monthlyTrend[index]['income'] as num?)?.toDouble() ?? 0;

      return FlSpot(index.toDouble(), income);
    });

    final balanceSpots = List.generate(monthlyTrend.length, (index) {
      final balance = (monthlyTrend[index]['balance'] as num?)?.toDouble() ?? 0;

      return FlSpot(index.toDouble(), balance);
    });

    final values = monthlyTrend
        .expand<double>(
          (item) => [
            (item['expense'] as num?)?.toDouble() ?? 0,
            (item['income'] as num?)?.toDouble() ?? 0,
            (item['balance'] as num?)?.toDouble() ?? 0,
          ],
        )
        .toList();

    final maximumValue = values.fold<double>(0, (maximum, value) {
      return value > maximum ? value : maximum;
    });

    final maxY = maximumValue <= 0 ? 10000.0 : _calculateMaxY(maximumValue);

    final minimumValue = values.fold<double>(0, (minimum, value) {
      return value < minimum ? value : minimum;
    });

    final minY = minimumValue >= 0 ? 0.0 : -_calculateMaxY(minimumValue.abs());

    final interval = maxY / 4;

    final colorScheme = Theme.of(context).colorScheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '月別収支推移',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 8),

            Text(
              '直近${monthlyTrend.length}か月',
              style: Theme.of(context).textTheme.bodySmall,
            ),

            const SizedBox(height: 12),

            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _LegendItem(label: '収入', color: colorScheme.tertiary),

                const SizedBox(width: 16),

                _LegendItem(label: '支出', color: colorScheme.error),

                const SizedBox(width: 16),

                _LegendItem(label: '収支', color: colorScheme.primary),
              ],
            ),

            const SizedBox(height: 20),

            SizedBox(
              height: 240,
              child: LineChart(
                LineChartData(
                  minX: 0,
                  maxX: (monthlyTrend.length - 1).toDouble(),
                  minY: minY,
                  maxY: maxY,

                  gridData: FlGridData(
                    show: true,
                    drawVerticalLine: false,
                    horizontalInterval: interval,
                  ),

                  borderData: FlBorderData(show: false),

                  titlesData: FlTitlesData(
                    topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                    rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 52,
                        interval: interval,
                        getTitlesWidget: (value, meta) {
                          return SideTitleWidget(
                            meta: meta,
                            child: Text(
                              _formatCompactYen(value),
                              style: const TextStyle(fontSize: 11),
                            ),
                          );
                        },
                      ),
                    ),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 34,
                        interval: 1,
                        getTitlesWidget: (value, meta) {
                          final index = value.toInt();

                          if (index < 0 || index >= monthlyTrend.length) {
                            return const SizedBox.shrink();
                          }

                          final yearMonth =
                              monthlyTrend[index]['yearMonth']?.toString() ??
                              '';

                          return SideTitleWidget(
                            meta: meta,
                            child: Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(
                                _formatMonth(yearMonth),
                                style: const TextStyle(fontSize: 11),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),

                  lineTouchData: LineTouchData(
                    touchTooltipData: LineTouchTooltipData(
                      getTooltipItems: (touchedSpots) {
                        return touchedSpots.map((spot) {
                          final index = spot.x.toInt();

                          if (index < 0 || index >= monthlyTrend.length) {
                            return null;
                          }

                          final yearMonth =
                              monthlyTrend[index]['yearMonth']?.toString() ??
                              '';

                          final label = switch (spot.barIndex) {
                            0 => '収入',
                            1 => '支出',
                            2 => '収支',
                            _ => '',
                          };

                          return LineTooltipItem(
                            '${_formatYearMonth(yearMonth)}\n'
                            '$label：${_formatYen(spot.y.toInt())}',
                            TextStyle(
                              color: colorScheme.onPrimaryContainer,
                              fontWeight: FontWeight.bold,
                            ),
                          );
                        }).toList();
                      },
                    ),
                  ),

                  lineBarsData: [
                    LineChartBarData(
                      spots: incomeSpots,
                      isCurved: monthlyTrend.length >= 3,
                      barWidth: 3,
                      color: colorScheme.tertiary,
                      isStrokeCapRound: true,
                      dotData: FlDotData(
                        show: true,
                        getDotPainter: (spot, percent, barData, index) {
                          return FlDotCirclePainter(
                            radius: 4,
                            color: colorScheme.tertiary,
                            strokeWidth: 2,
                            strokeColor: colorScheme.surface,
                          );
                        },
                      ),
                      belowBarData: BarAreaData(show: false),
                    ),

                    LineChartBarData(
                      spots: expenseSpots,
                      isCurved: monthlyTrend.length >= 3,
                      barWidth: 3,
                      color: colorScheme.error,
                      isStrokeCapRound: true,
                      dotData: FlDotData(
                        show: true,
                        getDotPainter: (spot, percent, barData, index) {
                          return FlDotCirclePainter(
                            radius: 4,
                            color: colorScheme.error,
                            strokeWidth: 2,
                            strokeColor: colorScheme.surface,
                          );
                        },
                      ),
                      belowBarData: BarAreaData(show: false),
                    ),

                    LineChartBarData(
                      spots: balanceSpots,
                      isCurved: monthlyTrend.length >= 3,
                      barWidth: 3,
                      color: colorScheme.primary,
                      isStrokeCapRound: true,
                      dotData: FlDotData(
                        show: true,
                        getDotPainter: (spot, percent, barData, index) {
                          return FlDotCirclePainter(
                            radius: 4,
                            color: colorScheme.primary,
                            strokeWidth: 2,
                            strokeColor: colorScheme.surface,
                          );
                        },
                      ),
                      belowBarData: BarAreaData(show: false),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static double _calculateMaxY(double maximumExpense) {
    const unit = 10000.0;

    return ((maximumExpense / unit).ceil() + 1) * unit;
  }

  static String _formatMonth(String value) {
    try {
      // "2026-07"
      if (RegExp(r'^\d{4}-\d{2}$').hasMatch(value)) {
        final month = int.parse(value.substring(5, 7));
        return '$month月';
      }

      // "2026-07-01T00:00:00..."
      final date = DateTime.parse(value);
      return '${date.month}月';
    } catch (_) {
      return value;
    }
  }

  static String _formatYearMonth(String value) {
    try {
      if (RegExp(r'^\d{4}-\d{2}$').hasMatch(value)) {
        return '${value.substring(0, 4)}年${int.parse(value.substring(5, 7))}月';
      }

      final date = DateTime.parse(value);
      return '${date.year}年${date.month}月';
    } catch (_) {
      return value;
    }
  }

  static String _formatCompactYen(double amount) {
    if (amount >= 10000) {
      final value = amount / 10000;

      if (value == value.roundToDouble()) {
        return '${value.toInt()}万';
      }

      return '${value.toStringAsFixed(1)}万';
    }

    return amount.toInt().toString();
  }

  static String _formatYen(int amount) {
    final formatted = amount.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );

    return '￥$formatted';
  }
}

class _LegendItem extends StatelessWidget {
  const _LegendItem({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),

        const SizedBox(width: 6),

        Text(label, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}
