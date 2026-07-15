// Variant-neutral tree-based review controller: the interactive board + eval
// gauge + captured material + local engine panel + branching move tree +
// whole-game analysis (advantage chart / accuracy summary / move glyphs / move
// advice), mounted on the shared review scaffold.
//
// This is the generalisation of the standard-xiangqi review surface: the RULES
// seam was already generic (VariantTreeAdapter<Move,Truth,View> in game-tree.ts);
// this file generalises the PRESENTATION seam. Everything xiangqi-specific — the
// board factory, move animation, engine FEN, PV formatting, arrow/marker
// mappers, board geometry/class names, the appearance re-render event — is
// injected as a `TreePresentation` bundle. mountXiangqiReview (xiangqi-review.ts)
// is now a thin wrapper that builds the xiangqi bundle and delegates here; other
// variants (jungle, banqi, jieqi, fortress-xiangqi, dark-*) will ride the same
// controller with their own bundle.
//
// The two xiangqi callers still differ only in ingress + metadata; the board,
// tree, engine, and analysis machinery is identical. The board is INTERACTIVE
// (play a move → it branches the tree, promote/delete variations).

import type { MoveJudgment } from '@mistboard/game';
import { type AdvantageChart, createAdvantageChart } from './advantage-chart.js';
import { createAnalysisSummary } from './analysis-summary.js';
import { createAnnotationEditor } from './annotations-editor.js';
import type { CevalLine, CevalVariant } from './engine/ceval.js';
import { createEnginePanel } from './engine/engine-panel.js';
import { createEvalBar } from './engine/eval-bar.js';
import { formatEval } from './engine/eval-format.js';
import { type GameAnalysis, judgmentGlyph, mergeDecisionAnalysis } from './game-analysis.js';
import {
  createGameTree,
  type GameTree,
  type GameTreeNode,
  type NodeShape,
  ROOT_PATH,
  type TreePath,
  type VariantTreeAdapter,
} from './game-tree.js';
import { createMoveAdvice } from './move-advice.js';
import { createMoveTree, type MoveTree, type MoveTreeAnnotation, pathKey } from './move-tree.js';
import { createReviewControls, REVIEW_MENU_ICONS } from './review-controls.js';
import { createReviewScaffold, installReviewKeyboard } from './review-layout.js';
import type { ReviewSeatColors } from './review-seat-colors.js';
import { deserializeTree, type SerializedTree, serializeTree } from './tree-serialize.js';
import { underboardPanel } from './underboard-tabs.js';

/** With the live engine off, a completed whole-game analysis still knows the
 *  best move at every mainline ply — draw it as a single arrow. Flip to false
 *  to keep arrows strictly live-engine. */
const SHOW_ANALYSIS_BEST_ARROW = true;

