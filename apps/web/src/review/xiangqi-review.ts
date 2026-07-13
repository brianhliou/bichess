// Shared standard-xiangqi review surface: ONE tree-based implementation of the
// interactive board + eval gauge + captured material + local engine panel +
// branching move tree + whole-game analysis (advantage chart / accuracy summary /
// move glyphs / move advice), mounted on the shared review scaffold. This is the
// move-tree "P1" the linear DRY-extract left a seam for — both callers ride it:
//   - xiangqi-analysis.ts  — bare move list / empty start position (client views,
//     client ceval sweep). The lichess.org/analysis surface.
//   - xiangqi-postgame.ts  — a specific played/ingested game with a meta card
//     (server views, server Pikafish analysis). The lichess.org/{gameId} surface.
// The two callers differ only in ingress + metadata; the board, tree, engine, and
// analysis machinery is identical. The board is INTERACTIVE (play a move → it
// branches the tree, promote/delete variations).

import {
  fsfUciToXiangqiSquares,
  type StandardXiangqiPlayerView,
  standardXiangqiEngineFen,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiSquare,
} from '@mistboard/game';
import { xiangqiAppearanceChangedEvent } from '../theme.js';
import {
  animateXiangqiBoardMove,
  createXiangqiInteractiveBoard,
  type XiangqiBoardArrow,
  type XiangqiBoardMarker,
} from '../xiangqi-board.js';
import { type AdvantageChart, createAdvantageChart } from './advantage-chart.js';
import { createAnalysisSummary } from './analysis-summary.js';
import { createAnnotationEditor } from './annotations-editor.js';
import type { CevalLine } from './engine/ceval.js';
import { bestMoveArrow, engineArrowsFromLines } from './engine/engine-arrows.js';
import { createEnginePanel } from './engine/engine-panel.js';
import { createEvalBar } from './engine/eval-bar.js';
import { formatEval } from './engine/eval-format.js';
import { type GameAnalysis, judgmentGlyph } from './game-analysis.js';
import {
  createGameTree,
  type GameTree,
  type GameTreeNode,
  type NodeShape,
  ROOT_PATH,
  type TreePath,
} from './game-tree.js';
import { createMoveAdvice } from './move-advice.js';
import { createMoveTree, type MoveTree, type MoveTreeAnnotation, pathKey } from './move-tree.js';
import { createReviewControls, REVIEW_MENU_ICONS } from './review-controls.js';
import { createReviewScaffold, installReviewKeyboard } from './review-layout.js';
import { deserializeTree, type SerializedTree, serializeTree } from './tree-serialize.js';
import { xiangqiTreeAdapter } from './xiangqi-tree-adapter.js';

type XiangqiNode = GameTreeNode<XiangqiMove, XiangqiGameState>;
type XiangqiTree = GameTree<XiangqiMove, XiangqiGameState, StandardXiangqiPlayerView>;

/** With the live engine off, a completed whole-game analysis still knows the
 *  best move at every mainline ply — draw it as a single arrow. Flip to false
 *  to keep arrows strictly live-engine. */
const SHOW_ANALYSIS_BEST_ARROW = true;

