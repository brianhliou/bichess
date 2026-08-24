// Lightweight client-side shogi game replay. One board plus compact hands,
// stepped through a western shogi move list by replaying the real rules kernel.
import type { ArticleLang } from './article-i18n.js';
import { replayStepperCopy } from './replay-stepper-copy.js';
import {
  applyShogiMove,
  createInitialShogiState,
  getLegalShogiMoves,
  isShogiDrop,
  type ShogiBoardMove,
  type ShogiColor,
  type ShogiGameState,
  type ShogiHand,
  type ShogiHandRole,
  type ShogiMove,
  type ShogiPieceRole,
  type ShogiPlayerView,
  type ShogiSquare,
  shogiSquareOf,
} from '@mistboard/game';
import { renderShogiBoardSvg, SHOGI_HAND_ORDER, shogiHandKomaSvg } from './shogi-render.js';
import { shogiAppearanceChangedEvent } from './theme.js';

export type ShogiReplaySpec = {
  // Space-separated western shogi notation, e.g. "P-7f P-8d ...". Sente is
  // Black and moves first; Gote is White and moves second.
  notation: string;
  sente: string;
  gote: string;
  event: string;
  perspective?: ShogiColor;
  // Shown on the final ply. Professional records commonly end at resignation,
  // so the rules kernel may still report "playing".
  resultText: string;
};

export type ShogiReplayController = { destroy: () => void };

export type ShogiReplayRecord = {
  tokens: string[];
  moves: ShogiMove[];
  states: ShogiGameState[];
};

const RANKS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const;
const MOVE_RE = /^(\+)?([KRGBSNLP])([1-9][a-i])?([-x*])([1-9][a-i])(\+|=)?$/;

function allShogiSquares(): ShogiSquare[] {
  const squares: ShogiSquare[] = [];
  for (let file = 1; file <= 9; file += 1) {
    for (let rankIndex = 0; rankIndex < RANKS.length; rankIndex += 1) {
      squares.push(shogiSquareOf(file, rankIndex));
    }
  }
  return squares;
}

const EVERY_SQUARE = allShogiSquares();

