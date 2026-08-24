// Crossroads Chess game replay for the rules article.
//
// Sibling of mini-xiangqi-replay.ts: the spec carries a move list, not per-ply
// board images. Each position is produced by replaying the moves through the real
// Crossroads Chess kernel and rendered on demand by the live board renderer, so
// the article shows the actual variant rather than precomputed engine FENs. This
// is the PERFECT-INFORMATION article, so it advances with the open kernel
// (applyCrossroadsChessOpenMove): the dark kernel now arms a pending Try on a
// far-rank arrival instead of winning outright, which the open referee never does.

import {
  applyCrossroadsChessOpenMove,
  type CrossroadsChessColor,
  type CrossroadsChessGameState,
  type CrossroadsChessMove,
  type CrossroadsChessSquare,
  createInitialCrossroadsChessState,
  getCrossroadsChessOpenView,
} from '@mistboard/game';
import type { ArticleLang } from './article-i18n.js';
import { renderCrossroadsChessViewBoard } from './crossroads-chess-diagram.js';
import { replayStepperCopy } from './replay-stepper-copy.js';

export type CrossroadsReplaySpec = {
  white: string;
  red: string;
  event: string;
  // Shown on the final ply. The record stops at the deciding move, so the kernel
  // may still report "playing"; the result is supplied explicitly.
  resultText: string;
  // Space-separated UCI moves (e.g. "a2a3 b7b6 ..."), files a-f and ranks 1-8 —
  // exactly Crossroads Chess square notation, so each token splits into from/to.
  moves: string;
  perspective?: CrossroadsChessColor;
};

export type CrossroadsChessReplayController = { destroy(): void };

function tokenToMove(tok: string): CrossroadsChessMove {
  const move: CrossroadsChessMove = {
    from: tok.slice(0, 2) as CrossroadsChessSquare,
    to: tok.slice(2, 4) as CrossroadsChessSquare,
  };
  if (tok.length >= 5 && tok[4] === 'q') move.promotion = 'queen';
  return move;
}

export function mountCrossroadsChessReplay(
  host: HTMLElement,
  spec: CrossroadsReplaySpec,
  options: { lang?: ArticleLang } = {},
): CrossroadsChessReplayController {
  const copy = replayStepperCopy(options.lang, 'crossroads');
  const perspective = spec.perspective ?? 'white';
  const moves = spec.moves
    .trim()
    .split(/\s+/)
    .filter((t) => /^[a-f][1-8][a-f][1-8]q?$/.test(t))
    .map(tokenToMove);

  // Replay once; cache every position so stepping is instant. The no-progress
  // clock is disabled so the full record always plays out — the record ends at
  // the deciding move, not by the fifty-move rule.
  const states: CrossroadsChessGameState[] = [
    createInitialCrossroadsChessState('crossroads-replay'),
  ];
  for (const move of moves) {
    states.push(
      applyCrossroadsChessOpenMove(states[states.length - 1]!, move, {
        progressClockLimit: Infinity,
      }),
    );
  }
  const total = moves.length;

  host.classList.add('crossroads-replay', 'stepper');
  host.tabIndex = 0;

  const header = document.createElement('div');
  header.className = 'xq-replay-header';
  const headerPlayers = document.createElement('div');
  headerPlayers.textContent = `${spec.white}${copy.firstRole} vs ${spec.red}${copy.secondRole}`;
  const headerEvent = document.createElement('div');
  headerEvent.className = 'xq-replay-header-event';
  headerEvent.textContent = spec.event;
  header.append(headerPlayers, headerEvent);

  const frame = document.createElement('div');
  frame.className = 'raw-svg-stepper-frame raw-svg-stepper-frame-crossroads';

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
    frame.innerHTML = renderCrossroadsChessViewBoard(
      getCrossroadsChessOpenView(states[index]!, perspective),
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

  render();

  return {
    destroy(): void {
      first.removeEventListener('click', onFirst);
      prev.removeEventListener('click', onPrev);
      next.removeEventListener('click', onNext);
      last.removeEventListener('click', onLast);
      slider.removeEventListener('input', onSlider);
      host.removeEventListener('keydown', onKey);
      host.replaceChildren();
      host.classList.remove('crossroads-replay', 'stepper');
    },
  };
}
