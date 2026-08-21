// Board renderer for Jungle / Dou Shou Qi (斗兽棋).
//
// A thin variant adapter over the shared descriptor-driven cell-board core
// (@mistboard/board-render renderGridBoardSvg). The core owns geometry
// (orientation flip), furniture (grid, coords, frame, clip) and the generic
// interaction layers (last-move, selection, targets, hit). This file supplies
// what is Jungle-specific: the near-solid 7×9 descriptor, the two river lakes +
// dens + traps drawn as a decoration layer, and the eight animal pieces as
// character tokens.
//
// Jungle's water is NOT a full-width strip (it is two 2×3 lakes with land lanes
// between), so each lake is drawn as a single rounded rectangle (not per-cell, so
// no internal grid lines) inside the renderPieces callback, along with the dens
// and traps. Concrete colours + namespaced <defs> (gradients / drop-shadow) so the
// SAME function renders both in-browser and standalone (OG cards, static previews
// via rsvg/resvg).

import {
  createGridGeometry,
  type GridBoardDescriptor,
  type GridCellRef,
  type GridGeometry,
  renderGridBoardSvg,
} from '@mistboard/board-render';
import {
  ALL_JUNGLE_SQUARES,
  JUNGLE_DENS,
  type JungleBoard,
  type JungleColor,
  type JunglePieceRole,
  type JungleSquare,
  jungleCoordOf,
  jungleTrapOwner,
} from '@mistboard/game';
import { glideSvgPiece, pieceAnimationDurationMs } from './board-anim.js';
import { TOKEN_PIECE_RATIO } from './board-metrics.js';
import { currentJungleBoardSkin, currentJunglePieceSkin } from './jungle-appearance-storage.js';
import {
  framedTokenSvg,
  jungleBoardAssetHref,
  jungleCoverImage,
  jungleLastMoveFromSvg,
  jungleLastMoveToSvg,
  jungleShadowFilterDef,
} from './jungle-art.js';
import {
  characterTokenSvg,
  JUNGLE_BARE_TERRAIN,
  type JungleBoardSkin,
  type JunglePieceSkin,
  jungleBareDenSvg,
  jungleBareTrapSvg,
} from './jungle-skins.js';
import { type SvgBoardArrowStyle, svgBoardArrow } from './svg-board-arrow.js';
import { type SvgBoardMarkerStyle, svgBoardCircleMarker } from './svg-board-marker.js';

const FILES = 7;
const RANKS = 9;
const CELL = 48;

// Warm-tan board, near-solid (the two shades give a faint texture, not a chess
// checker). Water/den/trap furniture carries the Jungle identity.
const PALETTE = {
  // Solid (non-alternating) board: one warm tan for every cell.
  lightCell: '#e7ce96',
  darkCell: '#e7ce96',
  // Borderless: no frame band or board edge (the rivers/dens/traps carry the
  // Jungle identity). The water/den/trap furniture provides all the contrast.
  coord: 'rgba(60,45,30,0.55)',
  lastMove: 'rgba(255,205,80,0.5)',
  selected: 'rgba(31,111,91,0.32)',
  targetDot: 'rgba(31,111,91,0.72)',
  targetRing: 'rgba(31,111,91,0.48)',
  targetHover: 'rgba(31,111,91,0.30)',
  fog: 'rgba(22,18,14,0.66)',
} as const;

// Tile-separating grid lines, banqi-style (matches live-banqi-render's grid ink).
const GRID_STROKE = 'rgba(91,74,50,0.55)';

// Token + terrain art comes from the shared jungle-art.ts recipe (the blog-aligned
// dobutsu look) so this board, the flip board, and the markers never drift apart.

// The two lakes, as [file, file] × [rank…] blocks (0-based files: b=1,c=2,e=4,f=5).
const LAKES: ReadonlyArray<{ files: readonly number[]; ranks: readonly number[] }> = [
  { files: [1, 2], ranks: [4, 5, 6] },
  { files: [4, 5], ranks: [4, 5, 6] },
];