function truthView(state: ShogiGameState, perspective: ShogiColor): ShogiPlayerView {
  return {
    id: state.id,
    perspective,
    board: state.board,
    hand: state.hands[perspective],
    visibleSquares: EVERY_SQUARE,
    legalMoves: [],
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

function isBoardMove(move: ShogiMove): move is ShogiBoardMove {
  return !isShogiDrop(move);
}

function tokenizeNotation(notation: string): string[] {
  return notation
    .trim()
    .split(/\s+/)
    .map((raw) => raw.replace(/^\d+\./, '').replace(/[,.]+$/g, ''))
    .filter(Boolean);
}

function squareFromNotation(square: string): ShogiSquare {
  return square as ShogiSquare;
}

function candidateLabel(move: ShogiMove): string {
  if (isShogiDrop(move)) return `${move.drop}*${move.to}`;
  return `${move.from}-${move.to}${move.promote ? '+' : ''}`;
}

function parseMoveToken(state: ShogiGameState, token: string, ply: number): ShogiMove {
  const match = MOVE_RE.exec(token);
  if (!match) throw new Error(`Invalid shogi replay token at ply ${ply}: ${token}`);

  const sourcePromoted = Boolean(match[1]);
  const role = match[2] as ShogiPieceRole;
  const from = match[3] ? squareFromNotation(match[3]) : null;
  const action = match[4]!;
  const to = squareFromNotation(match[5]!);
  const promote = match[6] === '+';

  if (action === '*') {
    if (from) throw new Error(`Drop token cannot include a source square at ply ${ply}: ${token}`);
    if (sourcePromoted || promote || role === 'K') {
      throw new Error(`Invalid shogi drop token at ply ${ply}: ${token}`);
    }
    const candidates = getLegalShogiMoves(state)
      .filter(isShogiDrop)
      .filter((move) => move.drop === (role as ShogiHandRole) && move.to === to);
    if (candidates.length !== 1) {
      throw new Error(
        `Shogi replay token ${token} at ply ${ply} matched ${candidates.length} legal drops`,
      );
    }
    return candidates[0]!;
  }

  const candidates = getLegalShogiMoves(state)
    .filter(isBoardMove)
    .filter((move) => {
      const piece = state.board[move.from];
      if (!piece) return false;
      if (piece.role !== role) return false;
      if (piece.promoted !== sourcePromoted) return false;
      if (from && move.from !== from) return false;
      if (move.to !== to) return false;
      return Boolean(move.promote) === promote;
    });

  if (candidates.length !== 1) {
    const labels = candidates.map(candidateLabel).join(', ') || 'none';
    throw new Error(
      `Shogi replay token ${token} at ply ${ply} matched ${candidates.length} legal moves: ${labels}`,
    );
  }
  return candidates[0]!;
}

export function replayShogiNotation(notation: string): ShogiReplayRecord {
  const tokens = tokenizeNotation(notation);
  const moves: ShogiMove[] = [];
  const states: ShogiGameState[] = [createInitialShogiState('shogi-replay')];

  for (const [index, token] of tokens.entries()) {
    const state = states[states.length - 1]!;
    const move = parseMoveToken(state, token, index + 1);
    const next = applyShogiMove(state, move);
    if (next === state) {
      throw new Error(`Shogi replay token ${token} at ply ${index + 1} did not apply`);
    }
    moves.push(move);
    states.push(next);
  }

  return { tokens, moves, states };
}

function boardSvg(
  state: ShogiGameState,
  lastMove: ShogiMove | undefined,
  perspective: ShogiColor,
): string {
  return renderShogiBoardSvg(truthView(state, perspective), {
    perspective,
    showFog: false,
    showCoords: false,
    lastMove,
  });
}

function handKoma(
  role: ShogiHandRole,
  color: ShogiColor,
  count: number,
  pointsUp: boolean,
): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'shogi-replay-hand-koma';
  wrap.innerHTML = shogiHandKomaSvg(role, color, pointsUp);
  const badge = document.createElement('span');
  badge.className = 'shogi-replay-hand-count';
  badge.textContent = String(count);
  wrap.append(badge);
  return wrap;
}

function renderHandStrip(
  host: HTMLElement,
  hand: ShogiHand,
  color: ShogiColor,
  pointsUp: boolean,
  labelText: string,
  emptyText: string,
): void {
  host.replaceChildren();
  const label = document.createElement('span');
  label.className = 'shogi-replay-hand-label';
  label.textContent = labelText;

  const pieces = document.createElement('span');
  pieces.className = 'shogi-replay-hand-pieces';
  const entries = SHOGI_HAND_ORDER.filter((role) => (hand[role] ?? 0) > 0);
  if (entries.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'shogi-replay-hand-empty';
    empty.textContent = emptyText;
    pieces.append(empty);
  } else {
    for (const role of entries) pieces.append(handKoma(role, color, hand[role] ?? 0, pointsUp));
  }
  host.append(label, pieces);
}

export function mountShogiReplay(
  host: HTMLElement,
  spec: ShogiReplaySpec,
  options: { lang?: ArticleLang } = {},
): ShogiReplayController {
  const copy = replayStepperCopy(options.lang, 'shogi');
  const perspective = spec.perspective ?? 'black';
  const topColor: ShogiColor = perspective === 'black' ? 'white' : 'black';
  const bottomColor = perspective;
  const { tokens, moves, states } = replayShogiNotation(spec.notation);
  const total = moves.length;

  host.classList.add('shogi-replay', 'stepper', 'notranslate');
  host.setAttribute('translate', 'no');
  host.tabIndex = 0;

  const header = document.createElement('div');
  header.className = 'shogi-replay-header';
  header.textContent = `${spec.sente}${copy.firstRole} vs ${spec.gote}${copy.secondRole} · ${spec.event}`;

  const stack = document.createElement('div');
  stack.className = 'shogi-replay-board-stack';
  const topHand = document.createElement('div');
  topHand.className = 'shogi-replay-hand shogi-replay-hand-top';
  const frame = document.createElement('div');
  frame.className = 'raw-svg-stepper-frame shogi-replay-frame';
  const bottomHand = document.createElement('div');
  bottomHand.className = 'shogi-replay-hand shogi-replay-hand-bottom';
  stack.append(topHand, frame, bottomHand);

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
  slider.className = 'shogi-replay-slider';
  slider.min = '0';
  slider.max = String(total);
  slider.step = '1';
  slider.setAttribute('aria-label', copy.sliderLabel);

  const narrative = document.createElement('div');
  narrative.className = 'stepper-narrative';

  host.append(header, stack, controls, slider, narrative);

  let index = 0;
  function render(): void {
    const state = states[index]!;
    const lastMove = index > 0 ? moves[index - 1] : undefined;
    frame.innerHTML = boardSvg(state, lastMove, perspective);
    renderHandStrip(
      topHand,
      state.hands[topColor],
      topColor,
      false,
      `${topColor === 'black' ? copy.first : copy.second}${copy.pocket}`,
      copy.noPieces,
    );
    renderHandStrip(
      bottomHand,
      state.hands[bottomColor],
      bottomColor,
      true,
      `${bottomColor === 'black' ? copy.first : copy.second}${copy.pocket}`,
      copy.noPieces,
    );
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
      const mover = index % 2 === 1 ? copy.first : copy.second;
      narrative.textContent = `${copy.movePrefix(index)} · ${mover}: ${tokens[index - 1]}`;
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
  window.addEventListener(shogiAppearanceChangedEvent, render);

  render();

  return {
    destroy(): void {
      first.removeEventListener('click', onFirst);
      prev.removeEventListener('click', onPrev);
      next.removeEventListener('click', onNext);
      last.removeEventListener('click', onLast);
      slider.removeEventListener('input', onSlider);
      host.removeEventListener('keydown', onKey);
      window.removeEventListener(shogiAppearanceChangedEvent, render);
      host.replaceChildren();
      host.classList.remove('shogi-replay', 'stepper', 'notranslate');
      host.removeAttribute('translate');
    },
  };
}
