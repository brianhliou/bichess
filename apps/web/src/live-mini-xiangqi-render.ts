import {
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiMove,
  type MiniXiangqiPiece,
  type MiniXiangqiPlayerView,
  type MiniXiangqiSquare,
  miniXiangqiCoordOf,
  miniXiangqiSquareOf,
} from '@mistboard/game';
import { glideSvgPiece, pieceAnimationDurationMs } from './board-anim.js';
import { tokenPieceSize } from './board-metrics.js';
import { type SvgBoardArrowStyle, svgBoardArrow } from './svg-board-arrow.js';
import { type SvgBoardMarkerStyle, svgBoardCircleMarker } from './svg-board-marker.js';
import { readStoredXiangqiPieceSet } from './xiangqi-appearance-storage.js';
import { xiangqiFogRegion } from './xiangqi-fog.js';
import { renderXiangqiPieceGlyphed, type XiangqiPieceSet } from './xiangqi-piece-sets.js';

// Bespoke SVG renderer for the 7x7 Dark Mini Xiangqi board. Pieces sit on
// intersections (xiangqi convention) and Fog of War is drawn as an inverse
// <mask> with square cutouts on visible intersections, matching the full Dark
// Xiangqi renderer (decision: connected reveals, not isolated portholes).

const CELL = 72;
const MARGIN = 42;
const DEFAULT_PIECE_SIZE = tokenPieceSize(CELL);
// Move/selection markers wrap the disc: radii track the default piece radius.
const RING_SELECTION = DEFAULT_PIECE_SIZE / 2 + 6;
const RING_LAST = DEFAULT_PIECE_SIZE / 2 + 4;
const RING_CAPTURE = DEFAULT_PIECE_SIZE / 2 + 1;
const FILES = 7;
const RANKS = 7;
const WIDTH = MARGIN * 2 + (FILES - 1) * CELL;
const HEIGHT = MARGIN * 2 + (RANKS - 1) * CELL;
const HIT_HALF = 31;
const FOG_OVERLAP = 0.5;

// Monotonic source of unique fog-mask ids (see renderMiniXiangqiBoardSvg).
let miniXqFogMaskCounter = 0;

export interface MiniXiangqiBoardArrow extends SvgBoardArrowStyle {
  from: MiniXiangqiSquare;
  to: MiniXiangqiSquare;
}

export interface MiniXiangqiBoardMarker extends SvgBoardMarkerStyle {
  square: MiniXiangqiSquare;
  kind: 'circle';
}

export type MiniXiangqiBoardRenderOptions = {
  arrows?: readonly MiniXiangqiBoardArrow[];
  markers?: readonly MiniXiangqiBoardMarker[];
  interactive?: boolean;
  showFog?: boolean;
  selectedSquare?: MiniXiangqiSquare | null;
  legalMoves?: readonly MiniXiangqiMove[];
  pieceSet?: XiangqiPieceSet;
  pieceSize?: number;
  // While a piece is being dragged, render its origin as a dim source shadow.
  draggingFrom?: MiniXiangqiSquare | null;
};

export function renderMiniXiangqiBoardSvg(
  view: MiniXiangqiPlayerView,
  perspective: MiniXiangqiColor = view.perspective,
  options: MiniXiangqiBoardRenderOptions = {},
): string {
  const showFog = options.showFog ?? true;
  const pieceSet = options.pieceSet ?? readStoredXiangqiPieceSet();
  const pieceSize = options.pieceSize ?? DEFAULT_PIECE_SIZE;
  // Globally-unique per render: the postgame triptych mounts three boards in one
  // document, and SVG `url(#id)` resolves the FIRST element with that id document-
  // wide. A shared id (same game id + same render orientation) made the black
  // board apply the red board's fog mask. A counter guarantees no collision.
  miniXqFogMaskCounter += 1;
  const maskId = `mini-xq-fog-${miniXqFogMaskCounter}`;
  const fog = showFog ? fogLayer(view, perspective, maskId) : '';
  const legalMoves = options.legalMoves ?? [];
  return `
    <svg class="mini-xq-board" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dark Mini Xiangqi board">
      <rect class="mini-xq-board-bg" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="10"/>
      ${palaceBands(perspective)}
      <g class="mini-xq-grid">${gridLines()}${palaceCrosses(perspective)}</g>
      <g class="mini-xq-fog">${fog}</g>
      ${lastMoveMarkers(view, perspective)}
      ${selectionRing(options.selectedSquare ?? null, perspective)}
      ${options.interactive ? '' : moveHints(view, legalMoves, perspective)}
      ${pieceLayer(view, perspective, pieceSet, options.draggingFrom ?? null, pieceSize)}
      <g class="mini-xq-board-markers xq-live-markers" aria-hidden="true" pointer-events="none">${(options.markers ?? []).map((marker) => miniXiangqiMarkerSvg(marker, perspective)).join('')}</g>
      <g class="mini-xq-board-arrows xq-live-arrows" aria-hidden="true" pointer-events="none">${(options.arrows ?? []).map((arrow) => miniXiangqiArrowSvg(arrow, perspective)).join('')}</g>
      ${options.interactive ? hitLayer(perspective, view, legalMoves) : ''}
    </svg>
  `;
}

