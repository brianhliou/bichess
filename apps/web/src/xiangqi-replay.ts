// Lightweight client-side xiangqi game replay. One board, stepped through a
// move list by replaying through the rules kernel — no per-ply SVG is shipped,
// each position is rendered on demand. Reusable game viewer; first used by the
// Xiangqi Rules article to show a full historical game.
import {
  applyMove as applyXiangqiMove,
  createInitialXiangqiState,
  type XiangqiBoard,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiPiece,
  type XiangqiSquare,
} from '@mistboard/game';
import { tokenPieceSize } from './board-metrics.js';
import { readStoredXiangqiPieceSet, xiangqiAppearanceChangedEvent } from './theme.js';
import { renderXiangqiPieceGlyphed } from './xiangqi-piece-sets.js';

// Geometry/colours mirror the static xiangqi diagrams in articles-data.ts so
// the replay board is visually identical to the rules diagrams.
const CELL = 31;
const MARGIN = 18;
const PIECE = tokenPieceSize(CELL);
const PAD = 4;
const BOARD_W = MARGIN * 2 + 8 * CELL;
const BOARD_H = MARGIN * 2 + 9 * CELL;
const RADIUS = 8;
const ARROW = '#15781B';

export type XiangqiReplaySpec = {
  // Space-separated ICCS coordinate tokens (e.g. "h2e2 h9g7 ..."). ICCS ranks
  // are 0-9 with 0 = Red's back rank; engine ranks are 1-10, so rank + 1.
  iccs: string;
  red: string;
  black: string;
  event: string;
  // Optional standalone title, used when the record is a named study or manual
  // line rather than a game between two players. When set, the header reads
  // "<title> · <event>" instead of "<red> (Red) vs <black> (Black) · <event>".
  title?: string;
  perspective?: XiangqiColor;
  // Shown on the final ply (the records stop at the mating move, so the rules
  // kernel still reports "playing"; the result is supplied explicitly).
  resultText: string;
};

export type XiangqiReplayController = { destroy: () => void };

function pointXY(file: number, rank: number, perspective: XiangqiColor): { x: number; y: number } {
  const row = perspective === 'red' ? 10 - rank : rank - 1;
  return { x: MARGIN + file * CELL, y: MARGIN + row * CELL };
}

function coord(square: XiangqiSquare): { file: number; rank: number } {
  return { file: 'abcdefghi'.indexOf(square[0]!), rank: Number(square.slice(1)) };
}

function gridSvg(perspective: XiangqiColor): string {
  const parts: string[] = [
    `<rect x="0" y="0" width="${BOARD_W}" height="${BOARD_H}" rx="${RADIUS}" class="xq-diagram-bg"/>`,
  ];
  const left = MARGIN;
  const right = left + 8 * CELL;
  const top = MARGIN;
  const bottom = top + 9 * CELL;
  const riverTop = top + 4 * CELL;
  const riverBottom = top + 5 * CELL;
  for (let r = 0; r < 10; r += 1) {
    const y = top + r * CELL;
    parts.push(
      `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="xq-diagram-line" stroke-width="1"/>`,
    );
  }
  for (let f = 0; f < 9; f += 1) {
    const x = left + f * CELL;
    if (f === 0 || f === 8) {
      parts.push(
        `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" class="xq-diagram-line" stroke-width="1"/>`,
      );
    } else {
      parts.push(
        `<line x1="${x}" y1="${top}" x2="${x}" y2="${riverTop}" class="xq-diagram-line" stroke-width="1"/>`,
      );
      parts.push(
        `<line x1="${x}" y1="${riverBottom}" x2="${x}" y2="${bottom}" class="xq-diagram-line" stroke-width="1"/>`,
      );
    }
  }
  for (const palace of [
    { fileMin: 3, fileMax: 5, rankBack: 1 },
    { fileMin: 3, fileMax: 5, rankBack: 8 },
  ]) {
    const topRank = palace.rankBack === 1 ? 3 : 10;
    const bottomRank = palace.rankBack;
    const a = pointXY(palace.fileMin, topRank, perspective);
    const b = pointXY(palace.fileMax, bottomRank, perspective);
    const c = pointXY(palace.fileMax, topRank, perspective);
    const d = pointXY(palace.fileMin, bottomRank, perspective);
    parts.push(
      `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="xq-diagram-line" stroke-width="1"/>`,
    );
    parts.push(
      `<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}" class="xq-diagram-line" stroke-width="1"/>`,
    );
  }
  parts.push(
    `<text x="${left + 4 * CELL}" y="${(riverTop + riverBottom) / 2 + 1}" font-family="serif" font-size="16" class="xq-diagram-ink xq-diagram-river-label" text-anchor="middle" dominant-baseline="central">楚 河   漢 界</text>`,
  );
  return parts.join('');
}

function piecesSvg(board: XiangqiBoard, perspective: XiangqiColor): string {
  return Object.entries(board)
    .map(([sq, piece]) => {
      if (!piece) return '';
      const { file, rank } = coord(sq as XiangqiSquare);
      const { x, y } = pointXY(file, rank, perspective);
      return renderXiangqiPieceGlyphed(piece as XiangqiPiece, readStoredXiangqiPieceSet(), {
        x: x - PIECE / 2,
        y: y - PIECE / 2,
        size: PIECE,
      });
    })
    .join('');
}

function arrowSvg(move: XiangqiMove, perspective: XiangqiColor, id: string): string {
  const from = coord(move.from);
  const to = coord(move.to);
  const a = pointXY(from.file, from.rank, perspective);
  const b = pointXY(to.file, to.rank, perspective);
  return [
    `<defs><marker id="${id}" markerWidth="4" markerHeight="4" refX="2.05" refY="2" orient="auto" overflow="visible" markerUnits="strokeWidth"><path d="M0,0 V4 L3,2 Z" fill="${ARROW}"/></marker></defs>`,
    `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${ARROW}" stroke-width="5.25" stroke-linecap="round" opacity="0.38" marker-end="url(#${id})"/>`,
  ].join('');
}

