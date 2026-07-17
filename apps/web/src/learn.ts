import './learn.css';
import { boardFen, hiddenSquareClasses, mountBoard } from '@mistboard/board-render/interactive';
import {
  type Board,
  darkChessVariant,
  type GameState,
  type Move,
  type PieceRole,
  type PlayerView,
  type Square,
} from '@mistboard/game';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';
import {
  type ChapterStatus,
  chapters,
  type LearnModule,
  learnModules,
  type TutorialChapter,
  type TutorialStep,
  type Uci,
} from './learn-content.js';
import { buildLearnHome } from './learn-home.js';
import {
  buildLearnMenu,
  buildPanel,
  buildPlannedModuleMenu,
  buildPlannedModulePanel,
  type LearnPanelActions,
} from './learn-panels.js';
import { buildNav } from './site-shell.js';

const boardFiles = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export function mountLearn(root: HTMLElement): void {
  const state = createTutorialState();
  root.replaceChildren();
  root.classList.add('landing-page', 'learn-route');
  root.append(buildNav(), buildShell(state));
  applyLearnRoute(state);
  window.addEventListener('hashchange', () => applyLearnRoute(state));
}

type LearnView = 'home' | 'chapter' | 'module';

type TutorialState = {
  api: Api | null;
  boardEl: HTMLElement | null;
  view: LearnView;
  activeModuleId: string | null;
  chapterIndex: number;
  stepIndex: number;
  status: ChapterStatus;
  activeState: GameState;
  message: string;
  shell: HTMLElement | null;
  // Endgames node state.
  demoIndex: number; // moves applied so far in a demo chapter
  whiteMoves: number; // white moves played in a play chapter
  playDone: boolean; // play chapter reached its cap / ended
  busy: boolean; // ignore input while the defender reply is pending
  superpositionCandidates: Square[];
  superpositionFlushed: Square[];
  superpositionMoveCount: number;
};

function createTutorialState(): TutorialState {
  const first = chapters[0]!;
  return {
    api: null,
    boardEl: null,
    view: 'home',
    activeModuleId: null,
    chapterIndex: 0,
    stepIndex: 0,
    status: 'ready',
    activeState: gameStateFromBoard(first.id, first.board),
    message: first.steps[0]!.teach,
    shell: null,
    demoIndex: 0,
    whiteMoves: 0,
    playDone: false,
    busy: false,
    superpositionCandidates: [],
    superpositionFlushed: [],
    superpositionMoveCount: 0,
  };
}

function buildShell(state: TutorialState): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'learn-shell';
  state.shell = shell;
  return shell;
}

function render(state: TutorialState): void {
  const shell = state.shell;
  if (!shell) return;

  if (state.view === 'home') {
    shell.className = 'learn-shell learn-home-shell';
    shell.replaceChildren(
      buildLearnHome({ onOpenModule: (moduleId) => openModule(state, moduleId) }),
    );
    state.api = null;
    state.boardEl = null;
    return;
  }

  if (state.view === 'module') {
    renderPlannedModule(state);
    return;
  }

  shell.className = 'learn-shell learn-tutorial-shell';
  const chapter = chapters[state.chapterIndex]!;
  const view = darkChessVariant.getPlayerView(state.activeState, 'white');
  const menu = buildLearnMenu(
    state,
    moduleForChapterIndex(state.chapterIndex) ?? learnModules[0]!,
    moduleChaptersForChapterIndex(state.chapterIndex),
    learnPanelActions(state),
  );
  const boardPanel = document.createElement('section');
  boardPanel.className = 'learn-board-panel';
  const boardEl = document.createElement('div');
  boardEl.className = 'board learn-board';
  boardEl.setAttribute('aria-label', 'Dark chess tutorial board');
  boardPanel.append(boardEl);

  const panel = buildPanel(state, chapter, currentStep(state, chapter), learnPanelActions(state));
  shell.replaceChildren(menu, boardPanel, panel);
  state.boardEl = boardEl;
  state.api = createTutorialBoard(boardEl, view, chapter, state);
  updateBoard(state, chapter, view);
}

function renderPlannedModule(state: TutorialState): void {
  const shell = state.shell;
  if (!shell) return;

  const module =
    learnModules.find((candidate) => candidate.id === state.activeModuleId) ?? learnModules[0]!;
  const moduleState = plannedModuleState(module);
  const view = darkChessVariant.getPlayerView(moduleState, 'white');

  shell.className = 'learn-shell learn-tutorial-shell';
  const menu = buildPlannedModuleMenu(module, learnPanelActions(state));
  const boardPanel = document.createElement('section');
  boardPanel.className = 'learn-board-panel';

  const boardEl = document.createElement('div');
  boardEl.className = 'board learn-board';
  boardEl.setAttribute('aria-label', `${module.title} preview board`);
  boardPanel.append(boardEl);

  const panel = buildPlannedModulePanel(module);
  shell.replaceChildren(menu, boardPanel, panel);
  state.boardEl = boardEl;
  state.activeState = moduleState;
  state.api = createStaticLearnBoard(boardEl, view);
}

