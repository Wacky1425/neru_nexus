import 'package:flutter_test/flutter_test.dart';
import 'package:app/app.dart';

void main() {
  testWidgets('Neru Nexus app builds', (WidgetTester tester) async {
    await tester.pumpWidget(const NeruNexusApp());
    expect(find.byType(NeruNexusApp), findsOneWidget);
  });
}
