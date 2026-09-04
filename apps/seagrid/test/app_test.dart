import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seagrid/main.dart';

void main() {
  testWidgets('renders the SeaGrid AR shell', (tester) async {
    await tester.pumpWidget(const SeaGridApp());

    expect(find.text('SeaGrid AR'), findsOneWidget);
    expect(
      find.text('Metric AR grid for coast, peaks, and depth context.'),
      findsOneWidget,
    );
    expect(find.byIcon(Icons.grid_4x4), findsOneWidget);
    expect(find.text('AR initialization pending'), findsOneWidget);
  });
}

