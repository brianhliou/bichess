// Live, fog-aware board renderer for Crossroads Chess (中西象棋).
//
// A thin variant adapter over the shared descriptor-driven cell-board core
// (@mistboard/board-render renderGridBoardSvg). The core owns geometry
// (orientation flip + river-strip offset), furniture (grid, river, coords,
// frame, clip), and the generic interaction layers (last-move, selection,
// targets, fog, hit). This file supplies only what is Crossroads-Chess-specific: the
// 6x8 + river descriptor, the disk/recolour piece glyphs, and the red-piece filter.
//
// Driven by the engine's CrossroadsChessPlayerView (packages/game/variants-crossroads-chess),
// orientation-aware (Red sees the board flipped) and fog-aware (hidden squares
// fogged; shrouded enemies render as colour-only silhouettes).

import {
  CROSSROADS_CHESS_DESCRIPTOR,
  CROSSROADS_PIECE_RED,
  type GridCellRef,
  type GridGeometry,
  type GridPalette,
  PIECE_SVGS,
  renderGridBoardSvg,
} from '@mistboard/board-render';
import type {
  CrossroadsChessColor,
  CrossroadsChessPieceRole,
  CrossroadsChessPlayerView,
  CrossroadsChessSquare,
  XiangqiColor,
  XiangqiPieceRole,
} from '@mistboard/game';
import { type PieceSet, readStoredPieceSet } from './theme.js';
import { readStoredXiangqiPieceSet } from './xiangqi-appearance-storage.js';
import { renderXiangqiPieceGlyphed, type XiangqiPieceSet } from './xiangqi-piece-sets.js';

const FILES = 6;
const RANKS = 8;
const CELL = 50;
const CROSSROADS_BOARD_WIDTH = FILES * CELL;
const CROSSROADS_BOARD_HEIGHT =
  RANKS * CELL +
  (CROSSROADS_CHESS_DESCRIPTOR.strips ?? []).reduce((sum, strip) => sum + strip.height, 0);

const RED = CROSSROADS_PIECE_RED;

const CHESS_ROLES = new Set<CrossroadsChessPieceRole>([
  'king',
  'queen',
  'bishop',
  'knight',
  'pawn',
]);
const XIANGQI_ROLES = new Set<CrossroadsChessPieceRole>(['chariot', 'horse', 'cannon', 'soldier']);
const CHESS_PIECE_CODES: Partial<Record<CrossroadsChessPieceRole, string>> = {
  bishop: 'B',
  king: 'K',
  knight: 'N',
  pawn: 'P',
  queen: 'Q',
};

const CROSSROADS_APP_PALETTE: GridPalette = {
  ...CROSSROADS_CHESS_DESCRIPTOR.palette,
  lightCell: 'var(--board-light)',
  darkCell: 'var(--board-dark)',
  // Borderless to match the fog aesthetic: the checker cells plus the river
  // strip carry the fusion identity, so the frame goes transparent and the
  // cells run edge-to-edge (frame paddings/radii zeroed in the descriptor).
  coord: 'var(--crossroads-coord)',
  lastMove: 'var(--board-last-move)',
  fog: 'var(--board-fog-light-fill)',
};
const CROSSROADS_APP_DESCRIPTOR = {
  ...CROSSROADS_CHESS_DESCRIPTOR,
  pad: 0,
  boardRadius: 0,
  strips: CROSSROADS_CHESS_DESCRIPTOR.strips?.map((strip) => ({
    ...strip,
    fill: 'var(--crossroads-river)',
    highlightFill: 'var(--crossroads-river-highlight)',
  })),
  palette: CROSSROADS_APP_PALETTE,
};