function createTutorialBoard(
  el: HTMLElement,
  view: PlayerView,
  chapter: TutorialChapter,
  state: TutorialState,
): Api {
  const interactive = chapter.mode
    ? (chapter.mode === 'practice' ||
        chapter.mode === 'play' ||
        chapter.mode === 'superposition') &&
      !state.playDone &&
      !state.busy
    : chapter.interaction !== 'reveal';
  const api = mountBoard(el, {
    animation: { enabled: false, duration: 0 },
    coordinates: true,
    coordinatesOnSquares: false,
    fen: boardFen(renderBoardFor(chapter, state, view)),
    orientation: 'white',
    movable: {
      free: false,
      color: interactive ? 'white' : undefined,
      dests: interactive ? legalDests(view) : new Map(),
    },
    draggable: { enabled: interactive },
    selectable: { enabled: interactive },
    premovable: { enabled: false },
    highlight: { custom: tutorialSquareClasses(view, chapter, state), lastMove: false },
    events: {
      move: (from, to) => handleMove(state, `${from}${to}` as Uci),
    },
    disableContextMenu: true,
  });
  return api;
}

function createStaticLearnBoard(el: HTMLElement, view: PlayerView): Api {
  return mountBoard(el, {
    animation: { enabled: false, duration: 0 },
    coordinates: true,
    coordinatesOnSquares: false,
    fen: boardFen(view.board),
    orientation: 'white',
    movable: {
      free: false,
      color: undefined,
      dests: new Map(),
    },
    draggable: { enabled: false },
    selectable: { enabled: false },
    premovable: { enabled: false },
    highlight: { custom: hiddenSquareClasses(view, 'white'), lastMove: false },
    disableContextMenu: true,
  });
}

function handleMove(state: TutorialState, uci: Uci): void {
  const chapter = chapters[state.chapterIndex]!;
  if (chapter.mode === 'practice') {
    handlePracticeMove(state, uci);
    return;
  }
  if (chapter.mode === 'play') {
    handlePlayMove(state, uci);
    return;
  }
  if (chapter.mode === 'superposition') {
    handleSuperpositionMove(state, uci);
    return;
  }
  if (chapter.mode) return;
  if (chapter.interaction === 'reveal') return;
  const step = currentStep(state, chapter);
  if (state.status !== 'ready') return;

  const view = darkChessVariant.getPlayerView(state.activeState, 'white');
  const move = moveFromUci(uci);
  const resolvedMove = resolveUiMove(view, move);
  if (!resolvedMove) {
    state.message = 'That move is not legal from this position.';
    render(state);
    return;
  }

  const resolvedUci = moveToUci(resolvedMove);
  const isAccepted = step.accepted.includes(uci) || step.accepted.includes(resolvedUci);

  const nextState = darkChessVariant.applyMove(state.activeState, resolvedMove);

  if (isAccepted && step.opponentReply) {
    // Two-phase reveal: render the truth board with white's move applied and the
    // opponent's piece still sitting on its origin square (the "oh, that's where it
    // was" moment), then apply the scripted capture after a short pause so the
    // player sees the threat before it lands.
    const oppReply = step.opponentReply;
    state.activeState = { ...nextState, lastMove: resolvedMove };
    state.status = 'success';
    state.message = chapter.reveal ? `${step.success} ${chapter.reveal.text}` : step.success;
    render(state);
    setTimeout(() => {
      if (state.chapterIndex !== chapters.indexOf(chapter)) return;
      const oppMove = moveFromUci(oppReply);
      const captured = darkChessVariant.applyMove(state.activeState, oppMove);
      state.activeState = { ...captured, lastMove: oppMove };
      render(state);
    }, 1500);
    return;
  }

  state.activeState = {
    ...nextState,
    status: { type: 'playing', turn: 'white' },
    lastMove: resolvedMove,
  };

  if (isAccepted) {
    const isFinalStep = state.stepIndex === chapter.steps.length - 1;
    if (isFinalStep) {
      state.status = 'success';
      state.message = chapter.reveal ? `${step.success} ${chapter.reveal.text}` : step.success;
    } else {
      state.stepIndex += 1;
      state.status = 'ready';
      state.message = `${step.success} ${currentStep(state, chapter).teach}`;
    }
  } else {
    state.status = 'soft-failure';
    state.message = step.softFailures[uci] ?? 'That is legal, but it does not solve this chapter.';
  }
  render(state);
}

