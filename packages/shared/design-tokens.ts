// TamCar — Design tokens (TypeScript)
//
// Source de vérité : design/palette.md, design/typography.md, design/tokens.md.
// Toute modification doit également mettre à jour ces docs.

export const colors = {
  primary: {
    50:  '#EFF6FF',
    100: '#DBEAFE',
    300: '#93C5FD',
    500: '#2563EB',   // Bleu roi vif TamCar
    700: '#1D4ED8',
    900: '#1E3A8A',
  },
  neutral: {
    0:   '#FFFFFF',   // blanc pur
    100: '#F8FAFC',   // slate-50 (fond secondaire, cards inactives)
    200: '#E2E8F0',   // slate-200 (bordures)
    400: '#94A3B8',   // slate-400 (texte tertiaire)
    600: '#475569',   // slate-600 (texte secondaire)
    900: '#0F172A',   // slate-900 (texte principal, noir bleuté)
  },
  // Accents — pour jovialité + engagement visuel
  // DEFAULT permet d'écrire bg-gold / text-success sans suffixe -500
  gold:   { DEFAULT: '#EAB308', 500: '#EAB308' },
  violet: { DEFAULT: '#8B5CF6', 500: '#8B5CF6' },
  cyan:   { DEFAULT: '#06B6D4', 500: '#06B6D4' },
  accent: { DEFAULT: '#EAB308', 500: '#EAB308' },
  success: { DEFAULT: '#10B981', 500: '#10B981' },
  warning: { DEFAULT: '#F59E0B', 500: '#F59E0B' },
  error:   { DEFAULT: '#EF4444', 500: '#EF4444' },
  info:    { DEFAULT: '#3B82F6', 500: '#3B82F6' },
} as const;

export const spacing = {
  xs:    4,
  sm:    8,
  md:    12,
  lg:    16,
  xl:    24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

export const radius = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  '2xl': 32,
  full: 999,
} as const;

export const shadow = {
  sm: '0 1px 2px rgba(15,23,42,0.06)',
  md: '0 4px 12px rgba(15,23,42,0.08)',
  lg: '0 12px 32px rgba(15,23,42,0.12)',
  xl: '0 24px 64px rgba(15,23,42,0.16)',
  // Glows colorés — pour l'effet "brillant, engagement"
  glow:     '0 10px 30px -10px rgba(37, 99, 235, 0.5)',    // bleu primary rayonne
  glowGold: '0 10px 30px -10px rgba(234, 179, 8, 0.5)',    // doré rayonne
  glowViolet: '0 10px 30px -10px rgba(139, 92, 246, 0.5)', // violet rayonne
} as const;

export const typography = {
  fontFamily: 'Sora, system-ui, sans-serif',
  displayXl: { fontSize: 32, lineHeight: 40, fontWeight: 800 },
  displayLg: { fontSize: 28, lineHeight: 36, fontWeight: 700 },
  headingLg: { fontSize: 22, lineHeight: 30, fontWeight: 700 },
  headingMd: { fontSize: 18, lineHeight: 26, fontWeight: 600 },
  bodyLg:    { fontSize: 16, lineHeight: 24, fontWeight: 500 },
  bodyMd:    { fontSize: 14, lineHeight: 20, fontWeight: 400 },
  caption:   { fontSize: 12, lineHeight: 16, fontWeight: 500 },
  monoPrice: { fontSize: 18, lineHeight: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
} as const;

export const motion = {
  fast:   { duration: 120, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  normal: { duration: 220, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  slow:   { duration: 380, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
} as const;