const DESCRIPTOR: GridBoardDescriptor = {
  files: FILES,
  ranks: RANKS,
  cell: CELL,
  palette: PALETTE,
  pad: 0,
  // Jungle paints terrain as full-bleed SVG <image> layers, which the outer
  // [data-board="grid"] CSS border-radius/overflow:hidden does NOT clip. Round
  // the internal clip-path instead (~1.9% of the 336u board width = the shared
  // --board-corner-radius token) so the corner images are clipped too.
  boardRadius: 6,
  svgClass: 'jungle-live-svg',
};

// Board geometry, exported so cropped consumers (the variant marker) can compute a
// sub-region viewBox without re-deriving the cell size.
export const JUNGLE_BOARD_VIEW = { cell: CELL, files: FILES, ranks: RANKS } as const;

export type JungleRenderOptions = {
  arrows?: readonly JungleBoardArrow[];
  markers?: readonly JungleBoardMarker[];
  // Black sees the board flipped (its den at the bottom).
  perspective?: JungleColor;
  lastMove?: { from: JungleSquare; to: JungleSquare } | null;
  selected?: JungleSquare | null;
  targets?: readonly JungleSquare[];
  // The square a piece is being dragged from: its on-board token dims so only the ghost reads.
  draggingFrom?: JungleSquare | null;
  interactive?: boolean;
  idSuffix?: string;
  // Drop the per-token shadow filter (markers don't need it, and it avoids duplicate
  // filter ids when several cropped boards render on one page).
  shadow?: boolean;
  // Pin the look instead of resolving it — for surfaces that must render
  // deterministically (variant markers, rules diagrams, OG cards).
  boardSkin?: JungleBoardSkin;
  pieceSkin?: JunglePieceSkin;
};

export interface JungleBoardArrow extends SvgBoardArrowStyle {
  from: JungleSquare;
  to: JungleSquare;
}

export interface JungleBoardMarker extends SvgBoardMarkerStyle {
  square: JungleSquare;
  kind: 'circle';
}

function cellRef(square: JungleSquare): GridCellRef {
  const { file, rank } = jungleCoordOf(square);
  return { file, rank };
}

function defs(gid: string): string {
  return jungleShadowFilterDef(`${gid}-shadow`);
}

// The terrain layers (grass land, water lakes, dobutsu den + trap tiles) + the grid,
// painted under the pieces. Mirrors the blog's terrainSvg: grass → grid → water/den/trap
// images, then the last-move ring on top of the terrain (the core's last-move layer sits
// UNDER renderPieces, so the grass would otherwise hide it).
function furniture(
  geom: GridGeometry,
  lastMove: { from: JungleSquare; to: JungleSquare } | null,
  boardSkin: JungleBoardSkin,
): string {
  const parts: string[] = [];
  const c = geom.cell;
  const boardW = FILES * c;
  const boardH = RANKS * c;
  const bare = boardSkin === 'bare';

  // Land under everything. Both skins paint an OPAQUE base: the core stack draws
  // its last-move and selection fills BEFORE renderPieces, so a transparent land
  // would let those show through on the plain skin only (each board draws its own
  // last-move marks below, over the terrain, precisely because of this order).
  parts.push(
    bare
      ? `<rect x="0" y="0" width="${boardW}" height="${boardH}" fill="${PALETTE.lightCell}"/>`
      : jungleCoverImage(jungleBoardAssetHref('grass'), 0, 0, boardW, boardH),
  );

  // Each lake as ONE water layer over its 6-cell bounding box (flip-safe).
  for (const lake of LAKES) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const f of lake.files) {
      for (const r of lake.ranks) {
        const { x, y } = geom.topLeft(f, r);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + c);
        maxY = Math.max(maxY, y + c);
      }
    }
    parts.push(
      bare
        ? `<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="${JUNGLE_BARE_TERRAIN.water}"/>`
        : jungleCoverImage(jungleBoardAssetHref('water'), minX, minY, maxX - minX, maxY - minY),
    );
  }

  // Den + trap tiles, one per cell: the painted tile, or the bare board's vector
  // mark (same silhouette, no baked-in grass texture and no character to read).
  for (const square of ALL_JUNGLE_SQUARES) {
    const { file, rank } = jungleCoordOf(square);
    const { x, y } = geom.topLeft(file, rank);
    const isDen = square === JUNGLE_DENS.red || square === JUNGLE_DENS.black;
    if (!isDen && !jungleTrapOwner(square)) continue;
    if (bare) {
      parts.push(isDen ? jungleBareDenSvg(x, y, c) : jungleBareTrapSvg(x, y, c));
    } else {
      parts.push(jungleCoverImage(jungleBoardAssetHref(isDen ? 'den' : 'trap'), x, y, c, c));
    }
  }

  // Tile-separating grid on interior cell boundaries (banqi-style), drawn OVER all
  // the terrain (grass, water, den, trap) so every tile — including the river
  // lakes — reads as a discrete cell. The playable background itself defines the
  // board edge, so do not add perimeter lines that get visibly clipped at the
  // rounded corners.
  for (let i = 1; i < FILES; i += 1) {
    const x = i * c;
    parts.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${boardH}" stroke="${GRID_STROKE}" stroke-width="1" stroke-linecap="round"/>`,
    );
  }
  for (let j = 1; j < RANKS; j += 1) {
    const y = j * c;
    parts.push(
      `<line x1="0" y1="${y}" x2="${boardW}" y2="${y}" stroke="${GRID_STROKE}" stroke-width="1" stroke-linecap="round"/>`,
    );
  }

  // Last-move marks over the terrain (shared JUNGLE_LAST_MOVE spec, same circular
  // grammar as the xiangqi boards): a darker shadow disc at the origin and a thin
  // gold halo (with a slim dark under-edge for busy tiles) at the destination.
  if (lastMove) {
    const from = jungleCoordOf(lastMove.from);
    const fromTopLeft = geom.topLeft(from.file, from.rank);
    parts.push(jungleLastMoveFromSvg(fromTopLeft.x, fromTopLeft.y, c));
    const to = jungleCoordOf(lastMove.to);
    const toTopLeft = geom.topLeft(to.file, to.rank);
    parts.push(jungleLastMoveToSvg(toTopLeft.x, toTopLeft.y, c));
  }
  return parts.join('');
}

