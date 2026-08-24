// Lightweight client-side Mini Xiangqi game replay. One 7x7 board, stepped
// through a move list by replaying through the rules kernel — no per-ply SVG is
// shipped, each position is rendered on demand. Sibling of xiangqi-replay.ts;
// first used by the Mini Xiangqi Rules article to show a strong engine game.

import {
  applyMiniXiangqiMove,
  createInitialMiniXiangqiState,
  getMiniXiangqiPlayerView,
  type MiniXiangqiBoard,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiMove,
  type MiniXiangqiPlayerView,
  type MiniXiangqiSquare,
  miniXiangqiCoordOf,
  miniXiangqiSquareOf,
  type XiangqiPiece,
} from '@mistboard/game';
import type { ArticleLang } from './article-i18n.js';
import { tokenPieceSize } from './board-metrics.js';
import { replayStepperCopy } from './replay-stepper-copy.js';
import { readStoredXiangqiPieceSet, xiangqiAppearanceChangedEvent } from './theme.js';
import { renderXiangqiPieceGlyphed } from './xiangqi-piece-sets.js';

// Geometry/colours mirror the static Mini Xiangqi diagrams in articles-data.ts
// (which reuse the full-Xiangqi diagram scale) so the replay board is visually
// identical to the rules diagrams on the same page.
const CELL = 31;
const MARGIN = 18;
const PIECE = tokenPieceSize(CELL);
const PAD = 4;
const FILES = 7;
const RANKS = 7;
const BOARD_W = MARGIN * 2 + (FILES - 1) * CELL;
const BOARD_H = MARGIN * 2 + (RANKS - 1) * CELL;
const RADIUS = 8;
const ARROW = '#15781B';

export type MiniXiangqiReplaySpec = {
  // Space-separated coordinate tokens (e.g. "b1b4 b7b5 ..."), files a-g and
  // ranks 1-7 with rank 1 = Red's back rank. This is exactly Mistboard's
  // Mini Xiangqi square notation, so each token splits directly into from/to.
  moves: string;
  red: string;
  black: string;
  event: string;
  perspective?: MiniXiangqiColor;
  // 'single' (default) shows one full-information board. 'triptych' shows the
  // Dark Mini Xiangqi fog comparison — Red's view / server truth / Black's view
  // — stepped together, the same three-angle layout the static fog diagrams use.
  views?: 'single' | 'triptych';
  // Shown on the final ply. The records stop at the mating move, so the rules
  // kernel still reports "playing"; the result is supplied explicitly.
  resultText: string;
};

export type MiniXiangqiReplayController = { destroy: () => void };

function pointXY(
  file: number,
  rank: number,
  perspective: MiniXiangqiColor,
): { x: number; y: number } {
  const row = perspective === 'red' ? RANKS - rank : rank - 1;
  return { x: MARGIN + file * CELL, y: MARGIN + row * CELL };
}

function palaceBandLayer(perspective: MiniXiangqiColor): string {
  return (
    [
      [1, 3],
      [5, 7],
    ] as const
  )
    .map(([loRank, hiRank]) => {
      const a = pointXY(2, hiRank, perspective);
      const b = pointXY(4, loRank, perspective);
      return `<rect x="${Math.min(a.x, b.x)}" y="${Math.min(a.y, b.y)}" width="${Math.abs(b.x - a.x)}" height="${Math.abs(b.y - a.y)}" class="xq-diagram-palace-band"/>`;
    })
    .join('');
}

