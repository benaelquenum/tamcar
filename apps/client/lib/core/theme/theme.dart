import 'package:flutter/material.dart';
import 'package:tamcar_shared/tamcar_shared.dart';

/// Thème clair TamCar — basé sur les design tokens du package shared.
final tamCarLightTheme = ThemeData(
  useMaterial3: true,
  brightness: Brightness.light,
  scaffoldBackgroundColor: TamCarColors.neutral0,
  colorScheme: const ColorScheme.light(
    primary: TamCarColors.primary500,
    onPrimary: Colors.white,
    primaryContainer: TamCarColors.primary100,
    onPrimaryContainer: TamCarColors.primary900,
    secondary: TamCarColors.accent500,
    onSecondary: TamCarColors.neutral900,
    surface: TamCarColors.neutral0,
    onSurface: TamCarColors.neutral900,
    error: TamCarColors.error500,
    onError: Colors.white,
  ),
  textTheme: const TextTheme(
    displayLarge: TamCarTypography.displayXl,
    displayMedium: TamCarTypography.displayLg,
    headlineLarge: TamCarTypography.headingLg,
    headlineMedium: TamCarTypography.headingMd,
    bodyLarge: TamCarTypography.bodyLg,
    bodyMedium: TamCarTypography.bodyMd,
    labelSmall: TamCarTypography.caption,
  ),
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      backgroundColor: TamCarColors.primary500,
      foregroundColor: Colors.white,
      minimumSize: const Size.fromHeight(52),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(TamCarRadius.md),
      ),
      textStyle: TamCarTypography.bodyLg.copyWith(fontWeight: FontWeight.w600),
    ),
  ),
  outlinedButtonTheme: OutlinedButtonThemeData(
    style: OutlinedButton.styleFrom(
      foregroundColor: TamCarColors.primary500,
      minimumSize: const Size.fromHeight(52),
      side: const BorderSide(color: TamCarColors.primary300, width: 1.5),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(TamCarRadius.md),
      ),
      textStyle: TamCarTypography.bodyLg.copyWith(fontWeight: FontWeight.w600),
    ),
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: TamCarColors.neutral100,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(TamCarRadius.md),
      borderSide: BorderSide.none,
    ),
    contentPadding: const EdgeInsets.all(TamCarSpacing.lg),
    hintStyle: TamCarTypography.bodyLg.copyWith(color: TamCarColors.neutral400),
  ),
  appBarTheme: const AppBarTheme(
    backgroundColor: TamCarColors.neutral0,
    foregroundColor: TamCarColors.neutral900,
    elevation: 0,
    scrolledUnderElevation: 0,
    titleTextStyle: TamCarTypography.headingLg,
  ),
);
