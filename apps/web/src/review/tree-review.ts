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
import { t } from '../i18n/catalog.js';
import type { StudyVariantId } from '../study-catalog.js';
import { displayComment } from '../study-i18n.js';
import { type AdvantageChart, createAdvantageChart } from './advantage-chart.js';
import { createAnalysisSummary } from './analysis-summary.js';
import { createAnnotationEditor } from './annotations-editor.js';
// Brush colours for the node's user-drawn shapes. Imported here, not only
// from the editor: the board draws shapes on surfaces that hide the panel.
import '../variant-tenant/board-annotations.css';
import type { CevalLine, CevalVariant } from './engine/ceval.js';
import { readEngineArrowsEnabled, writeEngineArrowsEnabled } from './engine/engine-arrow-pref.js';
import { createEnginePanel } from './engine/engine-panel.js';
import { createEvalBar } from './engine/eval-bar.js';
import { advantageSymbol, formatEval } from './engine/eval-format.js';
import {
  type GameAnalysis,
  type GamePhases,
  judgmentGlyph,
  mergeDecisionAnalysis,
  regradeBestPlayed,
} from './game-analysis.js';
import {
  createGameTree,
  type GameTree,
  type GameTreeNode,
  type NodeShape,
  ROOT_PATH,
  type TreePath,
  type VariantTreeAdapter,
} from './game-tree.js';
import { ADVICE_LABEL, defaultFormatBestMove } from './move-advice.js';
import { type MoveGlyphTone, moveGlyphTone } from './move-glyph.js';
import { createMoveTree, type MoveTree, type MoveTreeAnnotation, pathKey } from './move-tree.js';
import { createReviewControls, REVIEW_MENU_ICONS, type ReviewMenuItem } from './review-controls.js';
import {
  createReviewScaffold,
  installReviewKeyboard,
  type ReviewSurface,
} from './review-layout.js';
import type { ReviewSeatColors } from './review-seat-colors.js';
import { createStudyFromTree, studyExportMessage } from './study-export.js';
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
export interface EnginePresentation<Move, Truth, Arrow, Marker> {
  /** Which ceval engine the local engine panel loads. */
  panelVariant: CevalVariant;
  /** How the panel is fed each position. `'moves'` (default): replay engine UCI from the
   *  start position — the Fairy-Stockfish variants. `'fen'`: hand the engine the per-node
   *  FEN with no move list — the Misty and PikaJieQi backends. Hidden-information
   *  variants must redact that FEN to the as-played info-state. */
  positionMode?: 'moves' | 'fen';
  /** Engine FEN for a truth state. Drives the Share tab, and — when positionMode is
   *  `'fen'` — the per-node position fed to the engine panel. */
  fen(truth: Truth): string;
  /** Whether the local engine can search this truth. FEN-per-position engines
   *  expect at least one legal root move, so terminal positions are suppressed. */
  canEvaluatePosition?(truth: Truth): boolean;
  /** Prettify a PV move (engine UCI) for the engine panel. */
  formatPvMove(uci: string): string;
  /** Decode the engine's UCI dialect into the board/tree move dialect. Omit when
   *  the tree adapter's fromUci already consumes the same coordinates. Hidden
   *  variants use this for their 0-indexed engine ranks. */
  moveFromEngineUci?(uci: string, truth: Truth): Move | null;
  /** On-board arrows for live MultiPV lines. Omit while a board renderer has no
   *  overlay capability; the engine panel then hides its arrow setting. */
  engineArrowsFromLines?(lines: CevalLine[]): Arrow[];
  /** On-board point markers for engine actions without travel, such as a flip
   *  or a reserve drop. Paired with bestMoveMarker below. */
  engineMarkersFromLines?(lines: CevalLine[]): Marker[];
  /** Single best-move arrow from a whole-game analysis ply. Paired with
   *  engineArrowsFromLines as one board-overlay capability. */
  bestMoveArrow?(best: string | null | undefined): Arrow[];
  /** Single best-action marker from a whole-game analysis ply. */
  bestMoveMarker?(best: string | null | undefined): Marker[];
}

export interface TreePresentation<Move, Truth, View, Color, Arrow, Marker> {
  /** Rules seam: the concrete VariantTreeAdapter (already generic). */
  adapter: VariantTreeAdapter<Move, Truth, View>;
  /** Client-engine hooks (local ceval panel + eval gauge + engine arrows + Share
   *  FEN). Null for variants with no client engine: the panel and gauge are then
   *  omitted and the board carries no eval affordance. */
  engine: EnginePresentation<Move, Truth, Arrow, Marker> | null;
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
  /** Board width/height ratio for the scaffold's board-box sizing. May depend on appearance. */
  boardAspect: number | (() => number);
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
  /** Badge for the move-annotation glyph on `move`'s destination point (the
   *  '??' / '?' / '?!' the move list shows for the same move, plus user NAGs).
   *  The variant owns this because only it can turn its Move into a square.
   *  Return null when the move has no drawable destination; OMIT the hook
   *  entirely for variants that show no on-board glyphs. */
  moveGlyphMarker?(move: Move, glyph: { text: string; tone: MoveGlyphTone }): Marker | null;
  /** Game-phase segmentation over the mainline truths (index 0 = start position):
   *  drives the advantage chart's Opening/Middlegame/Endgame dividers and the
   *  summary's per-phase accuracy. Omit for variants without a phase heuristic —
   *  the chart and summary then skip the phase chrome. */
  gamePhases?(mainlineTruths: readonly Truth[]): GamePhases;
  /** Optional right-rail material rows (lichess mat-top / mat-bot). The factory
   *  receives the two host rows and returns a per-render updater called with the
   *  displayed node's truth, the tree root's truth (the diff baseline — a
   *  FEN-seeded root must not read as "captures"), and the flip state. Omit for
   *  variants without a material display. */
  material?(hosts: {
    top: HTMLElement;
    bottom: HTMLElement;
  }): (truth: Truth, rootTruth: Truth, flipped: boolean) => void;
  /** Window event whose fire means adapter.moveLabel now renders differently
   *  (a notation display-mode change): the tree relabels and the move list
   *  rebuilds. Omit for variants with a single fixed notation. */
  labelsEvent?: string;
}

export type AnalysisSource = {
  /** Request-button label ('Request computer analysis' / 'Analyse the whole game'). */
  requestLabel: string;
  /** When present, the request control is a link and never enters progress state. */
  requestHref?: string;
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
  /** Ranked alternatives for this chance ply, best first, ALREADY formatted by the variant
   *  (the move text is board notation, not engine UCI — this layer is variant-agnostic).
   *  Absent when the analysis predates candidate capture, or the variant cannot produce one. */
  candidates?: DecisionCandidate[];
};

/** One ranked alternative, display-ready. */
export type DecisionCandidate = {
  /** Board-notation move text, e.g. "e8-a8". */
  label: string;
  /** Luck-free win% for this choice, already rounded for display. */
  win: number;
  /** True when this is the move actually played. */
  played?: boolean;
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
 *  it), or on a cache miss when the analysis itself loaded from cache (a game analysed before
 *  the decomposition existed would otherwise wedge on the pending note forever).
 *  null/undefined disables the affordance entirely for variants without chance moves. */
export type DecisionSource = {
  fetchCached?(): Promise<DecisionOverlay | null>;
  /** Whether run() is allowed to compute. The POST is account-gated server-side, so signed-out
   *  viewers set false and get the base (reveals-ungraded) summary instead of a doomed 401. */
  canRun: boolean;
  run(): Promise<DecisionOverlay>;
};