// On-board piece footprint in px — the drag ghost matches it so the dragged
// piece tracks the cursor at board scale.
export const MINI_XIANGQI_PIECE_PX = DEFAULT_PIECE_SIZE;

// A standalone <svg> for one piece, used as the floating drag ghost. Rendered at
// the same glyph/size as on the board; the caller positions it under the cursor.
export function miniXiangqiPieceGhostSvg(
  piece: MiniXiangqiPiece,
  pieceSet?: XiangqiPieceSet,
): string {
  const set = pieceSet ?? readStoredXiangqiPieceSet();
  const inner = renderXiangqiPieceGlyphed(piece, set, {
    ariaLabel: `${piece.color} ${piece.role}`,
    className: 'mini-xq-piece',
    shrouded: false,
    x: 0,
    y: 0,
    size: DEFAULT_PIECE_SIZE,
  });
  return `<svg width="${DEFAULT_PIECE_SIZE}" height="${DEFAULT_PIECE_SIZE}" viewBox="0 0 ${DEFAULT_PIECE_SIZE} ${DEFAULT_PIECE_SIZE}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}

// A full-information "truth" view: every piece revealed, every square visible.
// Useful for a god/spectator toggle and postgame truth replay.
export function miniXiangqiTruthView(state: MiniXiangqiGameState): MiniXiangqiPlayerView {
  return {
    id: state.id,
    perspective: 'red',
    board: Object.fromEntries(
      Object.entries(state.board).map(([square, piece]) => [square, { piece, shrouded: false }]),
    ) as MiniXiangqiPlayerView['board'],
    visibleSquares: allMiniXiangqiSquares(),
    legalMoves: [],
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

function gridLines(): string {
  const parts: string[] = [];
  for (let r = 0; r < RANKS; r += 1) {
    const y = MARGIN + r * CELL;
    parts.push(`<line x1="${MARGIN}" y1="${y}" x2="${MARGIN + (FILES - 1) * CELL}" y2="${y}"/>`);
  }
  for (let f = 0; f < FILES; f += 1) {
    const x = MARGIN + f * CELL;
    parts.push(`<line x1="${x}" y1="${MARGIN}" x2="${x}" y2="${MARGIN + (RANKS - 1) * CELL}"/>`);
  }
  return parts.join('');
}

function palaceBands(perspective: MiniXiangqiColor): string {
  const red = palaceRect(1, 3, perspective);
  const black = palaceRect(5, 7, perspective);
  return [red, black]
    .map(
      ({ x, y, width, height }) =>
        `<rect class="mini-xq-palace-band" x="${x}" y="${y}" width="${width}" height="${height}"/>`,
    )
    .join('');
}

function palaceRect(
  rankA: number,
  rankB: number,
  perspective: MiniXiangqiColor,
): { x: number; y: number; width: number; height: number } {
  const a = intersection(2, rankA, perspective);
  const b = intersection(4, rankB, perspective);
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

function palaceCrosses(perspective: MiniXiangqiColor): string {
  const parts: string[] = [];
  for (const palace of [
    { bottom: 1, top: 3 },
    { bottom: 5, top: 7 },
  ]) {
    const a = intersection(2, palace.top, perspective);
    const b = intersection(4, palace.bottom, perspective);
    const c = intersection(4, palace.top, perspective);
    const d = intersection(2, palace.bottom, perspective);
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    parts.push(`<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}"/>`);
  }
  return parts.join('');
}

