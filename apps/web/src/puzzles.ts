/**
 * The puzzles trainer page: the variant-agnostic session core. It owns the
 * session state machine (attempt/hint/reveal round-trips, replay scrubbing,
 * solved/failed/revealed flags), the page layout (board panel + trainer side
 * panel + sidebar), navigation/rotation, and keyboard handling.
 *
 * Everything per-variant (board painting, click/drag interaction, move
 * animation, replay move application, labels/icons, engine analysis) lives in
 * a PuzzleBoardAdapter resolved through puzzles/registry.ts. Adding a puzzle
 * variant = a new adapter module + a registry entry; this file does not
 * change. See puzzles/adapter.ts for the contract.
 */

import {
  FORTRESS_XIANGQI_SPEC_ID,
  JUNGLE_SPEC_ID,
  resolvePuzzleShortCode,
  XIANGQI_SPEC_ID,
} from '@mistboard/game';
import './puzzles.css';
import { initLiveSound, playSound } from './live-sound.js';
import {
  clonePuzzleState,
  isPuzzleComplete,
  type PuzzleDetail,
  type PuzzleMove,
  type PuzzleNavigation,
  type PuzzleSession,
  type PuzzleState,
  type PuzzleSummary,
} from './puzzles/adapter.js';
import {
  fetchPuzzleDetail,
  fetchPuzzleHint,
  fetchPuzzleList,
  fetchPuzzleSolution,
  fetchUserPuzzleRating,
  reportAttemptRating,
  setOnAttemptRating,
  setPuzzleRatedPref,
  submitPuzzleAttempt,
  type UserPuzzleRating,
} from './puzzles/api.js';
import { feedbackPanel } from './puzzles/detail-panels.js';
import { moveListPanel } from './puzzles/move-list.js';
import { renderQueuePanel } from './puzzles/queue-panel.js';
import {
  allPuzzleBoardAdapters,
  type PuzzleVariant,
  puzzleBoardAdapter,
} from './puzzles/registry.js';
import {
  loadAutoNextEnabled,
  loadRatedEnabled,
  loadSeenPuzzles,
  loadSolvedPuzzleIds,
  rotatePuzzleOrder,
  saveAutoNextEnabled,
  saveRatedEnabled,
  saveSeenPuzzles,
  saveSolvedPuzzleIds,
} from './puzzles/storage.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily, xiangqiAppearanceChangedEvent } from './theme.js';

export { puzzleMoveRowNumber } from './puzzles/move-list.js';
// Re-exported for the existing test surface (puzzles.test.ts) and any callers
// that predate the puzzles/ split.
export { sourceGameLines } from './puzzles/queue-panel.js';

type PuzzleVariantFilter = PuzzleVariant;

const AUTO_NEXT_DELAY_MS = 150;
// Cadence for auto-playing the revealed solution, one ply at a time (each step
// reuses the scrub-forward animation).
const REVEAL_STEP_MS = 650;

// Variants surfaced in the Settings variant picker (order = display order; the
// first is the default view). Standard Xiangqi (the mined real-game corpus,
// the bet variant) leads; Fortress and Jungle are offered alongside it. Mini /
// Drop Mini stay in the corpus + API (deep links still resolve server-side)
// but are hidden from the selector. Add a spec id here to unhide it.
// Fortress is hidden from the picker while the variant is demoted and its
// puzzles await a re-mine with the per-ply uniqueness gate. Re-add
// FORTRESS_XIANGQI_SPEC_ID here when the re-mined corpus lands.
const PUZZLE_VARIANT_FILTERS: readonly PuzzleVariantFilter[] = [XIANGQI_SPEC_ID, JUNGLE_SPEC_ID];