export type CrossroadsChessRenderOptions = {
  // Whose side is at the bottom. Defaults to the view's own perspective.
  perspective?: CrossroadsChessColor;
  // Draw the fog overlay over non-visible squares. Pass false for the
  // perfect-information (open) view. Defaults to true.
  showFog?: boolean;
  lastMove?: { from: CrossroadsChessSquare; to: CrossroadsChessSquare } | null;
  // The currently selected square (highlighted).
  selected?: CrossroadsChessSquare | null;
  // Legal destination squares for the selection (dots / capture rings).
  targets?: readonly CrossroadsChessSquare[];
  // Squares to emphasise under the pieces (study / diagram callouts).
  highlights?: readonly CrossroadsChessSquare[];
  // Annotation arrows drawn over the board (study / diagram callouts).
  arrows?: readonly { from: CrossroadsChessSquare; to: CrossroadsChessSquare }[];
  // Add a transparent hit layer of <rect data-square="..."> for click handling.
  interactive?: boolean;
  // Draw board coordinate labels. Defaults to true for live play; review
  // triptychs can disable them to keep the three-board layout quiet.
  coords?: boolean;
  // Crossroads is a hybrid: orthodox chess roles use the chess piece set;
  // chariot/horse/cannon/soldier use the xiangqi piece set.
  chessPieceSet?: PieceSet;
  xiangqiPieceSet?: XiangqiPieceSet;
  // While dragging, omit the source piece so only the floating ghost shows.
  draggingFrom?: CrossroadsChessSquare | null;
};

let boardCounter = 0;

export function renderCrossroadsChessBoardSvg(
  view: CrossroadsChessPlayerView,
  options: CrossroadsChessRenderOptions = {},
): string {
  const perspective = options.perspective ?? view.perspective;
  const showFog = options.showFog ?? true;
  const chessPieceSet = options.chessPieceSet ?? readStoredPieceSet();
  const xiangqiPieceSet = options.xiangqiPieceSet ?? readStoredXiangqiPieceSet();
  boardCounter += 1;
  const id = `crossroads-live-${boardCounter}`;

  const visible = new Set<CrossroadsChessSquare>(view.visibleSquares);
  const occupied = new Set<CrossroadsChessSquare>(
    Object.keys(view.board) as CrossroadsChessSquare[],
  );
  const lastMove = options.lastMove ?? view.lastMove ?? null;
  const fogDescriptor = showFog
    ? {
        ...CROSSROADS_APP_DESCRIPTOR,
        palette: {
          ...CROSSROADS_APP_DESCRIPTOR.palette,
          fog: `url(#${id}-fog)`,
        },
      }
    : CROSSROADS_APP_DESCRIPTOR;

  return renderGridBoardSvg(fogDescriptor, {
    id,
    flip: perspective === 'red',
    extraDefs: `${crossroadsChessDefs(id)}${showFog ? crossroadsFogPatternDefs(id, perspective === 'red') : ''}`,
    renderPieces: (geom) =>
      pieceLayer(view, geom, id, {
        chessPieceSet,
        xiangqiPieceSet,
        draggingFrom: options.draggingFrom ?? null,
      }),
    lastMove: lastMove ? [coordOf(lastMove.from), coordOf(lastMove.to)] : null,
    selected: options.selected ? coordOf(options.selected) : null,
    highlights: (options.highlights ?? []).map(coordOf),
    targets: (options.targets ?? []).map((sq) => ({ ...coordOf(sq), occupied: occupied.has(sq) })),
    arrows: (options.arrows ?? []).map((a) => ({ from: coordOf(a.from), to: coordOf(a.to) })),
    fogHidden: showFog ? hiddenSquares(visible) : null,
    interactive: options.interactive ?? false,
    coords: options.coords ?? true,
    squareName: (file, rank) => squareAt(file, rank),
  });
}

export const CROSSROADS_CHESS_BOARD_PX = CELL;

export function readCrossroadsChessAppearance(): Pick<
  CrossroadsChessRenderOptions,
  'chessPieceSet' | 'xiangqiPieceSet'
> {
  return {
    chessPieceSet: readStoredPieceSet(),
    xiangqiPieceSet: readStoredXiangqiPieceSet(),
  };
}

// ── Coordinates ─────────────────────────────────────────────────────────────

function coordOf(square: CrossroadsChessSquare): GridCellRef {
  return { file: square.charCodeAt(0) - 'a'.charCodeAt(0), rank: Number(square.slice(1)) };
}

function squareAt(file: number, rank: number): CrossroadsChessSquare {
  return `${String.fromCharCode('a'.charCodeAt(0) + file)}${rank}` as CrossroadsChessSquare;
}