/** NAG code → move-list suffix for user-authored glyphs (annotations-editor set). */
const GLYPH_LABEL: Record<number, string> = { 1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!' };

/** The board handle the controller drives: render a view for a perspective, and
 *  swap the arrow / marker overlays. Arrow/Marker are OPAQUE to the controller —
 *  it only carries them from the presentation's engine/shape builders into the
 *  board. A variant's concrete interactive board satisfies this structurally. */
export interface TreeBoardHandle<View, Color, Arrow, Marker> {
  render(view: View | null, perspective: Color): void;
  setArrows(arrows: readonly Arrow[]): void;
  setMarkers(markers: readonly Marker[]): void;
}

/** What the controller hands a variant's board factory. The interaction policies
 *  (which view drives legality, whose seat plays, whether input is enabled) and
 *  the move / draw sinks are owned by the controller; the factory wires them into
 *  the variant's own interactive board. */
export interface TreeBoardFactoryOptions<Move, View, Color> {
  board: HTMLElement;
  getInteractionView: () => View | null;
  getPerspective: () => Color;
  seatFor: (view: View) => Color | null;
  enabled: () => boolean;
  onMove: (move: Move, view: View) => void;
  onDrawShape?: (orig: string, dest: string | null, opts: { alt: boolean }) => void;
}

/** The injected, variant-specific presentation bundle. Arrow/Marker are OPAQUE to
 *  the controller (it only passes them from the engine/shape builders into the
 *  board handle), so they stay free type params. */
export interface EnginePresentation<Truth, Arrow> {
  /** Which ceval engine the local engine panel loads. */
  panelVariant: CevalVariant;
  /** How the panel is fed each position. `'moves'` (default): replay engine UCI from the
   *  start position — the Fairy-Stockfish variants. `'fen'`: hand the engine the per-node
   *  redacted FEN with no move list — the Misty flip variants (banqi), whose engine takes a
   *  full position FEN and must never see more than the as-played info-state. */
  positionMode?: 'moves' | 'fen';
  /** Engine FEN for a truth state. Drives the Share tab, and — when positionMode is
   *  `'fen'` — the per-node position fed to the engine panel. */
  fen(truth: Truth): string;
  /** Prettify a PV move (engine UCI) for the engine panel. */
  formatPvMove(uci: string): string;
  /** On-board arrows for live MultiPV lines. */
  engineArrowsFromLines(lines: CevalLine[]): Arrow[];
  /** Single best-move arrow from a whole-game analysis ply; empty when absent. */
  bestMoveArrow(best: string | null | undefined): Arrow[];
}

export interface TreePresentation<Move, Truth, View, Color, Arrow, Marker> {
  /** Rules seam: the concrete VariantTreeAdapter (already generic). */
  adapter: VariantTreeAdapter<Move, Truth, View>;
  /** Client-engine hooks (local ceval panel + eval gauge + engine arrows + Share
   *  FEN). Null for variants with no client engine: the panel and gauge are then
   *  omitted and the board carries no eval affordance. */
  engine: EnginePresentation<Truth, Arrow> | null;
  /** Format a whole-game-analysis best move (server `evals[].best`, in the ANALYSIS
   *  engine's UCI dialect) for the "… was best" advice line. Omit to use the default
   *  xiangqi/FSF formatter (correct for xiangqi/fortress/jungle, whose display coords
   *  match the engine dialect). Hidden-info variants (banqi/jungle-flip) whose engine
   *  UCI differs from the board coords (0-indexed rank, flip = from===to) supply their
   *  own so the advice reads e.g. "b3 flip" instead of a raw "B2-B2". */
  formatBestMove?: (uci: string) => string;
  /** Class on the board host element (e.g. 'dxq-postgame__board xiangqi-live-board'). */
  boardHostClassName: string;
  /** Class on the board wrapper section (e.g. 'dxq-postgame__board-wrap review-board-host'). */
  boardWrapClassName: string;
  /** aria-label for the board host when the config supplies none. */
  defaultBoardAriaLabel: string;
  /** Board width/height ratio for the scaffold's board-box sizing. */
  boardAspect: number;
  /** Column count for the scaffold's board-box sizing. */
  boardCols: number;
  /** Optional hard cap on the rendered board WIDTH (px). Wide/short boards (e.g. the
   *  8x4 banqi board) otherwise stretch to the full column width; a cap keeps them at
   *  a sane size, matching the linear layout's boardMaxPx. Omit for square-ish boards. */
  boardMaxPx?: number;
  /** Window event whose fire forces a full re-render (variants that render pieces
   *  inline as SVG need this on a piece-set change; variants that pick up their set
   *  via CSS omit it). */
  appearanceEvent?: string;
  /** Board orientation for a flipped/unflipped state. */
  perspective(flipped: boolean): Color;
  /** The interactive seat for a view (the side to move, on a review board that
   *  plays both sides). Null = nobody interactive. */
  seatFor(view: View): Color | null;
  /** Build the variant's interactive board, wired to the controller's policies/sinks. */
  createBoard(
    opts: TreeBoardFactoryOptions<Move, View, Color>,
  ): TreeBoardHandle<View, Color, Arrow, Marker>;
  /** Glide the piece for `move` on the board host (reverse = a replay back-step). */
  animateMove(
    boardEl: HTMLElement,
    move: Move,
    perspective: Color,
    opts?: { reverse?: boolean },
  ): void;
  /** A user-drawn annotation arrow shape → board arrow. */
  shapeToArrow(shape: NodeShape): Arrow;
  /** A user-drawn annotation circle shape → board marker. */
  shapeToMarker(shape: NodeShape): Marker;
}

export type AnalysisSource = {
  /** Request-button label ('Request computer analysis' / 'Analyse the whole game'). */
  requestLabel: string;
  /** Cached result that never computes (server path). Optional. */
  fetchCached?(): Promise<GameAnalysis | null>;
  /** Compute the whole-game analysis; report progress when known. */
  run(onProgress: (done: number, total: number) => void): Promise<GameAnalysis>;
};

/** Per-reveal decision-vs-luck info the review overlays onto a chance-move game (jieqi). A
 *  reveal's eval swing splits into a DECISION (graded) and LUCK (shown, ungraded); this carries
 *  both per reveal ply plus per-player rollups. Variant-agnostic: the caller adapts its own
 *  decomposition shape (e.g. review/jieqi-decisions) to this. */
export type DecisionMoveInfo = {
  /** Decision-quality glyph for the reveal (null = a fine choice, or within engine noise). */
  judgment: MoveJudgment;
  /** Luck-free accuracy of the CHOICE in [0, 100] (best-vs-played pool means). Feeds the headline
   *  accuracy so a reveal ply is graded on skill, not the dice. */
  accuracy: number;
  /** Signed win% swing the reveal produced vs its own expectation (+ lucky, - unlucky). */
  luck: number;
  /** The played reveal's rank among the alternatives (1 = best), or null when off the table. */
  playedRank: number | null;
};

export type DecisionPlayerSummary = {
  reveals: number;
  /** Mean decision accuracy in [0, 100] (grades only the choice, not the outcome). */
  decisionAccuracy: number;
};

export type DecisionOverlay = {
  /** Per-reveal info keyed by ply, for move-list glyphs + the advice line. */
  byPly: Map<number, DecisionMoveInfo>;
  red: DecisionPlayerSummary;
  black: DecisionPlayerSummary;
};

/** The heavier, opt-in decision-vs-luck tier (jieqi). Fetched/computed alongside the basic
 *  analysis; `run` is triggered right after the basic analysis compute (the decomposition needs
 *  it). null/undefined disables the affordance entirely for variants without chance moves. */
export type DecisionSource = {
  fetchCached?(): Promise<DecisionOverlay | null>;
  run(): Promise<DecisionOverlay>;
};

export type TreeReviewConfig<Move> = {
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
  moves: Move[];
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
  analysis: AnalysisSource | null;
  /** Optional decision-vs-luck overlay for chance-move games (jieqi). When set, reveal plies get
   *  a decision-quality glyph + per-move luck readout, and the summary gains a two-number
   *  (decisions / luck) block. Absent for deterministic variants. */
  decisions?: DecisionSource | null;
  /** Per-ply elapsed milliseconds (index 0 = ply 1). When present, a "Move times"
   *  underboard tab renders a per-move bar chart. Only real games supply it. */
  moveTimes?: number[];
  /** Real player names — label the accuracy summary and crosstable stub. Absent =
   *  the side's displayed ink is used. */
  players?: { red?: string; black?: string };
  /** Visual ink bound to the first/second analysis seats. Flip variants set this
   *  after the opening reveal; analysis ownership remains keyed by seat. */
  seatColors?: ReviewSeatColors;
  /** Show the "Crosstable" underboard tab (a head-to-head record — a stub for now). */
  showCrosstable?: boolean;
  /** Prebuilt provenance panel (source / event / date / flags …). When present, a
   *  "Game info" underboard tab renders it. The historical-library caller supplies
   *  it; played/analysis surfaces leave it undefined. */
  provenance?: HTMLElement;
};

/** Handle returned by mountTreeReview: lets a caller snapshot the current tree
 *  (to persist it — "save as study", autosave). */
export interface TreeReviewHandle {
  serialize(): SerializedTree;
}

/** Keyboard listener is document-wide; on re-mount (import re-seeds) abort the
 *  previous one so handlers don't stack. */
let keyboardAbort: AbortController | null = null;

export function mountTreeReview<Move, Truth, View, Color, Arrow, Marker>(
  root: HTMLElement,
  presentation: TreePresentation<Move, Truth, View, Color, Arrow, Marker>,
  config: TreeReviewConfig<Move>,
): TreeReviewHandle {
  type Node = GameTreeNode<Move, Truth>;
  type Tree = GameTree<Move, Truth, View>;
  const { adapter } = presentation;

  const tree: Tree = config.initialTree
    ? deserializeTree(adapter, config.initialTree)
    : createGameTree(adapter, config.moves);
  const mainlineLen = tree.mainlinePath().length;
  const notifyChange = (): void => config.onChange?.();

  let currentPath: TreePath = tree.last();
  let flipped = false;

  const currentNode = (): Node => tree.nodeAt(currentPath) ?? tree.root;
  const orientation = (): Color => presentation.perspective(flipped);

  const uciTo = (node: Node): string[] => {
    const line: string[] = [];
    for (let n: Node | null = node; n?.parent; n = n.parent) {
      if (n.move) line.unshift(adapter.toEngineUci(n.move));
    }
    return line;
  };

  // ── Boards + gauge column. Captured-material rows are OFF on the review
  // surface for now: empty rows collapse and re-inflate on the first capture,
  // jarring the rail; they return with a lichess-style rework (#166).
  //
  // adapter.project() returns ONE view (open variants) or N (fog: truth +
  // per-POV). The primary-tier view is the INTERACTIVE analysis board; any
  // secondaries are read-only projections re-rendered on every navigation
  // (click-to-promote enlarges one, but input stays on the truth board). A
  // single-view variant builds exactly one board and renders as before.
  const projectionShape = adapter.project(tree.root.truth);
  const multiBoard = projectionShape.length > 1;

  // Play a move on the interactive board → branch the tree and follow it.
  const handleMove = (move: Move): void => {
    const next = tree.addMove(currentPath, move);
    if (!next) return;
    currentPath = next;
    moveTree.rebuild();
    render();
    notifyChange();
  };
  // Right-drag draws an annotation shape on the CURRENT node (toggle: re-drawing
  // the same shape removes it). Green by default, red with a modifier held.
  const handleDrawShape = (orig: string, dest: string | null, { alt }: { alt: boolean }): void => {
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
  };

  type BoardSlot = {
    key: string;
    wrap: HTMLElement;
    boardEl: HTMLElement;
    handle: TreeBoardHandle<View, Color, Arrow, Marker>;
    primary: boolean;
  };
  // The view for a board key at the current node (re-projected per navigation).
  const viewForKey = (key: string): View | null =>
    adapter.project(currentNode().truth).find((v) => v.key === key)?.view ?? null;

  const boardSlots: BoardSlot[] = projectionShape.map((pv) => {
    const wrap = document.createElement('section');
    wrap.className = presentation.boardWrapClassName;
    // Multi-board (fog) hosts carry a per-view label so the reviewer can tell the
    // truth board from each seat's fogged view; single-board hosts stay label-free.
    if (multiBoard) {
      // Reuse the shared postgame board-title class: it already carries the
      // styling and the board-only primary-collapse rule (review-stage.css), so
      // the big truth board stays label-free and only the POV boards show a title.
      const heading = document.createElement('h2');
      heading.className = 'dxq-postgame__board-title';
      heading.textContent = pv.label;
      wrap.append(heading);
    }
    const boardEl = document.createElement('div');
    boardEl.className = presentation.boardHostClassName;
    const ariaLabel = config.boardAriaLabel ?? presentation.defaultBoardAriaLabel;
    boardEl.setAttribute('aria-label', multiBoard ? `${pv.label} — ${ariaLabel}` : ariaLabel);
    wrap.append(boardEl);
    const primary = pv.tier === 'primary';
    const handle = presentation.createBoard({
      board: boardEl,
      getInteractionView: () => viewForKey(pv.key),
      getPerspective: orientation,
      seatFor: presentation.seatFor,
      // Only the truth board plays moves; secondaries are read-only projections.
      enabled: () => primary,
      onMove: primary ? handleMove : () => {},
      onDrawShape: primary ? handleDrawShape : undefined,
    });
    return { key: pv.key, wrap, boardEl, handle, primary };
  });

  const primarySlot = boardSlots.find((slot) => slot.primary) ?? boardSlots[0]!;
  // Animation + overlay (engine/user arrows) target the interactive truth board.
  const boardEl = primarySlot.boardEl;
  const interactive = primarySlot.handle;

  // No client engine → no eval gauge (and no engine panel below).
  const evalBar = presentation.engine ? createEvalBar() : null;

  // ── Engine (live, current node) ──
  // On-board PV arrows: live MultiPV lines win; with the engine off (or between
  // a ply change and the first fresh update) fall back to the whole-game
  // analysis' best move for the current mainline node; otherwise no arrows.
  // NOTE: declared before createEnginePanel — its constructor clears output,
  // which fires onLines(null) → paintOverlays() synchronously.
  let gameAnalysis: GameAnalysis | null = null;
  // Decision-vs-luck overlay (jieqi). Reveal plies get a decision glyph (merged into the move
  // list) + a per-move luck readout (the advice line) + a two-number summary block.
  let decisionOverlay: DecisionOverlay | null = null;
  let engineLines: CevalLine[] | null = null;
  // Engine PV / analysis-best arrows for the current node (transient, derived).
  function engineArrows(): Arrow[] {
    const engine = presentation.engine;
    if (!engine) return [];
    if (engineLines?.length) return engine.engineArrowsFromLines(engineLines);
    if (SHOW_ANALYSIS_BEST_ARROW && gameAnalysis) {
      const node = currentNode();
      if (mainlineNodes()[node.ply] === node) {
        const best = gameAnalysis.evals.find((entry) => entry.ply === node.ply)?.best;
        return engine.bestMoveArrow(best);
      }
    }
    return [];
  }
  // Paint BOTH the derived engine arrows and the node's user-drawn shapes. User
  // arrows layer over engine arrows; user circles ride the marker overlay.
  function paintOverlays(): void {
    const shapes = currentNode().annotations?.shapes ?? [];
    const userArrows = shapes.filter((s) => s.kind === 'arrow').map(presentation.shapeToArrow);
    interactive.setArrows([...engineArrows(), ...userArrows]);
    interactive.setMarkers(
      shapes.filter((s) => s.kind === 'circle').map(presentation.shapeToMarker),
    );
  }

  const enginePanel =
    presentation.engine && evalBar
      ? createEnginePanel({
          variant: presentation.engine.panelVariant,
          formatPvMove: presentation.engine.formatPvMove,
          evalBar,
          onLines: (lines) => {
            engineLines = lines?.length ? lines : null;
            paintOverlays();
          },
        })
      : null;

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
    seatColors: config.seatColors,
    players: config.showCrosstable ? (config.players ?? {}) : undefined,
    shareFenInput,
    shareMovesInput,
    gameUrl: typeof window !== 'undefined' ? window.location.href : '',
  });
  const analysisSummaryEl = document.createElement('div');
  // Chance-variant (jieqi) caption slot under the accuracy summary: a "Grading reveals…" placeholder
  // until the decomposition loads, then a one-line luck caption. Kept as a persistent child so
  // applyAnalysis/applyDecisions can re-attach it without re-creating the node.
  const decisionSummaryEl = document.createElement('div');
  decisionSummaryEl.className = 'review-decision-summary';
  const moveAdvice = createMoveAdvice(presentation.formatBestMove);
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
    boards: boardSlots.map((slot) => ({
      key: slot.key,
      el: slot.wrap,
      tier: slot.primary ? ('primary' as const) : ('secondary' as const),
    })),
    boardAspect: presentation.boardAspect,
    boardCols: presentation.boardCols,
    boardMaxPx: presentation.boardMaxPx,
    underboard:
      config.analysis || config.provenance || config.showCrosstable ? underboardEl : undefined,
    underboardOverflows: true,
    enginePanel: enginePanel?.el,
    moves: moveTree.el,
    moveComment: moveAdvice.el,
    annotations: annotationEditor?.el,
    navigation: controls.el,
    analysisSummary: analysisSummaryEl,
    gauge: evalBar?.el,
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
      if (move) presentation.animateMove(boardEl, move, orientation());
      return;
    }
    if (fromPath.length === toPath.length + 1 && isPrefix(toPath, fromPath)) {
      const move = tree.nodeAt(fromPath)?.move;
      if (move) presentation.animateMove(boardEl, move, orientation(), { reverse: true });
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
  function mainlineNodes(): Node[] {
    const nodes: Node[] = [tree.root];
    let n = tree.root;
    while (n.children[0]) {
      n = n.children[0];
      nodes.push(n);
    }
    return nodes;
  }

  function render(): void {
    const node = currentNode();
    // Re-project once per navigation and render each board host from its own
    // view (open = the single truth board; fog = truth + the two POV boards).
    const projection = adapter.project(node.truth);
    for (const slot of boardSlots) {
      const projected = projection.find((v) => v.key === slot.key);
      slot.handle.render(projected?.view ?? null, orientation());
    }
    evalBar?.setFlipped(flipped);

    // Order matters: setPosition fires onLines(null) synchronously when the
    // engine is on (stale-arrow clear); the explicit paintOverlays below then
    // repaints for the new node (engine/analysis arrows + the node's user shapes),
    // covering the engine-off case where setPosition fires no onLines.
    // `'fen'` engines (Misty flip variants) take the per-node redacted FEN with no move
    // list; `'moves'` engines (Fairy-Stockfish) replay engine UCI from the start position.
    if (enginePanel) {
      if (presentation.engine?.positionMode === 'fen') {
        enginePanel.setPosition([], presentation.engine.fen(node.truth));
      } else {
        enginePanel.setPosition(uciTo(node));
      }
    }
    paintOverlays();
    annotationEditor?.setAnnotations(node.annotations);
    moveTree.setCurrent(currentPath);
    controls.setBounds({ atStart: currentPath.length === 0, atEnd: node.children.length === 0 });
    // Live-refresh the Share tab's FEN + move export for the current node/line.
    if (presentation.engine) shareFenInput.value = presentation.engine.fen(node.truth);
    shareMovesInput.value = uciTo(node).join(' ');
    chart?.setPly(node.ply);
    // Reveal plies show their decision glyph + luck inline in the move list, so the advice line
    // stays the plain "was best" line for graded (non-chance) moves only.
    moveAdvice.update(node.ply, gameAnalysis);
  }

  function applyAnalysis(analysis: GameAnalysis): void {
    gameAnalysis = analysis;
    const nodes = mainlineNodes();
    chart = createAdvantageChart(analysis.evals, {
      seatColors: config.seatColors,
      onJump: (ply) => {
        const target = nodes[ply];
        if (target) go(tree.pathTo(target));
      },
    });
    chart.setPly(currentNode().ply);
    underboardBody.replaceChildren(chart.el);
    // Chance variants (jieqi) grade every move luck-free once the decomposition loads; the base
    // summary would exclude reveals and read as a misleading clean sheet, so hold a placeholder
    // until applyDecisions folds the decomposition in. Deterministic variants show the base now.
    if (config.decisions) {
      decisionSummaryEl.replaceChildren(decisionPendingNote());
      analysisSummaryEl.replaceChildren(decisionSummaryEl);
    } else {
      analysisSummaryEl.replaceChildren(
        createAnalysisSummary(analysis, config.players, { seatColors: config.seatColors }),
      );
    }
    refreshMoveTreeAnnotations(); // rebuilds the tree DOM (engine glyphs + user glyphs)
    render(); // re-highlight + re-apply move advice
    scaffold.refit(); // the underboard grew; re-fit the board
  }

  function applyDecisions(overlay: DecisionOverlay): void {
    decisionOverlay = overlay;
    // Fold the decomposition into the headline summary: reveals are now graded luck-free (best-vs-
    // played pool means), quiet moves on their realized swing, so accuracy + the mistake/blunder
    // counts finally reflect the player's CHOICES rather than the dice. ACPL is hidden (it can't be
    // luck-stripped). Per-reveal luck lives on the moves + the chart band, not a separate number.
    if (gameAnalysis) {
      const decisionByPly = new Map(
        [...overlay.byPly].map(([ply, info]) => [
          ply,
          { accuracy: info.accuracy, judgment: info.judgment },
        ]),
      );
      const merged = mergeDecisionAnalysis(gameAnalysis, decisionByPly);
      analysisSummaryEl.replaceChildren(
        createAnalysisSummary({ ...gameAnalysis, ...merged }, config.players, {
          hideAcpl: true,
          seatColors: config.seatColors,
        }),
        decisionSummaryEl,
      );
      decisionSummaryEl.replaceChildren(luckCaption());
    }
    // The advantage chart's "if reveals ran average" ghost line is intentionally NOT drawn for now:
    // after the last tile flips the gap freezes and the ghost just shadows the real line for the
    // rest of the game, which reads as confusing rather than informative. The per-move luck (🎲
    // badges) and the luck-free accuracy already carry the decision-vs-luck story. The chart's
    // setLuckOverlay() is kept intact so a future, better-signposted treatment can re-enable it.
    refreshMoveTreeAnnotations();
    render();
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
      // Decision overlay (jieqi): a reveal ply carries no eval-swing judgment (it is a chance
      // move), so its glyph comes from the DECISION quality, and its LUCK shows inline as a badge
      // next to the move — every reveal gets a luck readout, right where the move is. A fine
      // decision has no glyph (lichess-consistent); luck is always shown, never graded.
      if (decisionOverlay) {
        for (const [ply, info] of decisionOverlay.byPly) {
          const node = nodes[ply];
          if (!node) continue;
          const key = pathKey(tree.pathTo(node));
          const glyph = judgmentGlyph(info.judgment);
          const luck = Math.round(info.luck);
          byPathKey.set(key, {
            ...byPathKey.get(key),
            suffix: glyph?.suffix,
            suffixClass: glyph?.suffixClass,
            luck: `🎲 ${luck > 0 ? '+' : ''}${luck}%`,
            luckTone: luck > 0 ? 'lucky' : luck < 0 ? 'unlucky' : 'even',
          });
        }
      }
    }
    applyUserGlyphs(tree.root, byPathKey);
    moveTree.annotate(byPathKey);
  }

  function applyUserGlyphs(node: Node, map: Map<string, MoveTreeAnnotation>): void {
    const code = node.annotations?.glyphs?.[0];
    if (code !== undefined && node.parent) {
      const key = pathKey(tree.pathTo(node));
      const prev = map.get(key);
      map.set(key, { ...prev, suffix: GLYPH_LABEL[code] ?? prev?.suffix, suffixClass: undefined });
    }
    for (const child of node.children) applyUserGlyphs(child, map);
  }

  function renderAnalysisRequest(source: AnalysisSource): void {
    if (mainlineLen < 1) {
      underboardBody.replaceChildren();
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'xiangqi-review__analyse';
    // Prominent lichess-style request button: a bar-chart glyph + the label. The
    // label lives in its own span so progress updates don't clobber the icon.
    const icon = document.createElement('span');
    icon.className = 'xiangqi-review__analyse-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">' +
      '<rect x="1" y="8" width="3" height="6" rx="0.6"/>' +
      '<rect x="6.5" y="4" width="3" height="10" rx="0.6"/>' +
      '<rect x="12" y="1" width="3" height="13" rx="0.6"/></svg>';
    const label = document.createElement('span');
    label.textContent = source.requestLabel;
    button.replaceChildren(icon, label);
    button.addEventListener('click', () => {
      button.disabled = true;
      label.textContent = 'Analysing the whole game…';
      source
        .run((done, total) => {
          label.textContent = `Analysing… ${done}/${total}`;
        })
        .then((analysis) => {
          applyAnalysis(analysis);
          // The decomposition (jieqi) is the heavier follow-on pass; kick it off once the basic
          // sweep is in (it depends on it). Failure leaves the eval graph standing on its own.
          if (decisionSource) {
            label.textContent = 'Analysing reveals…';
            return runDecisions();
          }
        })
        .catch(() => {
          button.disabled = false;
          label.textContent = 'Analysis failed — retry';
        });
    });
    underboardBody.replaceChildren(button);
  }

  const decisionSource = config.decisions ?? null;
  async function loadCachedDecisions(): Promise<void> {
    if (!decisionSource?.fetchCached) return;
    try {
      const overlay = await decisionSource.fetchCached();
      if (overlay) applyDecisions(overlay);
    } catch {
      /* leave the decision overlay off — the eval graph stands on its own */
    }
  }
  async function runDecisions(): Promise<void> {
    if (!decisionSource) return;
    try {
      applyDecisions(await decisionSource.run());
    } catch {
      /* leave the decision overlay off */
    }
  }

  const analysisSource = config.analysis;
  if (analysisSource) {
    if (analysisSource.fetchCached) {
      void analysisSource
        .fetchCached()
        .then((cached) => {
          if (cached) {
            applyAnalysis(cached);
            void loadCachedDecisions(); // a cached decomposition loads straight in too
          } else {
            renderAnalysisRequest(analysisSource);
          }
        })
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
  // Some variants render pieces as inline SVG, so a piece-set change needs a
  // re-render (a board that picks up its set via CSS does not, and omits the
  // event). Reuse the per-mount abort signal so a re-mount drops the stale
  // listener rather than stacking.
  if (presentation.appearanceEvent) {
    window.addEventListener(presentation.appearanceEvent, () => render(), {
      signal: keyboardAbort.signal,
    });
  }
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

  return { serialize: () => serializeTree(tree, adapter) };
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

// Shown in the accuracy slot for a chance variant (jieqi) while the decision decomposition is still
// computing — the base accuracy would exclude reveals and read as a false clean sheet, so we wait.
function decisionPendingNote(): HTMLElement {
  const note = document.createElement('div');
  note.className = 'review-decision-summary__pending';
  note.textContent = 'Grading reveals…';
  return note;
}

// A one-line caption under the (luck-free) accuracy summary explaining that accuracy grades the
// CHOICE and the 🎲 per-move badges + chart band are the luck, so the two never look contradictory.
function luckCaption(): HTMLElement {
  const cap = document.createElement('div');
  cap.className = 'review-decision-summary__caption';
  cap.textContent = 'Accuracy grades your choices; 🎲 marks the luck of each reveal.';
  return cap;
}
