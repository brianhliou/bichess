// Lightweight client-side Drop Mini Xiangqi replay. One 7x7 board plus both
// reserves, stepped through a compact move list by replaying the real rules
// kernel.
import {
  applyDropMiniXiangqiMove,
  createInitialDropMiniXiangqiState,
  type DropMiniXiangqiDropRole,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiMove,
  type DropMiniXiangqiRules,
  getDropMiniXiangqiPlayerView,
  getLegalDropMiniXiangqiMoves,
  isDropMiniXiangqiDropMove,
  isLegalDropMiniXiangqiMove,
  type MiniXiangqiBoard,
  type MiniXiangqiColor,
  type MiniXiangqiMove,
  type MiniXiangqiSquare,
  miniXiangqiCoordOf,
  oppositeMiniXiangqiColor,
  type XiangqiPiece,
} from '@mistboard/game';
import './drop-mini-xiangqi.css';
import { tokenPieceSize } from './board-metrics.js';
import { dropMiniXiangqiMoveLabel, fillDropMiniXiangqiReserve } from './drop-mini-xiangqi-view.js';
import { readStoredXiangqiPieceSet, xiangqiAppearanceChangedEvent } from './theme.js';
import { renderXiangqiPieceGlyphed } from './xiangqi-piece-sets.js';

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
const DROP_MARK = '#c8792d';

export type DropMiniXiangqiReplaySpec = {
  // Space-separated coordinate tokens. Board moves use from+to, for example
  // "c2c3". Drops use R/H/C/S for chariot/horse/cannon/soldier, for example
  // "C@d4". Ranks 1-7 keep Red's back rank at rank 1.
  moves: string;
  red: string;
  black: string;
  event: string;
  perspective?: MiniXiangqiColor;
  rules?: DropMiniXiangqiRules;
  resultText: string;
};

export type DropMiniXiangqiReplayRecord = {
  tokens: string[];
  moves: DropMiniXiangqiMove[];
  states: DropMiniXiangqiGameState[];
};

export type DropMiniXiangqiReplayController = { destroy: () => void };

const DROP_ROLE_BY_LETTER: Record<string, DropMiniXiangqiDropRole> = {
  C: 'cannon',
  H: 'horse',
  R: 'chariot',
  S: 'soldier',
};

function tokenizeMoves(moves: string): string[] {
  return moves
    .trim()
    .split(/\s+/)
    .map((raw) => raw.replace(/^\d+\./, '').replace(/[,.]+$/g, ''))
    .filter(Boolean);
}

function tokenToMove(token: string, ply: number): DropMiniXiangqiMove {
  const board = /^([a-g][1-7])([a-g][1-7])$/.exec(token);
  if (board) {
    return {
      from: board[1] as MiniXiangqiSquare,
      to: board[2] as MiniXiangqiSquare,
    };
  }

  const drop = /^([RHCS])@([a-g][1-7])$/i.exec(token);
  if (drop) {
    const role = DROP_ROLE_BY_LETTER[drop[1]!.toUpperCase()];
    if (!role) throw new Error(`Invalid Drop Mini Xiangqi drop token at ply ${ply}: ${token}`);
    return { drop: role, to: drop[2] as MiniXiangqiSquare };
  }

  throw new Error(`Invalid Drop Mini Xiangqi replay token at ply ${ply}: ${token}`);
}

export function replayDropMiniXiangqiNotation(
  movesText: string,
  rules?: DropMiniXiangqiRules,
): DropMiniXiangqiReplayRecord {
  const tokens = tokenizeMoves(movesText);
  const moves: DropMiniXiangqiMove[] = [];
  const states: DropMiniXiangqiGameState[] = [
    createInitialDropMiniXiangqiState('drop-mini-xiangqi-replay', rules),
  ];

  for (const [index, token] of tokens.entries()) {
    const state = states[states.length - 1]!;
    const move = tokenToMove(token, index + 1);
    if (!isLegalDropMiniXiangqiMove(state, move)) {
      const labels = getLegalDropMiniXiangqiMoves(state)
        .slice(0, 16)
        .map(dropMiniXiangqiMoveLabel)
        .join(', ');
      throw new Error(
        `Drop Mini Xiangqi replay token ${token} at ply ${index + 1} is illegal. Legal moves: ${
          labels || 'none'
        }`,
      );
    }
    const next = applyDropMiniXiangqiMove(state, move, { progressClockLimit: Infinity });
    if (next === state) {
      throw new Error(`Drop Mini Xiangqi replay token ${token} at ply ${index + 1} did not apply`);
    }
    moves.push(move);
    states.push(next);
  }

  return { tokens, moves, states };
}

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