function pieceLayer(
  view: MiniXiangqiPlayerView,
  perspective: MiniXiangqiColor,
  pieceSet: XiangqiPieceSet,
  draggingFrom: MiniXiangqiSquare | null = null,
  pieceSize = DEFAULT_PIECE_SIZE,
): string {
  return Object.entries(view.board)
    .map(([square, entry]) => {
      if (!entry) return '';
      const dragSource = square === draggingFrom;
      const { file, rank } = miniXiangqiCoordOf(square as MiniXiangqiSquare);
      const { x, y } = intersection(file, rank, perspective);
      const piece =
        entry.shrouded === true
          ? ({ color: entry.color, role: 'soldier' } satisfies MiniXiangqiPiece)
          : entry.piece;
      const pieceSvg = renderXiangqiPieceGlyphed(piece, pieceSet, {
        ariaLabel: entry.shrouded ? `${entry.color} hidden piece` : `${piece.color} ${piece.role}`,
        className: dragSource ? 'mini-xq-piece mini-xq-piece--drag-source' : 'mini-xq-piece',
        shrouded: entry.shrouded,
        x: x - pieceSize / 2,
        y: y - pieceSize / 2,
        size: pieceSize,
      });
      // Keyed slot: a <g> wrapper per occupied square so a post-render glide
      // (animateMiniXiangqiBoardMove) can find and transform the piece.
      return `<g class="mini-xq-piece-slot" data-piece-square="${square}">${pieceSvg}</g>`;
    })
    .join('');
}

/**
 * Glide the piece that settled on `move.to` from its origin (or with `reverse`
 * the piece back on `move.from` from the destination). Call AFTER the innerHTML
 * swap. Deltas are viewBox user units from this module's own intersection
 * geometry. No-op at duration 0 or when the slot is missing. The move must come
 * from a received payload (attempt reply / played-move list), never a board diff.
 */
export function animateMiniXiangqiBoardMove(
  host: HTMLElement,
  move: { from: MiniXiangqiSquare; to: MiniXiangqiSquare },
  perspective: MiniXiangqiColor,
  opts: { reverse?: boolean } = {},
): void {
  const duration = pieceAnimationDurationMs();
  if (duration <= 0) return;
  const settleSquare = opts.reverse ? move.from : move.to;
  const originSquare = opts.reverse ? move.to : move.from;
  const slot = host.querySelector(`[data-piece-square="${settleSquare}"]`);
  if (!slot) return;
  const origin = miniXiangqiCoordOf(originSquare);
  const settle = miniXiangqiCoordOf(settleSquare);
  const from = intersection(origin.file, origin.rank, perspective);
  const to = intersection(settle.file, settle.rank, perspective);
  glideSvgPiece(slot, from.x - to.x, from.y - to.y, duration);
}

function fogLayer(
  view: MiniXiangqiPlayerView,
  perspective: MiniXiangqiColor,
  maskId: string,
): string {
  const cutouts = view.visibleSquares
    .map((square) => {
      const { file, rank } = miniXiangqiCoordOf(square);
      const center = intersection(file, rank, perspective);
      const displayRank = displayRankFor(rank, perspective);
      const x0 = file === 0 ? 0 : center.x - CELL / 2 - FOG_OVERLAP;
      const x1 = file === FILES - 1 ? WIDTH : center.x + CELL / 2 + FOG_OVERLAP;
      const y0 = displayRank === 0 ? 0 : center.y - CELL / 2 - FOG_OVERLAP;
      const y1 = displayRank === RANKS - 1 ? HEIGHT : center.y + CELL / 2 + FOG_OVERLAP;
      return `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="black"/>`;
    })
    .join('');
  return xiangqiFogRegion(
    { width: WIDTH, height: HEIGHT, cell: CELL, margin: MARGIN, rx: 10 },
    maskId,
    'mini-xq-fog-mask',
    cutouts,
  );
}

function selectionRing(selection: MiniXiangqiSquare | null, perspective: MiniXiangqiColor): string {
  if (!selection) return '';
  const { file, rank } = miniXiangqiCoordOf(selection);
  const { x, y } = intersection(file, rank, perspective);
  return `<circle class="mini-xq-selection" cx="${x}" cy="${y}" r="${RING_SELECTION}"/>`;
}

