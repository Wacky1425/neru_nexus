import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

class MonthlyExpenseChart extends StatelessWidget {
  const MonthlyExpenseChart({
    super.key,
    required this.monthlyTrend,
  });

  final List<Map<String, dynamic>> monthlyTrend;

  @override
  Widget build(BuildContext context) {
    if (monthlyTrend.isEmpty) {
      return const SizedBox.shrink();
    }

    final spots = List.generate(
      monthlyTrend.length,
      (index) {
        final expense =
            (monthlyTrend[index]['expense'] as num?)
                    ?.toDouble() ??
                0;

        return FlSpot(
          index.toDouble(),
          expense,
        );
      },
    );

    final expenses = monthlyTrend
        .map(
          (item) =>
              (item['expense'] as num?)?.toDouble() ?? 0,
        )
        .toList();

    final maximumExpense = expenses.fold<double>(
      0,
      (maximum, expense) {
        return expense > maximum ? expense : maximum;
      },
    );

    final maxY = maximumExpense <= 0
        ? 10000.0
        : _calculateMaxY(maximumExpense);

    final interval = maxY / 4;

    final colorScheme = Theme.of(context).colorScheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          16,
          20,
          20,
          16,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '月別支出推移',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),

            const SizedBox(height: 8),

            Text(
              '直近${monthlyTrend.length}か月',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall,
            ),

            const SizedBox(height: 24),

            SizedBox(
              height: 240,
              child: LineChart(
                LineChartData(
                  minX: 0,
                  maxX: (monthlyTrend.length - 1)
                      .toDouble(),
                  minY: 0,
                  maxY: maxY,

                  gridData: FlGridData(
                    show: true,
                    drawVerticalLine: false,
                    horizontalInterval: interval,
                  ),

                  borderData: FlBorderData(
                    show: false,
                  ),

                  titlesData: FlTitlesData(
                    topTitles: const AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: false,
                      ),
                    ),
                    rightTitles: const AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: false,
                      ),
                    ),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 52,
                        interval: interval,
                        getTitlesWidget: (
                          value,
                          meta,
                        ) {
                          return SideTitleWidget(
                            meta: meta,
                            child: Text(
                              _formatCompactYen(value),
                              style: const TextStyle(
                                fontSize: 11,
                              ),
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
                        getTitlesWidget: (
                          value,
                          meta,
                        ) {
                          final index = value.toInt();

                          if (index < 0 ||
                              index >=
                                  monthlyTrend.length) {
                            return const SizedBox.shrink();
                          }

                          final yearMonth =
                              monthlyTrend[index]
                                      ['yearMonth']
                                  ?.toString() ??
                              '';

                          return SideTitleWidget(
                            meta: meta,
                            child: Padding(
                              padding:
                                  const EdgeInsets.only(
                                top: 8,
                              ),
                              child: Text(
                                _formatMonth(yearMonth),
                                style: const TextStyle(
                                  fontSize: 11,
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),

                  lineTouchData: LineTouchData(
                    touchTooltipData:
                        LineTouchTooltipData(
                      getTooltipItems: (
                        touchedSpots,
                      ) {
                        return touchedSpots.map(
                          (spot) {
                            final index =
                                spot.x.toInt();

                            final yearMonth =
                                monthlyTrend[index]
                                        ['yearMonth']
                                    ?.toString() ??
                                '';

                            return LineTooltipItem(
                              '${_formatYearMonth(yearMonth)}\n'
                              '${_formatYen(spot.y.toInt())}',
                              TextStyle(
                                color: colorScheme
                                    .onPrimaryContainer,
                                fontWeight:
                                    FontWeight.bold,
                              ),
                            );
                          },
                        ).toList();
                      },
                    ),
                  ),

                  lineBarsData: [
                    LineChartBarData(
                      spots: spots,
                      isCurved:
                          monthlyTrend.length >= 3,
                      barWidth: 4,
                      color: colorScheme.primary,
                      isStrokeCapRound: true,
                      dotData: FlDotData(
                        show: true,
                        getDotPainter: (
                          spot,
                          percent,
                          barData,
                          index,
                        ) {
                          return FlDotCirclePainter(
                            radius: 5,
                            color:
                                colorScheme.primary,
                            strokeWidth: 2,
                            strokeColor:
                                colorScheme.surface,
                          );
                        },
                      ),
                      belowBarData: BarAreaData(
                        show: true,
                        color: colorScheme.primary
                            .withValues(
                          alpha: 0.12,
                        ),
                      ),
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

  static double _calculateMaxY(
    double maximumExpense,
  ) {
    const unit = 10000.0;

    return ((maximumExpense / unit).ceil() + 1) *
        unit;
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
    final formatted = amount
        .toString()
        .replaceAllMapped(
          RegExp(r'\B(?=(\d{3})+(?!\d))'),
          (_) => ',',
        );

    return '￥$formatted';
  }
}