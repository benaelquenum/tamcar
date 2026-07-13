// TamCar — Design tokens (Flutter)
//
// Source de vérité : ../../design/palette.md, typography.md, tokens.md.
// Toute modification doit également mettre à jour ces docs.

import 'dart:ui';
import 'package:flutter/material.dart';

class TamCarColors {
  // Primary — Vert TamCar
  static const primary50  = Color(0xFFE8F5EE);
  static const primary100 = Color(0xFFC7E7D5);
  static const primary300 = Color(0xFF6BBF95);
  static const primary500 = Color(0xFF0B7A55);
  static const primary700 = Color(0xFF085F42);
  static const primary900 = Color(0xFF043A28);

  // Secondary — Orange TamCar
  static const secondary100 = Color(0xFFFDE4D2);
  static const secondary500 = Color(0xFFF26A2E);
  static const secondary700 = Color(0xFFC24B15);

  // Neutrals
  static const neutral0   = Color(0xFFFBFAF7);
  static const neutral100 = Color(0xFFF0EDE7);
  static const neutral200 = Color(0xFFDDD8CE);
  static const neutral400 = Color(0xFF9A968D);
  static const neutral600 = Color(0xFF5D5A54);
  static const neutral900 = Color(0xFF1A1815);

  // Feedback
  static const success500 = Color(0xFF2E9E5C);
  static const warning500 = Color(0xFFF1B24A);
  static const error500   = Color(0xFFDC2E44);
  static const info500    = Color(0xFF2E7CDC);
}

class TamCarSpacing {
  static const xs    = 4.0;
  static const sm    = 8.0;
  static const md    = 12.0;
  static const lg    = 16.0;
  static const xl    = 24.0;
  static const xxl   = 32.0;
  static const xxxl  = 48.0;
  static const xxxxl = 64.0;
}

class TamCarRadius {
  static const xs   = 4.0;
  static const sm   = 8.0;
  static const md   = 12.0;
  static const lg   = 16.0;
  static const xl   = 24.0;
  static const full = 999.0;
}

class TamCarShadows {
  static const sm = [
    BoxShadow(color: Color(0x0F1A1815), blurRadius: 2, offset: Offset(0, 1)),
  ];
  static const md = [
    BoxShadow(color: Color(0x141A1815), blurRadius: 12, offset: Offset(0, 4)),
  ];
  static const lg = [
    BoxShadow(color: Color(0x1F1A1815), blurRadius: 32, offset: Offset(0, 12)),
  ];
  static const xl = [
    BoxShadow(color: Color(0x291A1815), blurRadius: 64, offset: Offset(0, 24)),
  ];
}

class TamCarTypography {
  static const _family = 'Inter';
  static const _tabular = FontFeature.tabularFigures();

  static const displayXl = TextStyle(
    fontFamily: _family, fontSize: 32, height: 1.25, fontWeight: FontWeight.w800,
  );
  static const displayLg = TextStyle(
    fontFamily: _family, fontSize: 28, height: 1.28, fontWeight: FontWeight.w700,
  );
  static const headingLg = TextStyle(
    fontFamily: _family, fontSize: 22, height: 1.36, fontWeight: FontWeight.w700,
  );
  static const headingMd = TextStyle(
    fontFamily: _family, fontSize: 18, height: 1.44, fontWeight: FontWeight.w600,
  );
  static const bodyLg = TextStyle(
    fontFamily: _family, fontSize: 16, height: 1.5, fontWeight: FontWeight.w500,
  );
  static const bodyMd = TextStyle(
    fontFamily: _family, fontSize: 14, height: 1.42, fontWeight: FontWeight.w400,
  );
  static const caption = TextStyle(
    fontFamily: _family, fontSize: 12, height: 1.33, fontWeight: FontWeight.w500,
  );
  static const monoPrice = TextStyle(
    fontFamily: _family, fontSize: 18, height: 1.33, fontWeight: FontWeight.w700,
    fontFeatures: [_tabular],
  );
}

class TamCarMotion {
  static const fastMs   = 120;
  static const normalMs = 220;
  static const slowMs   = 380;
  static const easing   = Curves.easeOutCubic;
}