function showTruthBoard(chapter: TutorialChapter, state: TutorialState): boolean {
  if (chapter.fogPreview) return false;
  if (chapter.mode === 'demo' || chapter.mode === 'teach') return true;
  return state.status === 'success' && (chapter.revealTruthOnSuccess ?? false);
}

function renderBoardFor(chapter: TutorialChapter, state: TutorialState, view: PlayerView): Board {
  if (chapter.mode === 'superposition') return superpositionBoardFor(state);
  return showTruthBoard(chapter, state) ? state.activeState.board : view.board;
}

function superpositionBoardFor(state: TutorialState): Board {
  const board: Board = { ...state.activeState.board };
  for (const square of state.superpositionCandidates) {
    board[square] = { color: 'black', role: 'king' };
  }
  return board;
}

function hiddenKingCandidateSquares(gs: GameState): Square[] {
  const view = darkChessVariant.getPlayerView(gs, 'white');
  const visible = new Set<Square>(view.visibleSquares);
  const candidates: Square[] = [];
  for (const file of boardFiles) {
    for (let rank = 1; rank <= 8; rank += 1) {
      const square = `${file}${rank}` as Square;
      if (visible.has(square)) continue;
      if (gs.board[square]?.color === 'white') continue;
      candidates.push(square);
    }
  }
  return candidates;
}

function resetChapter(state: TutorialState): void {
  const chapter = chapters[state.chapterIndex]!;
  state.activeState = gameStateFromBoard(chapter.id, chapter.board);
  state.stepIndex = 0;
  state.status = 'ready';
  state.demoIndex = 0;
  state.whiteMoves = 0;
  state.playDone = false;
  state.busy = false;
  state.superpositionCandidates =
    chapter.mode === 'superposition' && !chapter.candidateSquares?.length
      ? hiddenKingCandidateSquares(state.activeState)
      : [...(chapter.candidateSquares ?? [])];
  state.superpositionFlushed = [];
  state.superpositionMoveCount = 0;
  if (chapter.mode === 'practice') state.message = chapter.teachText ?? '';
  else if (chapter.mode === 'demo') state.message = chapter.demoIntro ?? '';
  else if (chapter.mode === 'teach') state.message = chapter.teachText ?? '';
  else if (chapter.mode === 'superposition') state.message = chapter.teachText ?? '';
  else if (chapter.mode === 'play') state.message = chapter.teachText ?? '';
  else state.message = chapter.steps[0]!.teach;
  render(state);
}

function goToChapter(state: TutorialState, chapterIndex: number): void {
  if (!chapters[chapterIndex]) return;
  const nextHash = hashForChapter(chapterIndex);
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
    return;
  }
  openChapter(state, chapterIndex);
}

function updateBoard(state: TutorialState, chapter: TutorialChapter, view: PlayerView): void {
  const interactive = chapter.mode
    ? (chapter.mode === 'practice' ||
        chapter.mode === 'play' ||
        chapter.mode === 'superposition') &&
      !state.playDone &&
      !state.busy
    : chapter.interaction !== 'reveal' && state.status === 'ready';
  state.api?.set({
    fen: boardFen(renderBoardFor(chapter, state, view)),
    movable: {
      color: interactive ? 'white' : undefined,
      dests: interactive ? legalDests(view) : new Map(),
    },
    highlight: { custom: tutorialSquareClasses(view, chapter, state), lastMove: false },
  });
}

function triggerReveal(state: TutorialState): void {
  const chapter = chapters[state.chapterIndex]!;
  if (chapter.interaction !== 'reveal') return;
  if (state.status !== 'ready') return;
  const step = chapter.steps[0]!;
  state.status = 'success';
  state.message = chapter.reveal ? `${step.success} ${chapter.reveal.text}` : step.success;
  render(state);
}

function tutorialSquareClasses(
  view: PlayerView,
  chapter: TutorialChapter,
  state: TutorialState,
): cg.SquareClasses {
  if (chapter.mode) return endgameSquareClasses(view, chapter);
  const classes: cg.SquareClasses = showTruthBoard(chapter, state)
    ? new Map()
    : hiddenSquareClasses(view, 'white');
  const step = currentStep(state, chapter);
  const activeTargets = step.targets;
  for (const square of activeTargets) {
    classes.set(square as cg.Key, `${classes.get(square as cg.Key) ?? ''} learn-highlight`.trim());
  }
  if (state.status === 'success') {
    for (const square of step.afterTargets) {
      if (step.targets.includes(square)) continue;
      classes.set(
        square as cg.Key,
        `${classes.get(square as cg.Key) ?? ''} learn-explained`.trim(),
      );
    }
  }
  if (chapter.reveal && state.status === 'success') {
    for (const square of [chapter.reveal.scout, chapter.reveal.revealed]) {
      classes.set(square as cg.Key, `${classes.get(square as cg.Key) ?? ''} learn-reveal`.trim());
    }
  }
  return classes;
}

