// Board renderer for Flip Jungle (兽棋 / 翻翻棋) — the 4×4 flip animal chess board.
//
// Thin adapter over the shared descriptor-driven cell-board core
// (@mistboard/board-render renderGridBoardSvg), like jungle-render.ts. Symmetric
// hidden-identity: a face-down tile draws as a neutral "back" disc (no ink/identity);
// a revealed tile draws as an ink-coloured animal character disc.
//
// Self-contained (its own glyph table + concrete colours) so it doesn't couple to the
// vanilla jungle-render.ts whose piece art is being refined in a parallel session; a
// later pass can extract a shared animal-disc module both renderers import.

import {
  type GridBoardDescriptor,
  type GridCellRef,
  type GridGeometry,
  renderGridBoardSvg,
} from '@mistboard/board-render';
import {
  ALL_JUNGLE_FLIP_SQUARES,
  type JungleFlipColor,
  type JungleFlipPieceRole,
  type JungleFlipSquare,
  jungleFlipCoordOf,
} from '@mistboard/game';
import { TOKEN_PIECE_RATIO } from './board-metrics.js';
import {
  framedTokenSvg,
  jungleBoardAssetHref,
  jungleCoverImage,
  jungleFaceDownDiscSvg,
  jungleLastMoveFromSvg,
  jungleLastMoveRevealSvg,
  jungleLastMoveToSvg,
  jungleShadowFilterDef,
} from './jungle-art.js';

const FILES = 4;
const RANKS = 4;
const CELL = 64;
// Flip tokens back off the canonical ratio so they sit INSIDE the last-move
// ring (its inner clear is ~0.83·cell).
const FLIP_TOKEN_RATIO = TOKEN_PIECE_RATIO - 0.03;

const PALETTE = {
  // Solid (non-alternating) board: one warm tan for every cell.
  lightCell: '#e7ce96',
  darkCell: '#e7ce96',
  // Borderless: no frame band or board edge, matching the vanilla Jungle board.
  coord: 'rgba(60,45,30,0.55)',
  lastMove: 'rgba(255,205,80,0.5)',
  selected: 'rgba(31,111,91,0.32)',
  targetDot: 'rgba(31,111,91,0.72)',
  targetRing: 'rgba(31,111,91,0.48)',
  targetHover: 'rgba(31,111,91,0.30)',
  fog: 'rgba(22,18,14,0.66)',
} as const;

// Tile-separating grid lines, banqi-style (matches the vanilla Jungle board).
const GRID_STROKE = 'rgba(91,74,50,0.55)';

// Token + terrain art comes from the shared jungle-art.ts recipe (the blog-aligned
// dobutsu look), the same source the vanilla board and the markers use.

// A masked board entry (mirrors JungleFlipVisibleBoardEntry on the wire).
export type JungleFlipRenderEntry =
  | { faceDown: true }
  | { faceDown: false; color: JungleFlipColor; role: JungleFlipPieceRole };
export type JungleFlipRenderBoard = Partial<Record<JungleFlipSquare, JungleFlipRenderEntry>>;

const DESCRIPTOR: GridBoardDescriptor = {
  files: FILES,
  ranks: RANKS,
  cell: CELL,
  palette: PALETTE,
  pad: 0,
  // Full-bleed <image> terrain (like jungle) isn't clipped by the outer CSS
  // border-radius, so round the internal clip-path (~1.9% of the 256u board
  // width = the shared --board-corner-radius token) to clip the corner images.
  boardRadius: 5,
  svgClass: 'jungle-flip-live-svg',
};

// Board geometry, exported so cropped consumers (the variant marker) can compute a
// sub-region viewBox.
export const JUNGLE_FLIP_BOARD_VIEW = { cell: CELL, files: FILES, ranks: RANKS } as const;

export type JungleFlipRenderOptions = {
  lastMove?: { from: JungleFlipSquare; to: JungleFlipSquare } | null;
  selected?: JungleFlipSquare | null;
  targets?: readonly JungleFlipSquare[];
  // The square a revealed piece is being dragged from: its on-board token dims to a ghost.
  draggingFrom?: JungleFlipSquare | null;
  interactive?: boolean;
  idSuffix?: string;
  // Drop the per-token shadow filter (markers; avoids duplicate filter ids).
  shadow?: boolean;
};

function cellRef(square: JungleFlipSquare): GridCellRef {
  const { file, rank } = jungleFlipCoordOf(square);
  return { file, rank };
}

function defs(gid: string): string {
  return jungleShadowFilterDef(`${gid}-tok`);
}