function gridSvg(perspective: MiniXiangqiColor): string {
  const parts: string[] = [
    `<rect x="0" y="0" width="${BOARD_W}" height="${BOARD_H}" rx="${RADIUS}" class="xq-diagram-bg"/>`,
    palaceBandLayer(perspective),
  ];
  const left = MARGIN;
  const right = MARGIN + (FILES - 1) * CELL;
  const top = MARGIN;
  const bottom = MARGIN + (RANKS - 1) * CELL;
  for (let r = 0; r < RANKS; r += 1) {
    const y = top + r * CELL;
    parts.push(
      `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="xq-diagram-line" stroke-width="1"/>`,
    );
  }
  for (let f = 0; f < FILES; f += 1) {
    const x = left + f * CELL;
    parts.push(
      `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" class="xq-diagram-line" stroke-width="1"/>`,
    );
  }
  // Palace diagonals: files c-e (indices 2-4), ranks 1-3 (Red) and 5-7 (Black).
  for (const [loRank, hiRank] of [
    [1, 3],
    [5, 7],
  ] as const) {
    const a = pointXY(2, hiRank, perspective);
    const b = pointXY(4, loRank, perspective);
    const c = pointXY(4, hiRank, perspective);
    const d = pointXY(2, loRank, perspective);
    parts.push(
      `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="xq-diagram-line" stroke-width="1"/>`,
    );
    parts.push(
      `<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}" class="xq-diagram-line" stroke-width="1"/>`,
    );
  }
  return parts.join('');
}

function piecesSvg(board: MiniXiangqiBoard, perspective: MiniXiangqiColor): string {
  return Object.entries(board)
    .map(([sq, piece]) => {
      if (!piece) return '';
      const { file, rank } = miniXiangqiCoordOf(sq as MiniXiangqiSquare);
      const { x, y } = pointXY(file, rank, perspective);
      return renderXiangqiPieceGlyphed(piece as XiangqiPiece, readStoredXiangqiPieceSet(), {
        x: x - PIECE / 2,
        y: y - PIECE / 2,
        size: PIECE,
      });
    })
    .join('');
}

function arrowSvg(move: MiniXiangqiMove, perspective: MiniXiangqiColor, id: string): string {
  const from = miniXiangqiCoordOf(move.from);
  const to = miniXiangqiCoordOf(move.to);
  const a = pointXY(from.file, from.rank, perspective);
  const b = pointXY(to.file, to.rank, perspective);
  return [
    `<defs><marker id="${id}" markerWidth="4" markerHeight="4" refX="2.05" refY="2" orient="auto" overflow="visible" markerUnits="strokeWidth"><path d="M0,0 V4 L3,2 Z" fill="${ARROW}"/></marker></defs>`,
    `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${ARROW}" stroke-width="5.25" stroke-linecap="round" opacity="0.38" marker-end="url(#${id})"/>`,
  ].join('');
}

function boardSvg(
  board: MiniXiangqiBoard,
  lastMove: MiniXiangqiMove | undefined,
  perspective: MiniXiangqiColor,
  key: number,
): string {
  const pw = BOARD_W + PAD * 2;
  const ph = BOARD_H + PAD * 2;
  const body = [
    gridSvg(perspective),
    piecesSvg(board, perspective),
    lastMove ? arrowSvg(lastMove, perspective, `mxqr-arrow-${key}`) : '',
  ].join('');
  return `<svg class="xq-article-svg" data-xq-layout="single" style="--xq-svg-width: ${pw}px" viewBox="0 0 ${pw} ${ph}" role="img" xmlns="http://www.w3.org/2000/svg" aria-label="Mini Xiangqi board"><g transform="translate(${PAD} ${PAD})">${body}</g></svg>`;
}

// --- Fog triptych (Dark Mini Xiangqi) ---------------------------------------
// All three cells share one orientation (Red at the bottom, like the static fog
// diagrams); only the visibility and pieces differ per cell. The move arrow is
// drawn on the server-truth board only — a view board never reveals a move its
// side could not see.
const TRI_LABEL_H = 20;
const TRI_GAP = 22;
const TRI_FOG_OVERLAP = 0.5;