function currentStep(state: TutorialState, chapter: TutorialChapter): TutorialStep {
  return chapter.steps[state.stepIndex] ?? chapter.steps[chapter.steps.length - 1]!;
}

function routeForModule(
  module: LearnModule,
): { view: 'module'; moduleId: string } | { view: 'chapter'; chapterIndex: number } {
  const chapterId = module.chapterIds?.[0];
  const chapterIndex = chapterId ? chapterIndexForId(chapterId) : -1;
  if (chapterIndex >= 0) return { view: 'chapter', chapterIndex };
  return { view: 'module', moduleId: module.id };
}

function applyLearnRoute(state: TutorialState): void {
  const route = parseLearnHash();
  if (route.view === 'home') {
    state.view = 'home';
    state.activeModuleId = null;
    render(state);
    return;
  }
  if (route.view === 'module') {
    state.view = 'module';
    state.activeModuleId = route.moduleId;
    render(state);
    return;
  }
  openChapter(state, route.chapterIndex);
}

function parseLearnHash():
  | { view: 'home' }
  | { view: 'module'; moduleId: string }
  | { view: 'chapter'; chapterIndex: number } {
  const rawHash = decodeURIComponent(window.location.hash.replace(/^#\/?/, '').trim());
  if (!rawHash) return { view: 'home' };

  const [first, second] = rawHash.split('/').filter(Boolean);
  const numericModule = Number.parseInt(first ?? '', 10);
  if (Number.isInteger(numericModule) && numericModule > 0) {
    const module = learnModules[numericModule - 1];
    if (module) return routeForModule(module);
  }

  const module = learnModules.find((candidate) => candidate.id === first);
  if (module) {
    const chapterIds = module.chapterIds ?? [];
    const chapterId = second && chapterIds.includes(second) ? second : chapterIds[0];
    const chapterIndex = chapterId ? chapterIndexForId(chapterId) : -1;
    if (chapterIndex >= 0) return { view: 'chapter', chapterIndex };
    return { view: 'module', moduleId: module.id };
  }

  const chapterIndex = chapterIndexForId(first ?? '');
  if (chapterIndex >= 0) return { view: 'chapter', chapterIndex };

  return { view: 'home' };
}

function showLearnHome(state: TutorialState): void {
  if (window.location.hash) {
    window.location.hash = '';
    return;
  }
  state.view = 'home';
  state.activeModuleId = null;
  render(state);
}

function openModule(state: TutorialState, moduleId: string): void {
  const module = learnModules.find((candidate) => candidate.id === moduleId);
  if (!module) return;
  const chapterId = module.chapterIds?.[0];
  const chapterIndex = chapterId ? chapterIndexForId(chapterId) : -1;
  if (chapterIndex >= 0) {
    goToChapter(state, chapterIndex);
    return;
  }
  const nextHash = hashForModule(module);
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
    return;
  }
  state.view = 'module';
  state.activeModuleId = module.id;
  render(state);
}

function openChapter(state: TutorialState, chapterIndex: number): void {
  if (!chapters[chapterIndex]) return;
  state.view = 'chapter';
  state.activeModuleId = null;
  state.chapterIndex = chapterIndex;
  resetChapter(state);
}

function chapterIndexForId(id: string): number {
  return chapters.findIndex((chapter) => chapter.id === id);
}

function moduleForChapterIndex(chapterIndex: number): LearnModule | null {
  const chapter = chapters[chapterIndex];
  if (!chapter) return null;
  return learnModules.find((module) => module.chapterIds?.includes(chapter.id)) ?? null;
}

function moduleChaptersForChapterIndex(
  chapterIndex: number,
): { chapter: TutorialChapter; localIndex: number; chapterIndex: number }[] {
  const module = moduleForChapterIndex(chapterIndex);
  const chapterIds = module?.chapterIds ?? [];
  const entries: { chapter: TutorialChapter; localIndex: number; chapterIndex: number }[] = [];
  for (let localIndex = 0; localIndex < chapterIds.length; localIndex += 1) {
    const nextChapterIndex = chapterIndexForId(chapterIds[localIndex]!);
    const chapter = chapters[nextChapterIndex];
    if (!chapter) continue;
    entries.push({ chapter, localIndex, chapterIndex: nextChapterIndex });
  }
  return entries;
}

function hashForChapter(chapterIndex: number): string {
  const chapter = chapters[chapterIndex]!;
  const module = moduleForChapterIndex(chapterIndex);
  return module ? `#/${module.id}/${chapter.id}` : `#/${chapter.id}`;
}

function hashForModule(module: LearnModule): string {
  return `#/${module.id}`;
}

function chapterProgress(chapterIndex: number): string {
  const chapter = chapters[chapterIndex];
  const module = moduleForChapterIndex(chapterIndex);
  if (!chapter || !module) return '';
  const chapterIds = module.chapterIds ?? [];
  const localIndex = chapterIds.indexOf(chapter.id);
  if (localIndex < 0) return '';
  return `Chapter ${localIndex + 1} of ${chapterIds.length}`;
}

function nextChapterLabel(chapterIndex: number): string {
  const currentModule = moduleForChapterIndex(chapterIndex);
  const nextIndex = chapterIndex + 1;
  if (!chapters[nextIndex]) return 'Modules';
  const nextModule = moduleForChapterIndex(nextIndex);
  if (currentModule && nextModule && currentModule.id !== nextModule.id) return 'Next module';
  return 'Next';
}

function learnPanelActions(state: TutorialState): LearnPanelActions {
  return {
    advanceDemo: () => advanceDemo(state),
    chapterProgress,
    goNextChapter: () => goNextChapter(state),
    goToChapter: (chapterIndex) => goToChapter(state, chapterIndex),
    nextChapterLabel,
    resetChapter: () => resetChapter(state),
    showLearnHome: () => showLearnHome(state),
    supportPieceLabel,
    triggerReveal: () => triggerReveal(state),
  };
}

function legalDests(view: PlayerView): cg.Dests {
  const dests: cg.Dests = new Map();
  for (const move of view.legalMoves) {
    const list = dests.get(move.from as cg.Key) ?? [];
    list.push(move.to as cg.Key);
    dests.set(move.from as cg.Key, list);
  }
  addCastlingDestinationAliases(view, dests);
  return dests;
}

function resolveUiMove(view: PlayerView, move: Move): Move | null {
  const castlingAlias = view.legalMoves.find(
    (candidate) =>
      candidate.from === move.from && castlingKingDestinationFromView(view, candidate) === move.to,
  );
  if (castlingAlias) return castlingAlias;
  return view.legalMoves.find((candidate) => movesMatch(candidate, move)) ?? null;
}

function addCastlingDestinationAliases(view: PlayerView, dests: cg.Dests): void {
  for (const move of view.legalMoves) {
    const alias = castlingKingDestinationFromView(view, move);
    if (!alias) continue;
    const from = move.from as cg.Key;
    const current = dests.get(from) ?? [];
    if (!current.includes(alias as cg.Key)) dests.set(from, [...current, alias as cg.Key]);
  }
}

function castlingKingDestinationFromView(view: PlayerView, move: Move): Square | null {
  const piece = view.board[move.from];
  const rook = view.board[move.to];
  if (piece?.role !== 'king' || !rook || rook.role !== 'rook' || rook.color !== piece.color)
    return null;
  if (rankOf(move.from) !== rankOf(move.to)) return null;
  return `${squareFileIndex(move.to) > squareFileIndex(move.from) ? 'g' : 'c'}${rankOf(move.from)}` as Square;
}

function squareFileIndex(square: Square): number {
  return boardFiles.indexOf(square[0] as (typeof boardFiles)[number]);
}

function rankOf(square: Square): string {
  return square[1] ?? '';
}

function gameStateFromBoard(id: string, board: Board): GameState {
  const chapter = chapters.find((candidate) => candidate.id === id);
  return {
    ...darkChessVariant.createInitialState(`learn-${id}`),
    board,
    status: { type: 'playing', turn: 'white' },
    castlingRights: chapter?.castlingRights ?? [],
    enPassantSquare: chapter?.enPassantSquare,
    halfmoveClock: chapter?.halfmoveClock ?? 0,
    moveNumber: chapter?.moveNumber ?? 1,
  };
}

function plannedModuleState(module: LearnModule): GameState {
  return {
    ...darkChessVariant.createInitialState(`learn-preview-${module.id}`),
    board: plannedModuleBoard(module),
    status: { type: 'playing', turn: 'white' },
    castlingRights: [],
    halfmoveClock: 0,
    moveNumber: 1,
  };
}

const researchPreviewModuleIds = new Set([
  'belief-state-basics',
  'particle-filters',
  'move-selection-under-uncertainty',
  'latent-slider-danger',
  'engine-lab-loop',
]);

function plannedModuleBoard(module: LearnModule): Board {
  if (researchPreviewModuleIds.has(module.id)) {
    return {
      e1: { color: 'white', role: 'king' },
      d2: { color: 'white', role: 'queen' },
      c3: { color: 'white', role: 'knight' },
      e4: { color: 'white', role: 'pawn' },
      a5: { color: 'black', role: 'bishop' },
      c6: { color: 'black', role: 'knight' },
      h8: { color: 'black', role: 'king' },
    };
  }
  return {
    e1: { color: 'white', role: 'king' },
    a1: { color: 'white', role: 'rook' },
    c1: { color: 'white', role: 'bishop' },
    f3: { color: 'white', role: 'knight' },
    e4: { color: 'white', role: 'pawn' },
    e5: { color: 'black', role: 'pawn' },
    c6: { color: 'black', role: 'knight' },
    h8: { color: 'black', role: 'king' },
  };
}

function moveFromUci(uci: Uci): Move {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
  };
}