// The board terrain (bushy 4×4 board) + grid + last-move ring, painted under the pieces.
// Mirrors the vanilla board: the bushy bg would hide the core's last-move layer, so the
// ring is drawn here over the terrain.
function terrain(
  geom: GridGeometry,
  lastMove: { from: JungleFlipSquare; to: JungleFlipSquare } | null,
): string {
  const c = geom.cell;
  const boardW = FILES * c;
  const boardH = RANKS * c;
  const parts: string[] = [
    jungleCoverImage(jungleBoardAssetHref('flip-board'), 0, 0, boardW, boardH),
  ];
  for (let i = 0; i <= FILES; i += 1) {
    const x = i * c;
    parts.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${boardH}" stroke="${GRID_STROKE}" stroke-width="1" stroke-linecap="round"/>`,
    );
  }
  for (let j = 0; j <= RANKS; j += 1) {
    const y = j * c;
    parts.push(
      `<line x1="0" y1="${y}" x2="${boardW}" y2="${y}" stroke="${GRID_STROKE}" stroke-width="1" stroke-linecap="round"/>`,
    );
  }
  if (lastMove) {
    // A board move gets xiangqi's two-part grammar: origin shadow disc plus a
    // destination halo. A flip is a self-move (`from === to`), so it gets only the
    // halo around the revealed piece. Drawing the origin shadow there as well would
    // falsely suggest that the piece travelled away and back.
    const from = jungleFlipCoordOf(lastMove.from);
    const fromTopLeft = geom.topLeft(from.file, from.rank);
    const to = jungleFlipCoordOf(lastMove.to);
    const toTopLeft = geom.topLeft(to.file, to.rank);
    if (lastMove.from !== lastMove.to) {
      parts.push(jungleLastMoveFromSvg(fromTopLeft.x, fromTopLeft.y, c));
    }
    parts.push(
      lastMove.from === lastMove.to
        ? jungleLastMoveRevealSvg(toTopLeft.x, toTopLeft.y, c)
        : jungleLastMoveToSvg(toTopLeft.x, toTopLeft.y, c),
    );
  }
  return parts.join('');
}

function pieces(
  board: JungleFlipRenderBoard,
  geom: GridGeometry,
  gid: string,
  shadow: boolean,
  draggingFrom: JungleFlipSquare | null,
): string {
  const parts: string[] = [];
  const s = geom.cell * FLIP_TOKEN_RATIO;
  const filterId = shadow ? `${gid}-tok` : undefined;
  for (const square of ALL_JUNGLE_FLIP_SQUARES) {
    const entry = board[square];
    if (!entry) continue;
    const { file, rank } = jungleFlipCoordOf(square);
    const { x, y } = geom.center(file, rank);
    if (entry.faceDown) {
      // Face-down back: a banqi-style neutral jade disc (no ink/identity — the deal is
      // hidden from both sides), small enough to sit inside the last-move ring.
      parts.push(jungleFaceDownDiscSvg(x, y, geom.cell, filterId));
      continue;
    }
    // Revealed: the shared framed dobutsu token (matches the vanilla board).
    const token = framedTokenSvg({
      cx: x,
      cy: y,
      size: s,
      ink: entry.color,
      role: entry.role,
      filterId,
    });
    // While this piece is being dragged, dim its on-board token so only the ghost reads.
    parts.push(square === draggingFrom ? `<g class="jungle-drag-source">${token}</g>` : token);
  }
  return parts.join('');
}

// The floating ghost piece shown while dragging a revealed animal (a framed token in a
// one-cell SVG box), appended to <body> by installBoardDrag.
export function jungleFlipPieceGhostSvg(entry: {
  color: JungleFlipColor;
  role: JungleFlipPieceRole;
}): string {
  const inner = framedTokenSvg({
    cx: CELL / 2,
    cy: CELL / 2,
    size: CELL * FLIP_TOKEN_RATIO,
    ink: entry.color,
    role: entry.role,
  });
  return `<svg viewBox="0 0 ${CELL} ${CELL}" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">${inner}</svg>`;
}

export function renderJungleFlipBoardSvg(
  board: JungleFlipRenderBoard,
  options: JungleFlipRenderOptions = {},
): string {
  const gid = `jungleflip${options.idSuffix ?? ''}`;
  const shadow = options.shadow ?? true;
  return renderGridBoardSvg(DESCRIPTOR, {
    id: gid,
    flip: false, // the deal has no sides — a fixed orientation is least confusing
    extraDefs: shadow ? defs(gid) : '',
    coords: false,
    renderPieces: (geom) =>
      terrain(geom, options.lastMove ?? null) +
      pieces(board, geom, gid, shadow, options.draggingFrom ?? null),
    // Last-move is drawn inside terrain (over the bushy board); the core's own last-move
    // layer sits under renderPieces and would be hidden by the board image.
    lastMove: null,
    selected: options.selected ? cellRef(options.selected) : null,
    targets: (options.targets ?? []).map((sq) => {
      const ref = cellRef(sq);
      return { ...ref, occupied: board[sq] !== undefined };
    }),
    squareName: (file, rank) => `${'abcd'[file]}${rank}`,
    interactive: options.interactive ?? false,
  });
}