export type TreeReviewConfig<Move, Truth = never, Arrow = unknown> = {
  /** Shared scaffold role. Postgame is the default; standalone analysis and
   *  studies opt into their distinct roles at their route-level mount. */
  reviewSurface?: ReviewSurface;
  /** Root the tree at a hand-set position (a FEN-seeded composition) instead of
   *  the variant's standard start. `truth` seeds the tree root; `fen` is the
   *  canonical FEN persisted with a serialized tree (SerializedTree.rootFen).
   *  The engine derives its own base FEN from the root truth. */
  root?: { truth: Truth; fen: string };
  pageClassName?: string;
  ariaLabel: string;
  /** Info-card eyebrow when no meta card ('Analysis' / 'Game review'). */
  eyebrow?: string;
  title: string;
  summary: string;
  boardAriaLabel?: string;
  /** Optional left-rail actions row. */
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
  /** Where the board sits on mount. 'end' (default) suits a game you just
   *  finished or imported: the result is the thing you came for. 'start' suits a
   *  study, which is a document meant to be read forward. Opening a 60-ply
   *  annotated game on its final position asks the reader to rewind before they
   *  can begin. */
  initialPosition?: 'start' | 'end';
  /** Which way the board faces on mount. False (default) puts the first player
   *  at the bottom. A study chapter passes its stored orientation here: a black
   *  repertoire read from red's side asks the reader to mentally mirror every
   *  line, and the Flip button only fixes it until the next chapter remounts. */
  initialFlipped?: boolean;
  /** Fired after any tree mutation (move, annotation, promote, delete). The study
   *  page uses it to autosave; the analysis/postgame pages ignore it. */
  onChange?: () => void;
  /** Show gamebook (lesson) authoring fields — per-node hint + deviation — in the
   *  annotation editor. The study page sets this for a gamebook chapter's owner. */
  gamebookEditing?: boolean;
  /** Study-level lesson controls shown in the under-board Lesson tab. The study
   *  page supplies the enable/preview controls; the annotation editor adds the
   *  current position's hint/deviation fields when gamebook mode is active. */
  annotationLessonControls?: HTMLElement;
  /** Show the study annotation controls (glyph picker + comment box + clear-shapes)
   *  in the under-board authoring dock. Only editable studies set this; the
   *  postgame/analysis surfaces are read-only and omit it. Board shape-drawing
   *  still works. */
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
  /** Show the "Crosstable" underboard tab. */
  showCrosstable?: boolean;
  /** Lazy head-to-head body for the Crosstable tab (review/crosstable.ts). */
  crosstable?: { load(): Promise<HTMLElement> };
  /** Prebuilt provenance panel (source / event / date / flags …). When present, a
   *  "Game info" underboard tab renders it. The historical-library caller supplies
   *  it; played/analysis surfaces leave it undefined. */
  provenance?: HTMLElement;
  /** A caller-labelled info panel rendered as the FIRST underboard tab. The study
   *  surface uses it for the study's own description + favorite + errata, so those
   *  live under the board instead of crowding the left rail. */
  aboutTab?: { label: string; body: HTMLElement };
  /** Extra rows for the Share & export tab. The study surface puts its PGN
   *  download here, with the other ways of getting the content out. */
  shareExtra?: HTMLElement[];
  /** Opening-explorer panel for surfaces with a game corpus behind them. Kept
   *  fully opaque here (an element plus a per-node setter) so this controller
   *  stays variant-neutral: the caller owns the variant types and the lookup. */
  explorer?: {
    el: HTMLElement;
    setTruth(truth: Truth): void;
    /** Called with whether the explorer panel is open. */
    setActive(active: boolean): void;
    /** Register the handler that plays a move the reader clicked in the table. */
    onPlayMove(handler: (move: Move) => void): void;
    /** Register the handler for hovering a move in the table: it hands back a
     *  ready-built board arrow (or null on leave). The caller owns the arrow's
     *  look so it reads as distinct from the engine's blue. */
    onHoverMove(handler: (arrow: Arrow | null) => void): void;
  };
  /** Game result appended to the move list as a terminal block (lichess: "0-1"
   *  over the termination line). Postgame surfaces supply it; the analysis board
   *  (no finished game) omits it. */
  result?: { score: string; label: string };
  /** Always-visible FEN + moves-import block under the underboard panel (the
   *  lichess.org/analysis anatomy). `onImport` receives the pasted game text and
   *  returns an error message to display, or null when it navigated/re-mounted.
   *  Only the analysis board supplies it; played/historical games keep these
   *  fields in the Share & export tab. */
  importPanel?: {
    onImport(text: string): string | null;
    /** Accept a pasted FEN and re-mount from that position. When present the FEN
     *  box turns editable (Enter or the Set position button submits); absent =
     *  the box stays a read-only mirror of the current node. */
    onImportFen?(fen: string): string | null;
    /** One sentence under the fields explaining the FEN this board expects (the
     *  dealt variants explain `X` and the pool). Absent = no hint line. */
    hint?: string;
  };
  /** Enable the control-bar menu's "Study" action: create a study seeded with the
   *  current tree. Absent = the item is omitted (the study page itself omits it —
   *  you are already in a study). */
  studyExport?: { variant: StudyVariantId; name: string };
  /** Persist the board's CURRENT facing as the chapter's default, for an owner.
   *  Sits under Flip board in the same menu because that is where an author
   *  looks when they think about orientation, and the pair reads as what it is:
   *  flip for now, or keep it. Omitted for readers and non-study surfaces. */
  saveDefaultOrientation?: (flipped: boolean) => Promise<string | null>;
  /** Enable the menu's "Clear moves" action: drop every move back to the root
   *  position, keeping a FEN-seeded root. Only the analysis board sets it; wiping
   *  the moves of a game that was actually played is meaningless. */
  allowClearMoves?: boolean;
  /** Enable the menu's Reveal/Hide identities toggle, for an identity-hidden
   *  variant whose review board is masked as-played (jieqi). The ADAPTER owns what
   *  revealing means — this only carries the flag back to it and re-renders — so a
   *  variant opts in by supplying the setter its own projection reads. */
  revealHidden?: { setRevealed(next: boolean): void };
  /** Menu action "Analyse from here": continue the CURRENT position on the
   *  standalone analysis board. Returns the href for the node's truth. A dealt
   *  variant pins its exact deal in that URL (the dealt FEN), so the analysis
   *  board continues THIS game's reveals rather than a fresh deal. Postgame
   *  surfaces set it; the analysis board itself omits it. */
  analyseFromHere?: (truth: Truth) => string;
  /** Menu action "Board editor": open the editor at the current position.
   *  Returns the href for the node's truth, built from the PUBLIC engine FEN:
   *  the editor edits what is visible and never carries hidden identities. */
  boardEditorHref?: (truth: Truth) => string;
  /** Menu action "New deal": re-deal a hidden-deal analysis board (a fresh random
   *  deal). Only the dealt variants' analysis surfaces set it. */
  newDeal?: () => void;
  /** Fired after every render with the moves from the root to the CURRENT node
   *  (the line on screen, variations included). The analysis surfaces mirror it
   *  into the URL (`?moves=`), so the address bar is always the share link for
   *  the position being looked at (lichess keeps its `#ply` the same way). */
  onLineChange?: (moves: Move[]) => void;
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
  config: TreeReviewConfig<Move, Truth, Arrow>,
): TreeReviewHandle {
  type Node = GameTreeNode<Move, Truth>;
  type Tree = GameTree<Move, Truth, View>;
  const { adapter } = presentation;

  const tree: Tree = config.initialTree
    ? deserializeTree(adapter, config.initialTree, config.root?.truth)
    : createGameTree(adapter, config.moves, config.root?.truth);
  // A custom root repositions the engine too: 'moves' engines replay UCIs from
  // this base instead of the variant's startpos.
  const engineBaseFen =
    config.root && presentation.engine ? presentation.engine.fen(tree.root.truth) : undefined;
  const mainlineLen = tree.mainlinePath().length;
  const notifyChange = (): void => config.onChange?.();

  let currentPath: TreePath = config.initialPosition === 'start' ? [] : tree.last();
  // `?flip=1` opens the review from the second seat's side: the crosstable links
  // a row's games that way, so a click reads as "this game from their side".
  // An explicit initialFlipped (the study's chapter orientation) still wins.
  let flipped = config.initialFlipped ?? flippedFromUrl();

  const currentNode = (): Node => tree.nodeAt(currentPath) ?? tree.root;
  const orientation = (): Color => presentation.perspective(flipped);

  const uciTo = (node: Node): string[] => {
    const line: string[] = [];
    for (let n: Node | null = node; n?.parent; n = n.parent) {
      if (n.move) line.unshift(adapter.toEngineUci(n.move));
    }
    return line;
  };
  const movesTo = (node: Node): Move[] => {
    const line: Move[] = [];
    for (let n: Node | null = node; n?.parent; n = n.parent) {
      if (n.move) line.unshift(n.move);
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
  const handleMove = (move: Move): boolean => {
    const next = tree.addMove(currentPath, move);
    if (!next) return false;
    currentPath = next;
    moveTree.rebuild();
    render();
    notifyChange();
    return true;
  };
  // Clicking a move in the opening explorer plays it, same as playing it on the
  // board: the explorer is a navigation surface, not a readout.
  config.explorer?.onPlayMove(handleMove);
  // Hovering a move previews it as a distinct arrow (the caller built its look).
  let explorerHoverArrow: Arrow | null = null;
  config.explorer?.onHoverMove((arrow) => {
    explorerHoverArrow = arrow;
    paintOverlays();
  });

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

  // Fog variants project N views (truth + each seat's fogged POV). The review
  // surface standardizes on ONE interactive board plus a segmented perspective
  // toggle beneath it (Red | Truth | Black) — the same control the watch page
  // uses — instead of a dominant truth board flanked by two small read-only POV
  // boards. Open variants project a single truth view: one board, no toggle. The
  // board keys fog off enabled() (showFog: !enabled()), so a single instance
  // renders the fully-revealed truth or a fogged POV as `currentPov` flips.
  const primaryProjection =
    projectionShape.find((pv) => pv.tier === 'primary') ?? projectionShape[0]!;
  const truthKey = primaryProjection.key;
  // Which projected view the single board currently shows. Input (branching the
  // tree) is live only on the truth view; POV views are read-only projections.
  let currentPov = truthKey;

  const wrap = document.createElement('section');
  wrap.className = presentation.boardWrapClassName;
  const boardEl = document.createElement('div');
  boardEl.className = presentation.boardHostClassName;
  const boardAriaLabel = config.boardAriaLabel ?? presentation.defaultBoardAriaLabel;
  boardEl.setAttribute('aria-label', boardAriaLabel);
  wrap.append(boardEl);
  const interactive = presentation.createBoard({
    board: boardEl,
    getInteractionView: () => viewForKey(currentPov),
    getPerspective: orientation,
    seatFor: presentation.seatFor,
    // Only the truth view plays moves; POV views are read-only (and fogged).
    enabled: () => currentPov === truthKey,
    onMove: (move) => {
      if (currentPov === truthKey) handleMove(move);
    },
    onDrawShape: (orig, dest, opts) => {
      if (currentPov === truthKey) handleDrawShape(orig, dest, opts);
    },
  });
  const primarySlot: BoardSlot = {
    key: truthKey,
    wrap,
    boardEl,
    handle: interactive,
    primary: true,
  };
  // One board reaches the scaffold — the board-stage renders it exactly as a
  // single-view (open) variant; the POV toggle carries the other perspectives.
  const boardSlots: BoardSlot[] = [primarySlot];

  // The perspective toggle: a segmented control under the board that swaps which
  // projected view the single board shows. Built once for fog (multi-view)
  // variants and synced on every render; absent for single-view variants.
  const povToggle = multiBoard ? buildPovToggle() : null;
  if (povToggle) wrap.append(povToggle.el);

  function buildPovToggle(): { el: HTMLElement; sync: () => void } {
    const secondaries = projectionShape.filter((pv) => pv.key !== truthKey);
    // Truth in the MIDDLE (Red | Truth | Black), matching the watch-page toggle;
    // fall back to truth-first if a variant ever projects other than two POVs.
    const ordered =
      secondaries.length === 2
        ? [secondaries[0]!, primaryProjection, secondaries[1]!]
        : [primaryProjection, ...secondaries];
    const group = document.createElement('div');
    group.className = 'review-pov';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Board perspective');
    const buttons: HTMLButtonElement[] = [];
    const sync = (): void => {
      for (const button of buttons) {
        const active = button.dataset.pov === currentPov;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    };
    for (const pv of ordered) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'review-pov__button';
      button.dataset.pov = pv.key;
      // Compact single word: the projection label is "Red's view" — strip the
      // possessive so the segmented control stays terse (truth reads "Truth").
      button.textContent = pv.key === truthKey ? pv.label : pv.label.replace(/['’]s view$/i, '');
      button.setAttribute('aria-pressed', pv.key === currentPov ? 'true' : 'false');
      button.addEventListener('click', () => {
        if (currentPov === pv.key) return;
        currentPov = pv.key;
        render();
      });
      buttons.push(button);
      group.append(button);
    }
    return { el: group, sync };
  }

  // No client engine → no eval gauge (and no engine panel below).
  const evalBar = presentation.engine ? createEvalBar() : null;

  // ── Engine (live, current node) ──
  // On-board PV arrows: live MultiPV lines win; with the engine off (or between
  // a ply change and the first fresh update) fall back to the whole-game
  // analysis' best move for the current mainline node; otherwise no arrows.
  // NOTE: declared before createEnginePanel — its constructor clears output,
  // which fires onLines(null) → paintOverlays() synchronously.
  let gameAnalysis: GameAnalysis | null = null;
  // Phase segmentation computed once per analysis load (variant-supplied heuristic).
  let gamePhases: GamePhases | undefined;
  // Decision-vs-luck overlay (jieqi). Reveal plies get a decision glyph (merged into the move
  // list) + a per-move luck readout (the advice line) + a two-number summary block.
  let decisionOverlay: DecisionOverlay | null = null;
  let engineLines: CevalLine[] | null = null;
  // Whether the local engine is switched on. The whole-game analysis best-move
  // arrow is PAIRED with it: the server already judged the game, but its arrow is
  // engine ink, so it shows only while the reader has the local engine on — an
  // engine-off board carries no derived arrows, only what the reader drew.
  let engineOn = false;
  const engineOverlaysSupported = Boolean(
    (presentation.engine?.engineArrowsFromLines || presentation.engine?.engineMarkersFromLines) &&
      (presentation.engine.bestMoveArrow || presentation.engine.bestMoveMarker),
  );
  // "Best move indicators" (engine gear popover / `a`). Gates both derived
  // overlay sources below, so turning it off means no engine ink on the board; the user's
  // own drawn shapes are unaffected (they are appended in paintOverlays).
  let showEngineArrows = readEngineArrowsEnabled();
  // Engine PV / analysis-best arrows for the current node (transient, derived).
  function engineArrows(): Arrow[] {
    const engine = presentation.engine;
    if (!engine || !engineOverlaysSupported || !showEngineArrows) return [];
    if (engineLines?.length && engine.engineArrowsFromLines) {
      return engine.engineArrowsFromLines(engineLines);
    }
    if (SHOW_ANALYSIS_BEST_ARROW && engineOn && gameAnalysis && engine.bestMoveArrow) {
      const node = currentNode();
      if (mainlineNodes()[node.ply] === node) {
        const best = gameAnalysis.evals.find((entry) => entry.ply === node.ply)?.best;
        return engine.bestMoveArrow(best);
      }
    }
    return [];
  }
  function engineMarkers(): Marker[] {
    const engine = presentation.engine;
    if (!engine || !engineOverlaysSupported || !showEngineArrows) return [];
    if (engineLines?.length && engine.engineMarkersFromLines) {
      return engine.engineMarkersFromLines(engineLines);
    }
    if (SHOW_ANALYSIS_BEST_ARROW && engineOn && gameAnalysis && engine.bestMoveMarker) {
      const node = currentNode();
      if (mainlineNodes()[node.ply] === node) {
        const best = gameAnalysis.evals.find((entry) => entry.ply === node.ply)?.best;
        return engine.bestMoveMarker(best);
      }
    }
    return [];
  }
  // The move-list annotation map (glyph suffix / eval / advice per node), kept so
  // the board badge can read the SAME entry the list renders instead of deriving
  // its own judgment. Rebuilt by refreshMoveTreeAnnotations.
  let annotationByPathKey = new Map<string, MoveTreeAnnotation>();

  /** Badge for the glyph on the move that LED to the current node (so it sits on
   *  the piece that just moved). Empty at the root, for variants without the
   *  hook, and for glyphs whose symbol we have no tone for. */
  function glyphMarkers(): Marker[] {
    const build = presentation.moveGlyphMarker;
    const node = currentNode();
    if (!build || !node.move) return [];
    const entry = annotationByPathKey.get(pathKey(currentPath));
    const tone = moveGlyphTone(entry?.suffix, entry?.suffixClass);
    if (!entry?.suffix || !tone) return [];
    const marker = build(node.move, { text: entry.suffix, tone });
    return marker ? [marker] : [];
  }

  // Paint BOTH the derived engine arrows and the node's user-drawn shapes. User
  // arrows layer over engine arrows; user circles ride the marker overlay.
  function paintOverlays(): void {
    const shapes = currentNode().annotations?.shapes ?? [];
    const userArrows = shapes.filter((s) => s.kind === 'arrow').map(presentation.shapeToArrow);
    // Explorer-hover hint on top: it points at a candidate the reader is
    // considering, so it sits over engine ink and the user's own shapes.
    const hover = explorerHoverArrow ? [explorerHoverArrow] : [];
    interactive.setArrows([...engineArrows(), ...userArrows, ...hover]);
    // Glyph first so a user's own circle on the same point draws over it: the
    // annotation they just made should not be hidden by a derived badge.
    interactive.setMarkers([
      ...engineMarkers(),
      ...glyphMarkers(),
      ...shapes.filter((s) => s.kind === 'circle').map(presentation.shapeToMarker),
    ]);
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
          onToggle: (on) => {
            engineOn = on;
            paintOverlays();
          },
          arrowsSupported: engineOverlaysSupported,
          showArrows: showEngineArrows,
          onShowArrowsChange: (enabled) => {
            showEngineArrows = enabled;
            writeEngineArrowsEnabled(enabled);
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
      adoptCompLine(path);
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
    result: config.result,
  });

  // ── Computer-injected refutation lines (lichess "computer variations") ──
  // Nodes grafted from the whole-game analysis' best-play PVs at every judged
  // move. They are real, clickable tree branches, but ephemeral: excluded from a
  // serialized study unless the user explicitly promotes (adopts) the line.
  const compKeys = new Set<string>();
  // Assessment glyph closing each grafted variation, keyed by its terminal node.
  // The best line's value is the eval BEFORE the played move (that eval IS what
  // best play reaches), so the whole line resolves to one verdict at its end.
  const compAssessmentByKey = new Map<string, string>();
  // Raised 10 -> 24 on 2026-08-27. The server stores 32; grafting only 10 meant
  // the best-play branch ended five moves a side in, which reads as a shallow
  // engine rather than a display cap.
  const MAX_INJECTED_PV_PLIES = 24;

  function injectBestLines(analysis: GameAnalysis): void {
    // Which parser turns an analysis PV token into a move. A variant whose
    // analysis-engine UCI diverges from the board's move dialect (banqi,
    // jungle-flip, jieqi, jungle) ships its own `moveFromEngineUci`; it is the
    // SAME parser the engine panel and the best-move arrow already trust, so the
    // lines grafted here are drawn from a decoder the surface relies on
    // elsewhere. Until 2026-08-22 those variants were skipped entirely (a bare
    // adapter.fromUci would have grafted wrong moves) and kept only the textual
    // advice row.
    const decodeUci = presentation.engine?.moveFromEngineUci;
    const nodes = mainlineNodes();
    const evalByPly = new Map(analysis.evals.map((entry) => [entry.ply, entry]));
    let injected = false;
    for (const move of analysis.moves) {
      if (!move.judgment) continue;
      const before = evalByPly.get(move.ply - 1);
      const parent = nodes[move.ply - 1];
      if (!before || !parent) continue;
      const pv = before.pv?.length ? before.pv : before.best ? [before.best] : [];
      if (pv.length === 0) continue;
      let path = tree.pathTo(parent);
      let grafted = false;
      let first = true;
      for (const uci of pv.slice(0, MAX_INJECTED_PV_PLIES)) {
        const at = tree.nodeAt(path);
        if (!at) break;
        const pvMove = decodeUci ? decodeUci(uci, at.truth) : adapter.fromUci(uci, at.truth);
        if (!pvMove) break;
        // The refutation REPLACES the played move; when the "best" line opens
        // with the move actually played there is nothing to graft. Compared as
        // move KEYS rather than raw tokens: a dialect variant's PV token is not
        // the node id, so a token comparison would never match and would graft
        // the played move back onto itself as a "variation".
        if (first) {
          first = false;
          if (adapter.moveKey(pvMove) === nodes[move.ply]?.id) break;
        }
        const isNew = !at.children.some((child) => child.id === adapter.moveKey(pvMove));
        const next = tree.addMove(path, pvMove);
        if (!next) break;
        if (isNew) {
          compKeys.add(pathKey(next));
          injected = true;
          grafted = true;
        }
        path = next;
      }
      // The verdict rides the last move of the line, book-style.
      if (grafted) {
        compAssessmentByKey.set(pathKey(path), advantageSymbol(before.cp, before.mate));
      }
    }
    if (injected) moveTree.rebuild();
  }

  // Promoting a computer line is an explicit adoption: clear the comp flags on the
  // connected line (ancestors and descendants) so a saved study keeps it.
  function adoptCompLine(path: TreePath): void {
    const key = pathKey(path);
    for (const k of [...compKeys]) {
      if (k === key || key.startsWith(`${k}/`) || k.startsWith(`${key}/`)) compKeys.delete(k);
    }
  }

  // ── Control bar (below the move box): nav + a menu overlay. ──
  // Every item here DOES something. Four permanently-muted placeholders (Board
  // editor, Learn from your mistakes, Continue from here, Settings) were cut
  // 2026-07-23 because each needed a surface or an API that did not exist, and a
  // menu that is mostly greyed out reads as a broken product, not a roadmap.
  // Board editor came back 2026-08-27 WITH its route (/editor/<variant>, via
  // `boardEditorHref`), alongside "Analyse from here" (`analyseFromHere`, the
  // position-input vertical: a postgame node continues on /analysis with its
  // exact deal). Learn-from-mistakes, Continue-from-here (create a live game
  // from a FEN), and Settings are still absent. Re-add an item WITH its
  // implementation, not ahead of it.
  const menuItems: ReviewMenuItem[] = [
    { label: t('review.flipBoard'), icon: REVIEW_MENU_ICONS.flip, onClick: () => flipBoard() },
  ];
  if (config.saveDefaultOrientation) {
    menuItems.push({
      label: t('review.setDefaultView'),
      icon: REVIEW_MENU_ICONS.pinView,
      onClick: () => {
        void config.saveDefaultOrientation?.(flipped);
      },
    });
  }
  if (config.studyExport) {
    menuItems.push({ label: 'Study', icon: REVIEW_MENU_ICONS.study, onClick: () => saveAsStudy() });
  }
  if (config.allowClearMoves) {
    menuItems.push({
      label: 'Clear moves',
      icon: REVIEW_MENU_ICONS.clear,
      onClick: () => clearMoves(),
    });
  }
  // Position hand-offs: each is a plain navigation with the CURRENT node's
  // position in the URL, so the target page has everything it needs on load.
  const analyseFromHere = config.analyseFromHere;
  if (analyseFromHere) {
    menuItems.push({
      label: t('review.analyseFromHere'),
      icon: REVIEW_MENU_ICONS.analyse,
      onClick: () => window.location.assign(analyseFromHere(currentNode().truth)),
    });
  }
  const boardEditorHref = config.boardEditorHref;
  if (boardEditorHref) {
    menuItems.push({
      label: t('review.boardEditor'),
      icon: REVIEW_MENU_ICONS.editor,
      onClick: () => window.location.assign(boardEditorHref(currentNode().truth)),
    });
  }
  const newDeal = config.newDeal;
  if (newDeal) {
    menuItems.push({
      label: t('review.newDeal'),
      icon: REVIEW_MENU_ICONS.newDeal,
      onClick: () => newDeal(),
    });
  }
  // Spoiler control for a masked board. The default stays masked: the review's job
  // is to show the game as it was played, and what the loser could not see is the
  // whole subject. Revealing is a deliberate second look, so it lives a click deep
  // in the menu rather than on the bar.
  if (config.revealHidden) {
    let hiddenRevealed = false;
    menuItems.push({
      label: () => (hiddenRevealed ? t('review.hideIdentities') : t('review.revealIdentities')),
      icon: REVIEW_MENU_ICONS.reveal,
      onClick: () => {
        hiddenRevealed = !hiddenRevealed;
        config.revealHidden?.setRevealed(hiddenRevealed);
        render();
      },
    });
  }
  const controls = createReviewControls({
    // The book tool appears only when a corpus is behind it (see review-controls).
    ...(config.explorer
      ? { onToggleExplorer: (open: boolean) => config.explorer?.setActive(open) }
      : {}),
    onFirst: () => go(ROOT_PATH),
    onPrevious: () => go(tree.stepBack(currentPath)),
    onNext: () => go(tree.stepForward(currentPath)),
    onLast: () => go(lineEnd(currentPath)),
    menuItems,
  });

  // Computer-injected refutation lines stay out of the persisted blob unless the
  // user adopted them via promote (adoptCompLine clears their flags). Shared by
  // the returned handle (study autosave) and the menu's Study action.
  function serializeCurrentTree(): SerializedTree {
    return serializeTree(tree, adapter, {
      skip: (node) => compKeys.has(pathKey(tree.pathTo(node))),
      rootFen: config.root?.fen,
    });
  }

  // Drop every move, keeping a FEN-seeded root position. Deleting the root's
  // children one at a time (rather than rebuilding the controller) preserves the
  // root truth and the mounted board.
  function clearMoves(): void {
    if (tree.root.children.length === 0) return;
    while (tree.root.children[0]) tree.deleteAt(tree.pathTo(tree.root.children[0]));
    compKeys.clear();
    compAssessmentByKey.clear();
    moveTree.rebuild();
    go(ROOT_PATH);
    notifyChange();
  }

  // One-click "save this line as a study". The study is created private and we
  // navigate to it; naming/visibility live on the study page.
  let studyPending = false;
  function saveAsStudy(): void {
    const target = config.studyExport;
    if (!target || studyPending) return;
    studyPending = true;
    void createStudyFromTree({
      variant: target.variant,
      name: target.name,
      tree: serializeCurrentTree(),
    })
      .then((result) => {
        if (result.ok) {
          window.location.href = `/study/${result.id}`;
          return;
        }
        studyPending = false;
        window.alert(studyExportMessage(result.reason));
      })
      .catch(() => {
        studyPending = false;
        window.alert(studyExportMessage('failed'));
      });
  }

  // ── Whole-game analysis (mainline) → underboard chart + summary + glyphs ──
  const underboardBody = document.createElement('div');
  underboardBody.className = 'review-underboard-panel__body';
  // Live-FEN share input, refreshed on every navigation (see render()).
  const shareFenInput = document.createElement('input');
  const shareMovesInput = document.createElement('textarea');
  // FEN + moves-import block below the underboard tools (analysis board only);
  // its FEN mirrors the current node, its moves box prefills with the current
  // line but never clobbers in-progress typing (see render()).
  const importPanel = config.importPanel
    ? createImportPanel(config.importPanel, { editorLink: config.boardEditorHref !== undefined })
    : null;
  // Authored comment for the CURRENT node, under the board. The move list shows
  // only a bubble marker per commented move; navigation brings the text here.
  const commentPanelEl = document.createElement('section');
  commentPanelEl.className = 'review-comment-panel review-comment-panel--empty';
  commentPanelEl.setAttribute('aria-live', 'polite');
  const analysisSummaryEl = document.createElement('div');
  analysisSummaryEl.className = 'review-analysis-summary-slot';
  // Chance-variant (jieqi) caption slot under the accuracy summary: a "Grading reveals…" placeholder
  // until the decomposition loads, then a one-line luck caption. Kept as a persistent child so
  // applyAnalysis/applyDecisions can re-attach it without re-creating the node.
  const decisionSummaryEl = document.createElement('div');
  decisionSummaryEl.className = 'review-decision-summary';
  // Judged-move advice ("Blunder. h3-e3 was best.") renders INLINE in the move
  // list (move-tree comment rows), lichess-style — there is no separate advice
  // line under the list on the tree surface.
  const formatBestForAdvice = presentation.formatBestMove ?? defaultFormatBestMove;
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
          // Per-keystroke write; deliberately no render() — a full render resets
          // the editor textarea and drops the caret. The move-tree refresh alone
          // is safe (it never touches the editor) and keeps the inline comment
          // row live while typing.
          tree.annotateAt(currentPath, { comments: text.trim() ? [{ text }] : [] });
          refreshMoveTreeAnnotations();
          moveTree.setCurrent(currentPath); // the rebuild dropped the highlight
          const trimmed = text.trim();
          commentPanelEl.textContent = trimmed;
          commentPanelEl.classList.toggle('review-comment-panel--empty', !trimmed);
          notifyChange();
        },
        onClearShapes: () => {
          tree.annotateAt(currentPath, { shapes: [] });
          paintOverlays();
          annotationEditor?.setAnnotations(currentNode().annotations);
          notifyChange();
        },
        gamebook: config.gamebookEditing,
        lessonControls: config.annotationLessonControls,
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
  const underboardEl = underboardPanel(underboardBody, {
    hasAnalysis: Boolean(config.analysis),
    about: config.aboutTab,
    tools: annotationEditor?.tabs,
    provenance: config.provenance,
    moveTimes: config.moveTimes,
    seatColors: config.seatColors,
    players: config.showCrosstable ? (config.players ?? {}) : undefined,
    ...(config.crosstable ? { crosstable: config.crosstable } : {}),
    // No engine = no FEN for this variant (the fog reviews): drop the row.
    ...(presentation.engine ? { shareFenInput } : {}),
    shareMovesInput,
    gameUrl: typeof window !== 'undefined' ? window.location.href : '',
    shareExtra: config.shareExtra,
  });

  // The tree truncates an illegal seed to the legal prefix; surface a notice.
  const truncated = !config.initialTree && mainlineLen < config.moves.length;
  const details = config.details ?? (truncated ? truncationNotice(mainlineLen) : undefined);

  // Material rows (variant opt-in): create the hosts before the scaffold so
  // they land in the rail's mat-top/mat-bot slots; render() drives the updater.
  let materialUpdate: ((truth: Truth, rootTruth: Truth, flipped: boolean) => void) | null = null;
  let materialTop: HTMLElement | undefined;
  let materialBottom: HTMLElement | undefined;
  if (presentation.material) {
    materialTop = document.createElement('div');
    materialBottom = document.createElement('div');
    materialUpdate = presentation.material({ top: materialTop, bottom: materialBottom });
  }

  const scaffold = createReviewScaffold(root, {
    reviewSurface: config.reviewSurface ?? 'game',
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
    boardAspect: resolveBoardAspect(presentation.boardAspect),
    boardCols: presentation.boardCols,
    boardMaxPx: presentation.boardMaxPx,
    underboard: composeUnderboard(
      commentPanelEl,
      // A played game always has Share & export (and usually Move times), so the
      // panel shows for those too; the analysis board keeps its own gate.
      config.analysis ||
        config.provenance ||
        config.showCrosstable ||
        config.aboutTab ||
        config.moveTimes ||
        config.shareExtra
        ? underboardEl
        : undefined,
      importPanel?.el,
    ),
    underboardOverflows: true,
    enginePanel: enginePanel?.el,
    moves: moveTree.el,
    railPanel: config.explorer?.el,
    navigation: controls.el,
    analysisSummary: analysisSummaryEl,
    gauge: evalBar?.el,
    materialTop,
    materialBottom,
    showBoardMaterial: Boolean(presentation.material),
    onPromote: () => render(),
  });

  function go(path: TreePath): void {
    closeVariationPicker();
    const fromPath = currentPath;
    currentPath = path;
    render();
    animateStep(fromPath, path);
  }

  // ── Variation picker (keyboard grammar for branch points) ─────────────────
  // Right-arrow on a node with several continuations opens a chooser over the
  // board: up/down select (mainline preselected), right/enter descend, left or
  // escape cancel. Mouse clicks on moves are untouched — this is arrow-key-only
  // navigation for the tree.
  let variationPicker: { index: number; el: HTMLElement } | null = null;

  function closeVariationPicker(): void {
    if (!variationPicker) return;
    variationPicker.el.remove();
    variationPicker = null;
  }

  function renderVariationPicker(): void {
    if (!variationPicker) return;
    const options = currentNode().children;
    const rows = options.map((child, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'review-var-picker__row';
      if (i === variationPicker!.index) row.classList.add('is-selected');
      const label = document.createElement('span');
      label.className = 'review-var-picker__label';
      label.textContent = child.label;
      row.append(label);
      if (i === 0) {
        const tag = document.createElement('span');
        tag.className = 'review-var-picker__tag';
        tag.textContent = 'main line';
        row.append(tag);
      }
      const snippet = displayComment(child.annotations?.comments?.[0]);
      if (snippet) {
        const note = document.createElement('span');
        note.className = 'review-var-picker__snippet';
        note.textContent = snippet.length > 90 ? `${snippet.slice(0, 90)}…` : snippet;
        row.append(note);
      }
      row.addEventListener('click', (event) => {
        event.stopPropagation();
        go(tree.pathTo(child)); // go() closes the picker
      });
      return row;
    });
    const title = document.createElement('div');
    title.className = 'review-var-picker__title';
    title.textContent = 'Choose a line';
    variationPicker.el.replaceChildren(title, ...rows);
  }

  function openVariationPicker(): void {
    if (currentNode().children.length < 2) return;
    const el = document.createElement('div');
    el.className = 'review-var-picker';
    el.setAttribute('role', 'menu');
    boardSlots[0]!.wrap.append(el);
    variationPicker = { index: 0, el };
    renderVariationPicker();
  }

  function stepForwardAction(): void {
    if (variationPicker) {
      const child = currentNode().children[variationPicker.index];
      if (child) go(tree.pathTo(child)); // go() closes the picker
      return;
    }
    const node = currentNode();
    if (node.children.length > 1) {
      openVariationPicker();
      return;
    }
    go(tree.stepForward(currentPath));
  }

  function movePickerSelection(delta: number): boolean {
    if (!variationPicker) return false;
    const count = currentNode().children.length;
    variationPicker.index = Math.min(count - 1, Math.max(0, variationPicker.index + delta));
    renderVariationPicker();
    return true;
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
    // Re-project once per navigation and render the single board from the view
    // the POV toggle currently selects (open = always the truth view; fog =
    // truth or a fogged seat POV). The board keys fog off enabled().
    const projection = adapter.project(node.truth);
    const view = projection.find((v) => v.key === currentPov)?.view ?? null;
    interactive.render(view, orientation());
    povToggle?.sync();
    evalBar?.setFlipped(flipped);
    materialUpdate?.(node.truth, tree.root.truth, flipped);

    // Order matters: setPosition fires onLines(null) synchronously when the
    // engine is on (stale-arrow clear); the explicit paintOverlays below then
    // repaints for the new node (engine/analysis arrows + the node's user shapes),
    // covering the engine-off case where setPosition fires no onLines.
    // `'fen'` engines (Misty and PikaJieQi) take a per-node FEN with no move list;
    // `'moves'` engines (Fairy-Stockfish) replay engine UCI from the start position.
    if (enginePanel) {
      const searchable = presentation.engine?.canEvaluatePosition?.(node.truth) ?? true;
      if (presentation.engine?.positionMode === 'fen') {
        enginePanel.setPosition([], presentation.engine.fen(node.truth), searchable);
      } else {
        enginePanel.setPosition(uciTo(node), engineBaseFen, searchable);
      }
    }
    paintOverlays();
    annotationEditor?.setAnnotations(node.annotations);
    // Under-board comment panel: the current node's authored text (hidden when
    // the node carries none). The move list only marks commented moves.
    const authoredComment = displayComment(node.annotations?.comments?.[0]) ?? '';
    commentPanelEl.textContent = authoredComment;
    commentPanelEl.classList.toggle('review-comment-panel--empty', !authoredComment);
    moveTree.setCurrent(currentPath);
    controls.setBounds({ atStart: currentPath.length === 0, atEnd: node.children.length === 0 });
    // Opening statistics follow the board like every other per-node panel.
    config.explorer?.setTruth(node.truth);
    // Live-refresh the Share tab's FEN + move export for the current node/line.
    if (presentation.engine) shareFenInput.value = presentation.engine.fen(node.truth);
    shareMovesInput.value = uciTo(node).join(' ');
    // The import block mirrors the same live state: FEN of the current node, and
    // the current line in display notation — but never over a paste in progress.
    if (importPanel) {
      if (presentation.engine && document.activeElement !== importPanel.fenInput) {
        importPanel.fenInput.value = presentation.engine.fen(node.truth);
      }
      if (document.activeElement !== importPanel.movesInput) {
        importPanel.movesInput.value = lineLabels(node).join(' ');
      }
      // The editor link follows the current node, like the menu item does.
      if (importPanel.editorLink && config.boardEditorHref) {
        importPanel.editorLink.href = config.boardEditorHref(node.truth);
      }
    }
    chart?.setPly(node.ply);
    config.onLineChange?.(movesTo(node));
  }

  /** Move labels from the root down to `node` (the current line, display notation). */
  function lineLabels(node: Node): string[] {
    const labels: string[] = [];
    for (let n: Node | null = node; n?.parent; n = n.parent) labels.unshift(n.label);
    return labels;
  }

  /** Mainline plies whose played move IS the analysis engine's best move for the position before
   *  it. The engine reports `best` in its OWN UCI dialect, so resolving this needs the position it
   *  was reported for — only available here, against the tree. Those plies must not be judged:
   *  otherwise a two-search eval drift renders as "Mistake. b1-b2 was best." on the move b1-b2. */
  function bestPlayedPlies(analysis: GameAnalysis): Set<number> {
    const decode = presentation.engine?.moveFromEngineUci;
    const nodes = mainlineNodes();
    const plies = new Set<number>();
    for (const entry of analysis.evals) {
      const parent = nodes[entry.ply];
      const played = nodes[entry.ply + 1];
      if (!entry.best || !parent || !played) continue;
      const move = decode
        ? decode(entry.best, parent.truth)
        : adapter.fromUci(entry.best, parent.truth);
      if (move && adapter.moveKey(move) === played.id) plies.add(entry.ply + 1);
    }
    return plies;
  }

  function applyAnalysis(raw: GameAnalysis): void {
    const analysis = regradeBestPlayed(raw, bestPlayedPlies(raw));
    gameAnalysis = analysis;
    // Graft the best-play refutation lines into the tree BEFORE the annotation
    // rebuild so comments and variations land in one pass.
    injectBestLines(analysis);
    const nodes = mainlineNodes();
    // Phase segmentation (variant-supplied heuristic): chart dividers + the
    // summary's per-phase accuracy share one computation.
    gamePhases = presentation.gamePhases
      ? presentation.gamePhases(nodes.map((node) => node.truth))
      : undefined;
    chart = createAdvantageChart(analysis.evals, {
      seatColors: config.seatColors,
      phases: gamePhases,
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
        createAnalysisSummary(analysis, config.players, {
          seatColors: config.seatColors,
          phases: gamePhases,
        }),
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
          phases: gamePhases,
        }),
        decisionSummaryEl,
      );
      // The luck legend ("Accuracy grades your choices; 🎲 marks the luck of each
      // reveal.") used to sit here. Removed 2026-08-22: the 🎲 badges and the
      // luck-free accuracy carry the story without a caption under the summary.
      decisionSummaryEl.replaceChildren();
    }
    // The advantage chart's "if reveals ran average" ghost line is intentionally NOT drawn for now:
    // after the last tile flips the gap freezes and the ghost just shadows the real line for the
    // rest of the game, which reads as confusing rather than informative. The per-move luck (🎲
    // badges) and the luck-free accuracy already carry the decision-vs-luck story. The chart's
    // setLuckOverlay() is kept intact so a future, better-signposted treatment can re-enable it.
    refreshMoveTreeAnnotations();
    render();
  }

  // The decomposition is off (compute failed, or this viewer can't request one): show the base
  // summary with a caption saying reveals are ungraded, replacing the pending note. The base
  // accuracy covers only non-reveal moves, so the caption keeps it from reading as a clean sheet.
  function showDecisionsUnavailable(): void {
    if (!gameAnalysis) return;
    analysisSummaryEl.replaceChildren(
      createAnalysisSummary(gameAnalysis, config.players, {
        seatColors: config.seatColors,
        phases: gamePhases,
      }),
      decisionSummaryEl,
    );
    decisionSummaryEl.replaceChildren(revealsUngradedCaption());
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
        // Judged moves carry their advice INLINE in the move list (lichess:
        // "Blunder. h3-e3 was best." right under the move, ahead of the grafted
        // refutation line).
        const best = move.judgment ? evalByPly.get(move.ply - 1)?.best : null;
        byPathKey.set(pathKey(tree.pathTo(node)), {
          suffix: glyph?.suffix,
          suffixClass: glyph?.suffixClass,
          eval: entry ? formatEval(entry.cp, entry.mate) : undefined,
          comment: move.judgment
            ? `${ADVICE_LABEL[move.judgment]}.${best ? ` ${formatBestForAdvice(best)} was best.` : ''}`
            : undefined,
          commentClass: move.judgment ?? undefined,
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
            // Chance plies get the ranked alternatives instead of a refutation line: past a
            // reveal nothing is knowable, so a LINE would be a fiction while a ranked SET is
            // exactly what the server scored.
            ...(info.candidates?.length ? { candidates: info.candidates } : {}),
          });
        }
      }
    }
    // Verdict glyph on each grafted refutation line's terminal move.
    for (const [key, assessment] of compAssessmentByKey) {
      byPathKey.set(key, { ...byPathKey.get(key), assessment });
    }
    applyUserAnnotations(tree.root, byPathKey);
    annotationByPathKey = byPathKey;
    moveTree.annotate(byPathKey);
    // The board badge reads this map, so it has to repaint when the map changes
    // (analysis landing, or the user authoring a glyph) and not only on a ply move.
    paintOverlays();
  }

  function applyUserAnnotations(node: Node, map: Map<string, MoveTreeAnnotation>): void {
    const code = node.annotations?.glyphs?.[0];
    if (code !== undefined && node.parent) {
      const key = pathKey(tree.pathTo(node));
      const prev = map.get(key);
      map.set(key, { ...prev, suffix: GLYPH_LABEL[code] ?? prev?.suffix, suffixClass: undefined });
    }
    // Authored comments show a small bubble marker on the move cell; the text
    // itself renders in the under-board comment panel when the cursor reaches
    // the node (visible to EVERY viewer, not just the owner's editor box).
    if (node.annotations?.comments?.[0]?.text && node.parent) {
      const key = pathKey(tree.pathTo(node));
      map.set(key, { ...map.get(key), commentMarker: true });
    }
    for (const child of node.children) applyUserAnnotations(child, map);
  }

  function renderAnalysisRequest(source: AnalysisSource): void {
    if (mainlineLen < 1) {
      underboardBody.replaceChildren();
      return;
    }
    const control = source.requestHref
      ? document.createElement('a')
      : document.createElement('button');
    if (control instanceof HTMLButtonElement) control.type = 'button';
    control.className = 'xiangqi-review__analyse';
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
    control.replaceChildren(icon, label);
    if (control instanceof HTMLAnchorElement && source.requestHref) {
      control.href = source.requestHref;
    } else if (control instanceof HTMLButtonElement) {
      control.addEventListener('click', () => {
        control.disabled = true;
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
            control.disabled = false;
            label.textContent = 'Analysis failed — retry';
          });
      });
    }
    underboardBody.replaceChildren(control);
  }

  const decisionSource = config.decisions ?? null;
  async function loadCachedDecisions(): Promise<void> {
    if (!decisionSource) return;
    let overlay: DecisionOverlay | null = null;
    try {
      overlay = (await decisionSource.fetchCached?.()) ?? null;
    } catch {
      /* a failed cache read is a miss */
    }
    if (overlay) {
      applyDecisions(overlay);
      return;
    }
    // Cache miss (e.g. the game was analysed before the decomposition shipped): compute it now
    // if this viewer may, so the "Grading reveals…" note is an honest in-progress state and not
    // a dead end. Otherwise fall straight back to the base summary.
    if (decisionSource.canRun) await runDecisions();
    else showDecisionsUnavailable();
  }
  async function runDecisions(): Promise<void> {
    if (!decisionSource) return;
    try {
      applyDecisions(await decisionSource.run());
    } catch {
      // The eval graph stands on its own; swap the pending note for the base summary so the
      // page never wedges on "Grading reveals…".
      showDecisionsUnavailable();
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
    window.addEventListener(
      presentation.appearanceEvent,
      () => {
        render();
        scaffold.setBoardAspect(resolveBoardAspect(presentation.boardAspect));
      },
      { signal: keyboardAbort.signal },
    );
  }
  if (presentation.labelsEvent) {
    window.addEventListener(
      presentation.labelsEvent,
      () => {
        // Node labels are cached at creation; recompute them all, then rebuild
        // the move list (rebuild drops the highlight, so re-mark the path) and
        // re-render so the import box's display-notation mirror follows.
        tree.relabel();
        moveTree.rebuild();
        moveTree.setCurrent(currentPath);
        render();
      },
      { signal: keyboardAbort.signal },
    );
  }
  installReviewKeyboard(
    {
      // With the picker open, left cancels it in place; up/down move the
      // selection instead of jumping to the ends of the game.
      stepBack: () => {
        if (variationPicker) {
          closeVariationPicker();
          return;
        }
        go(tree.stepBack(currentPath));
      },
      stepForward: () => stepForwardAction(),
      toStart: () => {
        if (movePickerSelection(-1)) return;
        go(ROOT_PATH);
      },
      toEnd: () => {
        if (movePickerSelection(1)) return;
        go(tree.mainlinePath());
      },
      flip: () => flipBoard(),
      escape: () => closeVariationPicker(),
      // Only meaningful where an engine panel exists to hold the checkbox.
      toggleArrows:
        enginePanel && engineOverlaysSupported
          ? () => enginePanel.setShowArrows(!showEngineArrows)
          : undefined,
      // Space follows the current local engine's first PV move. setPosition()
      // clears engineLines synchronously on every navigation, so a held/stale
      // result can never race ahead through a second position.
      playBestMove: () => {
        if (!engineOn) return false;
        const uci = engineLines?.[0]?.pvUci[0];
        const engine = presentation.engine;
        if (!uci || !engine) return false;
        const move = engine.moveFromEngineUci
          ? engine.moveFromEngineUci(uci, currentNode().truth)
          : adapter.fromUci(uci, currentNode().truth);
        return move ? handleMove(move) : false;
      },
    },
    keyboardAbort.signal,
  );

  return { serialize: serializeCurrentTree };
}