function fogLayerSvg(view: MiniXiangqiPlayerView, clipId: string): string {
  const visible = new Set(view.visibleSquares);
  const parts: string[] = [];
  for (let file = 0; file < FILES; file += 1) {
    for (let rank = 1; rank <= RANKS; rank += 1) {
      const sq = miniXiangqiSquareOf(file, rank);
      if (visible.has(sq)) continue;
      const { x, y } = pointXY(file, rank, 'red');
      const row = RANKS - rank;
      const left = file === 0 ? 0 : x - CELL / 2 - TRI_FOG_OVERLAP;
      const right = file === FILES - 1 ? BOARD_W : x + CELL / 2 + TRI_FOG_OVERLAP;
      const top = row === 0 ? 0 : y - CELL / 2 - TRI_FOG_OVERLAP;
      const bottom = row === RANKS - 1 ? BOARD_H : y + CELL / 2 + TRI_FOG_OVERLAP;
      parts.push(`M ${left} ${top} H ${right} V ${bottom} H ${left} Z`);
    }
  }
  if (parts.length === 0) return '';
  return [
    `<defs><clipPath id="${clipId}"><rect x="0" y="0" width="${BOARD_W}" height="${BOARD_H}" rx="${RADIUS}"/></clipPath></defs>`,
    `<path d="${parts.join(' ')}" class="xq-diagram-fog" clip-path="url(#${clipId})"/>`,
  ].join('');
}

// Pieces as the viewer sees them: own and revealed pieces by glyph, shrouded
// blockers/screens as a neutral ? marker in the owner's colour.
function viewPiecesSvg(view: MiniXiangqiPlayerView): string {
  return Object.entries(view.board)
    .map(([sq, entry]) => {
      if (!entry) return '';
      const { file, rank } = miniXiangqiCoordOf(sq as MiniXiangqiSquare);
      const { x, y } = pointXY(file, rank, 'red');
      const piece = (
        entry.shrouded ? { color: entry.color, role: 'soldier' } : entry.piece
      ) as XiangqiPiece;
      return renderXiangqiPieceGlyphed(piece, readStoredXiangqiPieceSet(), {
        x: x - PIECE / 2,
        y: y - PIECE / 2,
        size: PIECE,
        shrouded: entry.shrouded,
      });
    })
    .join('');
}

function triCellSvg(opts: {
  x: number;
  label: string;
  key: number;
  side: 'r' | 't' | 'b';
  view?: MiniXiangqiPlayerView;
  board?: MiniXiangqiBoard;
  arrow?: MiniXiangqiMove;
}): string {
  const layers: string[] = [gridSvg('red')];
  if (opts.view) {
    layers.push(fogLayerSvg(opts.view, `mxqr-fog-${opts.side}-${opts.key}`));
    layers.push(viewPiecesSvg(opts.view));
  } else if (opts.board) {
    layers.push(piecesSvg(opts.board, 'red'));
    if (opts.arrow) layers.push(arrowSvg(opts.arrow, 'red', `mxqr-tri-arrow-${opts.key}`));
  }
  return `<g transform="translate(${opts.x} 0)"><text x="${BOARD_W / 2}" y="11" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#5f4a2c" text-anchor="middle">${opts.label}</text><g transform="translate(0 ${TRI_LABEL_H})">${layers.join('')}</g></g>`;
}

function triptychSvg(
  state: MiniXiangqiGameState,
  lastMove: MiniXiangqiMove | undefined,
  key: number,
): string {
  const n = 3;
  const totalW = BOARD_W * n + TRI_GAP * (n - 1) + PAD * 2;
  const totalH = BOARD_H + TRI_LABEL_H + PAD * 2;
  const step = BOARD_W + TRI_GAP;
  const body = [
    triCellSvg({
      x: 0,
      label: "RED'S VIEW",
      key,
      side: 'r',
      view: getMiniXiangqiPlayerView(state, 'red'),
    }),
    triCellSvg({
      x: step,
      label: 'SERVER TRUTH',
      key,
      side: 't',
      board: state.board,
      arrow: lastMove,
    }),
    triCellSvg({
      x: step * 2,
      label: "BLACK'S VIEW",
      key,
      side: 'b',
      view: getMiniXiangqiPlayerView(state, 'black'),
    }),
  ].join('');
  return `<svg class="xq-article-svg" data-xq-layout="wide" style="--xq-svg-width: ${totalW}px" viewBox="0 0 ${totalW} ${totalH}" role="img" xmlns="http://www.w3.org/2000/svg" aria-label="Dark Mini Xiangqi: Red's view, server truth, Black's view"><g transform="translate(${PAD} ${PAD})">${body}</g></svg>`;
}

