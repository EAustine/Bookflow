/**
 * Bookflow Design Tokens
 *
 * Single source of truth for all visual constants. Components MUST reference
 * these tokens — never hardcode hex values, pixel sizes, or font names.
 *
 * Synced with the design system specs in /docs/specs/.
 */

// ============================================================================
// COLORS
// ============================================================================

export const colors = {
  // Forest — primary brand color, "literary" feel
  forest: {
    900: '#0E2A21',
    800: '#1B4332', // Primary brand color
    700: '#234D38',
    600: '#2D5A3F',
    200: '#B7CCB9',
    100: '#DAE6DC',
    50: '#EFF4F0',
  },

  // Ink — neutrals for text and chrome
  ink: {
    900: '#1A1A1A', // Primary text
    700: '#3D3A36',
    500: '#6B6862',
    400: '#8A8780',
    300: '#B5B2AB',
    200: '#D8D5CC',
    100: '#ECE9E0',
  },

  // Cream — warm backgrounds, paper-like
  cream: {
    50: '#FAF7F2', // Default app background — NOT pure white
    100: '#F5F1E8',
    200: '#ECE5D5',
  },

  // Amber — single accent color
  amber: {
    500: '#D4A574', // Bimodal word highlight, single illustration accent
    200: '#EFD9B5',
    50: '#FAF1E0',
  },

  // Semantic
  error: '#B5453A',
  errorBg: '#FBEAE7',
  success: '#2D7A4F',
  successBg: '#E8F4ED',
} as const;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

/**
 * Font family names match the per-weight identifiers exported by
 * `@expo-google-fonts/*`. React Native does NOT synthesize weights from a
 * single family — each weight must reference its own loaded family. The
 * `textStyles` presets below already pair the right family with the right
 * weight; raw `fonts.*` values point at the default (medium / regular).
 */
export const fonts = {
  display: 'Fraunces_500Medium',
  displayBold: 'Fraunces_600SemiBold',
  displayItalic: 'Fraunces_400Regular_Italic',
  ui: 'Geist_400Regular',
  uiMedium: 'Geist_500Medium',
  reading: 'Literata_400Regular',
  dyslexia: 'Lexend_400Regular',
} as const;

export const fontSizes = {
  // Display sizes for hero/title content (uses Fraunces)
  display: {
    xl: 56,  // Doc/marketing titles
    lg: 32,  // Section titles
    md: 22,  // Card titles
    sm: 18,  // Sub-titles
    xs: 16,  // Inline display text
  },
  // UI sizes for chrome (uses Geist)
  ui: {
    lg: 16,  // Large buttons
    md: 14,  // Default — buttons, inputs, list row labels
    sm: 13,  // Compact list rows
    xs: 12,  // Compact buttons, helper text
    xxs: 11, // Sub-labels, captions
    xxxs: 10, // Section labels (UPPERCASE)
  },
  // Reading sizes (uses Literata)
  reading: {
    lg: 18,  // Comfortable preset
    md: 16,  // Standard preset
    sm: 14,  // Smaller text
  },
} as const;

export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
} as const;

// ============================================================================
// SPACING
// ============================================================================

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
  8: 40,
  9: 48,
  10: 56,
  11: 64,
  12: 80,
} as const;

// ============================================================================
// RADII
// ============================================================================

export const radii = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  '2xl': 14,
  '3xl': 16,
  full: 9999,
} as const;

// ============================================================================
// COMPONENT TOKENS
// ============================================================================

/** Button system tokens (per bookflow_button_system.html) */
export const button = {
  height: {
    compact: 32,
    standard: 44,
    large: 52,
  },
  paddingX: {
    compact: 14,
    standard: 20,
    large: 28,
  },
  fontSize: {
    compact: 12,
    standard: 14,
    large: 16,
  },
  radius: {
    compact: 6,
    standard: 8,
    large: 10,
  },
  gap: 8, // gap between icon and label
  transitionMs: 120,
  pressScale: 0.98,
  spinner: {
    size: 16,
    strokeWidth: 1.5,
    durationMs: 700,
  },
} as const;

/** Input system tokens (per bookflow_input_system.html) */
export const input = {
  height: {
    compact: 32,
    standard: 44,
    large: 52,
  },
  paddingX: {
    compact: 10,
    standard: 12,
    large: 14,
  },
  fontSize: {
    compact: 12,
    standard: 14,
    large: 16,
  },
  radius: {
    compact: 6,
    standard: 8,
    large: 10,
  },
  iconSize: {
    compact: 14,
    standard: 18,
    large: 20,
  },
  focusRingWidth: 3, // px
} as const;

/** Bottom sheet tokens (per bookflow_bottom_sheet_system.html) */
export const bottomSheet = {
  radius: 16, // top corners only
  backdropOpacity: 0.4,
  handle: {
    width: 32,
    height: 4,
    topMargin: 8,
  },
  paddingX: 16,
  paddingY: 16,
  footerPaddingBottom: 18, // above iOS home indicator
  maxHeightPercent: 0.85,
  motion: {
    enterDurationMs: 320,
    exitDurationMs: 200,
    enterEasing: 'cubic-bezier(0, 0, 0.2, 1)',  // decelerate
    exitEasing: 'cubic-bezier(0.4, 0, 1, 1)',   // accelerate
  },
  drag: {
    dismissThreshold: 0.25,    // 25% of sheet height
    dismissVelocity: 600,       // pixels/second
  },
} as const;