function moveHints(
  view: MiniXiangqiPlayerView,
  moves: readonly MiniXiangqiMove[],
  perspective: MiniXiangqiColor,
): string {
  return moves
    .map((move) => {
      const { file, rank } = miniXiangqiCoordOf(move.to);
      const { x, y } = intersection(file, rank, perspective);
      // A visibly occupied destination is a capture (including a cannon firing
      // over a screen onto a revealed target); a fogged destination stays a quiet
      // dot so a hidden piece is never implied.
      const capture = view.board[move.to] !== undefined;
      return capture
        ? `<circle class="mini-xq-hint-capture" cx="${x}" cy="${y}" r="${RING_CAPTURE}"/>`
        : `<circle class="mini-xq-hint" cx="${x}" cy="${y}" r="10"/>`;
    })
    .join('');
}

function lastMoveMarkers(view: MiniXiangqiPlayerView, perspective: MiniXiangqiColor): string {
  if (!view.lastMove) return '';
  const visible = new Set(view.visibleSquares);
  return [view.lastMove.from, view.lastMove.to]
    .filter((sq) => visible.has(sq))
    .map((sq) => {
      const { file, rank } = miniXiangqiCoordOf(sq);
      const { x, y } = intersection(file, rank, perspective);
      return `<circle class="mini-xq-last" cx="${x}" cy="${y}" r="${RING_LAST}"/>`;
    })
    .join('');
}

export function miniXiangqiArrowSvg(
  arrow: MiniXiangqiBoardArrow,
  perspective: MiniXiangqiColor,
): string {
  const from = miniXiangqiCoordOf(arrow.from);
  const to = miniXiangqiCoordOf(arrow.to);
  return svgBoardArrow(
    arrow,
    intersection(from.file, from.rank, perspective),
    intersection(to.file, to.rank, perspective),
    { baseClassName: 'xq-arrow' },
  );
}

export function miniXiangqiMarkerSvg(
  marker: MiniXiangqiBoardMarker,
  perspective: MiniXiangqiColor,
): string {
  const { file, rank } = miniXiangqiCoordOf(marker.square);
  return svgBoardCircleMarker(marker, intersection(file, rank, perspective), CELL * 0.42, {
    baseClassName: 'xq-marker engine-marker',
  });
}

function hitLayer(
  perspective: MiniXiangqiColor,
  view: MiniXiangqiPlayerView,
  moves: readonly MiniXiangqiMove[],
): string {
  const targets = new Map<MiniXiangqiSquare, { capture: boolean }>();
  for (const move of moves) targets.set(move.to, { capture: view.board[move.to] !== undefined });
  const parts: string[] = [];
  for (let f = 0; f < FILES; f += 1) {
    for (let r = 1; r <= RANKS; r += 1) {
      const sq = miniXiangqiSquareOf(f, r);
      const { x, y } = intersection(f, r, perspective);
      const target = targets.get(sq);
      const marker = target
        ? target.capture
          ? `<circle class="mini-xq-hint-capture" cx="${x}" cy="${y}" r="${RING_CAPTURE}"/>`
          : `<circle class="mini-xq-hint" cx="${x}" cy="${y}" r="10"/>`
        : '';
      const hover = target
        ? `<circle class="mini-xq-target-hover" cx="${x}" cy="${y}" r="${RING_LAST}"/>`
        : '';
      parts.push(
        `<g data-square="${sq}" class="mini-xq-hit${target ? ' mini-xq-hit--target' : ''}">${hover}${marker}<rect x="${x - HIT_HALF}" y="${y - HIT_HALF}" width="${HIT_HALF * 2}" height="${HIT_HALF * 2}"/></g>`,
      );
    }
  }
  return parts.join('');
}

function intersection(
  file: number,
  rank: number,
  perspective: MiniXiangqiColor,
): { x: number; y: number } {
  return {
    x: MARGIN + file * CELL,
    y: MARGIN + displayRankFor(rank, perspective) * CELL,
  };
}

function displayRankFor(rank: number, perspective: MiniXiangqiColor): number {
  return perspective === 'red' ? RANKS - rank : rank - 1;
}

function allMiniXiangqiSquares(): MiniXiangqiSquare[] {
  const squares: MiniXiangqiSquare[] = [];
  for (let r = 1; r <= RANKS; r += 1) {
    for (let f = 0; f < FILES; f += 1) {
      squares.push(miniXiangqiSquareOf(f, r));
    }
  }
  return squares;
}

let stylesInstalled = false;

