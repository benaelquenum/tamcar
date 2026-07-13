// TamCar — Design tokens (TypeScript)
//
// Source de vérité : ../../design/palette.md, typography.md, tokens.md.
// Toute modification doit également mettre à jour ces docs.

export const colors = {
  primary: {
    50:  '#FEF3EC',
    100: '#FDE0CC',
    300: '#F8A26D',
    500: '#EA5D18',
    700: '#B84812',
    900: '#7A2E08',
  },
  neutral: {
    0:   '#FFFAF5',
    100: '#FBEFE3',
    200: '#F0DCC8',
    400: '#A28E7D',
    600: '#5C4D3F',
    900: '#1F1712',
  },
  accent:  { 500: '#F4C430' },
  success: { 500: '#2E9E5C' },
  warning: { 500: '#D4A017' },
  error:   { 500: '#C1272D' },
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
  sm: '0 1px 2px rgba(31,23,18,0.06)',
  md: '0 4px 12px rgba(31,23,18,0.08)',
  lg: '0 12px 32px rgba(31,23,18,0.12)',
  xl: '0 24px 64px rgba(31,23,18,0.16)',
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