/** NAG code → move-list suffix for user-authored glyphs (annotations-editor set). */
const GLYPH_LABEL: Record<number, string> = { 1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!' };

export type XiangqiAnalysisSource = {
  /** Request-button label ('Request computer analysis' / 'Analyse the whole game'). */
  requestLabel: string;
  /** Cached result that never computes (server path). Optional. */
  fetchCached?(): Promise<GameAnalysis | null>;
  /** Compute the whole-game analysis; report progress when known. */
  run(onProgress: (done: number, total: number) => void): Promise<GameAnalysis>;
};

export type XiangqiReviewConfig = {
  pageClassName?: string;
  ariaLabel: string;
  /** Info-card eyebrow when no meta card ('Analysis' / 'Game review'). */
  eyebrow?: string;
  title: string;
  summary: string;
  boardAriaLabel?: string;
  /** Optional left-rail actions row (analysis import/home, etc.). */
  actions?: HTMLElement;
  /** Left-rail details panel. Optional. */
  details?: HTMLElement;
  /** Lichess-style game meta card; replaces the plain title/summary card. */
  metaCard?: HTMLElement;
  /** Canonical moves in order. Any illegal-from-here move truncates the mainline to
   *  the legal prefix (a notice is surfaced). Empty = a fresh board at the start.
   *  Ignored when `initialTree` is set. */
  moves: XiangqiMove[];
  /** Load a persisted study tree (with its annotations + variations) instead of
   *  seeding from `moves`. When set, the tree is rebuilt from this blob by replay. */
  initialTree?: SerializedTree;
  /** Fired after any tree mutation (move, annotation, promote, delete). The study
   *  page uses it to autosave; the analysis/postgame pages ignore it. */
  onChange?: () => void;
  /** Show gamebook (lesson) authoring fields — per-node hint + deviation — in the
   *  annotation editor. The study page sets this for a gamebook chapter's owner. */
  gamebookEditing?: boolean;
  /** Show the study annotation controls (glyph picker + comment box + clear-shapes)
   *  in the right rail. Only editable studies set this; the postgame/analysis
   *  review surfaces are read-only and omit it. Board shape-drawing still works. */
  annotationEditing?: boolean;
  /** Whole-game analysis source; null disables the analysis affordance. */
  analysis: XiangqiAnalysisSource | null;
  /** Per-ply elapsed milliseconds (index 0 = ply 1). When present, a "Move times"
   *  underboard tab renders a per-move bar chart. Only real games supply it. */
  moveTimes?: number[];
  /** Real player names — label the accuracy summary and crosstable stub. Absent =
   *  the side colors (Red / Black) are used. */
  players?: { red?: string; black?: string };
  /** Show the "Crosstable" underboard tab (a head-to-head record — a stub for now). */
  showCrosstable?: boolean;
  /** Prebuilt provenance panel (source / event / date / flags …). When present, a
   *  "Game info" underboard tab renders it. The historical-library caller supplies
   *  it; played/analysis surfaces leave it undefined. */
  provenance?: HTMLElement;
};

/** Handle returned by mountXiangqiReview: lets a caller snapshot the current tree
 *  (to persist it — "save as study", autosave). */
export interface XiangqiReviewHandle {
  serialize(): SerializedTree;
}

/** Keyboard listener is document-wide; on re-mount (import re-seeds) abort the
 *  previous one so handlers don't stack. */
let keyboardAbort: AbortController | null = null;

export function mountXiangqiReview(
  root: HTMLElement,
  config: XiangqiReviewConfig,
): XiangqiReviewHandle {
  const tree: XiangqiTree = config.initialTree
    ? (deserializeTree(xiangqiTreeAdapter, config.initialTree) as XiangqiTree)
    : createGameTree(xiangqiTreeAdapter, config.moves);
  const mainlineLen = tree.mainlinePath().length;
  const notifyChange = (): void => config.onChange?.();

  let currentPath: TreePath = tree.last();
  let flipped = false;

  const currentNode = (): XiangqiNode => tree.nodeAt(currentPath) ?? tree.root;
  const currentView = (): StandardXiangqiPlayerView =>
    xiangqiTreeAdapter.project(currentNode().truth)[0]!.view;
  const orientation = (): XiangqiColor => (flipped ? 'black' : 'red');

  const uciTo = (node: XiangqiNode): string[] => {
    const line: string[] = [];
    for (let n: XiangqiNode | null = node; n?.parent; n = n.parent) {
      if (n.move) line.unshift(xiangqiTreeAdapter.toEngineUci(n.move));
    }
    return line;
  };

  // ── Board (interactive) + gauge column. Captured-material rows are OFF on
  // the review surface for now: empty rows collapse and re-inflate on the first
  // capture, jarring the rail; they return with a lichess-style rework (#166).
  const boardWrap = document.createElement('section');
  boardWrap.className = 'dxq-postgame__board-wrap review-board-host';
  const boardEl = document.createElement('div');
  boardEl.className = 'dxq-postgame__board xiangqi-live-board';
  boardEl.setAttribute('aria-label', config.boardAriaLabel ?? 'Xiangqi board');
  boardWrap.append(boardEl);

  const evalBar = createEvalBar();

  const interactive = createXiangqiInteractiveBoard({
    board: boardEl,
    getInteractionView: () => currentView(),
    getPerspective: orientation,
    // Review plays BOTH sides: the interactive seat is the side to move.
    seatFor: (view) => (view.status.type === 'playing' ? view.status.turn : null),
    enabled: () => true,
    onMove: (move) => {
      const next = tree.addMove(currentPath, move);
      if (!next) return;
      currentPath = next;
      moveTree.rebuild();
      render();
      notifyChange();
    },
    // Right-drag draws an annotation shape on the CURRENT node (toggle: re-drawing
    // the same shape removes it). Green by default, red with a modifier held.
    onDrawShape: (orig, dest, { alt }) => {
      const brush = alt ? 'red' : 'green';
      const shape: NodeShape =
        !dest || dest === orig
          ? { kind: 'circle', brush, orig }
          : { kind: 'arrow', brush, orig, dest };
      const same = (s: NodeShape): boolean =>
        s.kind === shape.kind &&
        s.orig === shape.orig &&
        s.dest === shape.dest &&
        s.brush === shape.brush;
      const existing = currentNode().annotations?.shapes ?? [];
      const nextShapes = existing.some(same)
        ? existing.filter((s) => !same(s))
        : [...existing, shape];
      tree.annotateAt(currentPath, { shapes: nextShapes });
      paintOverlays();
      annotationEditor?.setAnnotations(currentNode().annotations);
      notifyChange();
    },
  });

  // ── Engine (live, current node) ──
  // On-board PV arrows: live MultiPV lines win; with the engine off (or between
  // a ply change and the first fresh update) fall back to the whole-game
  // analysis' best move for the current mainline node; otherwise no arrows.
  // NOTE: declared before createEnginePanel — its constructor clears output,
  // which fires onLines(null) → paintOverlays() synchronously.
  let gameAnalysis: GameAnalysis | null = null;
  let engineLines: CevalLine[] | null = null;
  // Engine PV / analysis-best arrows for the current node (transient, derived).
  function engineArrows(): XiangqiBoardArrow[] {
    if (engineLines?.length) return engineArrowsFromLines(engineLines);
    if (SHOW_ANALYSIS_BEST_ARROW && gameAnalysis) {
      const node = currentNode();
      if (mainlineNodes()[node.ply] === node) {
        const best = gameAnalysis.evals.find((entry) => entry.ply === node.ply)?.best;
        return bestMoveArrow(best);
      }
    }
    return [];
  }
  const shapeToArrow = (s: NodeShape): XiangqiBoardArrow => ({
    from: s.orig as XiangqiSquare,
    to: (s.dest ?? s.orig) as XiangqiSquare,
    className: `xq-arrow--draw xq-shape--${s.brush}`,
  });
  const shapeToMarker = (s: NodeShape): XiangqiBoardMarker => ({
    square: s.orig as XiangqiSquare,
    kind: 'circle',
    className: `xq-shape--${s.brush}`,
  });
  // Paint BOTH the derived engine arrows and the node's user-drawn shapes. User
  // arrows layer over engine arrows; user circles ride the marker overlay.
  function paintOverlays(): void {
    const shapes = currentNode().annotations?.shapes ?? [];
    const userArrows = shapes.filter((s) => s.kind === 'arrow').map(shapeToArrow);
    interactive.setArrows([...engineArrows(), ...userArrows]);
    interactive.setMarkers(shapes.filter((s) => s.kind === 'circle').map(shapeToMarker));
  }

  const enginePanel = createEnginePanel({
    variant: 'xiangqi',
    formatPvMove: formatXiangqiEngineMove,
    evalBar,
    onLines: (lines) => {
      engineLines = lines?.length ? lines : null;
      paintOverlays();
    },
  });

  // ── Move tree (right-click a move to promote/delete its branch) ──
  const isPrefix = (prefix: TreePath, of: TreePath): boolean =>
    of.length >= prefix.length && prefix.every((id, i) => of[i] === id);
  const moveTree: MoveTree = createMoveTree(tree, {
    onJump: (path) => go(path),
    onPromote: (path) => {
      tree.promoteToMainline(path);
      moveTree.rebuild();
      render();
      notifyChange();
    },
    onDelete: (path) => {
      if (isPrefix(path, currentPath)) currentPath = path.slice(0, -1);
      tree.deleteAt(path);
      moveTree.rebuild();
      render();
      notifyChange();
    },
  });

  // ── Control bar (below the move box): nav + a menu overlay. Flip lives in the
  // menu; the deferred analyse tools are muted placeholders. ──
  const controls = createReviewControls({
    onFirst: () => go(ROOT_PATH),
    onPrevious: () => go(tree.stepBack(currentPath)),
    onNext: () => go(tree.stepForward(currentPath)),
    onLast: () => go(lineEnd(currentPath)),
    menuItems: [
      { label: 'Flip board', icon: REVIEW_MENU_ICONS.flip, onClick: () => flipBoard() },
      { label: 'Board editor', icon: REVIEW_MENU_ICONS.editor, disabled: true },
      { label: 'Learn from your mistakes', icon: REVIEW_MENU_ICONS.learn, disabled: true },
      { label: 'Continue from here', icon: REVIEW_MENU_ICONS.continue, disabled: true },
      { label: 'Study', icon: REVIEW_MENU_ICONS.study, disabled: true },
      { label: 'Clear moves', icon: REVIEW_MENU_ICONS.clear, disabled: true },
      { label: 'Settings', icon: REVIEW_MENU_ICONS.settings, disabled: true },
    ],
  });

  // ── Whole-game analysis (mainline) → underboard chart + summary + glyphs ──
  const underboardBody = document.createElement('div');
  underboardBody.className = 'review-underboard-panel__body';
  // Live-FEN share input, refreshed on every navigation (see render()).
  const shareFenInput = document.createElement('input');
  const shareMovesInput = document.createElement('textarea');
  const underboardEl = underboardPanel(underboardBody, {
    hasAnalysis: Boolean(config.analysis),
    provenance: config.provenance,
    moveTimes: config.moveTimes,
    players: config.showCrosstable ? (config.players ?? {}) : undefined,
    shareFenInput,
    shareMovesInput,
    gameUrl: typeof window !== 'undefined' ? window.location.href : '',
  });
  const analysisSummaryEl = document.createElement('div');
  const moveAdvice = createMoveAdvice();
  let chart: AdvantageChart | null = null;

  // ── Study annotation controls (glyph picker + comment editor) ──
  // Only editable studies show them; the read-only postgame/analysis surfaces omit
  // the panel entirely (board shape-drawing still works either way).
  const annotationEditor = config.annotationEditing
    ? createAnnotationEditor({
        onGlyph: (code) => {
          tree.annotateAt(currentPath, { glyphs: code === null ? [] : [code] });
          refreshMoveTreeAnnotations();
          render();
          notifyChange();
        },
        onComment: (text) => {
          // Per-keystroke write; deliberately no render() — the move list carries no
          // comment marker in S1 and a re-render would drop the textarea caret.
          tree.annotateAt(currentPath, { comments: text.trim() ? [{ text }] : [] });
          notifyChange();
        },
        onClearShapes: () => {
          tree.annotateAt(currentPath, { shapes: [] });
          paintOverlays();
          annotationEditor?.setAnnotations(currentNode().annotations);
          notifyChange();
        },
        gamebook: config.gamebookEditing,
        onGamebook: (patch) => {
          tree.annotateAt(currentPath, {
            gamebook: {
              hint: patch.hint?.trim() || undefined,
              deviation: patch.deviation?.trim() || undefined,
            },
          });
          notifyChange();
        },
      })
    : null;

  // The tree truncates an illegal seed to the legal prefix; surface a notice.
  const truncated = !config.initialTree && mainlineLen < config.moves.length;
  const details = config.details ?? (truncated ? truncationNotice(mainlineLen) : undefined);

  const scaffold = createReviewScaffold(root, {
    ariaLabel: config.ariaLabel,
    pageClassName: config.pageClassName,
    eyebrow: config.eyebrow ?? 'Analysis',
    title: config.title,
    summary: config.summary,
    actions: config.actions,
    details,
    metaCard: config.metaCard,
    boards: [{ key: 'truth', el: boardWrap, tier: 'primary' }],
    boardAspect: 552 / 612,
    boardCols: 9,
    underboard:
      config.analysis || config.provenance || config.showCrosstable ? underboardEl : undefined,
    underboardOverflows: true,
    enginePanel: enginePanel.el,
    moves: moveTree.el,
    moveComment: moveAdvice.el,
    annotations: annotationEditor?.el,
    navigation: controls.el,
    analysisSummary: analysisSummaryEl,
    gauge: evalBar.el,
    onPromote: () => render(),
  });

  function go(path: TreePath): void {
    const fromPath = currentPath;
    currentPath = path;
    render();
    animateStep(fromPath, path);
  }
  // Adjacent tree steps glide (pieceAnimation pref, no-op at duration 0):
  // stepping INTO a child animates that node's move; stepping back to the
  // parent reverse-animates it. Multi-ply jumps (first/last/tree clicks to a
  // distant node) render discretely. Moves the user plays on the board go
  // through onMove, not go(), so own input never double-animates.
  function animateStep(fromPath: TreePath, toPath: TreePath): void {
    if (toPath.length === fromPath.length + 1 && isPrefix(fromPath, toPath)) {
      const move = tree.nodeAt(toPath)?.move;
      if (move) animateXiangqiBoardMove(boardEl, move, orientation());
      return;
    }
    if (fromPath.length === toPath.length + 1 && isPrefix(toPath, fromPath)) {
      const move = tree.nodeAt(fromPath)?.move;
      if (move) animateXiangqiBoardMove(boardEl, move, orientation(), { reverse: true });
    }
  }
  function flipBoard(): void {
    flipped = !flipped;
    render();
  }
  function lineEnd(path: TreePath): TreePath {
    let p = path;
    for (;;) {
      const next = tree.stepForward(p);
      if (pathKey(next) === pathKey(p)) return p;
      p = next;
    }
  }
  function mainlineNodes(): XiangqiNode[] {
    const nodes: XiangqiNode[] = [tree.root];
    let n = tree.root;
    while (n.children[0]) {
      n = n.children[0];
      nodes.push(n);
    }
    return nodes;
  }

  function render(): void {
    const node = currentNode();
    const view = currentView();
    interactive.render(view, orientation());
    evalBar.setFlipped(flipped);

    // Order matters: setPosition fires onLines(null) synchronously when the
    // engine is on (stale-arrow clear); the explicit paintOverlays below then
    // repaints for the new node (engine/analysis arrows + the node's user shapes),
    // covering the engine-off case where setPosition fires no onLines.
    enginePanel.setPosition(uciTo(node));
    paintOverlays();
    annotationEditor?.setAnnotations(node.annotations);
    moveTree.setCurrent(currentPath);
    controls.setBounds({ atStart: currentPath.length === 0, atEnd: node.children.length === 0 });
    // Live-refresh the Share tab's FEN + move export for the current node/line.
    shareFenInput.value = standardXiangqiEngineFen(node.truth);
    shareMovesInput.value = uciTo(node).join(' ');
    chart?.setPly(node.ply);
    moveAdvice.update(node.ply, gameAnalysis);
  }

  function applyAnalysis(analysis: GameAnalysis): void {
    gameAnalysis = analysis;
    const nodes = mainlineNodes();
    chart = createAdvantageChart(analysis.evals, {
      onJump: (ply) => {
        const target = nodes[ply];
        if (target) go(tree.pathTo(target));
      },
    });
    chart.setPly(currentNode().ply);
    underboardBody.replaceChildren(chart.el);
    analysisSummaryEl.replaceChildren(createAnalysisSummary(analysis, config.players));
    refreshMoveTreeAnnotations(); // rebuilds the tree DOM (engine glyphs + user glyphs)
    render(); // re-highlight + re-apply move advice
    scaffold.refit(); // the underboard grew; re-fit the board
  }

  // Build the move-list annotation map from BOTH the engine judgment (mainline, if
  // analysed) and the user's authored glyphs (whole tree). User glyphs win on any
  // node where both exist (R6 — the two glyph sources are kept distinct).
  function refreshMoveTreeAnnotations(): void {
    const byPathKey = new Map<string, MoveTreeAnnotation>();
    if (gameAnalysis) {
      const nodes = mainlineNodes();
      const evalByPly = new Map(gameAnalysis.evals.map((entry) => [entry.ply, entry]));
      for (const move of gameAnalysis.moves) {
        const node = nodes[move.ply];
        if (!node) continue;
        const glyph = judgmentGlyph(move.judgment);
        const entry = evalByPly.get(move.ply);
        byPathKey.set(pathKey(tree.pathTo(node)), {
          suffix: glyph?.suffix,
          suffixClass: glyph?.suffixClass,
          eval: entry ? formatEval(entry.cp, entry.mate) : undefined,
        });
      }
    }
    applyUserGlyphs(tree.root, byPathKey);
    moveTree.annotate(byPathKey);
  }

  function applyUserGlyphs(node: XiangqiNode, map: Map<string, MoveTreeAnnotation>): void {
    const code = node.annotations?.glyphs?.[0];
    if (code !== undefined && node.parent) {
      const key = pathKey(tree.pathTo(node));
      const prev = map.get(key);
      map.set(key, { ...prev, suffix: GLYPH_LABEL[code] ?? prev?.suffix, suffixClass: undefined });
    }
    for (const child of node.children) applyUserGlyphs(child, map);
  }

  function renderAnalysisRequest(source: XiangqiAnalysisSource): void {
    if (mainlineLen < 1) {
      underboardBody.replaceChildren();
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'xiangqi-review__analyse';
    button.textContent = source.requestLabel;
    button.addEventListener('click', () => {
      button.disabled = true;
      button.textContent = 'Analysing the whole game…';
      source
        .run((done, total) => {
          button.textContent = `Analysing… ${done}/${total}`;
        })
        .then(applyAnalysis)
        .catch(() => {
          button.disabled = false;
          button.textContent = 'Analysis failed — retry';
        });
    });
    underboardBody.replaceChildren(button);
  }

  const analysisSource = config.analysis;
  if (analysisSource) {
    if (analysisSource.fetchCached) {
      void analysisSource
        .fetchCached()
        .then((cached) => (cached ? applyAnalysis(cached) : renderAnalysisRequest(analysisSource)))
        .catch(() => renderAnalysisRequest(analysisSource));
    } else {
      renderAnalysisRequest(analysisSource);
    }
  }

  // Paint any user glyphs carried by a loaded study tree into the move list (the
  // analysis/postgame paths seed no glyphs, so this is a harmless no-op there).
  refreshMoveTreeAnnotations();
  render();
  scaffold.refit();
  keyboardAbort?.abort();
  keyboardAbort = new AbortController();
  // The xiangqi board renders pieces as inline SVG, so a piece-set change needs a
  // re-render (the chess board picks up its set via CSS and does not). Reuse the
  // per-mount abort signal so a re-mount drops the stale listener rather than stacking.
  window.addEventListener(xiangqiAppearanceChangedEvent, () => render(), {
    signal: keyboardAbort.signal,
  });
  installReviewKeyboard(
    {
      stepBack: () => go(tree.stepBack(currentPath)),
      stepForward: () => go(tree.stepForward(currentPath)),
      toStart: () => go(ROOT_PATH),
      toEnd: () => go(tree.mainlinePath()),
      flip: () => flipBoard(),
    },
    keyboardAbort.signal,
  );

  return { serialize: () => serializeTree(tree, xiangqiTreeAdapter) };
}

type UnderboardOptions = {
  /** Include the "Computer analysis" tab. False for surfaces with no whole-game
   *  analysis (e.g. the historical library), so they don't lead with an empty chart. */
  hasAnalysis?: boolean;
  /** Prebuilt provenance panel → a "Game info" tab. */
  provenance?: HTMLElement;
  moveTimes?: number[];
  /** Present = show the Crosstable tab; the names label its stub. */
  players?: { red?: string; black?: string };
  shareFenInput: HTMLInputElement;
  shareMovesInput: HTMLTextAreaElement;
  gameUrl: string;
};

type UnderboardTab = { id: string; label: string; body: HTMLElement };

// Lichess analyse underboard: a tab strip (Computer analysis / Move times /
// Crosstable / Share & export) over a shared body. Computer analysis is the live
// chart body; the others are built here. Tabs that have no data are omitted.
function underboardPanel(analysisBody: HTMLElement, opts: UnderboardOptions): HTMLElement {
  const tabDefs: UnderboardTab[] = [];
  if (opts.hasAnalysis) {
    tabDefs.push({ id: 'analysis', label: 'Computer analysis', body: analysisBody });
  }
  if (opts.provenance) {
    tabDefs.push({ id: 'info', label: 'Game info', body: opts.provenance });
  }
  if (opts.moveTimes && opts.moveTimes.length > 0) {
    tabDefs.push({ id: 'times', label: 'Move times', body: moveTimesBody(opts.moveTimes) });
  }
  if (opts.players) {
    tabDefs.push({ id: 'crosstable', label: 'Crosstable', body: crosstableBody(opts.players) });
  }
  tabDefs.push({
    id: 'share',
    label: 'Share & export',
    body: shareExportBody(opts.shareFenInput, opts.shareMovesInput, opts.gameUrl),
  });

  const panel = document.createElement('section');
  panel.className = 'review-underboard-panel';
  const tabs = document.createElement('div');
  tabs.className = 'review-underboard-tabs';
  const bodies = document.createElement('div');
  bodies.className = 'review-underboard-bodies';

  const buttons = new Map<string, HTMLButtonElement>();
  const show = (id: string): void => {
    for (const def of tabDefs) {
      const active = def.id === id;
      def.body.hidden = !active;
      buttons.get(def.id)?.classList.toggle('review-underboard-tab--active', active);
    }
  };
  for (const def of tabDefs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'review-underboard-tab';
    button.textContent = def.label;
    button.addEventListener('click', () => show(def.id));
    buttons.set(def.id, button);
    tabs.append(button);
    def.body.classList.add('review-underboard-panel__body');
    bodies.append(def.body);
  }
  panel.append(tabs, bodies);
  show(tabDefs[0]!.id);
  return panel;
}

// Per-move time bars (lichess "Move times"): red plies (1,3,5…) above the axis,
// black plies below. Heights scale to the slowest move.
function moveTimesBody(times: number[]): HTMLElement {
  const body = document.createElement('div');
  const chart = document.createElement('div');
  chart.className = 'review-move-times';
  const max = Math.max(1, ...times);
  for (let i = 0; i < times.length; i += 1) {
    const isRed = i % 2 === 0; // ply 1 (index 0) is Red's move
    const col = document.createElement('div');
    col.className = `review-move-times__bar review-move-times__bar--${isRed ? 'red' : 'black'}`;
    col.style.height = `${Math.max(2, Math.round((times[i]! / max) * 100))}%`;
    col.title = `Move ${i + 1}: ${formatDuration(times[i]!)}`;
    chart.append(col);
  }
  const total = times.reduce((sum, t) => sum + t, 0);
  const caption = document.createElement('p');
  caption.className = 'review-move-times__caption';
  caption.textContent = `Total move time ${formatDuration(total)}`;
  body.append(chart, caption);
  return body;
}

function crosstableBody(players: { red?: string; black?: string }): HTMLElement {
  const body = document.createElement('div');
  const note = document.createElement('p');
  note.className = 'review-underboard-empty';
  const names = players.red && players.black ? `${players.red} vs ${players.black}` : '';
  note.textContent = names
    ? `Head-to-head record for ${names} is coming soon.`
    : 'Head-to-head record is coming soon.';
  body.append(note);
  return body;
}

function shareExportBody(
  fenInput: HTMLInputElement,
  movesInput: HTMLTextAreaElement,
  gameUrl: string,
): HTMLElement {
  const body = document.createElement('div');
  const grid = document.createElement('div');
  grid.className = 'review-share';

  fenInput.className = 'review-share__field';
  fenInput.readOnly = true;
  grid.append(shareRow('FEN', fenInput));

  const urlInput = document.createElement('input');
  urlInput.className = 'review-share__field';
  urlInput.readOnly = true;
  urlInput.value = gameUrl;
  grid.append(shareRow('Share', urlInput));

  movesInput.className = 'review-share__field review-share__field--moves';
  movesInput.readOnly = true;
  movesInput.rows = 2;
  grid.append(shareRow('Moves', movesInput));

  body.append(grid);
  return body;
}

function shareRow(label: string, field: HTMLInputElement | HTMLTextAreaElement): HTMLElement {
  const row = document.createElement('div');
  row.className = 'review-share__row';
  const name = document.createElement('span');
  name.className = 'review-share__label';
  name.textContent = label;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'review-share__copy';
  copy.textContent = 'Copy';
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(field.value).then(
      () => {
        copy.textContent = 'Copied';
        setTimeout(() => (copy.textContent = 'Copy'), 1200);
      },
      () => {},
    );
  });
  row.append(name, field, copy);
  return row;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function truncationNotice(legal: number): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'dxq-postgame__panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Truncated import';
  const body = document.createElement('p');
  body.textContent = `Move ${legal + 1} is illegal from that position; showing the first ${legal} legal ${legal === 1 ? 'move' : 'moves'}.`;
  panel.append(heading, body);
  return panel;
}

// Fairy-Stockfish xiangqi UCI back to our `from-to` notation for readable PV
// lines. FSF is 1-indexed like us, so this is a plain square split.
function formatXiangqiEngineMove(uci: string): string {
  const squares = fsfUciToXiangqiSquares(uci);
  return squares ? `${squares.from}-${squares.to}` : uci;
}
