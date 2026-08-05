import type { Config } from 'tailwindcss';
import { colors, spacing, radius, shadow } from '../../packages/shared/design-tokens';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        neutral: colors.neutral,
        gold: colors.gold,
        violet: colors.violet,
        cyan: colors.cyan,
        accent: colors.accent,
        success: colors.success,
        warning: colors.warning,
        error: colors.error,
        info: colors.info,
      },
      fontFamily: {
        sans: ['var(--font-sora)', 'system-ui', 'sans-serif'],
      },
      spacing: {
        xs: `${spacing.xs}px`,
        sm: `${spacing.sm}px`,
        md: `${spacing.md}px`,
        lg: `${spacing.lg}px`,
        xl: `${spacing.xl}px`,
        '2xl': `${spacing['2xl']}px`,
        '3xl': `${spacing['3xl']}px`,
        '4xl': `${spacing['4xl']}px`,
      },
      borderRadius: {
        xs: `${radius.xs}px`,
        sm: `${radius.sm}px`,
        md: `${radius.md}px`,
        lg: `${radius.lg}px`,
        xl: `${radius.xl}px`,
        '2xl': `${radius['2xl']}px`,
        full: '999px',
      },
      boxShadow: {
        sm: shadow.sm,
        md: shadow.md,
        lg: shadow.lg,
        xl: shadow.xl,
        glow: shadow.glow,
        'glow-gold': shadow.glowGold,
        'glow-violet': shadow.glowViolet,
      },
    },
  },
  plugins: [],
};

export default config;