function dropMarkSvg(move: DropMiniXiangqiMove, perspective: MiniXiangqiColor): string {
  if (!isDropMiniXiangqiDropMove(move)) return '';
  const to = miniXiangqiCoordOf(move.to);
  const { x, y } = pointXY(to.file, to.rank, perspective);
  return `<circle cx="${x}" cy="${y}" r="${PIECE * 0.72}" fill="none" stroke="${DROP_MARK}" stroke-width="3" opacity="0.72"/>`;
}

function boardSvg(
  board: MiniXiangqiBoard,
  lastMove: DropMiniXiangqiMove | undefined,
  perspective: MiniXiangqiColor,
  key: number,
): string {
  const pw = BOARD_W + PAD * 2;
  const ph = BOARD_H + PAD * 2;
  const body = [
    gridSvg(perspective),
    piecesSvg(board, perspective),
    lastMove && !isDropMiniXiangqiDropMove(lastMove)
      ? arrowSvg(lastMove, perspective, `dmxqr-arrow-${key}`)
      : '',
    lastMove ? dropMarkSvg(lastMove, perspective) : '',
  ].join('');
  return `<svg class="xq-article-svg" data-xq-layout="single" style="--xq-svg-width: ${pw}px" viewBox="0 0 ${pw} ${ph}" role="img" xmlns="http://www.w3.org/2000/svg" aria-label="Drop Mini Xiangqi board"><g transform="translate(${PAD} ${PAD})">${body}</g></svg>`;
}

function reserveHost(labelText: string): { root: HTMLElement; pieces: HTMLElement } {
  const root = document.createElement('div');
  root.className = 'drop-mini-replay-hand';
  const label = document.createElement('span');
  label.className = 'drop-mini-replay-hand-label';
  label.textContent = labelText;
  const pieces = document.createElement('div');
  pieces.className = 'drop-mini-replay-hand-pieces';
  root.append(label, pieces);
  return { root, pieces };
}

function sideName(color: MiniXiangqiColor): string {
  return color === 'red' ? 'Red' : 'Black';
}

export function mountDropMiniXiangqiReplay(
  host: HTMLElement,
  spec: DropMiniXiangqiReplaySpec,
): DropMiniXiangqiReplayController {
  const perspective = spec.perspective ?? 'red';
  const topColor = oppositeMiniXiangqiColor(perspective);
  const bottomColor = perspective;
  const { tokens, moves, states } = replayDropMiniXiangqiNotation(spec.moves, spec.rules);
  const total = moves.length;

  host.classList.add('xq-replay', 'drop-mini-replay', 'stepper', 'notranslate');
  host.setAttribute('translate', 'no');
  host.tabIndex = 0;

  const header = document.createElement('div');
  header.className = 'xq-replay-header';
  const headerPlayers = document.createElement('div');
  headerPlayers.textContent = `${spec.red} (Red) vs ${spec.black} (Black)`;
  const headerEvent = document.createElement('div');
  headerEvent.className = 'xq-replay-header-event';
  headerEvent.textContent = spec.event;
  header.append(headerPlayers, headerEvent);

  const frame = document.createElement('div');
  frame.className =
    'raw-svg-stepper-frame raw-svg-stepper-frame-xq replay-pane drop-mini-replay-frame';
  frame.style.setProperty('--xq-svg-width', `${BOARD_W + PAD * 2}px`);
  const topReserve = reserveHost(`${sideName(topColor)} reserve`);
  const board = document.createElement('div');
  board.className = 'drop-mini-replay-board';
  const bottomReserve = reserveHost(`${sideName(bottomColor)} reserve`);
  frame.append(topReserve.root, board, bottomReserve.root);

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
    const state = states[index]!;
    const view = getDropMiniXiangqiPlayerView(state, perspective);
    const lastMove = index > 0 ? moves[index - 1] : undefined;
    board.innerHTML = boardSvg(state.board, lastMove, perspective, index);
    fillDropMiniXiangqiReserve(topReserve.pieces, view, topColor);
    fillDropMiniXiangqiReserve(bottomReserve.pieces, view, bottomColor);
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
      const mover = index % 2 === 1 ? 'Red' : 'Black';
      narrative.textContent = `Move ${Math.ceil(index / 2)} · ${mover}: ${tokens[index - 1]}`;
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
  window.addEventListener(xiangqiAppearanceChangedEvent, render);

  render();

  return {
    destroy(): void {
      first.removeEventListener('click', onFirst);
      prev.removeEventListener('click', onPrev);
      next.removeEventListener('click', onNext);
      last.removeEventListener('click', onLast);
      slider.removeEventListener('input', onSlider);
      host.removeEventListener('keydown', onKey);
      window.removeEventListener(xiangqiAppearanceChangedEvent, render);
      host.replaceChildren();
      host.classList.remove('xq-replay', 'drop-mini-replay', 'stepper', 'notranslate');
      host.removeAttribute('translate');
    },
  };
}