export async function mountPuzzles(
  root: HTMLElement,
  initialPuzzleId: string | null = null,
): Promise<void> {
  for (const adapter of allPuzzleBoardAdapters()) adapter.installStyles?.();
  initLiveSound();
  setBoardFamily('xiangqi');
  root.classList.add('puzzles-page');

  const shell = document.createElement('main');
  shell.className = 'site-section puzzles-shell';
  const header = document.createElement('div');
  header.className = 'puzzles-header';
  const title = document.createElement('h1');
  title.className = 'site-section-heading';
  title.textContent = 'Puzzles';
  header.append(title);

  const layout = document.createElement('div');
  layout.className = 'puzzles-layout';
  const detail = document.createElement('section');
  detail.className = 'puzzle-detail';
  const controls = document.createElement('aside');
  controls.className = 'puzzles-sidebar';
  layout.append(detail, controls);
  shell.append(header, layout);
  root.replaceChildren(buildNav(), shell);

  let summaries: PuzzleSummary[] = [];
  let selectedId = initialPuzzleId;
  let variantFilter: PuzzleVariantFilter = PUZZLE_VARIANT_FILTERS[0] ?? FORTRESS_XIANGQI_SPEC_ID;
  let session: PuzzleSession | null = null;
  const solvedIds = loadSolvedPuzzleIds();
  const seenPuzzles = loadSeenPuzzles();
  // Record a puzzle as seen (for the next visit's rotation) without disturbing
  // this visit's already-frozen queue order.
  const markPuzzleSeen = (id: string): void => {
    seenPuzzles.set(id, Date.now());
    saveSeenPuzzles(seenPuzzles);
  };
  let autoNext = loadAutoNextEnabled();
  let ratedEnabled = loadRatedEnabled();
  let userRating: UserPuzzleRating | null = null;
  let ratingDelta: number | null = null;
  let autoNextTimer: number | null = null;
  let loadToken = 0;
  let ratingToken = 0;
  setPuzzleRatedPref(ratedEnabled);

  const queueSummaries = (): PuzzleSummary[] => filterPuzzlesByVariant(summaries, variantFilter);

  // Refresh the signed-in user's rating for the current variant. Guarded by a
  // token so a slow response for an old variant can't overwrite a newer one.
  const refreshUserRating = async (): Promise<void> => {
    const token = ++ratingToken;
    const next = await fetchUserPuzzleRating(variantFilter);
    if (token !== ratingToken) return;
    userRating = next;
    renderControls();
  };

  // A rated attempt just resolved: show the delta and re-sync the authoritative
  // rating + counts from the server.
  setOnAttemptRating(async (rating) => {
    ratingDelta = rating.ratingChanged ? rating.delta : null;
    const token = ++ratingToken;
    const next = await fetchUserPuzzleRating(variantFilter);
    if (token !== ratingToken) return;
    userRating = next;
    renderControls();
  });

  const renderControls = (): void => {
    renderQueuePanel(controls, {
      queue: queueSummaries(),
      selectedId,
      solvedIds,
      variantFilter,
      variantFilters: PUZZLE_VARIANT_FILTERS,
      autoNext,
      ratedEnabled,
      userRating,
      ratingDelta,
      onVariantChange: async (nextFilter) => {
        variantFilter = nextFilter;
        ratingDelta = null;
        const queue = queueSummaries();
        const nextId =
          selectedId && queue.some((puzzle) => puzzle.id === selectedId)
            ? selectedId
            : (queue[0]?.id ?? null);
        renderControls();
        void refreshUserRating();
        if (nextId) {
          await selectPuzzle(nextId, true);
        } else {
          selectedId = null;
          session = null;
          renderStatus(detail, 'No puzzles');
        }
      },
      onAutoNextChange: (enabled) => {
        autoNext = enabled;
        saveAutoNextEnabled(enabled);
        renderControls();
      },
      onRatedChange: (enabled) => {
        ratedEnabled = enabled;
        setPuzzleRatedPref(enabled);
        saveRatedEnabled(enabled);
        renderControls();
      },
    });
  };

  const clearAutoNextTimer = (): void => {
    if (autoNextTimer === null) return;
    window.clearTimeout(autoNextTimer);
    autoNextTimer = null;
  };

  const scheduleAutoNext = (navigation: PuzzleNavigation): void => {
    if (!autoNext || !navigation.hasNext) return;
    clearAutoNextTimer();
    autoNextTimer = window.setTimeout(() => {
      autoNextTimer = null;
      navigation.goNext();
    }, AUTO_NEXT_DELAY_MS);
  };

  const renderSession = (): void => {
    if (!session) return;
    const navigation = navigationFor(queueSummaries(), selectedId, selectPuzzle);
    renderPuzzleDetail(detail, session, renderSession, navigation, (id) => {
      solvedIds.add(id);
      saveSolvedPuzzleIds(solvedIds);
      markPuzzleSeen(id);
      renderControls();
      scheduleAutoNext(navigation);
    });
    renderControls();
  };

  const selectPuzzle = async (id: string, pushUrl: boolean): Promise<void> => {
    clearAutoNextTimer();
    ratingDelta = null;
    // A deep link (or popstate) may carry a short code (Puzzle #bMpKA) instead
    // of the full id. Normalize to the full id up front so selection, queue
    // matching, the pushed URL, and solved-state keys all use the canonical id.
    id = resolveToFullPuzzleId(id, summaries);
    const summary = summaries.find((puzzle) => puzzle.id === id);
    if (summary && !queueSummaries().some((puzzle) => puzzle.id === id)) {
      variantFilter = summary.variant;
    }
    selectedId = id;
    renderControls();
    renderStatus(detail, 'Loading');
    const token = ++loadToken;
    const puzzle = await fetchPuzzleDetail(id);
    if (token !== loadToken) return;
    if (!puzzle) {
      session = null;
      renderStatus(detail, 'Puzzle not found');
      return;
    }
    const nextPath = `/puzzles/${encodeURIComponent(id)}`;
    if (pushUrl && window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath);
    }
    // Tear down the outgoing puzzle's engine (worker + arrows) before swapping
    // in the next session, so a stale ceval handle does not outlive its board.
    session?.analysis?.dispose();
    session = createPuzzleSession(puzzle);
    markPuzzleSeen(id);
    renderSession();
    renderControls();
  };

  // Arrow-key replay scrubbing (lichess-style): up/down jump to the first/last
  // move, left/right step one ply. Attached to window so it works without
  // focusing the board; self-removes once this page is navigated away (the shell
  // detaches from the document).
  const onPuzzleKeyDown = (event: KeyboardEvent): void => {
    if (!shell.isConnected) {
      window.removeEventListener('keydown', onPuzzleKeyDown);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return;
    }
    const action: PuzzleScrub | null =
      event.key === 'ArrowUp'
        ? 'first'
        : event.key === 'ArrowDown'
          ? 'last'
          : event.key === 'ArrowLeft'
            ? 'previous'
            : event.key === 'ArrowRight'
              ? 'next'
              : null;
    if (!action || !session) return;
    event.preventDefault();
    scrubPuzzle(session, renderSession, action);
  };
  window.addEventListener('keydown', onPuzzleKeyDown);

  renderStatus(controls, 'Loading');
  renderStatus(detail, 'Loading');
  summaries = await fetchPuzzleList();
  // Rotate the queue so both the leading puzzle and the sequence vary between
  // visits instead of being identical every time. Computed once per visit so
  // navigation stays stable while solving; filtering by variant preserves it.
  summaries = rotatePuzzleOrder(summaries, seenPuzzles);
  // The deep-link path may be a short code; resolve it to the full id before it
  // drives variant selection and queue matching below.
  if (selectedId) selectedId = resolveToFullPuzzleId(selectedId, summaries);
  const directSummary = selectedId ? summaries.find((puzzle) => puzzle.id === selectedId) : null;
  // A normal visit defaults to the surfaced variant (Fortress); a direct deep
  // link into any puzzle still resolves so shared/bookmarked URLs keep working.
  if (directSummary) variantFilter = directSummary.variant;
  else if (!summaries.some((puzzle) => puzzle.variant === variantFilter) && summaries[0]) {
    variantFilter = summaries[0].variant;
  }
  renderControls();
  void refreshUserRating();

  const queue = queueSummaries();
  const firstId =
    selectedId && queue.some((puzzle) => puzzle.id === selectedId)
      ? selectedId
      : (queue[0]?.id ?? null);
  if (firstId) {
    await selectPuzzle(firstId, false);
  } else {
    renderStatus(detail, 'No puzzles');
  }

  window.addEventListener('popstate', () => {
    const id = puzzleIdFromPath(window.location.pathname) ?? queueSummaries()[0]?.id ?? null;
    if (id) void selectPuzzle(id, false);
  });

  // The variant boards render pieces as inline SVG, so a live piece-set or
  // board-theme change (from the appearance menu) must re-render to pick up the
  // new set — matching every other xiangqi surface (replay, postgame, live).
  window.addEventListener(xiangqiAppearanceChangedEvent, () => {
    if (session) renderSession();
    else renderControls();
  });
}

