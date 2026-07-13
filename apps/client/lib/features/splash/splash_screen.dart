import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:tamcar_shared/tamcar_shared.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    Timer(const Duration(milliseconds: 1200), () {
      if (!mounted) return;
      context.go('/home');
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TamCarColors.neutral0,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RichText(
              text: const TextSpan(
                style: TamCarTypography.displayXl,
                children: [
                  TextSpan(
                    text: 'Tam',
                    style: TextStyle(color: TamCarColors.primary500),
                  ),
                  TextSpan(
                    text: 'Car',
                    style: TextStyle(color: TamCarColors.neutral900),
                  ),
                ],
              ),
            ),
            const SizedBox(height: TamCarSpacing.md),
            Text(
              'Roulez tranquille au Bénin',
              style: TamCarTypography.bodyMd.copyWith(
                color: TamCarColors.neutral600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
