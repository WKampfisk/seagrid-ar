import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() {
  runApp(const ProviderScope(child: SeaGridApp()));
}

class SeaGridApp extends StatelessWidget {
  const SeaGridApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: const SeaGridHomeScreen(),
      theme: ThemeData(
        brightness: Brightness.dark,
        colorSchemeSeed: const Color(0xFF36D6C7),
        useMaterial3: true,
      ),
      title: 'SeaGrid AR',
    );
  }
}

class SeaGridHomeScreen extends StatelessWidget {
  const SeaGridHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.grid_4x4,
                  color: Theme.of(context).colorScheme.primary,
                  size: 72,
                ),
                const SizedBox(height: 24),
                Text(
                  'SeaGrid AR',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 12),
                const Text(
                  'Metric AR grid for coast, peaks, and depth context.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 32),
                const _DevelopmentStatus(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DevelopmentStatus extends StatelessWidget {
  const _DevelopmentStatus();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Development status: AR initialization pending',
      child: Chip(
        avatar: const Icon(Icons.construction, size: 18),
        label: const Text('AR initialization pending'),
        side: BorderSide(color: Theme.of(context).colorScheme.outline),
      ),
    );
  }
}

