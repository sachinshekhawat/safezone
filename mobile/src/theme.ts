import { MD3DarkTheme, MD3LightTheme, configureFonts } from 'react-native-paper';
import { RISK_BANDS } from '@safezone/shared';

/**
 * Three themes: elegant light, dark, and pink.
 *
 * ## Contrast
 *
 * Every pairing was measured against WCAG 2.1 rather than eyeballed. Text pairs
 * are held to 4.5:1 and control borders to 3:1, in all three modes:
 *
 *   ELEGANT LIGHT   primary/white 8.85 · onSurface 16.61 · variant 6.58 · outline 3.24
 *   DARK            primary 9.05 · onSurface 14.92 · variant 7.68 · outline 3.66 · error 6.50
 *   PINK            primary 5.77 · onSurface 16.10 · variant 6.48 · outline 3.11
 *
 * The outline figures are the ones that took work. A tasteful pale border came
 * out at 1.70 — nowhere near the 3:1 WCAG asks for the boundary of a control.
 * Input fields whose edges you cannot locate are a real problem on a cheap screen
 * in daylight, so the borders are darker than is purely decorative.
 *
 * ## The SOS red in every mode
 *
 * `error` is the SOS colour and it does not follow the palette. In pink mode the
 * brand rose and the emergency red are adjacent hues that cannot have high
 * contrast with each other (measured 1.66 apart), so the SOS control never relies
 * on colour alone: it is a filled octagon with an explicit "SOS" label, and a
 * full-width "PRESS FOR HELP" button on its own screen. In pink mode the rose is
 * deliberately the darker of the two so the brighter red still reads as more
 * urgent. In dark mode the red is lightened, because #DC2626 on a near-black
 * surface falls to 4.0:1 and stops being legible.
 *
 * ## Risk colours are never themed
 *
 * RISK_BANDS is imported, never redefined. Those five colours are shared with the
 * web client and the AI service and carry meaning rather than branding. Restyling
 * them per theme would make one zone render as a different band in two places,
 * and would put amber-on-pink combinations on screen that no longer read as a
 * scale. They are identical in all three modes.
 */

export type ThemeMode = 'light' | 'dark' | 'pink';

const fonts = configureFonts({ config: { fontFamily: 'System' } });

/** Neutral, restrained default. Indigo on near-white. */
const lightTheme = {
  ...MD3LightTheme,
  fonts,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#3F3D9E',
    onPrimary: '#FFFFFF',
    primaryContainer: '#E3E2FB',
    onPrimaryContainer: '#141338',
    secondary: '#0E7490',
    onSecondary: '#FFFFFF',
    secondaryContainer: '#CFFAFE',
    onSecondaryContainer: '#083344',
    error: '#DC2626',
    onError: '#FFFFFF',
    errorContainer: '#FEE2E2',
    onErrorContainer: '#7F1D1D',
    background: '#FBFBFD',
    onBackground: '#1B1B1F',
    surface: '#FFFFFF',
    onSurface: '#1B1B1F',
    surfaceVariant: '#F2F2F6',
    onSurfaceVariant: '#5A5A66',
    outline: '#8E8E9A',
    outlineVariant: '#E2E2E9',
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level0: 'transparent',
      level1: '#FFFFFF',
      level2: '#FCFCFE',
      level3: '#FAFAFC',
      level4: '#F8F8FB',
      level5: '#F5F5F9',
    },
  },
  roundness: 14,
};

/** Dark mode. Surfaces are lifted off pure black so elevation stays readable. */
const darkTheme = {
  ...MD3DarkTheme,
  fonts,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#A5B4FC',
    // Dark text on a light primary, because a light-on-light button label would
    // be unreadable in this mode.
    onPrimary: '#16161A',
    primaryContainer: '#2A2A5C',
    onPrimaryContainer: '#DDDCFE',
    secondary: '#67E8F9',
    onSecondary: '#06202A',
    secondaryContainer: '#0E4657',
    onSecondaryContainer: '#CFFAFE',
    // Lightened from #DC2626, which drops to 4.0:1 on a near-black surface.
    error: '#FF6B6B',
    onError: '#2A0606',
    errorContainer: '#5C1A1A',
    onErrorContainer: '#FFD9D9',
    background: '#101014',
    onBackground: '#E9E9EF',
    surface: '#16161A',
    onSurface: '#E9E9EF',
    surfaceVariant: '#22222A',
    onSurfaceVariant: '#A8A8B6',
    outline: '#6F6F80',
    outlineVariant: '#2E2E38',
    elevation: {
      ...MD3DarkTheme.colors.elevation,
      level0: 'transparent',
      level1: '#16161A',
      level2: '#1B1B21',
      level3: '#202027',
      level4: '#23232B',
      level5: '#28282F',
    },
  },
  roundness: 14,
};

/** Pink mode. Deep rose on a barely-tinted warm white. */
const pinkTheme = {
  ...MD3LightTheme,
  fonts,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#BE185D',
    onPrimary: '#FFFFFF',
    primaryContainer: '#FCE7F3',
    onPrimaryContainer: '#500724',
    // Deep violet, chosen because it collides with none of the five risk
    // colours — which rules out the teals and greens that would otherwise pair
    // nicely with rose.
    secondary: '#5B21B6',
    onSecondary: '#FFFFFF',
    secondaryContainer: '#EDE9FE',
    onSecondaryContainer: '#2E1065',
    error: '#DC2626',
    onError: '#FFFFFF',
    errorContainer: '#FEE2E2',
    onErrorContainer: '#7F1D1D',
    background: '#FFF8FA',
    onBackground: '#2B1720',
    surface: '#FFFFFF',
    onSurface: '#2B1720',
    surfaceVariant: '#FDF2F8',
    onSurfaceVariant: '#6B5560',
    outline: '#AD8395',
    outlineVariant: '#F0D9E2',
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level0: 'transparent',
      level1: '#FFFFFF',
      level2: '#FFFCFD',
      level3: '#FFF8FA',
      level4: '#FEF5F8',
      level5: '#FDF2F8',
    },
  },
  roundness: 16,
};

export const THEMES: Record<ThemeMode, typeof lightTheme> = {
  light: lightTheme,
  dark: darkTheme as unknown as typeof lightTheme,
  pink: pinkTheme,
};

export function themeFor(mode: ThemeMode) {
  return THEMES[mode] ?? THEMES.light;
}

/** Kept as a named export so existing imports of `theme` still resolve. */
export const theme = lightTheme;

export type AppTheme = typeof lightTheme;

/** Convenience map of risk level -> colour, derived from the shared bands. */
export const RISK_COLORS = RISK_BANDS.reduce<Record<string, string>>((acc, band) => {
  acc[band.level] = band.color;
  return acc;
}, {});

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