function moveToUci(move: Move): Uci {
  return `${move.from}${move.to}` as Uci;
}

function movesMatch(left: Move, right: Move): boolean {
  return left.from === right.from && left.to === right.to;
}

// --- Endgames node runtime ---

const CENTER_SQUARES: Square[] = ['d4', 'd5', 'e4', 'e5'];

function handlePracticeMove(state: TutorialState, uci: Uci): void {
  const view = darkChessVariant.getPlayerView(state.activeState, 'white');
  const resolvedMove = resolveUiMove(view, moveFromUci(uci));
  if (!resolvedMove) {
    state.message = 'That move is not legal from this position.';
    render(state);
    return;
  }

  const nextState = darkChessVariant.applyMove(state.activeState, resolvedMove);
  state.activeState = {
    ...nextState,
    status: { type: 'playing', turn: 'white' },
    lastMove: resolvedMove,
  };
  const supportPiece = supportPieceLabel(state.activeState.board);
  state.message = `Move made. There is no Black move in this chapter; keep moving the king and ${supportPiece} to study how the fog changes.`;
  render(state);
}

function supportPieceLabel(board: Board): string {
  for (const piece of Object.values(board)) {
    if (piece?.color !== 'white' || piece.role === 'king') continue;
    return piece.role;
  }
  return 'piece';
}

