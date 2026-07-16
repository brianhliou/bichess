import type { JieqiColor, JieqiMove, JieqiPlayerView, JieqiSquare } from '@mistboard/game';
import { tokenPieceSize } from './board-metrics.js';
import { readStoredXiangqiPieceSet } from './xiangqi-appearance-storage.js';
import { renderXiangqiPieceGlyphed, type XiangqiPieceSet } from './xiangqi-piece-sets.js';

// Bespoke SVG renderer for the 9x10 jieqi board. Pieces sit on intersections
// (xiangqi convention). Unlike the Dark Xiangqi / DMX renderers there is NO fog:
// jieqi positions are fully public. The hidden axis is IDENTITY — a face-down
// piece renders as a color-known "back" (shroudedStyle 'back'); a revealed piece
// renders with its glyph. The captured-pool UI is the caller's concern.

const CELL = 72;
const MARGIN = 42;
const PIECE_SIZE = tokenPieceSize(CELL);
// Move/selection markers wrap the disc: radii track the piece radius.
const RING_SELECTION = PIECE_SIZE / 2 + 6;
const RING_LAST = PIECE_SIZE / 2 + 4;
const RING_CAPTURE = PIECE_SIZE / 2 + 1;
const FILES = 9;
const RANKS = 10;
const WIDTH = MARGIN * 2 + (FILES - 1) * CELL;
const HEIGHT = MARGIN * 2 + (RANKS - 1) * CELL;
const HIT_HALF = 31;
// The river sits between ranks 5 and 6 (display rows 4 and 5 from the top).
const RIVER_TOP = MARGIN + 4 * CELL;
const RIVER_BOTTOM = MARGIN + 5 * CELL;

export type JieqiBoardRenderOptions = {
  interactive?: boolean;
  selectedSquare?: JieqiSquare | null;
  legalMoves?: readonly JieqiMove[];
  pieceSet?: XiangqiPieceSet;
  // While dragging, render the origin as a dim source shadow.
  draggingFrom?: JieqiSquare | null;
};

function jieqiCoordOf(square: JieqiSquare): { file: number; rank: number } {
  return { file: square.charCodeAt(0) - 97, rank: Number(square.slice(1)) };
}

function jieqiSquareOf(file: number, rank: number): JieqiSquare {
  return `${String.fromCharCode(97 + file)}${rank}` as JieqiSquare;
}

function displayRankFor(rank: number, perspective: JieqiColor): number {
  return perspective === 'red' ? RANKS - rank : rank - 1;
}

function intersection(
  file: number,
  rank: number,
  perspective: JieqiColor,
): { x: number; y: number } {
  const displayFile = perspective === 'red' ? file : FILES - 1 - file;
  return { x: MARGIN + displayFile * CELL, y: MARGIN + displayRankFor(rank, perspective) * CELL };
}

export function renderJieqiBoardSvg(
  view: JieqiPlayerView,
  perspective: JieqiColor = view.perspective,
  options: JieqiBoardRenderOptions = {},
): string {
  const pieceSet = options.pieceSet ?? readStoredXiangqiPieceSet();
  const legalMoves = options.legalMoves ?? [];
  return `
    <svg class="jieqi-board" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Reveal Xiangqi board">
      <rect class="jieqi-board-bg" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="10"/>
      <g class="jieqi-grid">${gridLines()}${palaceCrosses(perspective)}</g>
      ${lastMoveMarkers(view, perspective)}
      ${selectionRing(options.selectedSquare ?? null, perspective)}
      ${options.interactive ? '' : moveHints(view, legalMoves, perspective)}
      ${pieceLayer(view, perspective, pieceSet, options.draggingFrom ?? null)}
      ${options.interactive ? hitLayer(perspective, view, legalMoves) : ''}
    </svg>
  `;
}

export const JIEQI_PIECE_PX = PIECE_SIZE;

