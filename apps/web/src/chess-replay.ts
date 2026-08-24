// Lightweight client-side chess game replay. One chessground board stepped
// through a move list by replaying through the rules kernel — the game ships as
// a compact UCI string and each position is rendered on demand. The chess
// analogue of xiangqi-replay.ts; first used by the Chess Rules article to show
// a full historical game.

import {
  boardFen,
  hiddenSquareClasses,
  mountBoard,
  setBoardPosition,
} from '@mistboard/board-render/interactive';
import {
  type Color,
  darkChessVariant,
  type GameState,
  type Move,
  moveToAlgebraic,
  type Square,
} from '@mistboard/game';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';
import type { ArticleLang } from './article-i18n.js';
import { chessgroundAnimation } from './board-anim.js';
import { replayStepperCopy } from './replay-stepper-copy.js';

export type ChessReplaySpec = {
  // Space-separated UCI coordinate tokens (e.g. "e2e4 e7e5 ..."). Castling is
  // the king-two-square form (e1g1 / e1c1); promotions carry a trailing piece
  // letter (e.g. "e7e8q").
  uci: string;
  white: string;
  black: string;
  event: string;
  perspective?: Color;
  // Shown on the final ply. The records stop at the last move played, so the
  // rules kernel still reports "playing"; the result is supplied explicitly.
  resultText: string;
  // Render the game as ONE PLAYER SAW IT rather than as full truth. A fog game
  // replayed with both armies visible misrepresents every decision in it, so
  // any Fog of War game shown to a reader should set this. The board is masked
  // to that player's view and hidden squares carry the live room's fog tiles.
  fog?: Color;
  // Per-ply prose, keyed by 1-indexed ply. Shown under the board in place of
  // the bare move label, so a game can be annotated where it matters and left
  // silent everywhere else.
  notes?: Record<number, string>;
};

export type ChessReplayController = { destroy: () => void };

const PROMO: Record<string, Move['promotion']> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
};

function uciToMove(tok: string): Move {
  const move: Move = { from: tok.slice(0, 2) as Square, to: tok.slice(2, 4) as Square };
  const promo = tok[4] ? PROMO[tok[4]] : undefined;
  return promo ? { ...move, promotion: promo } : move;
}