function createPuzzleSession(puzzle: PuzzleDetail): PuzzleSession {
  return {
    puzzle,
    state: clonePuzzleState(puzzle.initial),
    playedMoves: [],
    solverMoves: [],
    viewPly: 0,
    selectedSquare: null,
    selectedDrop: null,
    draggingFrom: null,
    feedback: { kind: 'neutral', text: 'Find the best move.' },
    submitting: false,
    solved: false,
    failed: false,
    revealed: false,
    focusNext: false,
    vote: null,
  };
}

function renderPuzzleDetail(
  host: HTMLElement,
  session: PuzzleSession,
  renderSession: () => void,
  navigation: PuzzleNavigation,
  onSolved: (id: string) => void,
): void {
  host.replaceChildren();

  const adapter = puzzleBoardAdapter(session.puzzle.variant);
  const displayState = puzzleReplayState(session);

  const boardPanel = document.createElement('div');
  boardPanel.className = 'puzzle-board-panel';
  const board = document.createElement('div');
  board.className = 'puzzle-board';
  // Tag the board with the current puzzle so async reveal playback can detect a
  // navigation away (new puzzle = new id) and stop stepping a stale session.
  board.dataset.puzzleId = session.puzzle.id;
  const side = document.createElement('aside');
  side.className = 'puzzle-side-panel';

  // Paint the interactive board (+ reserves for drop variants) and wire drag,
  // all owned by the variant adapter.
  adapter.paintBoard(board, {
    session,
    displayState,
    renderSession,
    submitMove: (move) => submitMove(session, move, renderSession, onSolved),
  });

  const trainer = document.createElement('div');
  trainer.className = 'puzzle-trainer-panel';
  trainer.append(
    moveListPanel(session),
    feedbackPanel(session, navigation, renderSession, {
      onHint: () => void requestHint(session, renderSession),
      onReveal: () => void revealSolution(session, renderSession),
    }),
  );
  side.append(trainer, actionPanel(session, renderSession));

  // Post-completion engine analysis (adapters with a client engine): once the
  // puzzle is over (solved or its solution revealed), surface the local-engine
  // panel + board arrows. Gated to non-spoiler states only — a bare wrong move
  // keeps solving open, so the engine stays hidden until the outcome is locked.
  // The controller persists on the session across renders.
  if (adapter.createAnalysis && isPuzzleComplete(session)) {
    if (!session.analysis) session.analysis = adapter.createAnalysis();
    // The engine panel is a third child in a column sized to the board; let the
    // column scroll instead of clipping (grid is otherwise a fixed 2-row shape).
    side.classList.add('puzzle-side-panel--analysis');
    side.append(session.analysis.el);
    session.analysis.refresh(session, displayState, board);
  }

  boardPanel.append(board, side);
  host.append(boardPanel);

  // Right after a solve, hand focus to the next-puzzle button (one-shot) so
  // Enter or Space advances; on small screens this also scrolls the CTA into
  // view, where the side panel sits below the board.
  if (session.focusNext) {
    session.focusNext = false;
    host.querySelector<HTMLButtonElement>('[data-puzzle-next="true"]')?.focus();
  }
}

