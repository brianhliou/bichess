import {
  ALL_BANQI_SQUARES,
  type BanqiColor,
  type BanqiMove,
  type BanqiPieceRole,
  type BanqiPlayerView,
  type BanqiSeat,
  type BanqiSquare,
  banqiCoordOf,
} from '@mistboard/game';
import {
  boardLastMoveMarkersSvg,
  boardLastMoveOuterRadius,
  boardLastMoveStyleAttr,
  boardLastMoveUnit,
} from './board-lastmove.js';
import { tokenPieceSize } from './board-metrics.js';
import { type SvgBoardArrowStyle, svgBoardArrow } from './svg-board-arrow.js';
import {
  GLYPH_OFFSET_RATIO,
  GLYPH_RADIUS_RATIO,
  type SvgBoardMarkerStyle,
  svgBoardCircleMarker,
  svgBoardGlyphMarker,
} from './svg-board-marker.js';
import { readStoredXiangqiPieceSet } from './xiangqi-appearance-storage.js';
import { renderXiangqiPieceGlyphed, type XiangqiPieceSet } from './xiangqi-piece-sets.js';

// Bespoke SVG renderer for the banqi board, drawn as the bottom HALF of a xiangqi
// board in its natural HORIZONTAL orientation: 8 files run left-to-right, 4 ranks
// bottom-to-top. The 8x4 banqi cells are the 32 cells bounded by a 9x5 line grid
// (half a xiangqi board); the 32 pieces sit in the CELL centres. The board is a
// plain grid — the parent board's palace and soldier/cannon starting-point marks
// are deliberately NOT drawn: banqi keeps none of those rules (no palace
// confinement, no fixed start array), so they would be purely decorative noise.
//
// Banqi is symmetric-information: BOTH seats see the IDENTICAL board (no per-seat
// flip), and a face-down tile carries NO colour or identity to anyone (the deal
// is the only hidden state, hidden from both). A face-down piece renders as a
// uniform disc (one colour, leaking nothing); a revealed piece renders with its
// xiangqi glyph.

const FILES = 8; // cells across (9 vertical lines / files a..i)
const RANKS = 4; // cells down (5 horizontal lines / ranks 1..5, river at the top)
const CELL = 64;
const MARGIN = 28;
const PIECE_SIZE = tokenPieceSize(CELL);
const WIDTH = MARGIN * 2 + FILES * CELL;
const HEIGHT = MARGIN * 2 + RANKS * CELL;
const HIT_HALF = CELL / 2 - 1;
// The origin wash and destination halo are the shared marks (board-lastmove.ts).
// The reveal ring is banqi's alone -- a flip is a self-move, so there is no
// origin to wash -- and sits just outside where the shared marks end, making a
// revealed-in-place tile read as a double ring against a move's single one.
// Engine candidate marker. Was sharing the last-move ring's radius, which tied an
// unrelated mark to that ring's geometry; the other boards size it from the piece
// like their selection ring, so do the same here.
const ENGINE_MARKER_RADIUS = PIECE_SIZE / 2 + 6;
const LAST_MOVE_REVEAL_RADIUS =
  Math.round((boardLastMoveOuterRadius(PIECE_SIZE) + 2.5 * boardLastMoveUnit(PIECE_SIZE)) * 100) /
  100;

export const BANQI_PIECE_PX = PIECE_SIZE;

export type BanqiBoardRenderOptions = {
  arrows?: readonly BanqiBoardArrow[];
  markers?: readonly BanqiBoardMarker[];
  interactive?: boolean;
  // The selected own revealed piece (move source), if any.
  selectedSquare?: BanqiSquare | null;
  // Board moves of the selected piece (flips excluded — a face-down tile is
  // clicked directly to flip, so it needs no target dot).
  legalMoves?: readonly BanqiMove[];
  pieceSet?: XiangqiPieceSet;
  // While dragging, render the origin as a dim source shadow.
  draggingFrom?: BanqiSquare | null;
};

export interface BanqiBoardArrow extends SvgBoardArrowStyle {
  from: BanqiSquare;
  to: BanqiSquare;
}

