// TamCar — Design tokens (TypeScript)
//
// Source de vérité : ../../design/palette.md, typography.md, tokens.md.
// Toute modification doit également mettre à jour ces docs.

export const colors = {
  primary: {
    50:  '#E8F5EE',
    100: '#C7E7D5',
    300: '#6BBF95',
    500: '#0B7A55',
    700: '#085F42',
    900: '#043A28',
  },
  secondary: {
    100: '#FDE4D2',
    500: '#F26A2E',
    700: '#C24B15',
  },
  neutral: {
    0:   '#FBFAF7',
    100: '#F0EDE7',
    200: '#DDD8CE',
    400: '#9A968D',
    600: '#5D5A54',
    900: '#1A1815',
  },
  success: { 500: '#2E9E5C' },
  warning: { 500: '#F1B24A' },
  error:   { 500: '#DC2E44' },
  info:    { 500: '#2E7CDC' },
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
  full: 999,
} as const;

export const shadow = {
  sm: '0 1px 2px rgba(26,24,21,0.06)',
  md: '0 4px 12px rgba(26,24,21,0.08)',
  lg: '0 12px 32px rgba(26,24,21,0.12)',
  xl: '0 24px 64px rgba(26,24,21,0.16)',
} as const;

export const typography = {
  fontFamily: 'Inter, system-ui, sans-serif',
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