function findKing(board: Board, color: 'white' | 'black'): Square | null {
  for (const [square, piece] of Object.entries(board)) {
    if (piece && piece.role === 'king' && piece.color === color) return square as Square;
  }
  return null;
}

function hasPiece(board: Board, color: 'white' | 'black', role: PieceRole): boolean {
  return Object.values(board).some((piece) => piece?.color === color && piece.role === role);
}

function kingNeighbors(square: Square): Square[] {
  const fileIndex = squareFileIndex(square);
  const rank = Number.parseInt(rankOf(square), 10);
  const out: Square[] = [];
  for (let df = -1; df <= 1; df += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      if (df === 0 && dr === 0) continue;
      const nf = fileIndex + df;
      const nr = rank + dr;
      if (nf < 0 || nf > 7 || nr < 1 || nr > 8) continue;
      out.push(`${boardFiles[nf]}${nr}` as Square);
    }
  }
  return out;
}

function chebyshev(a: Square, b: Square): number {
  return Math.max(
    Math.abs(squareFileIndex(a) - squareFileIndex(b)),
    Math.abs(Number.parseInt(rankOf(a), 10) - Number.parseInt(rankOf(b), 10)),
  );
}

function centerDistance(square: Square): number {
  return Math.min(...CENTER_SQUARES.map((c) => chebyshev(square, c)));
}

// Open-board lone-king defender. Keeps Chebyshev distance >= 2 from the white
// king (so White can never reach its square next move), otherwise maximizes
// distance and drifts toward the center to stay off the edge. Provably drawing
// in the open, which is the only place the play chapter uses it.
function evaderReply(gs: GameState): Move | null {
  const board = gs.board;
  const black = findKing(board, 'black');
  const white = findKing(board, 'white');
  if (!black || !white) return null;
  const empty = kingNeighbors(black).filter((sq) => !board[sq]);
  if (empty.length === 0) return null;
  const safe = empty.filter((sq) => chebyshev(sq, white) >= 2);
  const pool = safe.length > 0 ? safe : empty;
  pool.sort((a, b) => {
    const byDistance = chebyshev(b, white) - chebyshev(a, white);
    if (byDistance !== 0) return byDistance;
    return centerDistance(a) - centerDistance(b);
  });
  return { from: black, to: pool[0]! };
}

