import {
  applyDropMiniXiangqiMove,
  applyFortressXiangqiMove,
  applyJungleMove,
  applyMiniXiangqiOpenMove,
  applyStandardXiangqiMove,
  DROP_MINI_XIANGQI_DROP_ROLES,
  DROP_MINI_XIANGQI_SPEC_ID,
  type DropMiniXiangqiDropRole,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiMove,
  FORTRESS_DROP_ROLES,
  FORTRESS_XIANGQI_SPEC_ID,
  type FortressXiangqiColor,
  type FortressXiangqiDropRole,
  type FortressXiangqiGameState,
  type FortressXiangqiMove,
  type FortressXiangqiPlayerView,
  type FortressXiangqiSquare,
  fsfUciToXiangqiSquares,
  getDropMiniXiangqiPlayerView,
  getFortressXiangqiPlayerView,
  getJunglePlayerView,
  getMiniXiangqiOpenPlayerView,
  getStandardXiangqiPlayerView,
  JUNGLE_SPEC_ID,
  type JungleColor,
  type JungleGameState,
  type JungleMove,
  type JunglePlayerView,
  type JungleSquare,
  MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiMove,
  type MiniXiangqiSquare,
  oppositeMiniXiangqiColor,
  puzzleShortCode,
  resolvePuzzleShortCode,
  type StandardXiangqiPlayerView,
  standardXiangqiEngineFen,
  XIANGQI_SPEC_ID,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiSquare,
} from '@mistboard/game';
import './drop-mini-xiangqi.css';
import './live-xiangqi.css';
import './puzzles.css';
import {
  dropMiniXiangqiBoardMoves,
  dropMiniXiangqiBoardView,
  dropMiniXiangqiDropTargets,
  dropMiniXiangqiTargetMoves,
  fillDropMiniXiangqiReserve,
} from './drop-mini-xiangqi-view.js';
import {
  animateFortressXiangqiBoardMove,
  FORTRESS_XIANGQI_PIECE_PX,
  fortressXiangqiPieceGhostSvg,
  installFortressXiangqiBoardStyles,
  renderFortressXiangqiBoardSvg,
} from './fortress-xiangqi-render.js';
import {
  fillFortressXiangqiReserve,
  fortressXiangqiBoardMoves,
  fortressXiangqiDropTargets,
  fortressXiangqiMoveLabel,
} from './fortress-xiangqi-view.js';
import {
  animateJungleBoardMove,
  JUNGLE_BOARD_VIEW,
  junglePieceGhostSvg,
  renderJungleBoardSvg,
} from './jungle-render.js';
import {
  animateMiniXiangqiBoardMove,
  installMiniXiangqiBoardStyles,
  MINI_XIANGQI_PIECE_PX,
  miniXiangqiPieceGhostSvg,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';
import { initLiveSound, playSound } from './live-sound.js';
import { engineArrowsFromLines } from './review/engine/engine-arrows.js';
import { createEnginePanel } from './review/engine/engine-panel.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily, xiangqiAppearanceChangedEvent } from './theme.js';
import { renderVariantMarker } from './variant-markers.js';
import type { VariantMiniId } from './variant-mini-boards.js';
import { installBoardDrag } from './variant-tenant/board-drag.js';
import { installHandDrag } from './variant-tenant/hand-drag.js';
import {
  animateXiangqiBoardMove,
  XIANGQI_PIECE_SIZE,
  type XiangqiBoardArrow,
  xiangqiArrowSvg,
  xiangqiBoardSvg,
  xiangqiClickResult,
  xiangqiPieceGhostSvg,
} from './xiangqi-board.js';

type PuzzleVariant =
  | typeof MINI_XIANGQI_SPEC_ID
  | typeof DROP_MINI_XIANGQI_SPEC_ID
  | typeof FORTRESS_XIANGQI_SPEC_ID
  | typeof JUNGLE_SPEC_ID
  | typeof XIANGQI_SPEC_ID;
type PuzzleVariantFilter = PuzzleVariant;
type PuzzleMove =
  | MiniXiangqiMove
  | DropMiniXiangqiMove
  | FortressXiangqiMove
  | JungleMove
  | XiangqiMove;
type PuzzleColor = MiniXiangqiColor | FortressXiangqiColor | JungleColor | XiangqiColor;

type PuzzleSummary = {
  id: string;
  variant: PuzzleVariant;
  title: string;
  sideToMove: PuzzleColor | null;
  goal:
    | { type: 'checkmate'; winner?: PuzzleColor }
    | { type: 'win'; winner?: PuzzleColor }
    | { type: 'winning-advantage'; winner?: PuzzleColor; centipawns?: number };
  themes: string[];
  solutionPlyCount: number;
  // Attribution for the "From game" card (standard-xiangqi mined puzzles). The
  // source game is not hosted yet, so this is display-only, not a link.
  sourceGame?: {
    gameId: string;
    ply: number;
    event?: string;
    playedOn?: string;
    result?: string;
    redName?: string;
    blackName?: string;
  };
};

type MiniPuzzleDetail = PuzzleSummary & {
  variant: typeof MINI_XIANGQI_SPEC_ID;
  initial: MiniXiangqiGameState;
};

type DropPuzzleDetail = PuzzleSummary & {
  variant: typeof DROP_MINI_XIANGQI_SPEC_ID;
  initial: DropMiniXiangqiGameState;
};

type FortressPuzzleDetail = PuzzleSummary & {
  variant: typeof FORTRESS_XIANGQI_SPEC_ID;
  initial: FortressXiangqiGameState;
};

type JunglePuzzleDetail = PuzzleSummary & {
  variant: typeof JUNGLE_SPEC_ID;
  initial: JungleGameState;
};

type XiangqiPuzzleDetail = PuzzleSummary & {
  variant: typeof XIANGQI_SPEC_ID;
  initial: XiangqiGameState;
};

type PuzzleDetail =
  | MiniPuzzleDetail
  | DropPuzzleDetail
  | FortressPuzzleDetail
  | JunglePuzzleDetail
  | XiangqiPuzzleDetail;
type PuzzleState =
  | MiniXiangqiGameState
  | DropMiniXiangqiGameState
  | FortressXiangqiGameState
  | JungleGameState
  | XiangqiGameState;

type PuzzleAttempt =
  | {
      ok: true;
      playedMoves: PuzzleMove[];
      solverMoves: PuzzleMove[];
      complete: boolean;
      ply: number;
      state: PuzzleState;
      lastMove?: PuzzleMove;
    }
  | {
      ok: false;
      code: 'incorrect-move' | 'illegal-move' | 'line-too-long' | 'wrong-move-shape';
      ply: number;
      state: PuzzleState;
      move: PuzzleMove;
    };

type FeedbackKind = 'neutral' | 'good' | 'bad' | 'pending';

type PuzzleSession = {
  puzzle: PuzzleDetail;
  state: PuzzleState;
  playedMoves: PuzzleMove[];
  solverMoves: PuzzleMove[];
  viewPly: number;
  selectedSquare: MiniXiangqiSquare | FortressXiangqiSquare | JungleSquare | XiangqiSquare | null;
  selectedDrop: DropMiniXiangqiDropRole | FortressXiangqiDropRole | null;
  draggingFrom: MiniXiangqiSquare | FortressXiangqiSquare | JungleSquare | XiangqiSquare | null;
  feedback: { kind: FeedbackKind; text: string };
  submitting: boolean;
  // True once the server confirmed the full solution line (attempt.complete).
  // Tracked on the session because winning-advantage puzzles complete mid-game:
  // their final state is still 'playing', so board status alone cannot signal
  // "solved" (and the next-puzzle CTA would never appear).
  solved: boolean;
  // Persistent (unlike feedback, which piece-selects reset to 'neutral'): set on
  // the first wrong move OR the first reveal/hint. Drives the always-visible
  // advance-to-next CTA + fail action row so a retry/select can't hide the way
  // out. The user may keep trying moves, take a hint, view the solution, or move
  // on — lichess "you failed this puzzle" semantics.
  failed: boolean;
  // The full solution has been fetched and played out; solving is locked (the
  // board becomes a replay of the answer). Distinct from `solved` (which shows
  // the Success panel) — a reveal is a give-up, not a win.
  revealed: boolean;
  // One-shot flag: focus the next-puzzle button on the render right after a
  // solve, so Enter or Space advances without reaching for the mouse.
  focusNext: boolean;
  // The viewer's "did you like this puzzle?" thumb vote, if any. Kept on the
  // session so the selected-button feedback survives renderSession() rebuilds
  // (the solved panel is rebuilt from scratch on every render). Voting shows
  // feedback in place and does NOT advance to the next puzzle.
  vote: 'up' | 'down' | null;
  // Post-completion engine analysis (standard xiangqi only). Created lazily the
  // first time a completed puzzle renders, then persists across renderSession()
  // rebuilds so the engine toggle + eval + arrows survive a full re-render.
  // Disposed when the session is replaced (see selectPuzzle).
  analysis?: PuzzleAnalysisController | null;
};

type PuzzleNavigation = {
  index: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
  goPrevious: () => void;
  goNext: () => void;
};

const SOLVED_PUZZLES_STORAGE_KEY = 'mistboard:puzzles:solved';
const SEEN_PUZZLES_STORAGE_KEY = 'mistboard:puzzles:seen';
const AUTO_NEXT_STORAGE_KEY = 'mistboard:puzzles:auto-next';
const RATED_STORAGE_KEY = 'mistboard:puzzles:rated';
const AUTO_NEXT_DELAY_MS = 150;
// Cadence for auto-playing the revealed solution, one ply at a time (each step
// reuses the scrub-forward animation).
const REVEAL_STEP_MS = 650;
// Rotation only needs "have I seen this lately," so cap the persisted seen-set
// to the most-recently-seen ids rather than growing an unbounded history.
const SEEN_PUZZLES_CAP = 200;

// The signed-in user's puzzle rating for the current variant (from
// /api/puzzles/rating), and the rating change returned by a rated attempt.
type UserPuzzleRating = {
  rating: number;
  provisional: boolean;
  solved: number;
  attempts: number;
};

type PuzzleAttemptRating = {
  userRating: number;
  delta: number;
  provisional: boolean;
  ratingChanged: boolean;
  firstAttempt: boolean;
};

// Rating UI wiring. One puzzle page is mounted at a time, so the rated
// preference and the "an attempt just changed my rating" callback live as
// module singletons the free-function attempt path can reach without threading.
let puzzleRatedPref = true;
let onAttemptRating: ((rating: PuzzleAttemptRating) => void) | null = null;
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
  installMiniXiangqiBoardStyles();
  installFortressXiangqiBoardStyles();
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
  puzzleRatedPref = ratedEnabled;

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
  onAttemptRating = async (rating) => {
    ratingDelta = rating.ratingChanged ? rating.delta : null;
    const token = ++ratingToken;
    const next = await fetchUserPuzzleRating(variantFilter);
    if (token !== ratingToken) return;
    userRating = next;
    renderControls();
  };

  const renderControls = (): void => {
    renderQueuePanel(controls, {
      queue: queueSummaries(),
      selectedId,
      solvedIds,
      variantFilter,
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
        puzzleRatedPref = enabled;
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

  // The mini-xiangqi board renders pieces as inline SVG, so a live piece-set or
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

type QueuePanelProps = {
  queue: readonly PuzzleSummary[];
  selectedId: string | null;
  solvedIds: ReadonlySet<string>;
  variantFilter: PuzzleVariantFilter;
  autoNext: boolean;
  ratedEnabled: boolean;
  userRating: UserPuzzleRating | null;
  ratingDelta: number | null;
  onVariantChange: (variant: PuzzleVariantFilter) => Promise<void>;
  onAutoNextChange: (enabled: boolean) => void;
  onRatedChange: (enabled: boolean) => void;
};

function renderQueuePanel(host: HTMLElement, props: QueuePanelProps): void {
  const {
    queue,
    selectedId,
    solvedIds,
    variantFilter,
    autoNext,
    ratedEnabled,
    userRating,
    ratingDelta,
    onVariantChange,
    onAutoNextChange,
    onRatedChange,
  } = props;
  host.replaceChildren();

  const currentIndex = Math.max(
    0,
    queue.findIndex((puzzle) => puzzle.id === selectedId),
  );
  const current = queue[currentIndex] ?? null;
  const solvedCount = queue.filter((puzzle) => solvedIds.has(puzzle.id)).length;

  const infoCard = document.createElement('section');
  infoCard.className = 'puzzle-left-card puzzle-current-card puzzle-info-card';
  if (current) {
    infoCard.append(
      puzzleInfoRow('target', [
        puzzleCodeLine(current),
        puzzleInfoLine('Rating: hidden'),
        puzzleInfoLine(solvedIds.has(current.id) ? 'Solved' : 'Played locally'),
      ]),
      puzzleInfoDivider(),
      puzzleInfoRow(
        'variant',
        [
          // Mined xiangqi puzzles carry attribution for the real game they came
          // from: show a lichess-style "From game" header instead of "From set".
          // The source game is not hosted yet (license-gated), so this is
          // display-only — no link.
          ...sourceGameLines(current),
          // The goal (e.g. "Mate in 1") is a spoiler while solving; reveal it only
          // once the puzzle is solved, like the puzzle rating.
          puzzleInfoLine(
            solvedIds.has(current.id)
              ? `${goalLabel(current)} | ${colorLabel(current.sideToMove)} to move`
              : `${colorLabel(current.sideToMove)} to move`,
          ),
        ],
        current.variant,
      ),
    );
  } else {
    const empty = document.createElement('p');
    empty.className = 'puzzle-card-empty';
    empty.textContent = 'No puzzles for this variant.';
    infoCard.append(empty);
  }

  // Rated on/off (lichess parity). Off = practice: attempts send rated:false, so
  // neither the user's nor the puzzle's rating moves.
  const ratingCard = document.createElement('section');
  ratingCard.className = `puzzle-left-card puzzle-rating-card${
    ratedEnabled ? ' puzzle-rating-card--enabled' : ' puzzle-rating-card--practice'
  }`;
  const ratedToggle = document.createElement('label');
  ratedToggle.className = 'puzzle-toggle puzzle-rated-toggle';
  const ratedInput = document.createElement('input');
  ratedInput.type = 'checkbox';
  ratedInput.checked = ratedEnabled;
  ratedInput.dataset.puzzleRated = 'true';
  ratedInput.addEventListener('change', () => onRatedChange(ratedInput.checked));
  const ratedSwitch = document.createElement('span');
  ratedSwitch.className = 'puzzle-toggle-switch';
  ratedSwitch.setAttribute('aria-hidden', 'true');
  const ratedName = document.createElement('span');
  ratedName.className = 'puzzle-toggle-label';
  ratedName.textContent = 'Rated';
  ratedToggle.append(ratedInput, ratedSwitch, ratedName);
  ratingCard.append(ratedToggle);
  if (ratedEnabled) {
    const ratingSummary = document.createElement('div');
    ratingSummary.className = 'puzzle-rating-summary';
    const ratingValue = document.createElement('strong');
    if (userRating) {
      ratingValue.textContent = `${userRating.rating}${userRating.provisional ? '?' : ''}`;
      if (ratingDelta) {
        const delta = document.createElement('span');
        delta.className = `puzzle-rating-delta puzzle-rating-delta--${ratingDelta > 0 ? 'up' : 'down'}`;
        delta.textContent = ` ${ratingDelta > 0 ? '+' : ''}${ratingDelta}`;
        ratingValue.append(delta);
      }
    } else {
      ratingValue.textContent = 'Unrated';
    }
    const ratingMeta = document.createElement('span');
    ratingMeta.className = 'puzzle-rating-meta';
    ratingMeta.textContent = `${solvedCount} solved of ${queue.length}`;
    ratingSummary.append(ratingValue, ratingMeta);
    ratingCard.append(ratingSummary);
  }
  if (!ratedEnabled) {
    const ratedNote = document.createElement('p');
    ratedNote.className = 'puzzle-rated-note';
    ratedNote.textContent =
      'Your puzzle rating will not change. Note that puzzles are not a competition. Your rating helps select the most appropriate puzzles for your skill level.';
    ratingCard.append(ratedNote);
  }

  const themesCard = document.createElement('section');
  themesCard.className = 'puzzle-left-card puzzle-theme-card';
  const themesTitle = document.createElement('h2');
  themesTitle.textContent = 'Puzzle themes';
  const themesCopy = document.createElement('p');
  themesCopy.textContent = 'Forcing lines grouped by mate pattern, piece, and variant.';
  themesCard.append(themesTitle);
  if (current && solvedIds.has(current.id)) {
    // Themes name the piece/pattern (e.g. "Drop", "Treasure"), so reveal them
    // only after the puzzle is solved to avoid giving the move away.
    themesCard.append(themesCopy, tagsPanel(current));
  } else if (current) {
    const hidden = document.createElement('p');
    hidden.className = 'puzzle-card-empty';
    hidden.textContent = 'Revealed after you solve it.';
    themesCard.append(hidden);
  } else {
    const empty = document.createElement('p');
    empty.className = 'puzzle-card-empty';
    empty.textContent = 'No themes';
    themesCard.append(empty);
  }

  const settingsCard = document.createElement('section');
  settingsCard.className = 'puzzle-left-card puzzle-settings-card';
  const settingsTitle = document.createElement('h2');
  settingsTitle.textContent = 'Settings';
  const form = document.createElement('div');
  form.className = 'puzzle-settings';
  // The variant picker only appears when more than one variant is surfaced.
  if (PUZZLE_VARIANT_FILTERS.length > 1) {
    const field = document.createElement('label');
    field.className = 'puzzle-field';
    const fieldLabel = document.createElement('span');
    fieldLabel.textContent = 'Variant';
    const select = document.createElement('select');
    select.className = 'puzzle-select';
    select.dataset.puzzleVariant = 'true';
    for (const filter of PUZZLE_VARIANT_FILTERS) {
      const option = document.createElement('option');
      option.value = filter;
      option.textContent = variantFilterLabel(filter);
      select.append(option);
    }
    select.value = variantFilter;
    select.addEventListener('change', () => {
      void onVariantChange(parseVariantFilter(select.value));
    });
    field.append(fieldLabel, select);
    form.append(field);
  }
  const autoNextToggle = document.createElement('label');
  autoNextToggle.className = 'puzzle-toggle';
  const autoNextInput = document.createElement('input');
  autoNextInput.type = 'checkbox';
  autoNextInput.checked = autoNext;
  autoNextInput.dataset.puzzleAutoNext = 'true';
  autoNextInput.addEventListener('change', () => {
    onAutoNextChange(autoNextInput.checked);
  });
  const autoNextSwitch = document.createElement('span');
  autoNextSwitch.className = 'puzzle-toggle-switch';
  autoNextSwitch.setAttribute('aria-hidden', 'true');
  const autoNextLabel = document.createElement('span');
  autoNextLabel.className = 'puzzle-toggle-label';
  autoNextLabel.textContent = 'Jump to next puzzle immediately';
  autoNextToggle.append(autoNextInput, autoNextSwitch, autoNextLabel);
  form.append(autoNextToggle);
  settingsCard.append(settingsTitle, form);

  host.append(infoCard, ratingCard, themesCard, settingsCard);
}

function puzzleInfoRow(
  icon: 'target' | 'variant',
  lines: readonly HTMLElement[],
  variant?: PuzzleVariant,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'puzzle-info-row';
  const iconEl = document.createElement('span');
  iconEl.className = `puzzle-info-icon puzzle-info-icon--${icon}`;
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.innerHTML =
    icon === 'target'
      ? targetAvatarSvg()
      : variant
        ? renderVariantMarker(variantMiniIdForPuzzle(variant), {
            size: 54,
            label: `${variantLabel(variant)} marker`,
            className: 'puzzle-variant-marker',
          })
        : '';
  const copy = document.createElement('div');
  copy.className = 'puzzle-info-copy';
  copy.append(...lines);
  row.append(iconEl, copy);
  return row;
}

function puzzleInfoLine(text: string): HTMLSpanElement {
  const line = document.createElement('span');
  line.textContent = text;
  return line;
}

// The "From X" header lines for the info card. Mined xiangqi puzzles that carry
// source-game attribution get a lichess-style "From game" header with the event
// and both players; everything else falls back to "From set <variant>".
export function sourceGameLines(
  puzzle: Pick<PuzzleSummary, 'variant' | 'sourceGame'>,
): HTMLElement[] {
  const source = puzzle.sourceGame;
  const hasAttribution =
    puzzle.variant === XIANGQI_SPEC_ID &&
    source !== undefined &&
    (source.event !== undefined || source.redName !== undefined || source.blackName !== undefined);
  if (!source || !hasAttribution) {
    return [puzzleInfoLine(`From set ${variantLabel(puzzle.variant)}`)];
  }
  const lines: HTMLElement[] = [puzzleInfoLine(sourceGameHeader(source))];
  if (source.redName !== undefined || source.blackName !== undefined) {
    lines.push(
      sourceGamePlayerLine('red', source.redName, source.result),
      sourceGamePlayerLine('black', source.blackName, source.result),
    );
  }
  return lines;
}

// "From game · <event> (<year>)" — event and year are both optional.
function sourceGameHeader(source: NonNullable<PuzzleSummary['sourceGame']>): string {
  const year = source.playedOn?.slice(0, 4);
  const parts = [source.event, year ? `(${year})` : undefined].filter(
    (part): part is string => part !== undefined && part.length > 0,
  );
  return parts.length > 0 ? `From game · ${parts.join(' ')}` : 'From game';
}

// One player row: a color disc, the player name, and a result glyph on the
// side that won (½ on a draw). Names are the raw source-archive strings.
function sourceGamePlayerLine(
  color: 'red' | 'black',
  name: string | undefined,
  result: string | undefined,
): HTMLSpanElement {
  const line = document.createElement('span');
  line.className = 'puzzle-source-player';
  const disc = document.createElement('span');
  disc.className = `puzzle-source-disc puzzle-source-disc--${color}`;
  disc.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'puzzle-source-player-name';
  label.textContent = name && name.length > 0 ? name : color === 'red' ? 'Red' : 'Black';
  line.append(disc, label);
  const glyph = sourceGameResultGlyph(color, result);
  if (glyph) {
    const outcome = document.createElement('span');
    outcome.className = 'puzzle-source-result';
    outcome.textContent = glyph;
    line.append(outcome);
  }
  return line;
}

function sourceGameResultGlyph(color: 'red' | 'black', result: string | undefined): string | null {
  if (result === '1/2-1/2') return '½';
  if (result === '1-0') return color === 'red' ? '1' : null;
  if (result === '0-1') return color === 'black' ? '1' : null;
  return null;
}

function puzzleInfoDivider(): HTMLHRElement {
  const divider = document.createElement('hr');
  divider.className = 'puzzle-info-divider';
  return divider;
}

// Stable, lichess-style puzzle identifier: "Puzzle #bMpKA", where the code is a
// deterministic hash of the puzzle id (unlike the old queue position, which
// shuffled every visit). The code links to the puzzle's canonical full-id URL;
// hand-typing /puzzles/<code> also resolves (see resolveToFullPuzzleId).
function puzzleCodeLine(puzzle: PuzzleSummary): HTMLSpanElement {
  const line = document.createElement('span');
  line.append('Puzzle ');
  const link = document.createElement('a');
  link.className = 'puzzle-code-link';
  link.href = `/puzzles/${encodeURIComponent(puzzle.id)}`;
  link.dataset.puzzleCode = puzzleShortCode(puzzle.id);
  link.textContent = `#${puzzleShortCode(puzzle.id)}`;
  line.append(link);
  return line;
}

function renderPuzzleDetail(
  host: HTMLElement,
  session: PuzzleSession,
  renderSession: () => void,
  navigation: PuzzleNavigation,
  onSolved: (id: string) => void,
): void {
  host.replaceChildren();

  const boardPanel = document.createElement('div');
  boardPanel.className = 'puzzle-board-panel';
  const board = document.createElement('div');
  board.className = 'puzzle-board';
  // Tag the board with the current puzzle so async reveal playback can detect a
  // navigation away (new puzzle = new id) and stop stepping a stale session.
  board.dataset.puzzleId = session.puzzle.id;
  const side = document.createElement('aside');
  side.className = 'puzzle-side-panel';

  paintPuzzleBoard(board, session, renderSession, onSolved);

  const trainer = document.createElement('div');
  trainer.className = 'puzzle-trainer-panel';
  trainer.append(moveListPanel(session), feedbackPanel(session, navigation, renderSession));
  side.append(trainer, actionPanel(session, renderSession));

  // Post-completion engine analysis (standard xiangqi): once the puzzle is over
  // (solved or its solution revealed), surface the local-engine panel + board
  // arrows. Gated to non-spoiler states only — a bare wrong move keeps solving
  // open, so the engine stays hidden until the outcome is locked. The controller
  // persists on the session across renders (see PuzzleAnalysisController).
  if (puzzleAnalysisSupported(session) && isPuzzleComplete(session)) {
    if (!session.analysis) session.analysis = createPuzzleAnalysis();
    // The engine panel is a third child in a column sized to the board; let the
    // column scroll instead of clipping (grid is otherwise a fixed 2-row shape).
    side.classList.add('puzzle-side-panel--analysis');
    side.append(session.analysis.el);
    session.analysis.refresh(session, board);
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

// Paint the interactive board (+ reserves for drop variants) and wire drag.
// Fortress Xiangqi renders on its own 7x8 corner-palace board; standard Xiangqi
// on the shared 9x10 intersection board (xiangqi-board.ts); Mini/Drop Mini
// share the 7x7 mini renderer (Drop Mini via a mini-shaped board view).
function paintPuzzleBoard(
  board: HTMLElement,
  session: PuzzleSession,
  renderSession: () => void,
  onSolved: (id: string) => void,
): void {
  const displayState = puzzleReplayState(session);
  if (session.puzzle.variant === FORTRESS_XIANGQI_SPEC_ID) {
    paintFortressPuzzleBoard(
      board,
      session,
      displayState as FortressXiangqiGameState,
      renderSession,
      onSolved,
    );
    return;
  }
  if (session.puzzle.variant === JUNGLE_SPEC_ID) {
    paintJunglePuzzleBoard(
      board,
      session,
      displayState as JungleGameState,
      renderSession,
      onSolved,
    );
    return;
  }
  if (session.puzzle.variant === XIANGQI_SPEC_ID) {
    paintXiangqiPuzzleBoard(
      board,
      session,
      displayState as XiangqiGameState,
      renderSession,
      onSolved,
    );
    return;
  }
  const { boardView, dropView } = puzzleViews(session, displayState);
  const boardTarget = dropView
    ? renderPuzzleBoardShell(board, session, dropView, renderSession, onSolved)
    : board;
  const legalMoves = highlightedBoardMoves(session);
  boardTarget.innerHTML = renderMiniXiangqiBoardSvg(boardView, boardView.perspective, {
    interactive: true,
    showFog: false,
    selectedSquare: session.selectedSquare as MiniXiangqiSquare | null,
    legalMoves,
    draggingFrom: session.draggingFrom as MiniXiangqiSquare | null,
  });
  installBoardDrag({
    board: boardTarget,
    ghostSizePx: MINI_XIANGQI_PIECE_PX,
    onSquareClick: (square) => {
      if (!isReplayLive(session)) return;
      void handleBoardClick(session, square as MiniXiangqiSquare, renderSession, onSolved);
    },
    canDragFrom: (square) => canDragBoardPiece(session, square as MiniXiangqiSquare),
    ghostHtml: (square) => {
      const entry = boardView.board[square as MiniXiangqiSquare];
      if (!entry || entry.shrouded !== false) return null;
      return miniXiangqiPieceGhostSvg(entry.piece);
    },
    onDragStart: (from) => {
      session.selectedSquare = from as MiniXiangqiSquare;
      session.selectedDrop = null;
      session.draggingFrom = from as MiniXiangqiSquare;
      renderSession();
    },
    onDrop: (from, to) => {
      void handleBoardDrop(
        session,
        from as MiniXiangqiSquare,
        (to as MiniXiangqiSquare | null) ?? null,
        renderSession,
        onSolved,
      );
    },
  });
}

function paintFortressPuzzleBoard(
  board: HTMLElement,
  session: PuzzleSession,
  state: FortressXiangqiGameState,
  renderSession: () => void,
  onSolved: (id: string) => void,
): void {
  const perspective = fortressPerspective(session);
  const view = getFortressXiangqiPlayerView(state, perspective);
  const boardTarget = renderFortressPuzzleShell(board, session, view, renderSession, onSolved);
  boardTarget.innerHTML = renderFortressXiangqiBoardSvg(view, perspective, {
    interactive: true,
    selectedSquare: session.selectedSquare as FortressXiangqiSquare | null,
    targets: fortressHighlightTargets(session, view),
    draggingFrom: session.draggingFrom as FortressXiangqiSquare | null,
  });
  installBoardDrag({
    board: boardTarget,
    ghostSizePx: FORTRESS_XIANGQI_PIECE_PX,
    onSquareClick: (square) => {
      if (!isReplayLive(session)) return;
      void handleFortressBoardClick(
        session,
        square as FortressXiangqiSquare,
        renderSession,
        onSolved,
      );
    },
    canDragFrom: (square) => canDragFortressPiece(session, square as FortressXiangqiSquare),
    ghostHtml: (square) => {
      const piece = view.board[square as FortressXiangqiSquare];
      return piece ? fortressXiangqiPieceGhostSvg(piece) : null;
    },
    onDragStart: (from) => {
      session.selectedSquare = from as FortressXiangqiSquare;
      session.selectedDrop = null;
      session.draggingFrom = from as FortressXiangqiSquare;
      renderSession();
    },
    onDrop: (from, to) => {
      void handleFortressBoardDrop(
        session,
        from as FortressXiangqiSquare,
        (to as FortressXiangqiSquare | null) ?? null,
        renderSession,
        onSolved,
      );
    },
  });
}

// Jungle (Dou Shou Qi) renders on its own 7x9 board with no reserve/hand (no
// drops), so it paints straight onto the board host — simpler than the fortress
// path. Mirrors the live-jungle drag wiring.
function paintJunglePuzzleBoard(
  board: HTMLElement,
  session: PuzzleSession,
  state: JungleGameState,
  renderSession: () => void,
  onSolved: (id: string) => void,
): void {
  const perspective = junglePerspective(session);
  const view = getJunglePlayerView(state, perspective);
  board.innerHTML = renderJungleBoardSvg(view.board, {
    perspective,
    interactive: true,
    selected: session.selectedSquare as JungleSquare | null,
    targets: jungleHighlightTargets(session, view),
    draggingFrom: session.draggingFrom as JungleSquare | null,
    lastMove: view.lastMove ?? null,
  });
  installBoardDrag({
    board,
    // The board scales above its SVG units, so size the ghost to the on-screen cell.
    ghostSizePx: () => {
      const width = board.getBoundingClientRect().width;
      return width > 0 ? width / JUNGLE_BOARD_VIEW.files : JUNGLE_BOARD_VIEW.cell;
    },
    onSquareClick: (square) => {
      if (!isReplayLive(session)) return;
      void handleJungleBoardClick(session, square as JungleSquare, renderSession, onSolved);
    },
    canDragFrom: (square) => canDragJunglePiece(session, square as JungleSquare),
    ghostHtml: (square) => {
      const piece = view.board[square as JungleSquare];
      return piece ? junglePieceGhostSvg(piece) : null;
    },
    onDragStart: (from) => {
      session.selectedSquare = from as JungleSquare;
      session.selectedDrop = null;
      session.draggingFrom = from as JungleSquare;
      renderSession();
    },
    onDrop: (from, to) => {
      void handleJungleBoardDrop(
        session,
        from as JungleSquare,
        (to as JungleSquare | null) ?? null,
        renderSession,
        onSolved,
      );
    },
  });
}

function junglePerspective(session: PuzzleSession): JungleColor {
  return (session.puzzle.sideToMove as JungleColor | null) ?? 'red';
}

function jungleLiveView(session: PuzzleSession): JunglePlayerView {
  return getJunglePlayerView(session.state as JungleGameState, junglePerspective(session));
}

function jungleMovesFrom(view: JunglePlayerView, from: JungleSquare): JungleMove[] {
  return view.legalMoves.filter((move) => move.from === from);
}

function jungleHighlightTargets(session: PuzzleSession, view: JunglePlayerView): JungleSquare[] {
  if (!isReplayLive(session) || !session.selectedSquare) return [];
  return jungleMovesFrom(view, session.selectedSquare as JungleSquare).map((move) => move.to);
}

function jungleIsSelectable(
  session: PuzzleSession,
  view: JunglePlayerView,
  square: JungleSquare,
): boolean {
  const piece = view.board[square];
  return (
    !!piece &&
    piece.color === (activeTurn(session) as JungleColor) &&
    jungleMovesFrom(view, square).length > 0
  );
}

function canDragJunglePiece(session: PuzzleSession, square: JungleSquare): boolean {
  if (
    session.submitting ||
    session.revealed ||
    session.state.status.type !== 'playing' ||
    !isReplayLive(session)
  ) {
    return false;
  }
  return jungleIsSelectable(session, jungleLiveView(session), square);
}

async function handleJungleBoardClick(
  session: PuzzleSession,
  square: JungleSquare,
  renderSession: () => void,
  onSolved: (id: string) => void,
): Promise<void> {
  if (
    session.submitting ||
    session.revealed ||
    session.state.status.type !== 'playing' ||
    !isReplayLive(session)
  ) {
    return;
  }
  const view = jungleLiveView(session);
  if (session.selectedSquare) {
    const move = jungleMovesFrom(view, session.selectedSquare as JungleSquare).find(
      (candidate) => candidate.to === square,
    );
    if (move) {
      await submitMove(session, move, renderSession, onSolved);
      return;
    }
  }
  if (jungleIsSelectable(session, view, square)) {
    session.selectedSquare = square;
    session.selectedDrop = null;
    session.feedback = { kind: 'neutral', text: `${square} selected.` };
  } else {
    session.selectedSquare = null;
    session.selectedDrop = null;
    session.feedback = { kind: 'neutral', text: 'Find the best move.' };
  }
  renderSession();
}

async function handleJungleBoardDrop(
  session: PuzzleSession,
  from: JungleSquare,
  to: JungleSquare | null,
  renderSession: () => void,
  onSolved: (id: string) => void,
): Promise<void> {
  session.draggingFrom = null;
  if (
    session.submitting ||
    session.state.status.type !== 'playing' ||
    !to ||
    !isReplayLive(session)
  ) {
    session.selectedSquare = null;
    session.selectedDrop = null;
    renderSession();
    return;
  }
  const move = jungleMovesFrom(jungleLiveView(session), from).find(
    (candidate) => candidate.to === to,
  );
  if (move) {
    await submitMove(session, move, renderSession, onSolved);
    return;
  }
  session.selectedSquare = null;
  session.selectedDrop = null;
  session.feedback = { kind: 'neutral', text: 'Find the best move.' };
  renderSession();
}

// ── Standard Xiangqi ─────────────────────────────────────────────────────────
// Renders on the canonical 9x10 intersection board (xiangqi-board.ts, shared
// with the live room / replay / analysis). No reserves, so it paints straight
// onto the board host like Jungle; selection state lives on the shared session
// and the pure xiangqiClickResult decides click-to-move.

function paintXiangqiPuzzleBoard(
  board: HTMLElement,
  session: PuzzleSession,
  state: XiangqiGameState,
  renderSession: () => void,
  onSolved: (id: string) => void,
): void {
  const perspective = xiangqiPerspective(session);
  const view = getStandardXiangqiPlayerView(state, perspective);
  const host = document.createElement('div');
  // xiangqi-live-board carries the canonical 552:612 aspect + corner clipping;
  // puzzle-xiangqi-board binds its footprint to the puzzle height budget.
  host.className = 'xiangqi-live-board puzzle-xiangqi-board';
  host.innerHTML = xiangqiBoardSvg(view, perspective, {
    interactive: true,
    // The click layer derives target hints from the view + selection, so drop
    // the selection while scrubbing history instead of painting stale targets.
    selectedSquare: isReplayLive(session) ? (session.selectedSquare as XiangqiSquare | null) : null,
    draggingFrom: session.draggingFrom as XiangqiSquare | null,
  });
  board.append(host);
  installBoardDrag({
    board: host,
    ghostSizePx: XIANGQI_PIECE_SIZE,
    onSquareClick: (square) => {
      if (!isReplayLive(session)) return;
      void handleXiangqiBoardClick(session, square as XiangqiSquare, renderSession, onSolved);
    },
    canDragFrom: (square) => canDragXiangqiPiece(session, square as XiangqiSquare),
    ghostHtml: (square) => {
      const piece = view.board[square as XiangqiSquare];
      return piece ? xiangqiPieceGhostSvg(piece) : null;
    },
    onDragStart: (from) => {
      session.selectedSquare = from as XiangqiSquare;
      session.selectedDrop = null;
      session.draggingFrom = from as XiangqiSquare;
      renderSession();
    },
    onDrop: (from, to) => {
      void handleXiangqiBoardDrop(
        session,
        from as XiangqiSquare,
        (to as XiangqiSquare | null) ?? null,
        renderSession,
        onSolved,
      );
    },
  });
}

function xiangqiPerspective(session: PuzzleSession): XiangqiColor {
  return (session.puzzle.sideToMove as XiangqiColor | null) ?? 'red';
}

// ── Post-completion engine analysis (standard xiangqi only) ──────────────────
// A lichess-style local-engine surface shown once a xiangqi puzzle is finished
// (solved, failed, or revealed): an on/off toggle, eval + principal-variation
// lines, and the engine's candidate moves drawn as arrows on the puzzle board.
// Reuses the review board's ceval stack unchanged; the only puzzle-specific bit
// is feeding the engine a FEN of the displayed position — mined puzzles begin
// mid-game, so there is no start-position move list to replay.
type PuzzleAnalysisController = {
  el: HTMLElement;
  // Re-point the engine at the currently displayed position and (re-)apply the
  // engine arrows to the freshly rebuilt board host. Called after each render.
  refresh(session: PuzzleSession, boardHost: HTMLElement): void;
  dispose(): void;
};

// Which puzzle families expose the post-completion analysis engine. Standard
// xiangqi only for now: it maps to the ceval 'xiangqi' variant and we can
// serialize its state to an engine FEN (standardXiangqiEngineFen). This is the
// deliberate extension point for per-variant engines — as each family gets its
// own engine (Fortress already has a ceval variant; Mini/Jungle will follow),
// add it here and generalise createPuzzleAnalysis's hardcoded 'xiangqi' variant
// + FEN builder to dispatch on session.puzzle.variant.
function puzzleAnalysisSupported(session: PuzzleSession): boolean {
  return session.puzzle.variant === XIANGQI_SPEC_ID;
}

function formatXiangqiEngineMove(uci: string): string {
  const squares = fsfUciToXiangqiSquares(uci);
  return squares ? `${squares.from}-${squares.to}` : uci;
}

function createPuzzleAnalysis(): PuzzleAnalysisController {
  let arrows: XiangqiBoardArrow[] = [];
  let boardHost: HTMLElement | null = null;
  let perspective: XiangqiColor = 'red';
  let lastFen: string | null = null;

  const paintArrows = (): void => {
    const layer = boardHost?.querySelector('.xq-live-arrows');
    if (layer)
      layer.innerHTML = arrows.map((arrow) => xiangqiArrowSvg(arrow, perspective)).join('');
  };

  const panel = createEnginePanel({
    variant: 'xiangqi',
    formatPvMove: formatXiangqiEngineMove,
    onLines: (lines) => {
      arrows = lines?.length ? engineArrowsFromLines(lines) : [];
      paintArrows();
    },
  });

  const container = document.createElement('section');
  container.className = 'puzzle-analysis-panel';
  container.append(panel.el);

  return {
    el: container,
    refresh(session, host) {
      boardHost = host;
      perspective = xiangqiPerspective(session);
      // Re-apply the last-known arrows onto the rebuilt board immediately (the
      // board's arrow layer is regenerated empty on every render).
      paintArrows();
      const fen = standardXiangqiEngineFen(puzzleReplayState(session) as XiangqiGameState);
      if (fen !== lastFen) {
        lastFen = fen;
        // setPosition clears arrows (onLines(null)) then re-evaluates if the
        // engine is on; a no-op while the engine is off beyond storing the FEN.
        panel.setPosition([], fen);
      }
    },
    dispose() {
      panel.dispose();
    },
  };
}

function xiangqiLiveView(session: PuzzleSession): StandardXiangqiPlayerView {
  return getStandardXiangqiPlayerView(
    session.state as XiangqiGameState,
    xiangqiPerspective(session),
  );
}

function canDragXiangqiPiece(session: PuzzleSession, square: XiangqiSquare): boolean {
  if (
    session.submitting ||
    session.revealed ||
    session.state.status.type !== 'playing' ||
    !isReplayLive(session)
  ) {
    return false;
  }
  const view = xiangqiLiveView(session);
  const piece = view.board[square];
  // Any of your pieces can be lifted on your turn, even one with no legal move:
  // it shows the origin highlight + faded source, no destination dots, and snaps
  // back on drop. The tap sibling lives in handleXiangqiBoardClick.
  return !!piece && piece.color === (activeTurn(session) as XiangqiColor);
}

async function handleXiangqiBoardClick(
  session: PuzzleSession,
  square: XiangqiSquare,
  renderSession: () => void,
  onSolved: (id: string) => void,
): Promise<void> {
  if (
    session.submitting ||
    session.revealed ||
    session.state.status.type !== 'playing' ||
    !isReplayLive(session)
  ) {
    return;
  }
  const view = xiangqiLiveView(session);
  const result = xiangqiClickResult(
    view,
    activeTurn(session),
    session.selectedSquare as XiangqiSquare | null,
    square,
  );
  if (result.kind === 'move') {
    await submitMove(session, result.move, renderSession, onSolved);
    return;
  }
  if (result.kind === 'select') {
    session.selectedSquare = result.square;
    session.selectedDrop = null;
    session.feedback = { kind: 'neutral', text: `${result.square} selected.` };
  } else if (result.kind === 'clear') {
    // xiangqiClickResult only 'select's a piece that has a legal move. Let the
    // solver also tap-pick one of their pieces that has no legal move (origin
    // highlight, no dest dots) instead of clearing — the tap sibling of
    // canDragXiangqiPiece.
    const piece = view.board[square];
    const ownDeadPiece =
      !!piece &&
      piece.color === (activeTurn(session) as XiangqiColor) &&
      square !== session.selectedSquare;
    if (ownDeadPiece) {
      session.selectedSquare = square;
      session.selectedDrop = null;
      session.feedback = { kind: 'neutral', text: `${square} selected.` };
    } else {
      session.selectedSquare = null;
      session.selectedDrop = null;
      session.feedback = { kind: 'neutral', text: 'Find the best move.' };
    }
  }
  renderSession();
}

async function handleXiangqiBoardDrop(
  session: PuzzleSession,
  from: XiangqiSquare,
  to: XiangqiSquare | null,
  renderSession: () => void,
  onSolved: (id: string) => void,
): Promise<void> {
  session.draggingFrom = null;
  if (
    session.submitting ||
    session.state.status.type !== 'playing' ||
    !to ||
    !isReplayLive(session)
  ) {
    session.selectedSquare = null;
    session.selectedDrop = null;
    renderSession();
    return;
  }
  const move = xiangqiLiveView(session).legalMoves.find(
    (candidate) => candidate.from === from && candidate.to === to,
  );
  if (move) {
    await submitMove(session, move, renderSession, onSolved);
    return;
  }
  session.selectedSquare = null;
  session.selectedDrop = null;
  session.feedback = { kind: 'neutral', text: 'Find the best move.' };
  renderSession();
}

function renderFortressPuzzleShell(
  host: HTMLElement,
  session: PuzzleSession,
  view: FortressXiangqiPlayerView,
  renderSession: () => void,
  onSolved: (id: string) => void,
): HTMLElement {
  const shell = document.createElement('div');
  // puzzle-fortress-shell narrows the shell for the taller 7x8 board so both
  // pockets stay in view (the drop shell is tuned for the square 7x7 board).
  shell.className =
    'puzzle-board-shell puzzle-fortress-shell board-shell drop-mini-reserve-container';
  // Crazyhouse-style pockets flanking the board: opponent's above, the solver's
  // own directly below. Dedicated puzzle-pocket styling (not the capture strip,
  // whose fixed height + overflow:hidden clipped the taller drop chips).
  const topReserve = document.createElement('div');
  topReserve.className = 'puzzle-pocket puzzle-pocket--opponent puzzle-board-reserve';
  topReserve.setAttribute('aria-label', 'Opponent reserve');
  const boardSurface = document.createElement('div');
  boardSurface.className = 'puzzle-board-surface';
  const bottomReserve = document.createElement('div');
  bottomReserve.className = 'puzzle-pocket puzzle-pocket--own puzzle-board-reserve';
  bottomReserve.setAttribute('aria-label', 'Your reserve');

  const bottom = view.perspective;
  const top = bottom === 'red' ? 'black' : 'red';
  fillFortressPuzzleReserve(topReserve, session, view, top, false, renderSession, onSolved);
  fillFortressPuzzleReserve(bottomReserve, session, view, bottom, true, renderSession, onSolved);

  shell.append(topReserve, boardSurface, bottomReserve);
  host.append(shell);
  return boardSurface;
}

function fillFortressPuzzleReserve(
  reserve: HTMLElement,
  session: PuzzleSession,
  view: FortressXiangqiPlayerView,
  color: FortressXiangqiColor,
  isBottom: boolean,
  renderSession: () => void,
  onSolved: (id: string) => void,
): void {
  const canPlay =
    isBottom &&
    color === activeTurn(session) &&
    session.state.status.type === 'playing' &&
    isReplayLive(session) &&
    !session.submitting;
  fillFortressXiangqiReserve(reserve, view, color, {
    interactive: canPlay,
    selectedRole: canPlay ? (session.selectedDrop as FortressXiangqiDropRole | null) : null,
    onSelect: (role) => {
      if (!canPlay) return;
      session.selectedDrop = session.selectedDrop === role ? null : role;
      session.selectedSquare = null;
      session.feedback = { kind: 'neutral', text: `${dropRoleLabel(role)} selected.` };
      renderSession();
    },
  });
  installHandDrag({
    hand: reserve,
    ghostSizePx: FORTRESS_XIANGQI_PIECE_PX,
    isRole: isFortressDropRole,
    canDragRole: (role) => canPlay && (view.hands[color][role] ?? 0) > 0,
    ghostHtml: (role) => fortressXiangqiPieceGhostSvg({ color, role }),
    onDragStart: (role) => {
      if (!canPlay) return;
      session.selectedDrop = role;
      session.selectedSquare = null;
      session.draggingFrom = null;
      session.feedback = { kind: 'neutral', text: `${dropRoleLabel(role)} selected.` };
      renderSession();
    },
    onDrop: (role, to) => {
      void handleFortressReserveDrop(
        session,
        role,
        (to as FortressXiangqiSquare | null) ?? null,
        renderSession,
        onSolved,
      );
    },
  });
}

function renderPuzzleBoardShell(
  host: HTMLElement,
  session: PuzzleSession,
  view: ReturnType<typeof getDropMiniXiangqiPlayerView>,
  renderSession: () => void,
  onSolved: (id: string) => void,
): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'puzzle-board-shell board-shell drop-mini-reserve-container';
  const topReserve = document.createElement('div');
  topReserve.className = 'captures-strip captures-strip-top puzzle-board-reserve';
  topReserve.setAttribute('aria-label', 'Top reserve');
  const boardSurface = document.createElement('div');
  boardSurface.className = 'puzzle-board-surface';
  const bottomReserve = document.createElement('div');
  bottomReserve.className = 'captures-strip captures-strip-bottom puzzle-board-reserve';
  bottomReserve.setAttribute('aria-label', 'Bottom reserve');

  const bottom = view.perspective;
  const top = bottom === 'red' ? 'black' : 'red';
  fillPuzzleReserveStrip(topReserve, session, view, top, false, renderSession, onSolved);
  fillPuzzleReserveStrip(bottomReserve, session, view, bottom, true, renderSession, onSolved);

  shell.append(topReserve, boardSurface, bottomReserve);
  host.append(shell);
  return boardSurface;
}

function feedbackPanel(
  session: PuzzleSession,
  navigation: PuzzleNavigation,
  renderSession: () => void,
): HTMLElement {
  if (isSessionSolved(session)) return solvedPanel(session, navigation, renderSession);
  if (session.revealed) return revealedPanel(navigation);

  const panel = document.createElement('div');
  panel.className = `puzzle-feedback puzzle-feedback--${session.feedback.kind}`;
  const icon = document.createElement('span');
  icon.className = 'puzzle-feedback-icon';
  icon.innerHTML = puzzleGeneralIconSvg(session.puzzle);
  icon.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('div');
  copy.className = 'puzzle-feedback-copy';
  const title = document.createElement('h2');
  title.className = 'puzzle-feedback-title';
  title.textContent = feedbackTitle(session);
  const body = document.createElement('span');
  body.className = 'puzzle-feedback-body';
  body.textContent = session.feedback.text;
  copy.append(title, body, assistRow(session, navigation, renderSession));
  panel.append(icon, copy);
  return panel;
}

// Persistent escape hatches while a puzzle is unsolved. Hint + view-solution are
// always available (they double as give-up; using either books a failed attempt
// server-side). The advance-to-next CTA appears only once the puzzle is failed,
// and — because it keys on session.failed, not the transient feedback kind — it
// survives the piece-select feedback reset (so a retry can't hide the way out).
function assistRow(
  session: PuzzleSession,
  navigation: PuzzleNavigation,
  renderSession: () => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'puzzle-assist-row';

  const hint = document.createElement('button');
  hint.type = 'button';
  hint.className = 'puzzle-feedback-skip puzzle-assist-hint';
  hint.dataset.puzzleHint = 'true';
  hint.textContent = 'Get a hint';
  hint.disabled = session.submitting;
  hint.addEventListener('click', () => {
    void requestHint(session, renderSession);
  });

  const solution = document.createElement('button');
  solution.type = 'button';
  solution.className = 'puzzle-feedback-skip puzzle-assist-solution';
  solution.dataset.puzzleReveal = 'true';
  solution.textContent = 'View solution';
  solution.disabled = session.submitting;
  solution.addEventListener('click', () => {
    void revealSolution(session, renderSession);
  });

  row.append(hint, solution);

  if (session.failed && navigation.hasNext) {
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'puzzle-feedback-skip puzzle-assist-next';
    skip.dataset.puzzleSkip = 'true';
    skip.textContent = 'Skip to the next puzzle';
    skip.addEventListener('click', navigation.goNext);
    row.append(skip);
  }
  return row;
}

// Shown after "View solution": the answer has been played out and the board is a
// locked replay to scrub. Distinct from the solved panel (no "Success!") — a
// reveal counts as a give-up, not a win.
function revealedPanel(navigation: PuzzleNavigation): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'puzzle-solved-panel puzzle-revealed-panel';

  const title = document.createElement('h2');
  title.textContent = 'Solution';

  const cont = document.createElement('button');
  cont.type = 'button';
  cont.className = 'puzzle-continue-button';
  cont.dataset.puzzleNext = 'true';
  cont.innerHTML = `${ICON_PLAY}<span>Next puzzle</span>`;
  cont.setAttribute('aria-label', 'Next puzzle');
  cont.disabled = !navigation.hasNext;
  cont.addEventListener('click', navigation.goNext);

  panel.append(title, cont);
  return panel;
}

function solvedPanel(
  session: PuzzleSession,
  navigation: PuzzleNavigation,
  renderSession: () => void,
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'puzzle-solved-panel';

  const title = document.createElement('h2');
  title.textContent = 'Success!';

  // Prominent primary CTA (lichess-style bar), in Mistboard's own accent. It
  // advances along the visit's rotated queue and is focused on solve (see
  // renderPuzzleDetail) so Enter or Space moves on immediately.
  const cont = document.createElement('button');
  cont.type = 'button';
  cont.className = 'puzzle-continue-button';
  cont.dataset.puzzleNext = 'true';
  cont.innerHTML = `${ICON_PLAY}<span>Next puzzle</span>`;
  cont.setAttribute('aria-label', 'Next puzzle');
  cont.disabled = !navigation.hasNext;
  cont.addEventListener('click', navigation.goNext);

  const feedbackRow = document.createElement('div');
  feedbackRow.className = 'puzzle-solved-feedback';
  // Standard xiangqi now gets an inline local-engine analysis panel below (see
  // renderPuzzleDetail), so the old disabled "analysis board" stub is gone.
  const prompt = document.createElement('span');
  prompt.className = 'puzzle-vote-prompt';
  prompt.textContent = session.vote ? 'Thanks for the feedback!' : 'Did you like this puzzle?';
  const votes = document.createElement('div');
  votes.className = 'puzzle-vote-actions';
  votes.append(
    puzzleVoteButton('up', session, renderSession),
    puzzleVoteButton('down', session, renderSession),
  );
  feedbackRow.append(prompt, votes);

  panel.append(title, cont, feedbackRow);
  return panel;
}

// The thumb vote records a like/dislike and shows in-place feedback (the chosen
// button reads as selected). It deliberately does NOT advance to the next
// puzzle — advancing is the "Next puzzle" CTA's job.
function puzzleVoteButton(
  kind: 'up' | 'down',
  session: PuzzleSession,
  renderSession: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  const selected = session.vote === kind;
  button.className = `puzzle-vote-button puzzle-vote-button--${kind}${
    selected ? ' puzzle-vote-button--selected' : ''
  }`;
  button.setAttribute(
    'aria-label',
    kind === 'up' ? 'Puzzle was helpful' : 'Puzzle was not helpful',
  );
  button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  button.innerHTML = kind === 'up' ? THUMB_UP_SVG : THUMB_DOWN_SVG;
  button.addEventListener('click', () => {
    // Toggle off if re-clicking the current vote, else set it. Re-render so both
    // buttons reflect the new state (and the prompt updates).
    session.vote = session.vote === kind ? null : kind;
    renderSession();
  });
  return button;
}

function moveListPanel(session: PuzzleSession): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'puzzle-moves';
  const list = document.createElement('ol');
  list.className = 'puzzle-move-list';
  const rows = puzzleMoveRows(session);
  for (const row of rows) {
    list.append(row);
  }
  panel.append(list);
  return panel;
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

function isSessionSolved(session: PuzzleSession): boolean {
  // `solved` mirrors the server's attempt.complete. Checking board status alone
  // missed winning-advantage puzzles, whose solution line ends while the game
  // is still in progress; a finished board still counts for mate/win lines.
  return session.solved || session.state.status.type === 'finished';
}

// The puzzle outcome is locked: solved, or the solution was revealed (a give-up
// that plays the answer out). A bare wrong move does NOT count — the trainer
// keeps solving open (retry / hint / view-solution), so the analysis engine
// stays hidden to avoid spoiling a still-open attempt.
function isPuzzleComplete(session: PuzzleSession): boolean {
  return isSessionSolved(session) || session.revealed;
}

function fillPuzzleReserveStrip(
  reserve: HTMLElement,
  session: PuzzleSession,
  view: ReturnType<typeof getDropMiniXiangqiPlayerView>,
  color: MiniXiangqiColor,
  isBottom: boolean,
  renderSession: () => void,
  onSolved: (id: string) => void,
): void {
  fillDropMiniXiangqiReserve(reserve, view, color, {
    interactive:
      isBottom &&
      color === activeTurn(session) &&
      session.state.status.type === 'playing' &&
      isReplayLive(session) &&
      !session.submitting,
    selectedRole:
      isBottom &&
      color === activeTurn(session) &&
      session.state.status.type === 'playing' &&
      isReplayLive(session) &&
      !session.submitting
        ? (session.selectedDrop as DropMiniXiangqiDropRole | null)
        : null,
    onSelect: (role) => {
      if (
        !isBottom ||
        color !== activeTurn(session) ||
        session.state.status.type !== 'playing' ||
        !isReplayLive(session)
      ) {
        return;
      }
      session.selectedDrop = session.selectedDrop === role ? null : role;
      session.selectedSquare = null;
      session.feedback = { kind: 'neutral', text: `${dropRoleLabel(role)} selected.` };
      renderSession();
    },
  });
  installHandDrag({
    hand: reserve,
    ghostSizePx: MINI_XIANGQI_PIECE_PX,
    isRole: isDropRole,
    canDragRole: (role) =>
      isBottom &&
      color === activeTurn(session) &&
      session.state.status.type === 'playing' &&
      isReplayLive(session) &&
      !session.submitting &&
      (view.hands[color][role] ?? 0) > 0,
    ghostHtml: (role) => miniXiangqiPieceGhostSvg({ color, role }),
    onDragStart: (role) => {
      if (
        !isBottom ||
        color !== activeTurn(session) ||
        session.state.status.type !== 'playing' ||
        !isReplayLive(session)
      ) {
        return;
      }
      session.selectedDrop = role;
      session.selectedSquare = null;
      session.draggingFrom = null;
      session.feedback = { kind: 'neutral', text: `${dropRoleLabel(role)} selected.` };
      renderSession();
    },
    onDrop: (role, to) => {
      void handleReserveDrop(
        session,
        role,
        to as MiniXiangqiSquare | null,
        renderSession,
        onSolved,
      );
    },
  });
}

function tagsPanel(puzzle: Pick<PuzzleSummary, 'themes'>): HTMLElement {
  const tags = document.createElement('div');
  tags.className = 'puzzle-tags';
  for (const theme of puzzle.themes) {
    const tag = document.createElement('span');
    tag.className = 'puzzle-tag';
    tag.textContent = themeLabel(theme);
    tags.append(tag);
  }
  return tags;
}

async function handleBoardClick(
  session: PuzzleSession,
  square: MiniXiangqiSquare,
  renderSession: () => void,
  onSolved: (id: string) => void,
): Promise<void> {
  if (
    session.submitting ||
    session.revealed ||
    session.state.status.type !== 'playing' ||
    !isReplayLive(session)
  ) {
    return;
  }
  if (session.selectedDrop) {
    const drop = session.selectedDrop as DropMiniXiangqiDropRole;
    const targets = dropTargetsFor(session, drop);
    if (targets.includes(square)) {
      await submitMove(session, { drop, to: square }, renderSession, onSolved);
      return;
    }
    session.selectedDrop = null;
    session.feedback = { kind: 'neutral', text: 'Reserve cleared.' };
    renderSession();
    return;
  }

  if (session.selectedSquare) {
    const move = boardMovesFor(session, session.selectedSquare as MiniXiangqiSquare).find(
      (m) => m.to === square,
    );
    if (move) {
      await submitMove(session, move, renderSession, onSolved);
      return;
    }
  }

  if (isSelectablePiece(session, square)) {
    session.selectedSquare = square;
    session.selectedDrop = null;
    session.feedback = { kind: 'neutral', text: `${square} selected.` };
  } else {
    session.selectedSquare = null;
    session.selectedDrop = null;
    session.feedback = { kind: 'neutral', text: 'Find the best move.' };
  }
  renderSession();
}

async function handleBoardDrop(
  session: PuzzleSession,
  from: MiniXiangqiSquare,
  to: MiniXiangqiSquare | null,
  renderSession: () => void,
  onSolved: (id: string) => void,
): Promise<void> {
  session.draggingFrom = null;
  if (
    session.submitting ||
    session.state.status.type !== 'playing' ||
    !to ||
    !isReplayLive(session)
  ) {
    session.selectedSquare = null;
    session.selectedDrop = null;
    renderSession();
    return;
  }

  const move = boardMovesFor(session, from).find((candidate) => candidate.to === to);
  if (move) {
    await submitMove(session, move, renderSession, onSolved);
    return;
  }

  session.selectedSquare = null;
  session.selectedDrop = null;
  session.feedback = { kind: 'neutral', text: 'Find the best move.' };
  renderSession();
}

async function handleReserveDrop(
  session: PuzzleSession,
  role: DropMiniXiangqiDropRole,
  to: MiniXiangqiSquare | null,
  renderSession: () => void,
  onSolved: (id: string) => void,
): Promise<void> {
  session.draggingFrom = null;
  session.selectedSquare = null;
  session.selectedDrop = null;
  if (
    session.submitting ||
    session.state.status.type !== 'playing' ||
    !to ||
    !isReplayLive(session)
  ) {
    renderSession();
    return;
  }

  if (dropTargetsFor(session, role).includes(to)) {
    await submitMove(session, { drop: role, to }, renderSession, onSolved);
    return;
  }

  session.feedback = { kind: 'neutral', text: 'Find the best move.' };
  renderSession();
}

// ── Fortress Xiangqi interaction ─────────────────────────────────────────────
// Parallels the Mini/Drop-Mini click/drag/drop handlers, but over the Fortress
// player view. Selection lives on the shared session; moves are submitted
// through the same variant-agnostic submitMove path.

function fortressPerspective(session: PuzzleSession): FortressXiangqiColor {
  return session.puzzle.sideToMove ?? 'red';
}

function fortressLiveView(session: PuzzleSession): FortressXiangqiPlayerView {
  return getFortressXiangqiPlayerView(
    session.state as FortressXiangqiGameState,
    fortressPerspective(session),
  );
}

function fortressHighlightTargets(
  session: PuzzleSession,
  view: FortressXiangqiPlayerView,
): FortressXiangqiSquare[] {
  if (!isReplayLive(session)) return [];
  if (session.selectedDrop) {
    return fortressXiangqiDropTargets(view, session.selectedDrop as FortressXiangqiDropRole);
  }
  if (!session.selectedSquare) return [];
  return fortressXiangqiBoardMoves(view, session.selectedSquare as FortressXiangqiSquare).map(
    (move) => move.to,
  );
}

function fortressIsSelectable(
  session: PuzzleSession,
  view: FortressXiangqiPlayerView,
  square: FortressXiangqiSquare,
): boolean {
  const piece = view.board[square];
  return (
    !!piece &&
    piece.color === activeTurn(session) &&
    fortressXiangqiBoardMoves(view, square).length > 0
  );
}

function canDragFortressPiece(session: PuzzleSession, square: FortressXiangqiSquare): boolean {
  if (
    session.submitting ||
    session.revealed ||
    session.state.status.type !== 'playing' ||
    !isReplayLive(session)
  ) {
    return false;
  }
  return fortressIsSelectable(session, fortressLiveView(session), square);
}

async function handleFortressBoardClick(
  session: PuzzleSession,
  square: FortressXiangqiSquare,
  renderSession: () => void,
  onSolved: (id: string) => void,
): Promise<void> {
  if (
    session.submitting ||
    session.revealed ||
    session.state.status.type !== 'playing' ||
    !isReplayLive(session)
  ) {
    return;
  }
  const view = fortressLiveView(session);
  if (session.selectedDrop) {
    const role = session.selectedDrop as FortressXiangqiDropRole;
    if (fortressXiangqiDropTargets(view, role).includes(square)) {
      await submitMove(session, { drop: role, to: square }, renderSession, onSolved);
      return;
    }
    session.selectedDrop = null;
    session.feedback = { kind: 'neutral', text: 'Reserve cleared.' };
    renderSession();
    return;
  }

  if (session.selectedSquare) {
    const move = fortressXiangqiBoardMoves(
      view,
      session.selectedSquare as FortressXiangqiSquare,
    ).find((candidate) => candidate.to === square);
    if (move) {
      await submitMove(session, move, renderSession, onSolved);
      return;
    }
  }

  if (fortressIsSelectable(session, view, square)) {
    session.selectedSquare = square;
    session.selectedDrop = null;
    session.feedback = { kind: 'neutral', text: `${square} selected.` };
  } else {
    session.selectedSquare = null;
    session.selectedDrop = null;
    session.feedback = { kind: 'neutral', text: 'Find the best move.' };
  }
  renderSession();
}

async function handleFortressBoardDrop(
  session: PuzzleSession,
  from: FortressXiangqiSquare,
  to: FortressXiangqiSquare | null,
  renderSession: () => void,
  onSolved: (id: string) => void,
): Promise<void> {
  session.draggingFrom = null;
  if (
    session.submitting ||
    session.state.status.type !== 'playing' ||
    !to ||
    !isReplayLive(session)
  ) {
    session.selectedSquare = null;
    session.selectedDrop = null;
    renderSession();
    return;
  }
  const move = fortressXiangqiBoardMoves(fortressLiveView(session), from).find(
    (candidate) => candidate.to === to,
  );
  if (move) {
    await submitMove(session, move, renderSession, onSolved);
    return;
  }
  session.selectedSquare = null;
  session.selectedDrop = null;
  session.feedback = { kind: 'neutral', text: 'Find the best move.' };
  renderSession();
}

async function handleFortressReserveDrop(
  session: PuzzleSession,
  role: FortressXiangqiDropRole,
  to: FortressXiangqiSquare | null,
  renderSession: () => void,
  onSolved: (id: string) => void,
): Promise<void> {
  session.draggingFrom = null;
  session.selectedSquare = null;
  session.selectedDrop = null;
  if (
    session.submitting ||
    session.state.status.type !== 'playing' ||
    !to ||
    !isReplayLive(session)
  ) {
    renderSession();
    return;
  }
  if (fortressXiangqiDropTargets(fortressLiveView(session), role).includes(to)) {
    await submitMove(session, { drop: role, to }, renderSession, onSolved);
    return;
  }
  session.feedback = { kind: 'neutral', text: 'Find the best move.' };
  renderSession();
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
  if (rating) onAttemptRating?.(rating);
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
  if (rating) onAttemptRating?.(rating);
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
  let state = clonePuzzleState(session.puzzle.initial);
  for (const move of solution) {
    state = applyPuzzleMove(session.puzzle.variant, state, move);
  }
  session.state = state;
  session.viewPly = startPly;
  session.feedback = { kind: 'neutral', text: 'Solution' };
  if (rating) onAttemptRating?.(rating);
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
// time (module invariant, see the rating singletons above), so the
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
  const variant = session.puzzle.variant;
  if (variant === XIANGQI_SPEC_ID) {
    const host = board.querySelector<HTMLElement>('.puzzle-xiangqi-board') ?? board;
    animateXiangqiBoardMove(host, move as XiangqiMove, xiangqiPerspective(session), opts);
    return;
  }
  if (variant === FORTRESS_XIANGQI_SPEC_ID) {
    const host = board.querySelector<HTMLElement>('.puzzle-board-surface') ?? board;
    animateFortressXiangqiBoardMove(
      host,
      move as { from: FortressXiangqiSquare; to: FortressXiangqiSquare },
      fortressPerspective(session),
      opts,
    );
    return;
  }
  if (variant === JUNGLE_SPEC_ID) {
    animateJungleBoardMove(
      board,
      move as { from: JungleSquare; to: JungleSquare },
      junglePerspective(session),
      opts,
    );
    return;
  }
  // Mini + Drop Mini share the mini renderer; the drop shell paints onto
  // .puzzle-board-surface, plain mini straight onto the board host.
  const host = board.querySelector<HTMLElement>('.puzzle-board-surface') ?? board;
  animateMiniXiangqiBoardMove(
    host,
    move as { from: MiniXiangqiSquare; to: MiniXiangqiSquare },
    (session.puzzle.sideToMove as MiniXiangqiColor | null) ?? activeTurn(session),
    opts,
  );
}

// Occupied-square count across any puzzle variant's board (all PuzzleState shapes
// carry a `board` square→piece map). Used only to pick a capture vs move sound.
function puzzlePieceCount(state: PuzzleState): number {
  return Object.keys(state.board).length;
}

function puzzleViews(
  session: PuzzleSession,
  state: PuzzleState = session.state,
): {
  boardView: ReturnType<typeof getMiniXiangqiOpenPlayerView>;
  dropView: ReturnType<typeof getDropMiniXiangqiPlayerView> | null;
} {
  const turn = session.puzzle.sideToMove ?? activeTurn(session);
  if (session.puzzle.variant === DROP_MINI_XIANGQI_SPEC_ID) {
    const dropView = getDropMiniXiangqiPlayerView(state as DropMiniXiangqiGameState, turn);
    return { boardView: dropMiniXiangqiBoardView(dropView), dropView };
  }
  return {
    boardView: getMiniXiangqiOpenPlayerView(state as MiniXiangqiGameState, turn),
    dropView: null,
  };
}

function highlightedBoardMoves(session: PuzzleSession): MiniXiangqiMove[] {
  if (!isReplayLive(session)) return [];
  if (session.selectedDrop)
    return dropMiniXiangqiTargetMoves(
      dropTargetsFor(session, session.selectedDrop as DropMiniXiangqiDropRole),
    );
  if (!session.selectedSquare) return [];
  return boardMovesFor(session, session.selectedSquare as MiniXiangqiSquare);
}

function boardMovesFor(session: PuzzleSession, from: MiniXiangqiSquare): MiniXiangqiMove[] {
  const { boardView, dropView } = puzzleViews(session);
  if (dropView) return dropMiniXiangqiBoardMoves(dropView, from);
  return boardView.legalMoves.filter((move) => move.from === from);
}

function dropTargetsFor(
  session: PuzzleSession,
  role: DropMiniXiangqiDropRole,
): MiniXiangqiSquare[] {
  const { dropView } = puzzleViews(session);
  return dropView ? dropMiniXiangqiDropTargets(dropView, role) : [];
}

function isSelectablePiece(session: PuzzleSession, square: MiniXiangqiSquare): boolean {
  const { boardView } = puzzleViews(session);
  const entry = boardView.board[square];
  return entry?.shrouded === false && entry.piece.color === activeTurn(session);
}

function canDragBoardPiece(session: PuzzleSession, square: MiniXiangqiSquare): boolean {
  return (
    !session.submitting &&
    session.state.status.type === 'playing' &&
    isReplayLive(session) &&
    isSelectablePiece(session, square)
  );
}

function activeTurn(session: PuzzleSession): MiniXiangqiColor {
  return session.state.status.type === 'playing'
    ? session.state.status.turn
    : (session.puzzle.sideToMove ?? 'red');
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

function parseVariantFilter(value: string): PuzzleVariantFilter {
  if (
    value === MINI_XIANGQI_SPEC_ID ||
    value === DROP_MINI_XIANGQI_SPEC_ID ||
    value === FORTRESS_XIANGQI_SPEC_ID ||
    value === JUNGLE_SPEC_ID ||
    value === XIANGQI_SPEC_ID
  ) {
    return value;
  }
  return FORTRESS_XIANGQI_SPEC_ID;
}

function variantFilterLabel(variant: PuzzleVariantFilter): string {
  return variantLabel(variant);
}

async function fetchPuzzleList(): Promise<PuzzleSummary[]> {
  const response = await fetch('/api/puzzles');
  if (!response.ok) throw new Error(`Puzzle list failed: ${response.status}`);
  const body = (await response.json()) as { puzzles?: PuzzleSummary[] };
  return Array.isArray(body.puzzles) ? body.puzzles : [];
}

async function fetchPuzzleDetail(id: string): Promise<PuzzleDetail | null> {
  const response = await fetch(`/api/puzzles/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Puzzle detail failed: ${response.status}`);
  const body = (await response.json()) as { puzzle?: PuzzleDetail };
  return body.puzzle ?? null;
}

async function submitPuzzleAttempt(
  id: string,
  moves: readonly PuzzleMove[],
): Promise<{ attempt: PuzzleAttempt; rating: PuzzleAttemptRating | null }> {
  const response = await fetch(`/api/puzzles/${encodeURIComponent(id)}/attempt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ moves, rated: puzzleRatedPref }),
  });
  if (!response.ok) throw new Error(`Puzzle attempt failed: ${response.status}`);
  const body = (await response.json()) as {
    attempt?: PuzzleAttempt;
    rating?: PuzzleAttemptRating;
  };
  if (!body.attempt) throw new Error('Puzzle attempt response missing attempt.');
  return { attempt: body.attempt, rating: body.rating ?? null };
}

// Fetch the full solution line (the reveal endpoint is the only route that
// exposes solution moves). POST because it books a failed rated attempt.
async function fetchPuzzleSolution(
  id: string,
): Promise<{ solution: PuzzleMove[] | null; rating: PuzzleAttemptRating | null }> {
  const response = await fetch(`/api/puzzles/${encodeURIComponent(id)}/reveal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'solution', rated: puzzleRatedPref }),
  });
  if (!response.ok) throw new Error(`Puzzle reveal failed: ${response.status}`);
  const body = (await response.json()) as {
    solution?: PuzzleMove[];
    rating?: PuzzleAttemptRating;
  };
  return { solution: body.solution ?? null, rating: body.rating ?? null };
}

// Fetch just the next correct move for the current ply (server computes it via
// the per-variant *PuzzleNextMove helpers; the client never holds the full line
// for a hint). POST because it books a failed rated attempt.
async function fetchPuzzleHint(
  id: string,
  playedPlyCount: number,
): Promise<{ move: PuzzleMove | null; rating: PuzzleAttemptRating | null }> {
  const response = await fetch(`/api/puzzles/${encodeURIComponent(id)}/reveal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'hint', playedPlyCount, rated: puzzleRatedPref }),
  });
  if (!response.ok) throw new Error(`Puzzle hint failed: ${response.status}`);
  const body = (await response.json()) as {
    move?: PuzzleMove | null;
    rating?: PuzzleAttemptRating;
  };
  return { move: body.move ?? null, rating: body.rating ?? null };
}

async function fetchUserPuzzleRating(variant: PuzzleVariant): Promise<UserPuzzleRating | null> {
  try {
    const response = await fetch(`/api/puzzles/rating?variant=${encodeURIComponent(variant)}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { rating?: UserPuzzleRating | null };
    return body.rating ?? null;
  } catch {
    return null;
  }
}

function clonePuzzleState<State extends PuzzleState>(state: State): State {
  return structuredClone(state);
}

function puzzleReplayState(session: PuzzleSession): PuzzleState {
  if (isReplayLive(session)) return session.state;
  let state: PuzzleState = clonePuzzleState(session.puzzle.initial);
  const visibleMoves = session.playedMoves.slice(0, Math.max(0, session.viewPly));
  for (const move of visibleMoves) {
    state = applyPuzzleMove(session.puzzle.variant, state, move);
  }
  return state;
}

function applyPuzzleMove(
  variant: PuzzleVariant,
  state: PuzzleState,
  move: PuzzleMove,
): PuzzleState {
  if (variant === FORTRESS_XIANGQI_SPEC_ID) {
    return applyFortressXiangqiMove(state as FortressXiangqiGameState, move as FortressXiangqiMove);
  }
  if (variant === JUNGLE_SPEC_ID) {
    return applyJungleMove(state as JungleGameState, move as JungleMove);
  }
  if (variant === XIANGQI_SPEC_ID) {
    return applyStandardXiangqiMove(state as XiangqiGameState, move as XiangqiMove);
  }
  if (variant === DROP_MINI_XIANGQI_SPEC_ID) {
    return applyDropMiniXiangqiMove(state as DropMiniXiangqiGameState, move as DropMiniXiangqiMove);
  }
  return applyMiniXiangqiOpenMove(state as MiniXiangqiGameState, move as MiniXiangqiMove);
}

function isReplayLive(session: PuzzleSession): boolean {
  return session.viewPly >= session.playedMoves.length;
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

function loadSolvedPuzzleIds(): Set<string> {
  try {
    const raw = window.localStorage?.getItem(SOLVED_PUZZLES_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function saveSolvedPuzzleIds(ids: ReadonlySet<string>): void {
  try {
    window.localStorage?.setItem(SOLVED_PUZZLES_STORAGE_KEY, JSON.stringify([...ids].sort()));
  } catch {
    // Solved markers are a convenience only; puzzle play should work without storage.
  }
}

// Order puzzles for rotation: unseen first (shuffled for real variety), then
// seen puzzles from least- to most-recently-seen so revisits resurface the
// oldest ones first. Real randomness is intentional here — this is client-side
// UX ordering, not a replay path — and rating-adaptive selection is a separate,
// later work item (issue #142).
function rotatePuzzleOrder(
  puzzles: readonly PuzzleSummary[],
  seen: ReadonlyMap<string, number>,
): PuzzleSummary[] {
  const unseen: PuzzleSummary[] = [];
  const seenList: PuzzleSummary[] = [];
  for (const puzzle of puzzles) {
    if (seen.has(puzzle.id)) seenList.push(puzzle);
    else unseen.push(puzzle);
  }
  shufflePuzzles(unseen);
  seenList.sort((a, b) => (seen.get(a.id) ?? 0) - (seen.get(b.id) ?? 0));
  return [...unseen, ...seenList];
}

function shufflePuzzles(puzzles: PuzzleSummary[]): void {
  // Fisher-Yates in place.
  for (let i = puzzles.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = puzzles[i]!;
    puzzles[i] = puzzles[j]!;
    puzzles[j] = swap;
  }
}

function loadSeenPuzzles(): Map<string, number> {
  try {
    const raw = window.localStorage?.getItem(SEEN_PUZZLES_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    const seen = new Map<string, number>();
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === 'number' && Number.isFinite(at)) seen.set(id, at);
    }
    return seen;
  } catch {
    return new Map();
  }
}

function saveSeenPuzzles(seen: ReadonlyMap<string, number>): void {
  try {
    // Keep only the most-recently-seen ids so the store stays bounded.
    const capped = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, SEEN_PUZZLES_CAP);
    window.localStorage?.setItem(
      SEEN_PUZZLES_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(capped)),
    );
  } catch {
    // Seen markers are a convenience only; puzzle play works without storage.
  }
}

function loadAutoNextEnabled(): boolean {
  try {
    return window.localStorage?.getItem(AUTO_NEXT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function loadRatedEnabled(): boolean {
  try {
    // Rated is the default; only an explicit opt-out is stored.
    return window.localStorage?.getItem(RATED_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function saveRatedEnabled(enabled: boolean): void {
  try {
    window.localStorage?.setItem(RATED_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Puzzle preferences are best-effort convenience state.
  }
}

function saveAutoNextEnabled(enabled: boolean): void {
  try {
    window.localStorage?.setItem(AUTO_NEXT_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Puzzle preferences are best-effort convenience state.
  }
}

function variantLabel(variant: PuzzleVariant): string {
  if (variant === FORTRESS_XIANGQI_SPEC_ID) return 'Fortress Xiangqi';
  if (variant === JUNGLE_SPEC_ID) return 'Jungle';
  if (variant === XIANGQI_SPEC_ID) return 'Xiangqi';
  return variant === DROP_MINI_XIANGQI_SPEC_ID ? 'Drop Mini Xiangqi' : 'Mini Xiangqi';
}

function goalLabel(puzzle: Pick<PuzzleSummary, 'goal' | 'solutionPlyCount'>): string {
  if (puzzle.goal.type === 'checkmate') {
    return `Mate in ${Math.ceil(puzzle.solutionPlyCount / 2)}`;
  }
  if (puzzle.goal.type === 'win') {
    return `Win in ${Math.ceil(puzzle.solutionPlyCount / 2)}`;
  }
  return 'Winning';
}

function colorLabel(color: MiniXiangqiColor | null): string {
  if (color === 'black') return 'Black';
  return 'Red';
}

function dropRoleLabel(role: string): string {
  return `${role[0]?.toUpperCase() ?? ''}${role.slice(1)}`;
}

function puzzleMoveLabel(move: PuzzleMove, variant: PuzzleVariant): string {
  if (variant === FORTRESS_XIANGQI_SPEC_ID) {
    return fortressXiangqiMoveLabel(move as FortressXiangqiMove);
  }
  if ('drop' in move) return `${dropRoleSymbol(move.drop as DropMiniXiangqiDropRole)}@${move.to}`;
  return `${move.from}-${move.to}`;
}

// The opponent's move that set up the puzzle (the mined blunder), if the initial
// state carries one. Prepended to the move list so it reads like a game and the
// opening position (viewPly 0) highlights the move that created the puzzle.
function puzzleSetupMove(session: PuzzleSession): PuzzleMove | null {
  const initial = session.puzzle.initial as { lastMove?: PuzzleMove };
  return initial.lastMove ?? null;
}

type PuzzleMoveCell = { move: PuzzleMove; active: boolean };

function puzzleMoveRows(session: PuzzleSession): HTMLElement[] {
  const solverColor = (session.puzzle.sideToMove ?? 'red') as MiniXiangqiColor;
  const setup = puzzleSetupMove(session);

  // Combined list: [setup?, ...solution]. The setup was played by the opponent,
  // so the whole sequence alternates starting from the opponent's color when a
  // setup exists, and from the solver's color otherwise.
  const combined: { move: PuzzleMove; solutionIndex: number | null }[] = [];
  if (setup) combined.push({ move: setup, solutionIndex: null });
  for (const [index, move] of session.playedMoves.entries()) {
    combined.push({ move, solutionIndex: index });
  }
  if (combined.length === 0) return [puzzleMoveContextRow(session)];

  const firstColor: MiniXiangqiColor = setup ? oppositeMiniXiangqiColor(solverColor) : solverColor;
  // viewPly 0 = the setup/opening position (setup cell active); otherwise the
  // just-played solution ply is viewPly-1.
  const activeSolutionIndex = session.viewPly - 1;

  const rows = new Map<number, { black?: PuzzleMoveCell; red?: PuzzleMoveCell }>();
  for (const [combinedIndex, entry] of combined.entries()) {
    const color = moveColorAt(firstColor, combinedIndex);
    const number = puzzleMoveRowNumber(firstColor, combinedIndex);
    const row = rows.get(number) ?? {};
    row[color] = {
      move: entry.move,
      active:
        entry.solutionIndex === null
          ? session.viewPly === 0
          : entry.solutionIndex === activeSolutionIndex,
    };
    rows.set(number, row);
  }

  return Array.from(rows.entries()).map(([number, row]) =>
    puzzleMoveRow(number, row, firstColor, session),
  );
}

function puzzleMoveContextRow(session: PuzzleSession): HTMLElement {
  const firstColor = session.puzzle.sideToMove ?? 'red';
  const row = document.createElement('li');
  row.className = 'puzzle-move-item puzzle-move-context';
  const number = puzzleMoveCell('puzzle-move-number', '1');
  const red = puzzleMoveCell('puzzle-move-red', firstColor === 'black' ? '...' : '');
  const black = puzzleMoveCell('puzzle-move-black', firstColor === 'red' ? '...' : '');
  row.append(number, red, black);
  return row;
}

function puzzleMoveRow(
  number: number,
  rowMoves: { black?: PuzzleMoveCell; red?: PuzzleMoveCell },
  firstColor: MiniXiangqiColor,
  session: PuzzleSession,
): HTMLElement {
  const row = document.createElement('li');
  row.className = 'puzzle-move-item';
  const numberCell = puzzleMoveCell('puzzle-move-number', String(number));
  // When the list leads with black (black-first solve, or a red-solve whose
  // setup move was black's), row 1 has no red move; show the "…" lead marker
  // (matching puzzleMoveContextRow) so the opening move reads as the reply.
  const blackLeads = firstColor === 'black';
  const redCell = puzzleMoveCell(
    'puzzle-move-red',
    rowMoves.red
      ? puzzleMoveLabel(rowMoves.red.move, session.puzzle.variant)
      : number === 1 && blackLeads
        ? '...'
        : '',
  );
  if (rowMoves.red?.active) redCell.classList.add('puzzle-move-cell--active');
  const blackCell = puzzleMoveCell(
    'puzzle-move-black',
    rowMoves.black ? puzzleMoveLabel(rowMoves.black.move, session.puzzle.variant) : '',
  );
  if (rowMoves.black?.active) blackCell.classList.add('puzzle-move-cell--active');
  row.append(numberCell, redCell, blackCell);
  return row;
}

function puzzleMoveCell(className: string, text: string): HTMLSpanElement {
  const cell = document.createElement('span');
  cell.className = className;
  cell.textContent = text;
  return cell;
}

function moveColorAt(firstColor: MiniXiangqiColor, plyIndex: number): MiniXiangqiColor {
  return plyIndex % 2 === 0 ? firstColor : oppositeMiniXiangqiColor(firstColor);
}

// Full-move number for a solution ply. Red always occupies the left column, so
// when BLACK moves first its opening move sits alone in row 1 (red cell blank),
// pushing red down one — otherwise black's move and red's reply would share a
// row and, printed red-cell-first, read in reversed order (e.g. "1. d2-d6 h7-h3"
// when black actually played h7-h3 first). Red-first is the ordinary chess case.
export function puzzleMoveRowNumber(firstColor: MiniXiangqiColor, plyIndex: number): number {
  const leadOffset = firstColor === 'black' ? 1 : 0;
  return Math.floor((plyIndex + leadOffset) / 2) + 1;
}

function targetAvatarSvg(): string {
  // Lucide `target` (24-grid, 2px round), consistent with the app's other inlined
  // Lucide icons (see landing-play.ts). Plain concentric bullseye, no arrow.
  return [
    '<svg class="puzzle-target-avatar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">',
    '<circle cx="12" cy="12" r="10"/>',
    '<circle cx="12" cy="12" r="6"/>',
    '<circle cx="12" cy="12" r="2"/>',
    '</svg>',
  ].join('');
}

function variantMiniIdForPuzzle(variant: PuzzleVariant): VariantMiniId {
  if (variant === FORTRESS_XIANGQI_SPEC_ID) return 'fortress-xiangqi';
  if (variant === JUNGLE_SPEC_ID) return 'jungle';
  if (variant === XIANGQI_SPEC_ID) return 'xiangqi';
  return variant === DROP_MINI_XIANGQI_SPEC_ID ? 'drop-mini-xiangqi' : 'mini-xiangqi';
}

function dropRoleSymbol(role: DropMiniXiangqiDropRole): string {
  switch (role) {
    case 'chariot':
      return 'R';
    case 'horse':
      return 'H';
    case 'cannon':
      return 'C';
    case 'soldier':
      return 'S';
  }
}

// The general (xiangqi "king") of the side to move, rendered in the user's
// chosen piece set — replaces the generic chess-king glyph so the icon matches
// the board's variant + skin.
function puzzleGeneralIconSvg(puzzle: PuzzleDetail): string {
  const color = puzzle.sideToMove ?? 'red';
  if (puzzle.variant === FORTRESS_XIANGQI_SPEC_ID) {
    return fortressXiangqiPieceGhostSvg({ color, role: 'general' });
  }
  if (puzzle.variant === JUNGLE_SPEC_ID) {
    // Jungle has no general; the elephant (top rank) stands in as the side icon.
    return junglePieceGhostSvg({ color: color as JungleColor, role: 'elephant' });
  }
  if (puzzle.variant === XIANGQI_SPEC_ID) {
    return xiangqiPieceGhostSvg({ color, role: 'general' });
  }
  return miniXiangqiPieceGhostSvg({ color, role: 'general' });
}

function feedbackTitle(session: PuzzleSession): string {
  switch (session.feedback.kind) {
    case 'good':
      return isSessionSolved(session) ? 'Solved' : 'Correct';
    case 'bad':
      return 'Try again';
    case 'pending':
      return 'Checking';
    case 'neutral':
      // Deliberately generic: the puzzle title names the piece + mate depth,
      // which would give the solution away.
      return `${colorLabel(session.puzzle.sideToMove)} to move`;
  }
}

function isDropRole(value: string): value is DropMiniXiangqiDropRole {
  return (DROP_MINI_XIANGQI_DROP_ROLES as readonly string[]).includes(value);
}

function isFortressDropRole(value: string): value is FortressXiangqiDropRole {
  return (FORTRESS_DROP_ROLES as readonly string[]).includes(value);
}

function themeLabel(theme: string): string {
  return theme
    .split('-')
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

const ICON_FIRST =
  '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true"><path d="M4 3.5h1.7v9H4zM13 3.5v9L6.5 8z" fill="currentColor"/></svg>';
const ICON_LAST =
  '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true"><path d="M10.3 3.5H12v9h-1.7zM3 3.5v9L9.5 8z" fill="currentColor"/></svg>';
const ICON_PLAY =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M5 3.2v9.6L12.5 8z" fill="currentColor"/></svg>';
const ICON_PREV =
  '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true"><path d="M11 3.5v9L5 8z" fill="currentColor"/></svg>';
const ICON_NEXT =
  '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true"><path d="M5 3.5v9L11 8z" fill="currentColor"/></svg>';
const THUMB_UP_SVG =
  '<svg viewBox="0 0 64 64" width="76" height="76" aria-hidden="true"><path d="M23 54h-8a4 4 0 0 1-4-4V30a4 4 0 0 1 4-4h8v28Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M23 29c7-5 9-15 12-18 2-2 6-1 7 3 1 5-3 10-3 12h10c6 0 9 5 7 10l-5 13c-1 4-5 6-9 6H23V29Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>';
const THUMB_DOWN_SVG =
  '<svg viewBox="0 0 64 64" width="76" height="76" aria-hidden="true"><path d="M41 10h8a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4h-8V10Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M41 35c-7 5-9 15-12 18-2 2-6 1-7-3-1-5 3-10 3-12H15c-6 0-9-5-7-10l5-13c1-4 5-6 9-6h19v26Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>';