// Hidden squares, in the core's grid-iteration order (file outer, rank inner).
function hiddenSquares(visible: Set<CrossroadsChessSquare>): GridCellRef[] {
  const refs: GridCellRef[] = [];
  for (let file = 0; file < FILES; file += 1) {
    for (let rank = 1; rank <= RANKS; rank += 1) {
      if (!visible.has(squareAt(file, rank))) refs.push({ file, rank });
    }
  }
  return refs;
}

// ── Pieces (the Crossroads-Chess-specific layer) ──────────────────────────────────

function pieceLayer(
  view: CrossroadsChessPlayerView,
  geom: GridGeometry,
  id: string,
  appearance: {
    chessPieceSet: PieceSet;
    xiangqiPieceSet: XiangqiPieceSet;
    draggingFrom: CrossroadsChessSquare | null;
  },
): string {
  const parts: string[] = [];
  for (const [square, entry] of Object.entries(view.board)) {
    if (!entry) continue;
    // While dragging, omit the source piece so only the floating ghost shows.
    if (square === appearance.draggingFrom) continue;
    const { file, rank } = coordOf(square as CrossroadsChessSquare);
    const { x, y } = geom.topLeft(file, rank);
    if (entry.shrouded) {
      parts.push(silhouette(entry.color, x, y, appearance.xiangqiPieceSet));
      continue;
    }
    parts.push(fusionPiece(entry.piece, x, y, id, appearance));
  }
  return parts.join('');
}

// One own visible fusion piece at a cell's top-left: a chess glyph for orthodox
// roles, a xiangqi disk for chariot/horse/cannon/soldier. Shared by the board
// layer and the standalone drag ghost.
function fusionPiece(
  piece: { role: CrossroadsChessPieceRole; color: CrossroadsChessColor },
  x: number,
  y: number,
  id: string,
  appearance: { chessPieceSet: PieceSet; xiangqiPieceSet: XiangqiPieceSet },
): string {
  if (CHESS_ROLES.has(piece.role)) {
    const size = CELL * 0.86;
    const inset = (CELL - size) / 2;
    return chessPiece(
      piece.role,
      piece.color,
      x + inset,
      y + inset,
      size,
      appearance.chessPieceSet,
      id,
    );
  }
  if (XIANGQI_ROLES.has(piece.role)) {
    const size = CELL * 0.82;
    const inset = (CELL - size) / 2;
    return diskPiece(
      piece.role,
      piece.color,
      x + inset,
      y + inset,
      size,
      appearance.xiangqiPieceSet,
    );
  }
  return '';
}

// The standalone glyph for the floating drag ghost (board-drag.ts mounts it in a
// CELL-sized <div>). Only own visible pieces are draggable, so the piece is
// always known. Self-contained: it carries its own red-piece filter def so the
// chess recolour works off-board.
export function crossroadsChessPieceGhostSvg(
  piece: { role: CrossroadsChessPieceRole; color: CrossroadsChessColor },
  appearance: Pick<CrossroadsChessRenderOptions, 'chessPieceSet' | 'xiangqiPieceSet'> = {},
): string {
  boardCounter += 1;
  const id = `crossroads-ghost-${boardCounter}`;
  const inner = fusionPiece(piece, 0, 0, id, {
    chessPieceSet: appearance.chessPieceSet ?? readStoredPieceSet(),
    xiangqiPieceSet: appearance.xiangqiPieceSet ?? readStoredXiangqiPieceSet(),
  });
  return `<svg width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${crossroadsChessDefs(id)}</defs>${inner}</svg>`;
}

function crossroadsChessDefs(id: string): string {
  return [
    `<filter id="${id}-red-piece" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.710 0 0 0 0 0.196 0 0 0 0 0.169 0 0 0 1 0"/></filter>`,
  ].join('');
}