function handlePlayMove(state: TutorialState, uci: Uci): void {
  const chapter = chapters[state.chapterIndex]!;
  if (state.busy || state.playDone) return;

  const view = darkChessVariant.getPlayerView(state.activeState, 'white');
  const resolved = resolveUiMove(view, moveFromUci(uci));
  if (!resolved) {
    state.message = 'That move is not legal from this position.';
    render(state);
    return;
  }

  const afterWhite = darkChessVariant.applyMove(state.activeState, resolved);
  state.activeState = { ...afterWhite, lastMove: resolved };
  state.whiteMoves += 1;

  // White should never actually catch the evader on an open board, but guard.
  if (afterWhite.status.type !== 'playing') {
    state.playDone = true;
    state.message =
      chapter.playCaptureText ??
      'You caught it. On an open board that takes luck, not force. Try again and watch how it slips away.';
    render(state);
    return;
  }

  const cap = chapter.playMoveCap ?? 12;
  // Render the glimpse (the black king may now sit on a square White can see),
  // then let the defender slip back into the fog.
  state.busy = true;
  render(state);
  const chapterAtMove = chapter;
  setTimeout(() => {
    if (chapters[state.chapterIndex] !== chapterAtMove) return;
    if (state.whiteMoves >= cap) {
      state.playDone = true;
      state.busy = false;
      state.message = chapter.playCoachCap ?? 'No capture. It always slips away.';
      render(state);
      return;
    }
    const reply = defenderReplyForChapter(chapter, state.activeState);
    if (reply) {
      const afterBlack = darkChessVariant.applyMove(state.activeState, reply);
      state.activeState = {
        ...afterBlack,
        status:
          afterBlack.status.type === 'playing'
            ? { type: 'playing', turn: 'white' }
            : afterBlack.status,
        lastMove: reply,
      };
      if (afterBlack.status.type !== 'playing') {
        state.playDone = true;
        state.busy = false;
        state.message =
          afterBlack.status.type === 'finished' && afterBlack.status.winner === 'black'
            ? (chapter.playDefeatText ?? 'The defender captured your king.')
            : (chapter.playCaptureText ?? 'King captured.');
        render(state);
        return;
      }
      if (chapter.lesson === 'K+Q vs K' && !hasPiece(afterBlack.board, 'white', 'queen')) {
        state.playDone = true;
        state.busy = false;
        state.message =
          chapter.playMaterialLossText ??
          'The defender captured your queen. Reset and keep the queen closer to king support.';
        render(state);
        return;
      }
    }
    state.busy = false;
    render(state);
  }, 700);
}

function defenderReplyForChapter(chapter: TutorialChapter, gs: GameState): Move | null {
  if (chapter.playDefender === 'wandering-king') return wanderingKingReply(gs);
  return evaderReply(gs);
}

function wanderingKingReply(gs: GameState): Move | null {
  const black = findKing(gs.board, 'black');
  if (!black) return null;
  const legal = darkChessVariant.getLegalMoves(gs, 'black').filter((move) => move.from === black);
  if (legal.length === 0) return null;

  legal.sort((left, right) => {
    const scoreDelta =
      scoreWanderingKingMove(gs, right, black) - scoreWanderingKingMove(gs, left, black);
    if (scoreDelta !== 0) return scoreDelta;
    return moveToUci(left).localeCompare(moveToUci(right));
  });
  return legal[0]!;
}

function scoreWanderingKingMove(gs: GameState, move: Move, from: Square): number {
  const target = gs.board[move.to];
  if (target?.role === 'king' && target.color === 'white') return 10_000;

  const after = darkChessVariant.applyMove(gs, move);
  const black = findKing(after.board, 'black') ?? move.to;
  const whiteKing = findKing(after.board, 'white');
  const whiteQueen = findPiece(after.board, 'white', 'queen');
  const visibleToWhite = Boolean(darkChessVariant.getPlayerView(after, 'white').board[black]);
  const canBeCaptured = whiteCanCaptureBlackKing(after);
  const capturesQueen = target?.role === 'queen' && target.color === 'white';

  let score = 0;
  if (capturesQueen) score += 120;
  if (!visibleToWhite) score += 60;
  if (canBeCaptured) score -= 250;
  if (whiteKing) score += chebyshev(black, whiteKing) * 12;
  if (whiteQueen) score += chebyshev(black, whiteQueen) * 5;
  score -= centerDistance(black) * 3;
  score += chebyshev(from, black);
  return score;
}

function findPiece(board: Board, color: 'white' | 'black', role: PieceRole): Square | null {
  for (const [square, piece] of Object.entries(board)) {
    if (piece && piece.role === role && piece.color === color) return square as Square;
  }
  return null;
}

function whiteCanCaptureBlackKing(gs: GameState): boolean {
  const black = findKing(gs.board, 'black');
  if (!black) return false;
  const whiteTurn: GameState = { ...gs, status: { type: 'playing', turn: 'white' } };
  return darkChessVariant
    .getLegalMoves(whiteTurn, 'white')
    .some((candidate) => candidate.to === black);
}