export function installMiniXiangqiBoardStyles(): void {
  if (stylesInstalled) return;
  stylesInstalled = true;
  const style = document.createElement('style');
  style.textContent = `
    /* Board presentation (data-xiangqi-board-theme) and fog shading
       (data-fog-theme, shared with chess) drive the board via CSS vars. */
    :root {
      --mini-xq-board-bg: var(--xq-board-bg, #f5dca8);
      --mini-xq-palace-band: var(--xq-board-band, rgba(90, 58, 20, 0.06));
      --mini-xq-grid: var(--xq-board-ink, #5a3a14);
    }
    :root[data-xiangqi-board-theme="international"] {
      --mini-xq-board-bg: var(--xq-board-bg, #f5dca8);
      --mini-xq-palace-band: var(--xq-board-band, rgba(90, 58, 20, 0.06));
      --mini-xq-grid: var(--xq-board-ink, #5a3a14);
    }
    :root[data-xiangqi-board-theme="traditional"] {
      --mini-xq-board-bg: var(--xq-board-bg, #d9bd82);
      --mini-xq-palace-band: var(--xq-board-band, rgba(75, 60, 42, 0.07));
      --mini-xq-grid: var(--xq-board-ink, #4b3c2a);
    }
    /* Per-skin fog tints + texture toggles are shared with the full board and
       live in app-base.css (--xq-fog-fill, .xq-fog-tex). The drag ghost is the
       shared .board-drag-ghost (styles.css), floated by installBoardDrag. */
    .mini-xq-board {
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
    }
    .mini-xq-board image,
    .mini-xq-piece {
      -webkit-user-drag: none;
    }
    .mini-xq-board {
      display: block;
      width: 100%;
      height: auto;
      touch-action: none;
      touch-action: manipulation;
    }
    .mini-xq-board-bg {
      fill: var(--mini-xq-board-bg, #d9bd82);
    }
    .mini-xq-palace-band {
      fill: var(--mini-xq-palace-band, rgba(255, 255, 255, 0.17));
    }
    .mini-xq-grid line {
      stroke: var(--mini-xq-grid, #4b3c2a);
      stroke-width: 2;
      stroke-linecap: round;
    }
    .mini-xq-fog-mask {
      fill: var(--xq-fog-fill, rgba(46, 43, 37, 0.82));
      pointer-events: none;
    }
    .mini-xq-selection {
      fill: rgba(31, 111, 91, 0.32);
      stroke: none;
      pointer-events: none;
    }
    .mini-xq-hint {
      fill: rgba(31, 111, 91, 0.72);
      opacity: 0.78;
      pointer-events: none;
    }
    .mini-xq-hint-capture {
      fill: none;
      stroke: rgba(31, 111, 91, 0.48);
      stroke-width: 3;
      pointer-events: none;
    }
    .mini-xq-target-hover {
      fill: rgba(31, 111, 91, 0.3);
      opacity: 0;
      pointer-events: none;
    }
    .mini-xq-hit--target:hover .mini-xq-target-hover {
      opacity: 1;
    }
    .mini-xq-hit--target:hover .mini-xq-hint,
    .mini-xq-hit--target:hover .mini-xq-hint-capture {
      opacity: 0;
    }
    .mini-xq-last {
      fill: rgba(250, 204, 21, 0.22);
      stroke: rgba(180, 83, 9, 0.55);
      stroke-width: 2;
      pointer-events: none;
    }
    .mini-xq-piece {
      pointer-events: none;
      filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.2));
    }
    .mini-xq-piece--drag-source {
      opacity: 0.34;
    }
    .mini-xq-hit rect {
      fill: transparent;
      cursor: pointer;
    }
    .live-route--mini-xiangqi {
      --uni-board-aspect: 1;
      --uni-board-max: 560px;
    }
    .live-route--mini-xiangqi .board-status {
      width: 100%;
    }
    .mini-xiangqi-live-board {
      aspect-ratio: 1 / 1;
      width: 100%;
      min-height: 0;
      border-radius: 10px;
      box-shadow: 0 18px 50px rgba(37, 31, 24, 0.16);
    }
    .mini-xiangqi-live-board--disabled {
      background: repeating-linear-gradient(135deg, #ece7dc, #ece7dc 16px, #ddd5c5 16px, #ddd5c5 32px);
    }
  `;
  document.head.append(style);
}