/** List row tokens (per bookflow_list_row_system.html) */
export const listRow = {
  minHeight: {
    standard: 56,
    compact: 48,
  },
  paddingX: 14,
  gap: 12,
  fontSize: {
    label: { standard: 14, compact: 13 },
    sublabel: 11,
  },
  fontWeight: {
    label: { standard: '500', compact: '400' },
  },
  iconBgSize: { standard: 32, compact: 28 },
  iconSize: { standard: 18, compact: 16 },
  chevronSize: { standard: 16, compact: 14 },
  transitionMs: 100,
} as const;

/** Icon size scale (per bookflow_input_system.html, icon library section) */
export const iconSize = {
  xs: 14,   // Helper text, inline
  sm: 18,   // DEFAULT — buttons, inputs, most UI
  md: 20,   // Tab nav, large inputs
  lg: 24,   // Headers, empty states
} as const;

export const iconStrokeWidth = 1.5; // ALWAYS — never use Lucide's default 2

// ============================================================================
// SEMANTIC LAYER — preferred names for screens & app code
// ============================================================================
//
// The token groups above (colors.ink, fontSizes.ui, spacing[n]) are the raw
// scales used by canonical components. Screens should prefer the *semantic*
// names below (textColors.muted, space.lg, textStyles['body-md']) so intent
// is readable without knowing the underlying scale.

import type { TextStyle } from 'react-native';

/** Semantic text colors. Use these in screens, not raw ink/forest tokens. */
export const textColors = {
  primary: colors.ink[900],
  secondary: colors.ink[700],
  muted: colors.ink[500],
  subtle: colors.ink[400],
  disabled: colors.ink[300],
  inverse: colors.cream[50],
  accent: colors.forest[800],
  error: colors.error,
  success: colors.success,
} as const;

/** Semantic surface colors. */
export const bgColors = {
  canvas: colors.cream[50],
  surface: colors.cream[100],
  raised: colors.cream[200],
  accent: colors.forest[800],
  accentMuted: colors.forest[100],
  errorMuted: colors.errorBg,
  successMuted: colors.successBg,
  overlay: colors.ink[900],
} as const;

/** Semantic border colors. */
export const borderColors = {
  subtle: colors.ink[200],
  default: colors.ink[300],
  accent: colors.forest[800],
  error: colors.error,
} as const;

/**
 * Named spacing scale per design system spec.
 * Aliases the numeric `spacing[n]` scale; both coexist.
 */
export const space = {
  none: 0,
  xs: 4,    // tight gaps between related elements
  sm: 8,    // component-internal padding
  md: 12,   // standard component padding, list-item gaps
  lg: 16,   // section padding, card padding
  xl: 24,   // section separation
  '2xl': 32, // major layout breaks
  '3xl': 48, // hero spacing, screen-level breathing room
  '4xl': 64, // landing page / onboarding
} as const;

/**
 * Composed typography styles per /docs/specs/bookflow_design_system.md type scale.
 * Each preset bundles fontFamily + fontSize + lineHeight + weight (and tracking
 * for label variants). Apply via the `<Text variant>` component, never rebuild
 * the composition inline.
 */
export const textStyles = {
  'display-xl': { fontFamily: fonts.displayBold, fontSize: 48, lineHeight: 56, fontWeight: '600' },
  'display-lg': { fontFamily: fonts.display, fontSize: 36, lineHeight: 44, fontWeight: '500' },
  'display-md': { fontFamily: fonts.display, fontSize: 28, lineHeight: 36, fontWeight: '500' },
  'display-sm': { fontFamily: fonts.display, fontSize: 22, lineHeight: 30, fontWeight: '500' },

  'heading-lg': { fontFamily: fonts.uiMedium, fontSize: 20, lineHeight: 28, fontWeight: '500' },
  'heading-md': { fontFamily: fonts.uiMedium, fontSize: 16, lineHeight: 24, fontWeight: '500' },
  'heading-sm': { fontFamily: fonts.uiMedium, fontSize: 14, lineHeight: 20, fontWeight: '500' },

  'body-lg': { fontFamily: fonts.ui, fontSize: 16, lineHeight: 24, fontWeight: '400' },
  'body-md': { fontFamily: fonts.ui, fontSize: 14, lineHeight: 20, fontWeight: '400' },
  'body-sm': { fontFamily: fonts.ui, fontSize: 12, lineHeight: 18, fontWeight: '400' },
  'body-xs': { fontFamily: fonts.ui, fontSize: 11, lineHeight: 16, fontWeight: '400' },

  'label-md': {
    fontFamily: fonts.uiMedium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  'label-sm': {
    fontFamily: fonts.uiMedium,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
} as const satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof textStyles;
export type TextColor = keyof typeof textColors;
export type SpaceSize = keyof typeof space;

// ============================================================================
// MOTION
// ============================================================================

export const motion = {
  // Standard transitions
  fast: 100,
  normal: 120,
  medium: 160,
  slow: 200,
  // Easings
  easing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
    accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const;

// ============================================================================
// EXPORTS
// ============================================================================

export const tokens = {
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
  radii,
  button,
  input,
  bottomSheet,
  listRow,
  iconSize,
  iconStrokeWidth,
  motion,
  // Semantic layer — preferred for screens
  textColors,
  bgColors,
  borderColors,
  space,
  textStyles,
} as const;

export type Tokens = typeof tokens;
export default tokens;