function handleSuperpositionMove(state: TutorialState, uci: Uci): void {
  const chapter = chapters[state.chapterIndex]!;
  if (state.playDone) return;

  const view = darkChessVariant.getPlayerView(state.activeState, 'white');
  const resolved = resolveUiMove(view, moveFromUci(uci));
  if (!resolved) {
    state.message = 'That move is not legal from this position.';
    render(state);
    return;
  }

  const afterWhite = darkChessVariant.applyMove(state.activeState, resolved);
  state.activeState = {
    ...afterWhite,
    status: { type: 'playing', turn: 'white' },
    lastMove: resolved,
  };
  state.superpositionMoveCount += 1;

  const nextView = darkChessVariant.getPlayerView(state.activeState, 'white');
  const visible = new Set(nextView.visibleSquares);
  const candidates =
    state.superpositionCandidates.length > 0
      ? state.superpositionCandidates
      : [...(chapter.candidateSquares ?? [])];
  const connected = connectedHiddenKingCandidateSquares(candidates, state.activeState);
  const flushed = connected.filter((square) => visible.has(square));
  const remaining = connected.filter((square) => !visible.has(square));

  state.superpositionCandidates = remaining;
  state.superpositionFlushed = flushed;

  if (remaining.length === 0) {
    state.status = 'success';
    state.playDone = true;
    state.message =
      chapter.playCaptureText ??
      'All candidate worlds are gone. Whichever square held the real Black king, this move forces the capture.';
    render(state);
    return;
  }

  state.status = flushed.length > 0 ? 'ready' : 'soft-failure';
  state.message =
    flushed.length > 0
      ? `${remaining.length} squares could still hold the king. ${flushed.length} connected ${flushed.length === 1 ? 'square was' : 'squares were'} revealed by your move.`
      : `${remaining.length} candidates still possible. That move was legal, but it did not light up any candidate square.`;
  render(state);
}

function connectedHiddenKingCandidateSquares(candidates: Square[], gs: GameState): Square[] {
  const connected = new Set<Square>();
  for (const candidate of candidates) {
    for (const square of kingNeighbors(candidate)) {
      if (gs.board[square]?.color === 'white') continue;
      connected.add(square);
    }
  }
  return sortSquares([...connected]);
}

function sortSquares(squares: Square[]): Square[] {
  return [...squares].sort((left, right) => {
    const byFile = squareFileIndex(left) - squareFileIndex(right);
    if (byFile !== 0) return byFile;
    return Number.parseInt(rankOf(left), 10) - Number.parseInt(rankOf(right), 10);
  });
}

function advanceDemo(state: TutorialState): void {
  const chapter = chapters[state.chapterIndex]!;
  const moves = chapter.demoMoves ?? [];
  const beat = state.demoIndex;
  if (beat < moves.length) {
    const move = moveFromUci(moves[beat]!.uci);
    const applied = darkChessVariant.applyMove(state.activeState, move);
    state.activeState = { ...applied, lastMove: move };
    state.message = moves[beat]!.say;
    state.demoIndex = beat + 1;
  } else if (beat === moves.length) {
    // Conclusion beat: reset to the start position so the overlay sits on the
    // original kings.
    state.activeState = gameStateFromBoard(chapter.id, chapter.board);
    state.message = chapter.demoConclusion ?? state.message;
    state.demoIndex = beat + 1;
  } else {
    goNextChapter(state);
    return;
  }
  render(state);
}

function goNextChapter(state: TutorialState): void {
  const nextIndex = state.chapterIndex + 1;
  if (!chapters[nextIndex]) {
    showLearnHome(state);
    return;
  }
  goToChapter(state, nextIndex);
}

function endgameSquareClasses(view: PlayerView, chapter: TutorialChapter): cg.SquareClasses {
  const classes: cg.SquareClasses =
    chapter.mode === 'practice' || chapter.mode === 'play' || chapter.fogPreview
      ? hiddenSquareClasses(view, 'white')
      : new Map();
  const showOverlays = chapter.mode === 'teach' || chapter.mode === 'demo';
  if (showOverlays) {
    for (const sq of chapter.wallSquares ?? []) {
      classes.set(sq as cg.Key, `${classes.get(sq as cg.Key) ?? ''} learn-explained`.trim());
    }
    for (const sq of chapter.candidateSquares ?? []) {
      classes.set(sq as cg.Key, `${classes.get(sq as cg.Key) ?? ''} learn-candidate`.trim());
    }
    for (const sq of chapter.safePair ?? []) {
      classes.set(sq as cg.Key, `${classes.get(sq as cg.Key) ?? ''} learn-highlight`.trim());
    }
    for (const sq of chapter.unsafeSquares ?? []) {
      classes.set(sq as cg.Key, `${classes.get(sq as cg.Key) ?? ''} learn-reveal`.trim());
    }
  }
  return classes;
}
