import 'package:flutter/material.dart';

Future<DateTime?> showMonthPickerDialog({
  required BuildContext context,
  required DateTime initialMonth,
  DateTime? firstMonth,
  DateTime? lastMonth,
}) {
  return showDialog<DateTime>(
    context: context,
    builder: (dialogContext) {
      return _MonthPickerDialog(
        initialMonth: initialMonth,
        firstMonth: firstMonth ?? DateTime(2020, 1),
        lastMonth: lastMonth ?? DateTime.now(),
      );
    },
  );
}

class _MonthPickerDialog extends StatefulWidget {
  const _MonthPickerDialog({
    required this.initialMonth,
    required this.firstMonth,
    required this.lastMonth,
  });

  final DateTime initialMonth;
  final DateTime firstMonth;
  final DateTime lastMonth;

  @override
  State<_MonthPickerDialog> createState() => _MonthPickerDialogState();
}

class _MonthPickerDialogState extends State<_MonthPickerDialog> {
  late int _selectedYear;

  @override
  void initState() {
    super.initState();

    _selectedYear = widget.initialMonth.year;
  }

  @override
  Widget build(BuildContext context) {
    final canMovePrevious = _selectedYear > widget.firstMonth.year;

    final canMoveNext = _selectedYear < widget.lastMonth.year;

    return AlertDialog(
      titlePadding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      contentPadding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      actionsPadding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
      title: Row(
        children: [
          IconButton(
            onPressed: canMovePrevious
                ? () {
                    setState(() {
                      _selectedYear--;
                    });
                  }
                : null,
            icon: const Icon(Icons.chevron_left),
          ),

          Expanded(
            child: Text(
              '$_selectedYear年',
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
          ),

          IconButton(
            onPressed: canMoveNext
                ? () {
                    setState(() {
                      _selectedYear++;
                    });
                  }
                : null,
            icon: const Icon(Icons.chevron_right),
          ),
        ],
      ),
      content: SizedBox(
        width: 320,
        child: GridView.builder(
          shrinkWrap: true,
          itemCount: 12,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            childAspectRatio: 1.8,
            crossAxisSpacing: 8,
            mainAxisSpacing: 8,
          ),
          itemBuilder: (context, index) {
            final month = index + 1;

            final candidate = DateTime(_selectedYear, month);

            final firstMonth = DateTime(
              widget.firstMonth.year,
              widget.firstMonth.month,
            );

            final lastMonth = DateTime(
              widget.lastMonth.year,
              widget.lastMonth.month,
            );

            final enabled =
                !candidate.isBefore(firstMonth) &&
                !candidate.isAfter(lastMonth);

            final selected =
                widget.initialMonth.year == _selectedYear &&
                widget.initialMonth.month == month;

            return FilledButton.tonal(
              onPressed: enabled
                  ? () {
                      Navigator.of(context).pop(candidate);
                    }
                  : null,
              style: selected
                  ? FilledButton.styleFrom(
                      backgroundColor: Theme.of(
                        context,
                      ).colorScheme.primaryContainer,
                      foregroundColor: Theme.of(
                        context,
                      ).colorScheme.onPrimaryContainer,
                    )
                  : null,
              child: Text('$month月'),
            );
          },
        ),
      ),
      actions: [
        TextButton(
          onPressed: () {
            Navigator.of(context).pop();
          },
          child: const Text('キャンセル'),
        ),
      ],
    );
  }
}