function resolveBoardAspect(aspect: number | (() => number)): number {
  return typeof aspect === 'function' ? aspect() : aspect;
}

/** Stack the under-board pieces (comment panel, tools panel, FEN/import block)
 *  into one region; pass through a single element alone; undefined when none. */
function flippedFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('flip') === '1';
}

function composeUnderboard(...parts: Array<HTMLElement | undefined>): HTMLElement | undefined {
  const present = parts.filter((el): el is HTMLElement => !!el);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  const stack = document.createElement('div');
  stack.className = 'review-underboard-stack';
  stack.append(...present);
  return stack;
}

/** The lichess.org/analysis FEN + moves boxes: the FEN of the current position
 *  over a moves textarea with an Import action. Field refresh is driven by the
 *  controller's render(); the import handlers are variant-supplied. With an
 *  onImportFen handler the FEN box is editable (paste a composition → Enter or
 *  Set position); without one it stays a read-only mirror. */
function createImportPanel(
  handlers: {
    onImport(text: string): string | null;
    onImportFen?(fen: string): string | null;
    hint?: string;
  },
  options: { editorLink: boolean },
): {
  el: HTMLElement;
  fenInput: HTMLInputElement;
  movesInput: HTMLTextAreaElement;
  editorLink: HTMLAnchorElement | null;
} {
  const { onImport, onImportFen, hint } = handlers;
  // One grid for both rows (label | field | action) so the two action buttons
  // share a column and their edges line up; the foot row hangs under the
  // field column.
  const el = document.createElement('section');
  el.className = 'review-import';

  const error = document.createElement('span');
  error.className = 'review-import__error';
  error.setAttribute('role', 'alert');

  const fenLabel = document.createElement('label');
  fenLabel.className = 'review-share__label review-import__label';
  fenLabel.textContent = 'FEN';
  const fenInput = document.createElement('input');
  fenInput.className = 'review-share__field review-import__field';
  fenInput.id = 'review-import-fen';
  fenLabel.htmlFor = fenInput.id;
  fenInput.readOnly = !onImportFen;
  fenInput.spellcheck = false;
  fenInput.setAttribute('aria-label', 'Current position FEN');
  fenInput.addEventListener('focus', () => fenInput.select());
  el.append(fenLabel, fenInput);
  if (onImportFen) {
    const submitFen = (): void => {
      error.textContent = onImportFen(fenInput.value) ?? '';
    };
    fenInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submitFen();
    });
    const setButton = document.createElement('button');
    setButton.type = 'button';
    setButton.className = 'review-share__copy review-import__button';
    setButton.textContent = 'Set position';
    setButton.addEventListener('click', submitFen);
    el.append(setButton);
  } else {
    el.append(document.createElement('span'));
  }

  const movesLabel = document.createElement('label');
  movesLabel.className = 'review-share__label review-import__label review-import__label--moves';
  movesLabel.textContent = 'Moves';
  const movesInput = document.createElement('textarea');
  movesInput.className = 'review-share__field review-share__field--moves review-import__field';
  movesInput.id = 'review-import-moves';
  movesLabel.htmlFor = movesInput.id;
  movesInput.rows = 2;
  movesInput.spellcheck = false;
  movesInput.placeholder = 'Paste a game to import';
  movesInput.setAttribute('aria-label', 'Moves to import');
  const importButton = document.createElement('button');
  importButton.type = 'button';
  importButton.className = 'review-share__copy review-import__button review-import__button--moves';
  importButton.textContent = 'Import moves';
  importButton.addEventListener('click', () => {
    error.textContent = onImport(movesInput.value) ?? '';
  });
  el.append(movesLabel, movesInput, importButton);

  // Foot: the error (when any), the variant's FEN hint, and the way out for
  // anyone who would rather place pieces than type them.
  const foot = document.createElement('div');
  foot.className = 'review-import__foot';
  foot.append(error);
  if (hint) {
    const hintEl = document.createElement('span');
    hintEl.className = 'review-import__hint';
    hintEl.textContent = hint;
    foot.append(hintEl);
  }
  let editorLink: HTMLAnchorElement | null = null;
  if (options.editorLink) {
    editorLink = document.createElement('a');
    editorLink.className = 'review-import__editor-link';
    editorLink.textContent = t('analysis.openBoardEditor');
    foot.append(editorLink);
  }
  el.append(foot);
  return { el, fenInput, movesInput, editorLink };
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

// Fallback caption when the decomposition never loaded: the base accuracy skips reveal plies,
// so say so rather than letting the summary read as a full luck-free grade.
function revealsUngradedCaption(): HTMLElement {
  const cap = document.createElement('div');
  cap.className = 'review-decision-summary__caption';
  cap.textContent = 'Reveals are not graded on this game; accuracy covers the other moves.';
  return cap;
}
