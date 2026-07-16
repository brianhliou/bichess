// Crossroads Chess board data shared between render surfaces: the live/diagram
// renderer in apps/web (crossroads-chess-render.ts) and the server-side OG
// card (apps/server/og-image.ts). One descriptor, one disc-glyph table, one
// piece palette — the surfaces differ only in how they draw pieces (the web
// uses <text> glyphs with the page's fonts; the OG card uses the baked Noto
// paths because resvg has no fonts).

import { GRID_INTERACTION_COLORS, type GridBoardDescriptor } from './grid-board.js';

// meerkat palette (matches crossroads-chess-diagram.ts)
export const CROSSROADS_PIECE_RED = '#b5322b';
export const CROSSROADS_INK_WHITE = '#28323c';
export const CROSSROADS_INK_RED = '#1a1a1a';
export const CROSSROADS_IVORY_STOPS: [string, string] = ['#fdf6e4', '#f3e6c4'];
export const CROSSROADS_RED_STOPS: [string, string] = ['#c1453b', '#a4291f'];

// The 6x8 river board, expressed as data for the shared core.
export const CROSSROADS_CHESS_DESCRIPTOR: GridBoardDescriptor = {
  files: 6,
  ranks: 8,
  cell: 50,
  strips: [{ afterRow: 4, height: 11, fill: '#5aa0d6', highlightFill: 'rgba(255,255,255,0.4)' }],
  palette: {
    lightCell: '#f0d9b5',
    darkCell: '#b58863',
    coord: 'rgba(60,45,30,0.55)',
    lastMove: 'rgba(255,205,80,0.45)',
    selected: GRID_INTERACTION_COLORS.selected,
    targetDot: GRID_INTERACTION_COLORS.targetDot,
    targetRing: GRID_INTERACTION_COLORS.targetRing,
    targetHover: GRID_INTERACTION_COLORS.targetHover,
    fog: 'rgba(22,18,14,0.66)',
  },
  svgClass: 'crossroads-live-svg',
};

// Xiangqi-side pieces draw as character discs; chess-side roles use PIECE_SVGS.
export const CROSSROADS_DISK_GLYPHS: Partial<Record<string, { white: string; red: string }>> = {
  chariot: { white: '車', red: '俥' },
  horse: { white: '馬', red: '傌' },
  cannon: { white: '砲', red: '炮' },
  soldier: { white: '卒', red: '兵' },
};