function boardSvg(
  board: XiangqiBoard,
  lastMove: XiangqiMove | undefined,
  perspective: XiangqiColor,
  key: number,
): string {
  const pw = BOARD_W + PAD * 2;
  const ph = BOARD_H + PAD * 2;
  const body = [
    gridSvg(perspective),
    piecesSvg(board, perspective),
    lastMove ? arrowSvg(lastMove, perspective, `xqr-arrow-${key}`) : '',
  ].join('');
  return `<svg class="xq-article-svg" data-xq-layout="single" style="--xq-svg-width: ${pw}px" viewBox="0 0 ${pw} ${ph}" role="img" xmlns="http://www.w3.org/2000/svg"><g transform="translate(${PAD} ${PAD})">${body}</g></svg>`;
}

function iccsToMove(tok: string): XiangqiMove {
  const conv = (c: string) => `${c[0]}${Number(c[1]) + 1}` as XiangqiSquare;
  return { from: conv(tok.slice(0, 2)), to: conv(tok.slice(2, 4)) };
}

export function mountXiangqiReplay(
  host: HTMLElement,
  spec: XiangqiReplaySpec,
): XiangqiReplayController {
  const perspective = spec.perspective ?? 'red';
  const moves = spec.iccs
    .trim()
    .split(/\s+/)
    .filter((t) => /^[a-i]\d[a-i]\d$/.test(t))
    .map(iccsToMove);

  // Replay once; cache every position so stepping is instant.
  const states: XiangqiGameState[] = [createInitialXiangqiState('xq-replay')];
  for (const move of moves) {
    states.push(applyXiangqiMove(states[states.length - 1]!, move));
  }
  const total = moves.length;

  host.classList.add('xq-replay', 'stepper');
  host.tabIndex = 0;

  const header = document.createElement('div');
  header.className = 'xq-replay-header';
  header.textContent = spec.title
    ? `${spec.title} · ${spec.event}`
    : `${spec.red} (Red) vs ${spec.black} (Black) · ${spec.event}`;

  const frame = document.createElement('div');
  frame.className = 'raw-svg-stepper-frame raw-svg-stepper-frame-xq';

  const controls = document.createElement('div');
  controls.className = 'stepper-controls';
  const mkButton = (label: string, aria: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'stepper-button';
    b.setAttribute('aria-label', aria);
    b.textContent = label;
    return b;
  };
  const first = mkButton('⏮', 'First move');
  const prev = mkButton('←', 'Previous move');
  prev.classList.add('stepper-button-prev');
  const counter = document.createElement('span');
  counter.className = 'stepper-counter';
  const next = mkButton('→', 'Next move');
  next.classList.add('stepper-button-next');
  const last = mkButton('⏭', 'Last move');
  controls.append(first, prev, counter, next, last);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'xq-replay-slider';
  slider.min = '0';
  slider.max = String(total);
  slider.step = '1';
  slider.setAttribute('aria-label', 'Move');

  const narrative = document.createElement('div');
  narrative.className = 'stepper-narrative';

  host.append(header, frame, controls, slider, narrative);

  let index = 0;
  function render(): void {
    const lastMove = index > 0 ? moves[index - 1] : undefined;
    frame.innerHTML = boardSvg(states[index]!.board, lastMove, perspective, index);
    counter.textContent = index === 0 ? 'Start' : `${index} / ${total}`;
    first.disabled = index === 0;
    prev.disabled = index === 0;
    next.disabled = index === total;
    last.disabled = index === total;
    slider.value = String(index);
    if (index === 0) {
      narrative.textContent = 'Step through the moves. Red moves first.';
    } else if (index === total) {
      narrative.textContent = spec.resultText;
    } else {
      const mv = moves[index - 1]!;
      const mover = index % 2 === 1 ? 'Red' : 'Black';
      narrative.textContent = `Move ${Math.ceil(index / 2)} · ${mover}: ${mv.from}–${mv.to}`;
    }
  }

  function goto(target: number): void {
    const clamped = Math.max(0, Math.min(total, target));
    if (clamped !== index) {
      index = clamped;
      render();
    }
  }
  const onFirst = () => goto(0);
  const onPrev = () => goto(index - 1);
  const onNext = () => goto(index + 1);
  const onLast = () => goto(total);
  const onSlider = () => goto(Number(slider.value));
  first.addEventListener('click', onFirst);
  prev.addEventListener('click', onPrev);
  next.addEventListener('click', onNext);
  last.addEventListener('click', onLast);
  slider.addEventListener('input', onSlider);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      onPrev();
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      onNext();
      e.preventDefault();
    }
  };
  host.addEventListener('keydown', onKey);
  // Piece set is inline glyphs, so re-render the current ply when the picker
  // changes (board + fog react through CSS, like the static diagrams).
  const onAppearance = () => render();
  window.addEventListener(xiangqiAppearanceChangedEvent, onAppearance);

  render();

  return {
    destroy(): void {
      first.removeEventListener('click', onFirst);
      prev.removeEventListener('click', onPrev);
      next.removeEventListener('click', onNext);
      last.removeEventListener('click', onLast);
      slider.removeEventListener('input', onSlider);
      host.removeEventListener('keydown', onKey);
      window.removeEventListener(xiangqiAppearanceChangedEvent, onAppearance);
      host.replaceChildren();
      host.classList.remove('xq-replay', 'stepper');
    },
  };
}