export interface BanqiBoardMarker extends SvgBoardMarkerStyle {
  square: BanqiSquare;
  kind: 'circle' | 'glyph';
  /** Badge label for kind 'glyph' (e.g. '??'). Ignored by 'circle'. */
  text?: string;
}

// The standalone disc for the floating drag ghost (board-drag.ts mounts it in a
// sized <div>). Only revealed pieces are draggable, so the entry is always known.
export function banqiPieceGhostSvg(
  entry: { color: BanqiColor; role: BanqiPieceRole },
  pieceSet?: XiangqiPieceSet,
): string {
  const set = pieceSet ?? readStoredXiangqiPieceSet();
  const inner = renderXiangqiPieceGlyphed(entry, set, {
    ariaLabel: `${entry.color} ${entry.role}`,
    className: 'banqi-piece',
    shrouded: false,
    x: 0,
    y: 0,
    size: PIECE_SIZE,
  });
  return `<svg width="${PIECE_SIZE}" height="${PIECE_SIZE}" viewBox="0 0 ${PIECE_SIZE} ${PIECE_SIZE}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}

// A line intersection. `fileLine` 0..8 runs left→right (file a at the left);
// `rankLine` 0..4 runs top→bottom (the river edge at the top, rank 1 at the
// bottom).
function point(fileLine: number, rankLine: number): { x: number; y: number } {
  return { x: MARGIN + fileLine * CELL, y: MARGIN + rankLine * CELL };
}

// A cell centre for a banqi square (file 0..7 across, rank 1..4 up; identical for
// both seats, no flip — rank 1 sits at the bottom).
function cellCenter(square: BanqiSquare): { x: number; y: number } {
  const { file, rank } = banqiCoordOf(square);
  return { x: MARGIN + (file + 0.5) * CELL, y: MARGIN + (4.5 - rank) * CELL };
}

export function banqiArrowSvg(arrow: BanqiBoardArrow): string {
  const scaledArrow = {
    ...arrow,
    width: arrow.width === undefined ? undefined : arrow.width * (CELL / 72),
  };
  return svgBoardArrow(scaledArrow, cellCenter(arrow.from), cellCenter(arrow.to), {
    baseClassName: 'xq-arrow',
    defaultWidth: 8,
    startInset: 10,
  });
}

export function banqiMarkerSvg(marker: BanqiBoardMarker): string {
  const center = cellCenter(marker.square);
  if (marker.kind === 'glyph') {
    return svgBoardGlyphMarker(
      marker,
      center,
      CELL * GLYPH_RADIUS_RATIO,
      CELL * GLYPH_OFFSET_RATIO,
      {
        baseClassName: 'xq-marker',
      },
    );
  }
  return svgBoardCircleMarker(marker, center, ENGINE_MARKER_RADIUS, {
    baseClassName: 'xq-marker engine-marker',
  });
}

function gridLines(): string {
  const parts: string[] = [];
  const a = point(0, 0);
  const z = point(FILES, RANKS);
  for (let r = 0; r <= RANKS; r += 1) {
    const y = MARGIN + r * CELL;
    parts.push(`<line x1="${a.x}" y1="${y}" x2="${z.x}" y2="${y}"/>`);
  }
  for (let f = 0; f <= FILES; f += 1) {
    const x = MARGIN + f * CELL;
    parts.push(`<line x1="${x}" y1="${a.y}" x2="${x}" y2="${z.y}"/>`);
  }
  return parts.join('');
}

// A uniform face-down disc: one colour, a single ring, no glyph (the deal is
// hidden from both). A flat disc with no inner ring keeps the back clean.
function faceDownDisc(cx: number, cy: number, className = 'banqi-back'): string {
  const r = PIECE_SIZE * 0.46;
  return [`<g class="${className}">`, `<circle cx="${cx}" cy="${cy}" r="${r}"/>`, `</g>`].join('');
}

function pieceLayer(
  view: BanqiPlayerView,
  pieceSet: XiangqiPieceSet,
  draggingFrom: BanqiSquare | null,
): string {
  return ALL_BANQI_SQUARES.map((square) => {
    const entry = view.board[square];
    if (!entry) return '';
    const dragSource = square === draggingFrom;
    const { x, y } = cellCenter(square);
    if (entry.faceDown) {
      return faceDownDisc(x, y, dragSource ? 'banqi-back banqi-drag-source' : 'banqi-back');
    }
    return renderXiangqiPieceGlyphed({ color: entry.color, role: entry.role }, pieceSet, {
      ariaLabel: `${entry.color} ${entry.role}`,
      className: dragSource ? 'banqi-piece banqi-drag-source' : 'banqi-piece',
      shrouded: false,
      x: x - PIECE_SIZE / 2,
      y: y - PIECE_SIZE / 2,
      size: PIECE_SIZE,
    });
  }).join('');
}

function selectionRing(selection: BanqiSquare | null): string {
  if (!selection) return '';
  const { x, y } = cellCenter(selection);
  return `<rect class="banqi-selection" x="${x - HIT_HALF}" y="${y - HIT_HALF}" width="${HIT_HALF * 2}" height="${HIT_HALF * 2}" rx="6"/>`;
}

function moveHints(view: BanqiPlayerView, moves: readonly BanqiMove[]): string {
  return moves
    .filter((move) => move.from !== move.to)
    .map((move) => {
      const { x, y } = cellCenter(move.to);
      const occupant = view.board[move.to];
      const capture = !!occupant && !occupant.faceDown;
      return capture
        ? `<circle class="banqi-hint-capture" cx="${x}" cy="${y}" r="${CELL * 0.42}"/>`
        : `<circle class="banqi-hint" cx="${x}" cy="${y}" r="9"/>`;
    })
    .join('');
}

function lastMoveMarkers(view: BanqiPlayerView): string {
  if (!view.lastMove) return '';
  const to = cellCenter(view.lastMove.to);
  // Flips are self-moves: mark the destination only, never invent an origin to
  // wash, and add the reveal ring so a flip is distinguishable from a move.
  if (view.lastMove.from === view.lastMove.to) {
    return (
      boardLastMoveMarkersSvg({ to }, PIECE_SIZE) +
      `<circle class="banqi-last-reveal" cx="${to.x}" cy="${to.y}" r="${LAST_MOVE_REVEAL_RADIUS}"/>`
    );
  }
  return boardLastMoveMarkersSvg({ from: cellCenter(view.lastMove.from), to }, PIECE_SIZE);
}

function hitLayerWithTargets(moves: readonly BanqiMove[], view?: BanqiPlayerView): string {
  const targets = new Map<BanqiSquare, { capture: boolean }>();
  if (view) {
    for (const move of moves) {
      const occupant = view.board[move.to];
      targets.set(move.to, { capture: !!occupant && !occupant.faceDown });
    }
  }
  return ALL_BANQI_SQUARES.map((square) => {
    const { x, y } = cellCenter(square);
    const target = targets.get(square);
    const marker = target
      ? target.capture
        ? `<circle class="banqi-hint-capture" cx="${x}" cy="${y}" r="${CELL * 0.42}"/>`
        : `<circle class="banqi-hint" cx="${x}" cy="${y}" r="9"/>`
      : '';
    const hover = target
      ? `<rect class="banqi-target-hover" x="${x - HIT_HALF}" y="${y - HIT_HALF}" width="${HIT_HALF * 2}" height="${HIT_HALF * 2}" rx="6"/>`
      : '';
    return `<g data-square="${square}" class="banqi-hit${target ? ' banqi-hit--target' : ''}">${hover}${marker}<rect x="${x - HIT_HALF}" y="${y - HIT_HALF}" width="${HIT_HALF * 2}" height="${HIT_HALF * 2}"/></g>`;
  }).join('');
}

// `perspective` is accepted for call-site parity with the other variants, but
// banqi shows the SAME board to both seats (symmetric info), so it is unused.
export function renderBanqiBoardSvg(
  view: BanqiPlayerView,
  _perspective: BanqiSeat = view.perspective,
  options: BanqiBoardRenderOptions = {},
): string {
  const pieceSet = options.pieceSet ?? readStoredXiangqiPieceSet();
  const moves = options.selectedSquare
    ? (options.legalMoves ?? []).filter((m) => m.from === options.selectedSquare)
    : [];
  return `
    <svg class="banqi-board"${boardLastMoveStyleAttr(PIECE_SIZE)} viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Banqi board">
      <rect class="banqi-board-bg" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="6"/>
      <g class="banqi-grid">${gridLines()}</g>
      ${lastMoveMarkers(view)}
      ${selectionRing(options.selectedSquare ?? null)}
      ${options.interactive ? '' : moveHints(view, moves)}
      ${pieceLayer(view, pieceSet, options.draggingFrom ?? null)}
      <g class="banqi-board-markers xq-live-markers" aria-hidden="true" pointer-events="none">${(options.markers ?? []).map(banqiMarkerSvg).join('')}</g>
      <g class="banqi-board-arrows xq-live-arrows" aria-hidden="true" pointer-events="none">${(options.arrows ?? []).map(banqiArrowSvg).join('')}</g>
      ${options.interactive ? hitLayerWithTargets(moves, view) : ''}
    </svg>
  `;
}

let stylesInstalled = false;

/**
 * The board's presentation, as a stylesheet rather than presentation attributes.
 *
 * Exported because it is NOT optional decoration: `renderBanqiBoardSvg` emits class
 * names (`banqi-board-bg`, `banqi-grid`, `banqi-back`, the last-move marks) and nothing
 * else, so an SVG rendered without these rules has no board, no grid, and no face-down
 * discs. Anything rasterizing the markup outside a page (resvg has no page stylesheet)
 * must inline this string, and inlining a hand-copied duplicate is how the two drift.
 */
export const BANQI_BOARD_CSS = `
    .banqi-board {
      display: block;
      width: 100%;
      height: auto;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
      /* Match the room-page boards' soft card lift (xiangqi-live-board). */
      filter: drop-shadow(0 14px 36px rgba(37, 31, 24, 0.18));
    }
    .banqi-board-bg { fill: var(--mini-xq-board-bg, #f0d6a4); }
    .banqi-grid line {
      stroke: var(--mini-xq-grid, #5b4a32);
      stroke-width: 1.5;
      stroke-linecap: round;
    }
    .banqi-selection { fill: rgba(31, 111, 91, 0.32); stroke: none; pointer-events: none; }
    .banqi-hint { fill: rgba(31, 111, 91, 0.72); opacity: 0.7; pointer-events: none; }
    .banqi-hint-capture {
      fill: none; stroke: rgba(31, 111, 91, 0.48); stroke-width: 3; pointer-events: none;
    }
    .banqi-target-hover {
      fill: rgba(31, 111, 91, 0.3);
      opacity: 0;
      pointer-events: none;
    }
    .banqi-hit--target:hover .banqi-target-hover {
      opacity: 1;
    }
    .banqi-hit--target:hover .banqi-hint,
    .banqi-hit--target:hover .banqi-hint-capture {
      opacity: 0;
    }
    /* Origin wash and destination halo now come from board-lastmove.css, shared
       with the xiangqi family. Only the reveal ring is this board's own. */
    .banqi-last-reveal {
      fill: none;
      stroke: var(--board-highlight, #d6af4e);
      stroke-width: var(--board-lastmove-origin-stroke, 2);
      opacity: 0.9;
      pointer-events: none;
    }
    .banqi-piece { pointer-events: none; filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.2)); }
    .banqi-back { pointer-events: none; filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.3)); }
    .banqi-drag-source { opacity: 0.34; }
    .banqi-back circle { fill: #2f8f6b; stroke: #184a38; stroke-width: 2; }
    .banqi-hit rect { fill: transparent; cursor: pointer; }
  `;

export function installBanqiBoardStyles(): void {
  if (stylesInstalled) return;
  stylesInstalled = true;
  const style = document.createElement('style');
  style.textContent = BANQI_BOARD_CSS;
  document.head.append(style);
}