// Each piece: the shared framed dobutsu token (cream disc + cutout + colour ring + shadow).
// Sized to sit INSIDE the last-move ring (its inner clear is ~0.83·cell).
function pieces(
  board: JungleBoard,
  geom: GridGeometry,
  gid: string,
  shadow: boolean,
  draggingFrom: JungleSquare | null,
  pieceSkin: JunglePieceSkin,
): string {
  const parts: string[] = [];
  const s = geom.cell * TOKEN_PIECE_RATIO;
  const tokenSvg = pieceSkin === 'characters' ? characterTokenSvg : framedTokenSvg;
  for (const square of ALL_JUNGLE_SQUARES) {
    const piece = board[square];
    if (!piece) continue;
    const { file, rank } = jungleCoordOf(square);
    const { x, y } = geom.center(file, rank);
    const token = tokenSvg({
      cx: x,
      cy: y,
      size: s,
      ink: piece.color,
      role: piece.role,
      filterId: shadow ? `${gid}-shadow` : undefined,
    });
    // While this piece is being dragged, dim its on-board token so only the ghost
    // reads. The keyed outer slot lets a post-render glide find the token
    // (animateJungleBoardMove); the drag-source dimmer stays an inner wrapper.
    const slotBody = square === draggingFrom ? `<g class="jungle-drag-source">${token}</g>` : token;
    parts.push(`<g class="jgl-piece-slot" data-piece-square="${square}">${slotBody}</g>`);
  }
  return parts.join('');
}

/**
 * Glide the piece that settled on `move.to` from its origin (or with `reverse`
 * the piece back on `move.from`). Call AFTER the innerHTML swap. Deltas come
 * from the same grid geometry the renderer uses (flip-aware). No-op at duration
 * 0 or when the slot is missing. Move payloads only, never board diffs.
 */
export function animateJungleBoardMove(
  host: HTMLElement,
  move: { from: JungleSquare; to: JungleSquare },
  perspective: JungleColor,
  opts: { reverse?: boolean } = {},
): void {
  const duration = pieceAnimationDurationMs();
  if (duration <= 0) return;
  const settleSquare = opts.reverse ? move.from : move.to;
  const originSquare = opts.reverse ? move.to : move.from;
  const slot = host.querySelector(`[data-piece-square="${settleSquare}"]`);
  if (!slot) return;
  const geom = createGridGeometry(DESCRIPTOR, perspective === 'black');
  const origin = jungleCoordOf(originSquare);
  const settle = jungleCoordOf(settleSquare);
  const from = geom.center(origin.file, origin.rank);
  const to = geom.center(settle.file, settle.rank);
  glideSvgPiece(slot, from.x - to.x, from.y - to.y, duration);
}