type PuzzleScrub = 'first' | 'previous' | 'next' | 'last';

// Move the replay cursor. Shared by the arrow buttons and the keyboard handler
// so both animate identically. No-op while a submission is in flight or when the
// cursor is already at the requested end.
function scrubPuzzle(session: PuzzleSession, renderSession: () => void, action: PuzzleScrub): void {
  if (session.submitting) return;
  const lastPly = session.playedMoves.length;
  switch (action) {
    case 'first':
      if (session.viewPly <= 0) return;
      session.viewPly = 0;
      renderSession();
      return;
    case 'previous': {
      if (session.viewPly <= 0) return;
      // Reverse-glide the move being undone (replay back-step).
      const undone = session.playedMoves[session.viewPly - 1];
      session.viewPly -= 1;
      renderSession();
      if (undone) animatePuzzleMove(session, undone, { reverse: true });
      return;
    }
    case 'next': {
      if (session.viewPly >= lastPly) return;
      // Glide the move being stepped into (replay forward step).
      const stepped = session.playedMoves[session.viewPly];
      session.viewPly += 1;
      renderSession();
      if (stepped) animatePuzzleMove(session, stepped);
      return;
    }
    case 'last':
      if (session.viewPly >= lastPly) return;
      session.viewPly = lastPly;
      renderSession();
      return;
  }
}