function crossroadsFogPatternDefs(id: string, flip: boolean): string {
  const tiles: string[] = [];
  for (let file = 0; file < FILES; file += 1) {
    for (let rank = 1; rank <= RANKS; rank += 1) {
      const { col, row } = visualCell(file, rank, flip);
      const x = col * CELL;
      const y = row * CELL + stripOffsetForRow(row);
      const colorClass = isLightSquare(file, rank)
        ? 'crossroads-fog-tile--light'
        : 'crossroads-fog-tile--dark';
      const visualClass = `fog-tile-f${col}r${row}`;
      tiles.push(
        [
          `<g class="crossroads-fog-tile ${colorClass} ${visualClass}">`,
          `<rect class="crossroads-fog-fill" x="${x}" y="${y}" width="${CELL}" height="${CELL}"/>`,
          `<image class="crossroads-fog-tex crossroads-fog-tex-drift" href="/fog/fog.webp" x="${x}" y="${y}" width="${CELL}" height="${CELL}" preserveAspectRatio="xMidYMid slice"/>`,
          `<image class="crossroads-fog-tex crossroads-fog-tex-mist" href="/fog/mistveil/f${col}r${row}.webp" x="${x}" y="${y}" width="${CELL}" height="${CELL}" preserveAspectRatio="xMidYMid slice"/>`,
          `<rect class="crossroads-fog-shadow" x="${x + 0.5}" y="${y + 0.5}" width="${CELL - 1}" height="${CELL - 1}" fill="none"/>`,
          `</g>`,
        ].join(''),
      );
    }
  }
  return `<pattern id="${id}-fog" patternUnits="userSpaceOnUse" width="${CROSSROADS_BOARD_WIDTH}" height="${CROSSROADS_BOARD_HEIGHT}">${tiles.join('')}</pattern>`;
}

function visualCell(file: number, rank: number, flip: boolean): { col: number; row: number } {
  return {
    col: flip ? FILES - 1 - file : file,
    row: flip ? rank - 1 : RANKS - rank,
  };
}

function stripOffsetForRow(row: number): number {
  return (CROSSROADS_CHESS_DESCRIPTOR.strips ?? []).reduce(
    (sum, strip) => (row >= strip.afterRow ? sum + strip.height : sum),
    0,
  );
}

function isLightSquare(file: number, rank: number): boolean {
  const even = (file + rank) % 2 === 0;
  const darkWhenEven = CROSSROADS_CHESS_DESCRIPTOR.darkWhenEven ?? true;
  return darkWhenEven ? !even : even;
}

function chessPiece(
  role: CrossroadsChessPieceRole,
  color: CrossroadsChessColor,
  x: number,
  y: number,
  size: number,
  pieceSet: PieceSet,
  id: string,
): string {
  if (pieceSet !== 'cburnett') {
    const code = CHESS_PIECE_CODES[role];
    if (!code) return '';
    const href = `/pieces/${pieceSet}/w${code}.svg`;
    const filter = color === 'red' ? ` filter="url(#${id}-red-piece)"` : '';
    return `<image href="${href}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"${filter}/>`;
  }
  let raw = PIECE_SVGS[`white:${role}`];
  if (!raw) return '';
  if (color === 'red') {
    raw = raw
      .replace(/#fff(?![0-9a-fA-F])/g, RED)
      .replace(/#ffffff\b/gi, RED)
      .replace(/#fbfbf9/gi, RED);
  }
  return raw.replace(
    /^<svg[^>]*>/,
    `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">`,
  );
}

function diskPiece(
  role: CrossroadsChessPieceRole,
  color: CrossroadsChessColor,
  x: number,
  y: number,
  size: number,
  pieceSet: XiangqiPieceSet,
): string {
  return renderXiangqiPieceGlyphed(
    { color: xiangqiColorForCrossroads(color), role: role as XiangqiPieceRole },
    pieceSet,
    {
      ariaLabel: `${color} ${role}`,
      className: 'crossroads-xq-piece',
      x,
      y,
      size,
    },
  );
}

// A shrouded enemy: colour is known under fog (field of fire), identity is not.
function silhouette(
  color: CrossroadsChessColor,
  x: number,
  y: number,
  pieceSet: XiangqiPieceSet,
): string {
  const size = CELL * 0.7;
  const inset = (CELL - size) / 2;
  return renderXiangqiPieceGlyphed(
    { color: xiangqiColorForCrossroads(color), role: 'soldier' },
    pieceSet,
    {
      ariaLabel: `${color} hidden piece`,
      className: 'crossroads-xq-piece crossroads-xq-piece--shrouded',
      shrouded: true,
      x: x + inset,
      y: y + inset,
      size,
    },
  );
}

function xiangqiColorForCrossroads(color: CrossroadsChessColor): XiangqiColor {
  return color === 'red' ? 'red' : 'black';
}