// The floating ghost piece shown while dragging (a framed token in a one-cell SVG box),
// appended to <body> by installBoardDrag.
export function junglePieceGhostSvg(entry: { color: JungleColor; role: JunglePieceRole }): string {
  const tokenSvg = currentJunglePieceSkin() === 'characters' ? characterTokenSvg : framedTokenSvg;
  const inner = tokenSvg({
    cx: CELL / 2,
    cy: CELL / 2,
    size: CELL * TOKEN_PIECE_RATIO,
    ink: entry.color,
    role: entry.role,
  });
  return `<svg viewBox="0 0 ${CELL} ${CELL}" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">${inner}</svg>`;
}

export function renderJungleBoardSvg(
  board: JungleBoard,
  options: JungleRenderOptions = {},
): string {
  const gid = `jungle${options.idSuffix ?? ''}`;
  const shadow = options.shadow ?? true;
  // Resolved once per render; a caller may pin either axis (markers, diagrams).
  const boardSkin = options.boardSkin ?? currentJungleBoardSkin();
  const pieceSkin = options.pieceSkin ?? currentJunglePieceSkin();
  return renderGridBoardSvg(DESCRIPTOR, {
    id: gid,
    flip: options.perspective === 'black',
    extraDefs: shadow ? defs(gid) : '',
    coords: false,
    renderPieces: (geom) =>
      furniture(geom, options.lastMove ?? null, boardSkin) +
      pieces(board, geom, gid, shadow, options.draggingFrom ?? null, pieceSkin) +
      `<g class="jungle-board-markers xq-live-markers" aria-hidden="true" pointer-events="none">${(options.markers ?? []).map((marker) => jungleMarkerSvg(marker, geom)).join('')}</g>` +
      `<g class="jungle-board-arrows xq-live-arrows" aria-hidden="true" pointer-events="none">${jungleArrowLayer(options.arrows ?? [], geom)}</g>`,
    // Last-move is drawn inside furniture (over the grass terrain); the core's own
    // last-move layer sits under renderPieces and would be hidden by the grass.
    lastMove: null,
    selected: options.selected ? cellRef(options.selected) : null,
    targets: (options.targets ?? []).map((sq) => {
      const ref = cellRef(sq);
      return { ...ref, occupied: board[sq] !== undefined };
    }),
    squareName: (file, rank) => `${'abcdefg'[file]}${rank}`,
    interactive: options.interactive ?? false,
  });
}

export function jungleArrowSvg(arrow: JungleBoardArrow, perspective: JungleColor): string {
  const geom = createGridGeometry(DESCRIPTOR, perspective === 'black');
  return jungleArrowSvgWithGeometry(arrow, geom);
}

export function jungleMarkerSvg(marker: JungleBoardMarker, geom: GridGeometry): string {
  const { file, rank } = jungleCoordOf(marker.square);
  return svgBoardCircleMarker(marker, geom.center(file, rank), geom.cell * 0.42, {
    baseClassName: 'xq-marker engine-marker',
  });
}

function jungleArrowLayer(arrows: readonly JungleBoardArrow[], geom: GridGeometry): string {
  return arrows.map((arrow) => jungleArrowSvgWithGeometry(arrow, geom)).join('');
}

function jungleArrowSvgWithGeometry(arrow: JungleBoardArrow, geom: GridGeometry): string {
  const from = jungleCoordOf(arrow.from);
  const to = jungleCoordOf(arrow.to);
  const scaledArrow = {
    ...arrow,
    width: arrow.width === undefined ? undefined : arrow.width * (CELL / 72),
  };
  return svgBoardArrow(
    scaledArrow,
    geom.center(from.file, from.rank),
    geom.center(to.file, to.rank),
    {
      baseClassName: 'xq-arrow',
      defaultWidth: 6,
      startInset: 8,
    },
  );
}