function actionPanel(session: PuzzleSession, renderSession: () => void): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'puzzle-actions';
  const atStart = session.viewPly <= 0 || session.submitting;
  const atEnd = session.viewPly >= session.playedMoves.length || session.submitting;

  const scrub = (action: PuzzleScrub) => () => scrubPuzzle(session, renderSession, action);
  const first = actionButton(
    'puzzleReplayFirst',
    ICON_FIRST,
    'First move',
    atStart,
    scrub('first'),
  );
  const previous = actionButton(
    'puzzleReplayPrevious',
    ICON_PREV,
    'Previous move',
    atStart,
    scrub('previous'),
  );
  const next = actionButton('puzzleReplayNext', ICON_NEXT, 'Next move', atEnd, scrub('next'));
  const last = actionButton('puzzleReplayLast', ICON_LAST, 'Last move', atEnd, scrub('last'));
  panel.append(first, previous, next, last);
  return panel;
}

function actionButton(
  dataKey: string,
  glyph: string,
  label: string,
  disabled: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'puzzle-button';
  button.dataset[dataKey] = 'true';
  if (glyph.startsWith('<')) button.innerHTML = glyph;
  else button.textContent = glyph;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

async function submitMove(
  session: PuzzleSession,
  move: PuzzleMove,
  renderSession: () => void,
  onSolved?: (id: string) => void,
): Promise<void> {
  // Once the answer has been shown (or the puzzle is solved), the board is a
  // locked replay: no further moves are submitted.
  if (session.revealed || session.solved) return;
  session.submitting = true;
  session.feedback = { kind: 'pending', text: 'Checking move.' };
  renderSession();
  const beforeCount = puzzlePieceCount(session.state);
  const playedCountBefore = session.playedMoves.length;
  const nextSolverMoves = [...session.solverMoves, move];
  const { attempt, rating } = await submitPuzzleAttempt(session.puzzle.id, nextSolverMoves);
  session.submitting = false;
  session.selectedSquare = null;
  session.selectedDrop = null;
  if (attempt.ok) {
    session.solverMoves = attempt.solverMoves;
    session.playedMoves = attempt.playedMoves;
    session.state = attempt.state;
    session.viewPly = session.playedMoves.length;
    if (attempt.complete) {
      session.solved = true;
      session.focusNext = true;
      onSolved?.(session.puzzle.id);
    }
    session.feedback = attempt.complete
      ? { kind: 'good', text: 'Solved.' }
      : { kind: 'good', text: 'Correct.' };
    // Solved = victory fanfare; a correct-but-incomplete move sounds like the
    // move it was (capture if the played line reduced piece count, else a step).
    playSound(
      attempt.complete ? 'win' : puzzlePieceCount(session.state) < beforeCount ? 'capture' : 'move',
    );
  } else {
    session.state = attempt.state;
    session.viewPly = session.playedMoves.length;
    // Persist the failed state so the escape hatches (hint / view solution /
    // next) survive the piece-select feedback reset on the next render.
    session.failed = true;
    session.feedback = { kind: 'bad', text: 'Try another move.' };
    playSound('lose');
  }
  if (rating) reportAttemptRating(rating);
  renderSession();
  // A correct move lands the solver's move AND the engine reply in the same
  // render; glide ONLY the reply (the user just chose their own move, so it
  // reads fine landing instantly — the reply is what teleported before).
  if (attempt.ok && attempt.playedMoves.length - playedCountBefore >= 2) {
    const reply = attempt.playedMoves.at(-1);
    if (reply) animatePuzzleMove(session, reply);
  }
}

// Highlight the correct piece to move for the current ply (lichess "get a hint").
// The move is computed server-side (the client never holds the solution); the
// hint books a failed rated attempt on the first terminal action (idempotent
// server-side, so it never double-counts a prior wrong-move fail). The user may
// then play the highlighted piece, take the full solution, or move on.
async function requestHint(session: PuzzleSession, renderSession: () => void): Promise<void> {
  if (session.submitting || session.revealed || session.solved) return;
  session.submitting = true;
  session.feedback = { kind: 'pending', text: 'Fetching a hint.' };
  renderSession();
  const { move, rating } = await fetchPuzzleHint(session.puzzle.id, session.playedMoves.length);
  session.submitting = false;
  if (!move) {
    session.feedback = { kind: 'neutral', text: 'No hint available.' };
    renderSession();
    return;
  }
  session.failed = true;
  // Drop the replay cursor back to the live position so the highlight paints.
  session.viewPly = session.playedMoves.length;
  if ('drop' in move) {
    session.selectedDrop = move.drop;
    session.selectedSquare = null;
  } else {
    session.selectedSquare = move.from;
    session.selectedDrop = null;
  }
  session.feedback = { kind: 'neutral', text: 'Hint: move the highlighted piece.' };
  if (rating) reportAttemptRating(rating);
  renderSession();
}

// Fetch the full solution line, play it out, and lock solving (lichess "view
// solution"). Spoiler-gated: nothing is fetched until this runs. Books a failed
// rated attempt on the first terminal action (idempotent server-side).
async function revealSolution(session: PuzzleSession, renderSession: () => void): Promise<void> {
  if (session.submitting || session.revealed) return;
  session.submitting = true;
  session.feedback = { kind: 'pending', text: 'Loading the solution.' };
  renderSession();
  const { solution, rating } = await fetchPuzzleSolution(session.puzzle.id);
  session.submitting = false;
  if (!solution || solution.length === 0) {
    session.feedback = { kind: 'neutral', text: 'No solution available.' };
    renderSession();
    return;
  }
  session.failed = true;
  session.revealed = true;
  session.selectedSquare = null;
  session.selectedDrop = null;
  // Play the answer out from wherever the user got to. Their correct moves are a
  // prefix of the solution, so replaying from that ply matches the board.
  const startPly = Math.min(session.playedMoves.length, solution.length);
  session.playedMoves = solution;
  session.solverMoves = solution.filter((_, index) => index % 2 === 0);
  const adapter = puzzleBoardAdapter(session.puzzle.variant);
  let state = clonePuzzleState(session.puzzle.initial);
  for (const move of solution) {
    state = adapter.applyMove(state, move);
  }
  session.state = state;
  session.viewPly = startPly;
  session.feedback = { kind: 'neutral', text: 'Solution' };
  if (rating) reportAttemptRating(rating);
  renderSession();
  playbackSolution(session, renderSession);
}

// Step the replay cursor forward one ply at a time, reusing the scrub-forward
// animation, until the whole solution has been shown. Stops early if the user
// navigated to another puzzle (the board's puzzle id no longer matches).
function playbackSolution(session: PuzzleSession, renderSession: () => void): void {
  const puzzleId = session.puzzle.id;
  const step = (): void => {
    const board = document.querySelector<HTMLElement>('.puzzle-board');
    if (!board || board.dataset.puzzleId !== puzzleId) return;
    if (session.viewPly >= session.playedMoves.length) return;
    scrubPuzzle(session, renderSession, 'next');
    window.setTimeout(step, REVEAL_STEP_MS);
  };
  window.setTimeout(step, REVEAL_STEP_MS);
}

// Glide a board move on the mounted puzzle board. One puzzle page mounts at a
// time (module invariant, see the rating singletons in puzzles/api.ts), so the
// .puzzle-board query is unambiguous. Called AFTER renderSession painted the
// final position. Drop moves have no origin square and stay discrete. Moves
// come from the server attempt payload or the local playedMoves history,
// never from diffing board states.
function animatePuzzleMove(
  session: PuzzleSession,
  move: PuzzleMove,
  opts: { reverse?: boolean } = {},
): void {
  if (!('from' in move) || typeof move.from !== 'string') return;
  const board = document.querySelector<HTMLElement>('.puzzle-board');
  if (!board) return;
  puzzleBoardAdapter(session.puzzle.variant).animateMove(board, session, move, opts);
}

// Occupied-square count across any puzzle variant's board (all PuzzleState shapes
// carry a `board` square→piece map). Used only to pick a capture vs move sound.
function puzzlePieceCount(state: PuzzleState): number {
  return Object.keys(state.board).length;
}

function renderStatus(host: HTMLElement, message: string): void {
  const status = document.createElement('p');
  status.className = 'puzzles-status';
  status.textContent = message;
  host.replaceChildren(status);
}

function filterPuzzlesByVariant(
  puzzles: readonly PuzzleSummary[],
  variant: PuzzleVariantFilter,
): PuzzleSummary[] {
  return puzzles.filter((puzzle) => puzzle.variant === variant);
}

function navigationFor(
  puzzles: readonly PuzzleSummary[],
  selectedId: string | null,
  selectPuzzle: (id: string, pushUrl: boolean) => Promise<void>,
): PuzzleNavigation {
  const index = Math.max(
    0,
    puzzles.findIndex((puzzle) => puzzle.id === selectedId),
  );
  const total = puzzles.length;
  const hasPrevious = total > 0 && index > 0;
  // The queue is frozen for the visit (rotation happens once on mount), so
  // "next" wraps at the end instead of dead-ending the trainer on the last
  // puzzle with a disabled button.
  const hasNext = total > 1;
  return {
    index,
    total,
    hasPrevious,
    hasNext,
    goPrevious: () => {
      if (!hasPrevious) return;
      void selectPuzzle(puzzles[index - 1]!.id, true);
    },
    goNext: () => {
      if (!hasNext) return;
      void selectPuzzle(puzzles[(index + 1) % total]!.id, true);
    },
  };
}

// The replay-aware state to display: the live state when the cursor sits at the
// tip, else the initial state with the first viewPly moves re-applied.
function puzzleReplayState(session: PuzzleSession): PuzzleState {
  if (session.viewPly >= session.playedMoves.length) return session.state;
  const adapter = puzzleBoardAdapter(session.puzzle.variant);
  let state: PuzzleState = clonePuzzleState(session.puzzle.initial);
  const visibleMoves = session.playedMoves.slice(0, Math.max(0, session.viewPly));
  for (const move of visibleMoves) {
    state = adapter.applyMove(state, move);
  }
  return state;
}

function puzzleIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/puzzles\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

// The URL slug is normally the full puzzle id, but the info-card code link and
// hand-typed short URLs may carry a lichess-style short code. Resolve a code
// against the loaded summaries; pass through anything that already is a full id
// (or does not resolve, so selectPuzzle can surface "Puzzle not found").
function resolveToFullPuzzleId(idOrCode: string, summaries: readonly PuzzleSummary[]): string {
  if (summaries.some((puzzle) => puzzle.id === idOrCode)) return idOrCode;
  return (
    resolvePuzzleShortCode(
      idOrCode,
      summaries.map((puzzle) => puzzle.id),
    ) ?? idOrCode
  );
}

const ICON_FIRST =
  '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true"><path d="M4 3.5h1.7v9H4zM13 3.5v9L6.5 8z" fill="currentColor"/></svg>';
const ICON_LAST =
  '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true"><path d="M10.3 3.5H12v9h-1.7zM3 3.5v9L9.5 8z" fill="currentColor"/></svg>';
const ICON_PREV =
  '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true"><path d="M11 3.5v9L5 8z" fill="currentColor"/></svg>';
const ICON_NEXT =
  '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true"><path d="M5 3.5v9L11 8z" fill="currentColor"/></svg>';