function tokenToMove(tok: string): MiniXiangqiMove {
  return { from: tok.slice(0, 2) as MiniXiangqiSquare, to: tok.slice(2, 4) as MiniXiangqiSquare };
}

export function mountMiniXiangqiReplay(
  host: HTMLElement,
  spec: MiniXiangqiReplaySpec,
  options: { lang?: ArticleLang } = {},
): MiniXiangqiReplayController {
  const copy = replayStepperCopy(options.lang, 'xiangqi');
  const perspective = spec.perspective ?? 'red';
  const triptych = spec.views === 'triptych';
  const moves = spec.moves
    .trim()
    .split(/\s+/)
    .filter((t) => /^[a-g][1-7][a-g][1-7]$/.test(t))
    .map(tokenToMove);

  // Replay once; cache every position so stepping is instant. The progress
  // clock is disabled so the full record always plays out — the recorded game
  // ends in mate, not by the no-progress rule.
  const states: MiniXiangqiGameState[] = [createInitialMiniXiangqiState('mxq-replay')];
  for (const move of moves) {
    states.push(
      applyMiniXiangqiMove(states[states.length - 1]!, move, { progressClockLimit: Infinity }),
    );
  }
  const total = moves.length;

  host.classList.add('xq-replay', 'stepper');
  host.tabIndex = 0;

  const header = document.createElement('div');
  header.className = 'xq-replay-header';
  const headerPlayers = document.createElement('div');
  headerPlayers.textContent = `${spec.red}${copy.firstRole} vs ${spec.black}${copy.secondRole}`;
  const headerEvent = document.createElement('div');
  headerEvent.className = 'xq-replay-header-event';
  headerEvent.textContent = spec.event;
  header.append(headerPlayers, headerEvent);

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
  const first = mkButton('⏮', copy.firstMove);
  const prev = mkButton('←', copy.previousMove);
  prev.classList.add('stepper-button-prev');
  const counter = document.createElement('span');
  counter.className = 'stepper-counter';
  const next = mkButton('→', copy.nextMove);
  next.classList.add('stepper-button-next');
  const last = mkButton('⏭', copy.lastMove);
  controls.append(first, prev, counter, next, last);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'xq-replay-slider';
  slider.min = '0';
  slider.max = String(total);
  slider.step = '1';
  slider.setAttribute('aria-label', copy.sliderLabel);

  const narrative = document.createElement('div');
  narrative.className = 'stepper-narrative';

  host.append(header, frame, controls, slider, narrative);

  let index = 0;
  function render(): void {
    const lastMove = index > 0 ? moves[index - 1] : undefined;
    frame.innerHTML = triptych
      ? triptychSvg(states[index]!, lastMove, index)
      : boardSvg(states[index]!.board, lastMove, perspective, index);
    counter.textContent = index === 0 ? copy.start : `${index} / ${total}`;
    first.disabled = index === 0;
    prev.disabled = index === 0;
    next.disabled = index === total;
    last.disabled = index === total;
    slider.value = String(index);
    if (index === 0) {
      narrative.textContent = copy.intro;
    } else if (index === total) {
      narrative.textContent = spec.resultText;
    } else {
      const mv = moves[index - 1]!;
      const mover = index % 2 === 1 ? copy.first : copy.second;
      narrative.textContent = `${copy.movePrefix(Math.ceil(index / 2))} · ${mover}: ${mv.from}–${mv.to}`;
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
  // changes (board theme reacts through CSS, like the static diagrams).
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
