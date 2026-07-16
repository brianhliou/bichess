// Xiangqi gamebook (interactive-lesson) PLAYER: a board + a coach panel that drives
// the guess-the-move session (gamebook-play.ts). Moves are hidden — the learner must
// find the solution move on their side; the opponent's replies auto-play. A wrong
// (legal) move shows the coach's "why not" and lets them try again. This is a
// standalone surface (no move list / engine / variations) — the study page mounts it
// for a gamebook chapter, and /learn will mount the same player later.

import type { StandardXiangqiPlayerView, XiangqiColor, XiangqiGameState } from '@mistboard/game';
import { createXiangqiInteractiveBoard } from '../xiangqi-board.js';
import { createGamebookSession } from './gamebook-play.js';
import { deserializeTree, type SerializedTree } from './tree-serialize.js';
import { xiangqiTreeAdapter } from './xiangqi-tree-adapter.js';
import './gamebook.css';

export interface XiangqiGamebookOptions {
  /** The solution tree (with per-node hint/deviation/comment). */
  tree: SerializedTree;
  /** Side the learner plays. */
  orientation: XiangqiColor;
  title?: string;
  summary?: string;
  /** Optional left-rail element (chapter tabs, "edit lesson", etc.). */
  aside?: HTMLElement;
}

export function mountXiangqiGamebook(root: HTMLElement, opts: XiangqiGamebookOptions): void {
  const tree = deserializeTree(xiangqiTreeAdapter, opts.tree);
  const session = createGamebookSession(tree, {
    moveKey: xiangqiTreeAdapter.moveKey,
    isLegal: xiangqiTreeAdapter.isLegal,
    learner: opts.orientation,
    sideToMove: (truth: XiangqiGameState) =>
      truth.status.type === 'playing' ? truth.status.turn : null,
    comment: (node) => node.annotations?.comments?.[0]?.text,
    hint: (node) => node.annotations?.gamebook?.hint,
    deviation: (node) => node.annotations?.gamebook?.deviation,
  });

  const currentView = (): StandardXiangqiPlayerView =>
    xiangqiTreeAdapter.project(session.node().truth)[0]!.view;

  // ── Layout ──
  const wrap = document.createElement('section');
  wrap.className = 'gamebook';
  if (opts.aside) {
    const aside = document.createElement('div');
    aside.className = 'gamebook__aside';
    aside.append(opts.aside);
    wrap.append(aside);
  }
  const boardEl = document.createElement('div');
  boardEl.className = 'gamebook__board xiangqi-live-board';
  boardEl.setAttribute('aria-label', 'Xiangqi lesson board');
  wrap.append(boardEl);

  const coach = document.createElement('aside');
  coach.className = 'gamebook__coach';
  const mascot = document.createElement('div');
  mascot.className = 'gamebook__mascot';
  mascot.textContent = '🐉';
  const bubble = document.createElement('div');
  bubble.className = 'gamebook__bubble';
  const comment = document.createElement('p');
  comment.className = 'gamebook__comment';
  const feedback = document.createElement('p');
  feedback.className = 'gamebook__feedback';
  const hintText = document.createElement('p');
  hintText.className = 'gamebook__hint';
  bubble.append(comment, feedback, hintText);
  const controls = document.createElement('div');
  controls.className = 'gamebook__controls';
  const hintBtn = button('Hint', 'gamebook__btn');
  const retryBtn = button('Try again', 'gamebook__btn gamebook__btn--primary');
  const restartBtn = button('Restart lesson', 'gamebook__btn');
  controls.append(hintBtn, retryBtn, restartBtn);
  coach.append(mascot, bubble, controls);
  wrap.append(coach);

  const interactive = createXiangqiInteractiveBoard({
    board: boardEl,
    getInteractionView: () => currentView(),
    getPerspective: () => opts.orientation,
    // Only the learner's side is draggable, and only while awaiting their move.
    seatFor: () => (session.view().awaitingMove ? opts.orientation : null),
    enabled: () => session.view().awaitingMove,
    onMove: (move) => {
      const result = session.attempt(move);
      if (result === 'invalid') return;
      render(result);
    },
  });

  hintBtn.addEventListener('click', () => {
    const hint = session.view().hint;
    hintText.textContent = hint ?? 'No hint for this move.';
  });
  retryBtn.addEventListener('click', () => {
    session.retry();
    render();
  });
  restartBtn.addEventListener('click', () => {
    session.reset();
    render();
  });

  function render(justAttempted?: 'good' | 'bad'): void {
    const view = session.view();
    interactive.render(currentView(), opts.orientation);
    coach.dataset.state = view.feedback;
    hintText.textContent = '';

    if (view.feedback === 'bad') {
      comment.textContent = '';
      feedback.textContent = view.deviation ?? 'Not the move — try again.';
    } else if (view.feedback === 'end') {
      comment.textContent = view.comment ?? '';
      feedback.textContent = 'Lesson complete! 🎉';
    } else {
      comment.textContent = view.comment ?? '';
      feedback.textContent =
        justAttempted === 'good' ? 'Correct! Keep going.' : 'Your move — find the best line.';
    }

    hintBtn.hidden = view.feedback !== 'play' || !view.hint;
    retryBtn.hidden = view.feedback !== 'bad';
    restartBtn.hidden = view.feedback !== 'end';
  }

  const header = document.createElement('header');
  header.className = 'gamebook__header';
  if (opts.title) {
    const h1 = document.createElement('h1');
    h1.className = 'gamebook__title';
    h1.textContent = opts.title;
    header.append(h1);
  }
  if (opts.summary) {
    const p = document.createElement('p');
    p.className = 'gamebook__summary';
    p.textContent = opts.summary;
    header.append(p);
  }

  root.replaceChildren(header, wrap);
  render();
}

function button(label: string, className: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = label;
  return el;
}