// The standalone piece for the floating drag ghost (board-drag.ts mounts it in a
// sized <div>). Mirrors pieceLayer exactly: a face-down piece's ghost is the
// colour-known "back" (it moves AND reveals, so it is draggable), and a revealed
// piece's ghost is its glyph.
export function jieqiPieceGhostSvg(
  entry: JieqiPlayerView['board'][JieqiSquare],
  pieceSet?: XiangqiPieceSet,
): string {
  if (!entry) return '';
  const set = pieceSet ?? readStoredXiangqiPieceSet();
  const inner = entry.faceDown
    ? renderXiangqiPieceGlyphed({ color: entry.color, role: 'soldier' }, set, {
        ariaLabel: `${entry.color} hidden piece`,
        className: 'jieqi-piece',
        shrouded: true,
        shroudedStyle: 'back',
        x: 0,
        y: 0,
        size: PIECE_SIZE,
      })
    : renderXiangqiPieceGlyphed({ color: entry.color, role: entry.role }, set, {
        ariaLabel: `${entry.color} ${entry.role}`,
        className: 'jieqi-piece',
        shrouded: false,
        x: 0,
        y: 0,
        size: PIECE_SIZE,
      });
  return `<svg width="${PIECE_SIZE}" height="${PIECE_SIZE}" viewBox="0 0 ${PIECE_SIZE} ${PIECE_SIZE}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}

function gridLines(): string {
  const parts: string[] = [];
  for (let r = 0; r < RANKS; r += 1) {
    const y = MARGIN + r * CELL;
    parts.push(`<line x1="${MARGIN}" y1="${y}" x2="${MARGIN + (FILES - 1) * CELL}" y2="${y}"/>`);
  }
  for (let f = 0; f < FILES; f += 1) {
    const x = MARGIN + f * CELL;
    if (f === 0 || f === FILES - 1) {
      // Edge files run the full height across the river.
      parts.push(`<line x1="${x}" y1="${MARGIN}" x2="${x}" y2="${MARGIN + (RANKS - 1) * CELL}"/>`);
    } else {
      // Interior files stop at the river banks (the xiangqi river gap).
      parts.push(`<line x1="${x}" y1="${MARGIN}" x2="${x}" y2="${RIVER_TOP}"/>`);
      parts.push(
        `<line x1="${x}" y1="${RIVER_BOTTOM}" x2="${x}" y2="${MARGIN + (RANKS - 1) * CELL}"/>`,
      );
    }
  }
  return parts.join('');
}

function palaceCrosses(perspective: JieqiColor): string {
  const parts: string[] = [];
  // Palace files d..f (3..5); red ranks 1..3, black ranks 8..10.
  for (const palace of [
    { lo: 1, hi: 3 },
    { lo: 8, hi: 10 },
  ]) {
    const a = intersection(3, palace.hi, perspective);
    const b = intersection(5, palace.lo, perspective);
    const c = intersection(5, palace.hi, perspective);
    const d = intersection(3, palace.lo, perspective);
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    parts.push(`<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}"/>`);
  }
  return parts.join('');
}

function pieceLayer(
  view: JieqiPlayerView,
  perspective: JieqiColor,
  pieceSet: XiangqiPieceSet,
  draggingFrom: JieqiSquare | null,
): string {
  return Object.entries(view.board)
    .map(([square, entry]) => {
      if (!entry) return '';
      const dragSource = square === draggingFrom;
      const { file, rank } = jieqiCoordOf(square as JieqiSquare);
      const { x, y } = intersection(file, rank, perspective);
      if (entry.faceDown) {
        return renderXiangqiPieceGlyphed({ color: entry.color, role: 'soldier' }, pieceSet, {
          ariaLabel: `${entry.color} hidden piece`,
          className: dragSource ? 'jieqi-piece jieqi-piece--drag-source' : 'jieqi-piece',
          shrouded: true,
          shroudedStyle: 'back',
          x: x - PIECE_SIZE / 2,
          y: y - PIECE_SIZE / 2,
          size: PIECE_SIZE,
        });
      }
      // A revealed soldier past the river draws with the promoted-soldier art,
      // same as the standard xiangqi board (red owns ranks 1-5, black 6-10).
      const crossed = entry.role === 'soldier' && (entry.color === 'red' ? rank >= 6 : rank <= 5);
      return renderXiangqiPieceGlyphed({ color: entry.color, role: entry.role }, pieceSet, {
        ariaLabel: `${entry.color} ${entry.role}`,
        className: dragSource ? 'jieqi-piece jieqi-piece--drag-source' : 'jieqi-piece',
        shrouded: false,
        x: x - PIECE_SIZE / 2,
        y: y - PIECE_SIZE / 2,
        size: PIECE_SIZE,
        crossed,
      });
    })
    .join('');
}

