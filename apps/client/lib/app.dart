import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/router/router.dart';
import 'core/theme/theme.dart';

class TamCarClientApp extends ConsumerWidget {
  const TamCarClientApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'TamCar',
      theme: tamCarLightTheme,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