export function mountChessReplay(
  host: HTMLElement,
  spec: ChessReplaySpec,
  options: { lang?: ArticleLang } = {},
): ChessReplayController {
  const copy = replayStepperCopy(options.lang, 'chess');
  const perspective = spec.perspective ?? 'white';
  const moves = spec.uci
    .trim()
    .split(/\s+/)
    .filter((t) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t))
    .map(uciToMove);

  // Replay once; cache every position so stepping is instant. `sans[i]` is the
  // algebraic label for `moves[i]`, computed from the state before the move.
  const states: GameState[] = [darkChessVariant.createInitialState('chess-replay')];
  const sans: string[] = [];
  for (const move of moves) {
    const prev = states[states.length - 1]!;
    sans.push(moveToAlgebraic(prev, move));
    states.push(darkChessVariant.applyMove(prev, move));
  }
  const total = moves.length;

  host.classList.add('chess-replay', 'stepper');
  host.tabIndex = 0;

  const header = document.createElement('div');
  header.className = 'chess-replay-header';
  const players = document.createElement('div');
  players.className = 'chess-replay-players';
  players.textContent = `${spec.white}${copy.firstRole} vs ${spec.black}${copy.secondRole}`;
  const eventLine = document.createElement('div');
  eventLine.className = 'chess-replay-event';
  eventLine.textContent = spec.event;
  header.append(players, eventLine);

  const frame = document.createElement('div');
  frame.className = 'chess-replay-board cg-wrap';

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
  slider.className = 'chess-replay-slider';
  slider.min = '0';
  slider.max = String(total);
  slider.step = '1';
  slider.setAttribute('aria-label', copy.sliderLabel);

  const narrative = document.createElement('div');
  narrative.className = 'stepper-narrative';

  // Move list. Pairs are laid out as "N. white black" rows; every ply is a
  // button that jumps the board, so a reader can scan to the moment a note
  // refers to instead of stepping there one arrow at a time.
  const moveList = document.createElement('ol');
  moveList.className = 'chess-replay-moves';
  const plyButtons: HTMLButtonElement[] = [];
  for (let i = 0; i < total; i += 2) {
    const row = document.createElement('li');
    row.className = 'chess-replay-move-row';
    const no = document.createElement('span');
    no.className = 'chess-replay-move-no';
    no.textContent = `${i / 2 + 1}.`;
    row.append(no);
    for (const ply of [i, i + 1]) {
      if (ply >= total) break;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chess-replay-move';
      b.textContent = sans[ply]!;
      b.addEventListener('click', () => goto(ply + 1));
      plyButtons.push(b);
      row.append(b);
    }
    moveList.append(row);
  }

  const body = document.createElement('div');
  body.className = 'chess-replay-body';
  body.append(frame, moveList);

  host.append(header, body, controls, slider, narrative);

  const api: Api = mountBoard(frame, {
    // pieceAnimation pref (was a hardcoded 180ms); read once at mount.
    animation: chessgroundAnimation(),
    coordinates: false,
    coordinatesOnSquares: false,
    fen: boardFen(states[0]!.board),
    orientation: perspective,
    movable: { free: false, color: undefined, dests: new Map() },
    draggable: { enabled: false },
    selectable: { enabled: false },
    premovable: { enabled: false },
    highlight: { lastMove: true },
    viewOnly: true,
  });

  let index = 0;
  function render(): void {
    const move = index > 0 ? moves[index - 1] : undefined;
    const state = states[index]!;
    if (spec.fog) {
      const view = darkChessVariant.getPlayerView(state, spec.fog);
      setBoardPosition(
        api,
        view.board,
        // preserveFogOnFinished: the last ply of a decided game is exactly the
        // position worth seeing fogged, so do not let the reveal-on-finish
        // default strip the fog off the payoff.
        hiddenSquareClasses(view, perspective, { preserveFogOnFinished: true }),
      );
      api.set({ lastMove: move ? [move.from as cg.Key, move.to as cg.Key] : undefined });
    } else {
      api.set({
        fen: boardFen(state.board),
        lastMove: move ? [move.from as cg.Key, move.to as cg.Key] : undefined,
      });
    }
    plyButtons.forEach((b, i) => {
      b.classList.toggle('is-current', i === index - 1);
    });
    if (index > 0) {
      plyButtons[index - 1]?.scrollIntoView({ block: 'nearest' });
    }
    counter.textContent = index === 0 ? copy.start : `${index} / ${total}`;
    first.disabled = index === 0;
    prev.disabled = index === 0;
    next.disabled = index === total;
    last.disabled = index === total;
    slider.value = String(index);
    if (index === 0) {
      narrative.textContent = copy.intro;
    } else if (index === total) {
      // The last ply is usually the decisive one, so a note on it is the line
      // worth reading; keep the result alongside rather than replacing it.
      const finalNote = spec.notes?.[index];
      narrative.textContent = finalNote ? `${finalNote} ${spec.resultText}` : spec.resultText;
    } else {
      const moveNo = Math.ceil(index / 2);
      const san = sans[index - 1]!;
      const label = index % 2 === 1 ? `${moveNo}. ${san}` : `${moveNo}… ${san}`;
      const note = spec.notes?.[index];
      narrative.textContent = note ? `${label} — ${note}` : label;
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

  render();

  return {
    destroy(): void {
      first.removeEventListener('click', onFirst);
      prev.removeEventListener('click', onPrev);
      next.removeEventListener('click', onNext);
      last.removeEventListener('click', onLast);
      slider.removeEventListener('input', onSlider);
      host.removeEventListener('keydown', onKey);
      api.destroy();
      host.replaceChildren();
      host.classList.remove('chess-replay', 'stepper');
    },
  };
}
