// Visual tokens shared between the static SVG renderer and the interactive
// chessground wrapper. The chessground side reads colors via its CSS files
// (chessground.brown.css); mirror any change to those CSS values here so the
// two render paths stay in sync.

export const LIGHT_SQUARE = '#f0d9b5';
export const DARK_SQUARE = '#b58863';

// Fog veil tokens — matched to the live-game CSS variables
// (--board-fog-* in apps/web/src/styles.css). Fog is drawn as a translucent
// overlay so the underlying light/dark square color still shows through.
export const FOG_LIGHT_FILL = 'rgba(6, 10, 8, 0.66)';
export const FOG_DARK_FILL = 'rgba(6, 10, 8, 0.72)';
export const FOG_SOLID_LIGHT_FILL = '#17261a';
export const FOG_SOLID_DARK_FILL = FOG_SOLID_LIGHT_FILL;
export const FOG_LINE = 'rgba(0, 0, 0, 0.36)';
export const FOG_LINE_SOFT = 'rgba(255, 255, 255, 0.06)';
export const FOG_SHADOW = '#3a523f';
export const FOG_TILE_SIZE = 14;
// Legacy flat-fog values, kept for any caller that hasn't migrated.
export const FOG_FILL = '#1a1a1a';
export const FOG_OPACITY = 0.78;

// ── Palettes ──────────────────────────────────────────────────────────────
// A palette bundles every color the static renderer needs so a single board
// can be drawn in a theme other than the module-level default. Mirror values
// from the matching `[data-board-theme="…"]` block in apps/web/src/styles.css.
export type BoardPalette = {
  light: string;
  dark: string;
  fogLightFill: string;
  fogDarkFill: string;
  fogSolidLightFill: string;
  fogSolidDarkFill: string;
  fogLine: string;
  fogLineSoft: string;
  fogShadow: string;
};

// Default (brown) — matches the module constants above; this is what every
// caller gets when no palette is passed.
export const BROWN_PALETTE: BoardPalette = {
  light: LIGHT_SQUARE,
  dark: DARK_SQUARE,
  fogLightFill: FOG_LIGHT_FILL,
  fogDarkFill: FOG_DARK_FILL,
  fogSolidLightFill: FOG_SOLID_LIGHT_FILL,
  fogSolidDarkFill: FOG_SOLID_DARK_FILL,
  fogLine: FOG_LINE,
  fogLineSoft: FOG_LINE_SOFT,
  fogShadow: FOG_SHADOW,
};

// Tournament green — the product's *default* in-app theme
// (apps/web/src/theme.ts), mirrored from the green block in styles.css.
export const GREEN_PALETTE: BoardPalette = {
  light: '#eeeed2',
  dark: '#769656',
  fogLightFill: FOG_LIGHT_FILL,
  fogDarkFill: FOG_DARK_FILL,
  fogSolidLightFill: FOG_SOLID_LIGHT_FILL,
  fogSolidDarkFill: FOG_SOLID_DARK_FILL,
  fogLine: 'rgba(8, 24, 12, 0.36)',
  fogLineSoft: 'rgba(255, 255, 255, 0.08)',
  fogShadow: FOG_SHADOW,
};

// Fog rendering style. 'solid' is the default opaque block style; 'veil' is a
// translucent overlay that preserves board colors.
export type FogStyle = 'striped' | 'solid' | 'veil';