function selectionRing(selection: JieqiSquare | null, perspective: JieqiColor): string {
  if (!selection) return '';
  const { file, rank } = jieqiCoordOf(selection);
  const { x, y } = intersection(file, rank, perspective);
  return `<circle class="jieqi-selection" cx="${x}" cy="${y}" r="${RING_SELECTION}"/>`;
}

function moveHints(
  view: JieqiPlayerView,
  moves: readonly JieqiMove[],
  perspective: JieqiColor,
): string {
  return moves
    .map((move) => {
      const { file, rank } = jieqiCoordOf(move.to);
      const { x, y } = intersection(file, rank, perspective);
      const capture = view.board[move.to] !== undefined;
      return capture
        ? `<circle class="jieqi-hint-capture" cx="${x}" cy="${y}" r="${RING_CAPTURE}"/>`
        : `<circle class="jieqi-hint" cx="${x}" cy="${y}" r="10"/>`;
    })
    .join('');
}

function lastMoveMarkers(view: JieqiPlayerView, perspective: JieqiColor): string {
  if (!view.lastMove) return '';
  return [view.lastMove.from, view.lastMove.to]
    .map((sq) => {
      const { file, rank } = jieqiCoordOf(sq);
      const { x, y } = intersection(file, rank, perspective);
      return `<circle class="jieqi-last" cx="${x}" cy="${y}" r="${RING_LAST}"/>`;
    })
    .join('');
}

function hitLayer(
  perspective: JieqiColor,
  view: JieqiPlayerView,
  moves: readonly JieqiMove[],
): string {
  const targets = new Map<JieqiSquare, { capture: boolean }>();
  for (const move of moves) targets.set(move.to, { capture: view.board[move.to] !== undefined });
  const parts: string[] = [];
  for (let f = 0; f < FILES; f += 1) {
    for (let r = 1; r <= RANKS; r += 1) {
      const sq = jieqiSquareOf(f, r);
      const { x, y } = intersection(f, r, perspective);
      const target = targets.get(sq);
      const marker = target
        ? target.capture
          ? `<circle class="jieqi-hint-capture" cx="${x}" cy="${y}" r="${RING_CAPTURE}"/>`
          : `<circle class="jieqi-hint" cx="${x}" cy="${y}" r="10"/>`
        : '';
      const hover = target
        ? `<circle class="jieqi-target-hover" cx="${x}" cy="${y}" r="${RING_LAST}"/>`
        : '';
      parts.push(
        `<g data-square="${sq}" class="jieqi-hit${target ? ' jieqi-hit--target' : ''}">${hover}${marker}<rect x="${x - HIT_HALF}" y="${y - HIT_HALF}" width="${HIT_HALF * 2}" height="${HIT_HALF * 2}"/></g>`,
      );
    }
  }
  return parts.join('');
}

let stylesInstalled = false;

export function installJieqiBoardStyles(): void {
  if (stylesInstalled) return;
  stylesInstalled = true;
  const style = document.createElement('style');
  style.textContent = `
    .jieqi-board {
      display: block;
      width: 100%;
      height: auto;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
    }
    .jieqi-board-bg { fill: var(--mini-xq-board-bg, #f5dca8); }
    .jieqi-grid line {
      stroke: var(--mini-xq-grid, #5a3a14);
      stroke-width: 1.2;
    }
    .jieqi-selection { fill: rgba(31, 111, 91, 0.32); stroke: none; pointer-events: none; }
    .jieqi-hint { fill: rgba(31, 111, 91, 0.72); opacity: 0.78; pointer-events: none; }
    .jieqi-hint-capture {
      fill: none; stroke: rgba(31, 111, 91, 0.48); stroke-width: 3; pointer-events: none;
    }
    .jieqi-target-hover {
      fill: rgba(31, 111, 91, 0.3);
      opacity: 0;
      pointer-events: none;
    }
    .jieqi-hit--target:hover .jieqi-target-hover {
      opacity: 1;
    }
    .jieqi-hit--target:hover .jieqi-hint,
    .jieqi-hit--target:hover .jieqi-hint-capture {
      opacity: 0;
    }
    .jieqi-last {
      fill: rgba(250, 204, 21, 0.22); stroke: rgba(180, 83, 9, 0.55);
      stroke-width: 2; pointer-events: none;
    }
    .jieqi-piece { pointer-events: none; filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.2)); }
    .jieqi-piece--drag-source { opacity: 0.34; }
    .jieqi-hit rect { fill: transparent; cursor: pointer; }
  `;
  document.head.append(style);
}
