// Generic Mistboard TV renderer for the tenant SVG family (Jieqi, Banqi, Dark
// Mini Xiangqi — red/black boards rendered as SVG, replayed from a FINISHED
// game's postgame endpoint, never live spectating). This holds ALL the shared
// "TV" chrome — header strip, board panes (one truth pane, or a per-color
// triptych), the control bar + auto-play, ply navigation, and the ReplayHandle
// contract. Each variant supplies a small TenantWatchAdapter (its postgame
// loader/helpers, board renderer, and captures fill); the per-variant module is
// then ~30 lines. See watch-banqi-replay.ts / watch-jieqi-replay.ts.
//
// Crossroads/dark-chess stay on the chessground path in replay.ts; this generic
// is for the xiangqi-style SVG tenants only.

import { t } from './i18n/catalog.js';
import { currentLocale, type Locale } from './i18n/locale.js';
import type { GameMeta, ReplayHandle } from './replay.js';
import { createPane, type ReplayPaneHandle } from './replay-board.js';
import { createGameHeaderStrip } from './replay-meta.js';
import type { MoveListEntry } from './review/move-list.js';
import {
  reconstructMoveDelays,
  reconstructShowcaseClocks,
  type ShowcaseClockPair,
  showcaseResultMarks,
} from './showcase-clock.js';
import { pickCompactViewKey } from './showcase-compact-view.js';
import { formatClock } from './web-utils.js';

const AUTO_PLAY_PLY_MS = 1100;
const AUTO_PLAY_LOOP_HOLD_MS = 2600;
// Compact showcase end-of-game hold: long enough to read the 1/0/½ result marks
// before the cycler advances (the chess path holds the same via showcase-board).
const SHOWCASE_END_HOLD_MS = 4000;
// Compact showcase per-move pacing: play each move at its real recorded duration
// clamped to this watchable band, and tick the mover's clock down across it.
const SHOWCASE_MIN_MOVE_MS = 700;
const SHOWCASE_MAX_MOVE_MS = 2500;
const SHOWCASE_CLOCK_TICK_MS = 100;

// The postgame fields the shared TV chrome reads; every tenant postgame response
// carries these (the adapter's Postgame type extends this).
export type WatchPostgameMeta = {
  game: {
    mode: string;
    result: string;
    termination: string;
    plyCount: number;
    rated: boolean;
    initialMs: number | null;
    incrementMs: number | null;
    startedAt?: number | string | null;
  };
  state: { timeControl?: { initialMs: number; incrementMs: number } | null };
  // Per-event wall-clock timestamps; present on every tenant postgame (move events
  // carry color + ply, terminal events may not). The compact showcase reconstructs
  // the players' real clocks from the move timestamps (the generic tenant postgames
  // carry no dense clock series). Move events also carry the played `move` (from-to
  // coordinates), which the /watch move list reads variant-agnostically; drops
  // (drop-mini-xiangqi) omit `from`.
  timeline?: ReadonlyArray<{
    at: number;
    color?: string;
    ply?: number;
    move?: { from?: string; to?: string };
  }>;
};

// The variant-specific surface. The generic owns everything else.
export type TenantWatchAdapter<Postgame extends WatchPostgameMeta, View, ViewKey extends string> = {
  installStyles(): void;
  /** Appearance event that repaints the current ply without changing replay state. */
  appearanceEvent?: string;
  loadPostgame(roomId: string): Promise<{ ok: true; postgame: Postgame } | { ok: false }>;
  maxPly(postgame: Postgame): number;
  // Boards to show: a triptych [red, truth, black] for per-color hidden info
  // (jieqi/mini-xiangqi) or just [truth] for symmetric variants (banqi).
  viewEntries(postgame: Postgame): ReadonlyArray<{ key: ViewKey; label: string }>;
  viewAtPly(postgame: Postgame, key: ViewKey, ply: number): View | null;
  paneKind(key: ViewKey): 'white' | 'truth' | 'black';
  // The adapter owns fog/perspective (e.g. mini-xiangqi passes showFog when the
  // pane is a per-color view rather than truth).
  renderBoard(view: View, orientation: 'red' | 'black', key: ViewKey): string;
  fillCaptures(host: HTMLElement, view: View, owner: 'red' | 'black'): void;
  // Drop/reserve variants (drop-mini-xiangqi, crazyhouse, shogi) where the hand IS
  // the position: the compact showcase flanks the board with vertical reserve
  // strips (each side's hand) instead of top/bottom capture rows.
  sidedCaptures?: boolean;
  // When set, the (single) board defaults to the as-played hidden-identity view
  // (hiddenKey) and a Reveal/Hide control (and the `h` key) swaps it to truth.
  // Tenants without hidden identities omit this and keep their fixed view.
  reveal?: { hiddenKey: ViewKey; truthKey: ViewKey };
  // Override the result string when the recorded result key (seat-based) is not
  // the player-facing color. Banqi needs this: its seats are first/second mover
  // and the ink binds on the opening flip, so "red-wins" may be a Black-ink win.
  // Tenants where seat == ink (jieqi, mini-xiangqi) omit it and keep the default.
  resultLabel?(result: string, postgame: Postgame): string;
  // OPTIONAL piece-glide hook, called after each pane's innerHTML swap when the
  // ply moved by exactly ONE (autoplay tick or manual step). `view` is the pane's
  // freshly rendered view, `prevView` the same pane's view at the previous ply
  // (null when unavailable); the adapter derives the move from those payloads
  // (typically lastMove) — never from diffing boards. Tenants that omit this
  // keep the discrete per-ply repaint.
  animateMove?(
    boardEl: HTMLElement,
    view: View,
    prevView: View | null,
    direction: 'forward' | 'back',
    orientation: 'red' | 'black',
    key: ViewKey,
  ): void;
};

export type TenantWatchReplayOptions = {
  autoplay?: boolean;
  locale?: Locale;
  metadataByRoomId?: Record<string, GameMeta>;
  /**
   * Homepage showcase mode: render a SINGLE board (no header/control-bar/ply-line)
   * instead of the full TV triptych. The compact view honors hidden info —
   * perfect-info/symmetric variants show truth; hidden-identity/per-color variants
   * show the as-played hidden view (a reveal tenant's hiddenKey, or one random
   * color's POV — never the truth board). Pairs with onGameEnd for cross-variant
   * cycling.
   */
  compact?: boolean;
  /**
   * Called once when the game reaches its final ply under autoplay (after the
   * loop hold), instead of restarting the same game. Lets an outer showcase
   * controller advance to the next pooled game (possibly a different variant).
   */
  onGameEnd?: () => void;
  /**
   * Player names for the compact showcase seats, keyed by room id: `first` is the
   * red/first-mover side, `second` is black. The tenant postgames carry no names
   * (they come from the feed's participants), so the caller supplies them here;
   * absent names fall back to the color labels.
   */
  namesByRoomId?: Record<string, { first: string; second: string }>;
  /**
   * Called on every ply change (autoplay tick, manual jump, or loop reset) with
   * the current ply and the game's max ply. The /watch right rail uses it to keep
   * the move list highlight + scrubber bounds in sync. OPTIONAL: the homepage
   * showcase omits it.
   */
  onPlyChange?: (ply: number, maxPly: number) => void;
};

type ControlRefs = {
  first: HTMLButtonElement;
  prev: HTMLButtonElement;
  play: HTMLButtonElement;
  next: HTMLButtonElement;
  last: HTMLButtonElement;
  plyLabel: HTMLElement;
};

function resultChipKind(result: string): 'white' | 'black' | 'draw' {
  if (result === 'red-wins') return 'white';
  if (result === 'black-wins') return 'black';
  return 'draw';
}

function resultLabel(result: string, locale: Locale): string {
  if (result === 'red-wins') return t('watch.redWins', {}, locale);
  if (result === 'black-wins') return t('watch.blackWins', {}, locale);
  return t('result.draw', {}, locale);
}

function labelize(value: string): string {
  const spaced = value.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function timeControlLabel(postgame: WatchPostgameMeta, locale: Locale): string {
  const initialMs = postgame.game.initialMs ?? postgame.state.timeControl?.initialMs ?? null;
  const incrementMs = postgame.game.incrementMs ?? postgame.state.timeControl?.incrementMs ?? null;
  if (initialMs === null && incrementMs === null) return t('watch.untimed', {}, locale);
  return `${Math.round((initialMs ?? 0) / 60000)}+${Math.round((incrementMs ?? 0) / 1000)}`;
}

// Title is the matchup (like the dark-chess watch's "Human vs engine"), not the
// variant name; the channel tab already conveys the variant.
function matchupLabel(mode: string, locale: Locale): string {
  if (mode === 'pve') return t('watch.humanVsEngine', {}, locale);
  if (mode === 'eve') return t('watch.engineVsEngine', {}, locale);
  return t('watch.humanVsHuman', {}, locale);
}

function localizeResultLabel(label: string | undefined, result: string, locale: Locale): string {
  if (label === 'Red wins' || (!label && result === 'red-wins'))
    return t('watch.redWins', {}, locale);
  if (label === 'Black wins' || (!label && result === 'black-wins'))
    return t('watch.blackWins', {}, locale);
  if (label === 'Draw' || !label) return resultLabel(result, locale);
  return label;
}

function terminationLabel(reason: string, locale: Locale): string {
  if (locale === 'en') return labelize(reason);
  switch (reason) {
    case 'resignation':
      return t('result.resignation', {}, locale);
    case 'timeout':
      return t('result.timeout', {}, locale);
    case 'abandonment':
      return t('result.abandonment', {}, locale);
    case 'checkmate':
      return t('result.checkmate', {}, locale);
    default:
      return labelize(reason);
  }
}

function localizePaneLabel(label: string, locale: Locale): string {
  if (label === 'Truth') return t('watch.truth', {}, locale);
  if (label === 'Red') return t('replay.red', {}, locale);
  if (label === 'Black') return t('replay.black', {}, locale);
  return label;
}

type SeatCell = { row: HTMLElement; clock: HTMLElement };

function seatCell(name: string): SeatCell {
  const row = document.createElement('div');
  row.className = 'replay-clock-row';
  const label = document.createElement('span');
  label.className = 'replay-clock-side';
  label.textContent = name;
  const clock = document.createElement('span');
  clock.className = 'replay-clock-time';
  row.append(label, clock);
  return { row, clock };
}

// A variant-agnostic move list from a tenant postgame's timeline: one entry per
// move event (`ply` 1-based, matching currentPly), labeled by from-to coordinates
// (the `${from}-${to}` convention the tenant postgame reviews use). Drop moves
// (no `from`) fall back to the destination square. Entries without a `move`
// (terminal events) are skipped.
function buildTenantMoveEntries(postgame: WatchPostgameMeta): MoveListEntry[] {
  const entries: MoveListEntry[] = [];
  for (const event of postgame.timeline ?? []) {
    const move = event.move;
    if (!move) continue;
    const from = typeof move.from === 'string' ? move.from : '';
    const to = typeof move.to === 'string' ? move.to : '';
    if (!from && !to) continue;
    entries.push({
      ply: typeof event.ply === 'number' ? event.ply : entries.length + 1,
      label: from && to ? `${from}-${to}` : to || from,
    });
  }
  return entries;
}

function controlButton(symbol: string, aria: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'replay-button';
  button.textContent = symbol;
  button.setAttribute('aria-label', aria);
  return button;
}

export async function mountTenantWatchReplay<
  Postgame extends WatchPostgameMeta,
  View,
  ViewKey extends string,
>(
  root: HTMLElement,
  roomId: string,
  options: TenantWatchReplayOptions,
  adapter: TenantWatchAdapter<Postgame, View, ViewKey>,
): Promise<ReplayHandle> {
  adapter.installStyles();
  const autoplay = options.autoplay ?? true;
  const locale = options.locale ?? currentLocale();
  const compact = options.compact === true;
  const onGameEnd = options.onGameEnd;
  const namesByRoomId = options.namesByRoomId;
  const onPlyChange = options.onPlyChange;
  // Guards a single onPlyChange fire per distinct ply (sync also runs on flips /
  // reveal toggles, which don't move the ply).
  let lastNotifiedPly: number | null = null;

  let activeId = roomId;
  let destroyed = false;
  let timer: number | null = null;
  let paused = !autoplay;
  // Guards a single onGameEnd fire per game so the loop hold can't re-enter it.
  let endFired = false;

  // Per-game render state, rebuilt on each loadGame.
  let boardTargets: Array<{ pane: ReplayPaneHandle; key: ViewKey }> = [];
  let controls: ControlRefs | null = null;
  let seatCells: { red: SeatCell; black: SeatCell } | null = null;
  // Static initial time per side; null when untimed (the tenant postgame payload
  // carries no dense clock series, so there is no continuous countdown).
  let initialClock: { red: number; black: number } | null = null;
  let maxPly = 0;
  let currentPly = 0;
  // The ply the previous sync rendered; a one-ply delta animates the step
  // (adapter.animateMove). Null right after a (re)load so the first paint of a
  // game never glides.
  let lastSyncedPly: number | null = null;
  let boardOrientation: 'red' | 'black' = 'red';
  let activePostgame: Postgame | null = null;
  // Default to the as-played (hidden) board when the tenant supports reveal.
  let revealed = false;
  let revealBtn: HTMLButtonElement | null = null;
  // Compact showcase seats (player name + real reconstructed clock), rebuilt per
  // game; `side` maps each seat to the first(red)/second(black) clock slot.
  let compactSeats: {
    top: { row: HTMLElement; clockEl: HTMLElement; side: 'first' | 'second' };
    bottom: { row: HTMLElement; clockEl: HTMLElement; side: 'first' | 'second' };
  } | null = null;
  // Vertical reserve strips flanking the board for drop/reserve variants
  // (adapter.sidedCaptures); null for board-only variants (captures ride the pane).
  let compactSideStrips: { left: HTMLElement; right: HTMLElement } | null = null;
  let compactClocks: ShowcaseClockPair[] | null = null;
  let moveDelays: number[] | null = null;
  let compactIncrementMs = 0;
  // Continuous drain of the mover's clock between ply snapshots (see tickCompactClock).
  let clockAnim: {
    side: 'first' | 'second';
    startVal: number;
    floorVal: number;
    shownAt: number;
    windowMs: number;
  } | null = null;
  let clockTickTimer: number | null = null;

  const tickCompactClock = (): void => {
    if (!compactSeats || !clockAnim) return;
    const fraction = Math.min((Date.now() - clockAnim.shownAt) / clockAnim.windowMs, 1);
    const shown = Math.max(
      0,
      clockAnim.startVal - (clockAnim.startVal - clockAnim.floorVal) * fraction,
    );
    const seat = compactSeats.top.side === clockAnim.side ? compactSeats.top : compactSeats.bottom;
    seat.clockEl.textContent = formatClock(shown);
  };

  const compactSeatRow = (name: string): { row: HTMLElement; clockEl: HTMLElement } => {
    const row = document.createElement('div');
    row.className = 'showcase-seat';
    const nameEl = document.createElement('span');
    nameEl.className = 'showcase-seat-name';
    nameEl.textContent = name;
    const clockEl = document.createElement('span');
    clockEl.className = 'showcase-seat-clock';
    row.append(nameEl, clockEl);
    return { row, clockEl };
  };

  // Lichess convention: a player's captured material sits next to that player.
  const renderPaneCaptures = (
    pane: ReplayPaneHandle,
    view: View,
    bottomColor: 'red' | 'black',
  ): void => {
    const topColor: 'red' | 'black' = bottomColor === 'red' ? 'black' : 'red';
    // Reset before each per-ply re-render: the family fill helpers append a row
    // rather than replace, so without this the rows accumulate across plies as the
    // TV auto-advances (a fixed-height strip used to hide it by clipping).
    pane.topCapturesEl.replaceChildren();
    pane.capturesEl.replaceChildren();
    adapter.fillCaptures(pane.topCapturesEl, view, topColor);
    adapter.fillCaptures(pane.capturesEl, view, bottomColor);
  };

  const clearTimer = (): void => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  const sync = (): void => {
    if (!activePostgame) return;
    // Exactly one ply moved since the last sync: glide the step. Flips, reveal
    // toggles, jumps, and the first paint (lastSyncedPly null) stay discrete.
    const stepDelta = lastSyncedPly === null ? 0 : currentPly - lastSyncedPly;
    const animatedPrevPly = Math.abs(stepDelta) === 1 ? lastSyncedPly : null;
    for (const target of boardTargets) {
      const key = adapter.reveal
        ? ((revealed ? adapter.reveal.truthKey : adapter.reveal.hiddenKey) as ViewKey)
        : target.key;
      // Fall back to the pane's own key if the chosen view is missing (e.g. a game
      // stored without per-color histories): better a revealed board than blank.
      const view =
        adapter.viewAtPly(activePostgame, key, currentPly) ??
        adapter.viewAtPly(activePostgame, target.key, currentPly);
      if (view) {
        target.pane.boardEl.innerHTML = adapter.renderBoard(view, boardOrientation, key);
        if (adapter.animateMove && animatedPrevPly !== null) {
          const prevView =
            adapter.viewAtPly(activePostgame, key, animatedPrevPly) ??
            adapter.viewAtPly(activePostgame, target.key, animatedPrevPly);
          adapter.animateMove(
            target.pane.boardEl,
            view,
            prevView,
            stepDelta > 0 ? 'forward' : 'back',
            boardOrientation,
            key,
          );
        }
        if (compactSideStrips) {
          // Reserve strips: opponent's hand on the left, the oriented side's on
          // the right (each below its own player).
          const topColor: 'red' | 'black' = boardOrientation === 'red' ? 'black' : 'red';
          compactSideStrips.left.replaceChildren();
          compactSideStrips.right.replaceChildren();
          adapter.fillCaptures(compactSideStrips.left, view, topColor);
          adapter.fillCaptures(compactSideStrips.right, view, boardOrientation);
        } else if (!compact) {
          // Watch (full TV) keeps captures on the pane; compact non-drop shows none.
          renderPaneCaptures(target.pane, view, boardOrientation);
        }
      }
    }
    if (compactSeats) {
      // At the final ply the clocks give way to the result (1 / 0 / ½) for the
      // hold; earlier plies show the reconstructed clocks (toggles also clear the
      // result state when a loop restarts the same game at ply 0).
      const atGameEnd = maxPly > 0 && currentPly >= maxPly;
      const marks = atGameEnd ? showcaseResultMarks(activePostgame.game.result) : null;
      const winner =
        marks === null || marks.first === marks.second
          ? null
          : marks.first === '1'
            ? 'first'
            : 'second';
      for (const seat of [compactSeats.top, compactSeats.bottom]) {
        if (marks) {
          seat.clockEl.textContent = marks[seat.side];
        } else if (compactClocks) {
          const at = compactClocks[Math.min(currentPly, compactClocks.length - 1)]!;
          seat.clockEl.textContent = formatClock(at[seat.side]);
        }
        seat.clockEl.classList.toggle('showcase-seat-result', marks !== null);
        seat.row.classList.toggle('result-win', seat.side === winner);
      }
      // Red moves first, so an even ply leaves Red (first) to move; no active side
      // once the game has ended.
      const toMove: 'first' | 'second' | null =
        currentPly >= maxPly ? null : currentPly % 2 === 0 ? 'first' : 'second';
      compactSeats.top.row.classList.toggle('active', toMove === compactSeats.top.side);
      compactSeats.bottom.row.classList.toggle('active', toMove === compactSeats.bottom.side);
      // Arm the live tick: drain the mover's clock from this ply's value toward the
      // value just before the increment it earns on completing the move, over the
      // real move-playback window.
      if (toMove && compactClocks && moveDelays) {
        const startVal = compactClocks[currentPly]?.[toMove] ?? 0;
        const nextVal = compactClocks[currentPly + 1]?.[toMove];
        clockAnim = {
          side: toMove,
          startVal,
          floorVal: nextVal === undefined ? startVal : Math.max(0, nextVal - compactIncrementMs),
          shownAt: Date.now(),
          windowMs: moveDelays[currentPly + 1] ?? SHOWCASE_MIN_MOVE_MS,
        };
      } else {
        clockAnim = null;
      }
    }
    if (controls) {
      const result =
        currentPly >= maxPly
          ? localizeResultLabel(
              adapter.resultLabel?.(activePostgame.game.result, activePostgame),
              activePostgame.game.result,
              locale,
            )
          : '';
      controls.plyLabel.textContent = result
        ? t('watch.plyProgressResult', { current: currentPly, total: maxPly, result }, locale)
        : t('watch.plyProgress', { current: currentPly, total: maxPly }, locale);
      controls.first.disabled = currentPly <= 0;
      controls.prev.disabled = currentPly <= 0;
      controls.next.disabled = currentPly >= maxPly;
      controls.last.disabled = currentPly >= maxPly;
    }

    // Red moves first, so after an even ply Red is to move; no active side once
    // the game has ended.
    const toMove = currentPly >= maxPly ? null : currentPly % 2 === 0 ? 'red' : 'black';
    if (seatCells) {
      if (initialClock) {
        seatCells.red.clock.textContent = formatClock(initialClock.red);
        seatCells.black.clock.textContent = formatClock(initialClock.black);
      }
      seatCells.red.row.classList.toggle('active', toMove === 'red');
      seatCells.black.row.classList.toggle('active', toMove === 'black');
    }
    lastSyncedPly = currentPly;
    if (onPlyChange && lastNotifiedPly !== currentPly) {
      lastNotifiedPly = currentPly;
      onPlyChange(currentPly, maxPly);
    }
  };

  const scheduleAuto = (): void => {
    if (paused || destroyed || maxPly <= 0) return;
    clearTimer();
    const atEnd = currentPly >= maxPly;
    timer = window.setTimeout(
      () => {
        if (destroyed) return;
        if (atEnd) {
          // Showcase mode hands off to the outer controller instead of replaying
          // the same game. Watch (no onGameEnd) loops the single game as before.
          if (onGameEnd) {
            if (!endFired) {
              endFired = true;
              onGameEnd();
            }
            return;
          }
          currentPly = 0;
        } else {
          currentPly += 1;
        }
        sync();
        scheduleAuto();
      },
      atEnd
        ? onGameEnd
          ? SHOWCASE_END_HOLD_MS
          : AUTO_PLAY_LOOP_HOLD_MS
        : (moveDelays?.[currentPly + 1] ?? AUTO_PLAY_PLY_MS),
    );
  };

  const setPaused = (next: boolean): void => {
    paused = next;
    if (controls)
      controls.play.textContent = paused
        ? `▶ ${t('watch.play', {}, locale)}`
        : `⏸ ${t('watch.pause', {}, locale)}`;
    if (paused) clearTimer();
    else scheduleAuto();
  };

  // A manual step pauses auto-play (TV you can pause and scrub).
  const manualJump = (ply: number): void => {
    setPaused(true);
    currentPly = Math.max(0, Math.min(maxPly, ply));
    sync();
  };

  const toggleReveal = (): void => {
    if (!adapter.reveal) return;
    revealed = !revealed;
    if (revealBtn)
      revealBtn.textContent = revealed
        ? t('watch.hide', {}, locale)
        : t('watch.reveal', {}, locale);
    sync();
  };

  // The single board to show in compact showcase mode. Honors hidden info:
  //  - reveal tenants (jieqi): the as-played masked board (hiddenKey), never truth;
  //  - per-color hidden info (dark-xiangqi fog): one random side's own POV, stable
  //    per room, oriented to that side;
  //  - perfect-info / symmetric (banqi, jungle, mini-open): the truth board.
  // The showcase only ever replays FINISHED games (whose truth is already public
  // via the reveal gate), so this is a product choice — show the fog off — not a
  // redaction boundary.
  const pickCompactTarget = (game: Postgame): { key: ViewKey; orientation: 'red' | 'black' } => {
    const choice = pickCompactViewKey({
      roomId: activeId,
      entries: adapter.viewEntries(game),
      paneKind: adapter.paneKind,
      reveal: adapter.reveal,
    });
    return { key: choice.key, orientation: choice.side === 'second' ? 'black' : 'red' };
  };

  const buildGame = (postgame: Postgame): void => {
    activePostgame = postgame;
    maxPly = adapter.maxPly(postgame);
    currentPly = 0;
    lastSyncedPly = null;
    lastNotifiedPly = null;
    paused = !autoplay;
    boardOrientation = 'red';
    const initialMs = postgame.game.initialMs ?? postgame.state.timeControl?.initialMs ?? null;
    initialClock = initialMs === null ? null : { red: initialMs, black: initialMs };
    endFired = false;

    // Compact showcase: a single board framed by a player name + real clock on
    // each side (no control-bar/ply-line).
    if (compact) {
      const target = pickCompactTarget(postgame);
      boardOrientation = target.orientation;
      // Compact never uses the pane's top/bottom capture rows: drop/reserve
      // variants show side strips, and every other variant shows no captures here.
      const sided = adapter.sidedCaptures === true;
      const pane = createPane('', adapter.paneKind(target.key), false, 'split');
      boardTargets = [{ pane, key: target.key }];
      controls = null;
      seatCells = null;

      // Reconstruct the players' real remaining clocks from the move timestamps
      // (the generic tenant postgames carry no dense clock series). Null when
      // untimed or timeline-less: seats then show names only.
      const clockInitialMs = initialMs ?? postgame.state.timeControl?.initialMs ?? null;
      const clockIncrementMs =
        postgame.game.incrementMs ?? postgame.state.timeControl?.incrementMs ?? 0;
      const moves = (postgame.timeline ?? []).flatMap((event) =>
        typeof event.color === 'string' && typeof event.ply === 'number'
          ? [{ at: event.at, color: event.color, ply: event.ply }]
          : [],
      );
      compactClocks =
        clockInitialMs !== null && moves.length > 0
          ? reconstructShowcaseClocks({
              moves,
              startedAt: null,
              initialMs: clockInitialMs,
              incrementMs: clockIncrementMs,
              firstColor: 'red',
            })
          : null;
      compactIncrementMs = clockIncrementMs;
      // Play each move at its real recorded duration (clamped), and drain the
      // mover's clock across that window (see sync/tickCompactClock).
      moveDelays =
        moves.length > 0
          ? reconstructMoveDelays({
              moves,
              minMs: SHOWCASE_MIN_MOVE_MS,
              maxMs: SHOWCASE_MAX_MOVE_MS,
            })
          : null;

      // Bottom seat = the side the board is oriented to; top = the opponent.
      // `first` is the red/first-mover clock slot.
      const names = namesByRoomId?.[activeId];
      const bottomSide: 'first' | 'second' = boardOrientation === 'red' ? 'first' : 'second';
      const topSide: 'first' | 'second' = bottomSide === 'first' ? 'second' : 'first';
      const nameFor = (side: 'first' | 'second'): string =>
        names
          ? side === 'first'
            ? names.first
            : names.second
          : side === 'first'
            ? t('replay.red', {}, locale)
            : t('replay.black', {}, locale);
      const topSeat = compactSeatRow(nameFor(topSide));
      const bottomSeat = compactSeatRow(nameFor(bottomSide));
      compactSeats = {
        top: { row: topSeat.row, clockEl: topSeat.clockEl, side: topSide },
        bottom: { row: bottomSeat.row, clockEl: bottomSeat.clockEl, side: bottomSide },
      };

      // Flank the board with vertical reserve strips for drop/reserve variants;
      // otherwise the board pane stands alone (captures ride the pane top/bottom).
      let boardRow: HTMLElement = pane.el;
      if (sided) {
        const left = document.createElement('div');
        left.className = 'showcase-reserve showcase-reserve-left';
        const right = document.createElement('div');
        right.className = 'showcase-reserve showcase-reserve-right';
        compactSideStrips = { left, right };
        boardRow = document.createElement('div');
        boardRow.className = 'showcase-board-row';
        boardRow.append(left, pane.el, right);
      } else {
        compactSideStrips = null;
      }

      const layout = document.createElement('div');
      layout.className = 'replay-layout replay-layout-solo';
      layout.append(topSeat.row, boardRow, bottomSeat.row);
      root.replaceChildren(layout);
      sync();
      scheduleAuto();
      if (compactClocks && clockTickTimer === null) {
        clockTickTimer = window.setInterval(tickCompactClock, SHOWCASE_CLOCK_TICK_MS);
      }
      return;
    }

    const header = createGameHeaderStrip();
    header.title.textContent = matchupLabel(postgame.game.mode, locale);
    const chip = document.createElement('span');
    chip.className = `replay-game-header-result-chip replay-game-header-result-${resultChipKind(postgame.game.result)}`;
    chip.textContent = localizeResultLabel(
      adapter.resultLabel?.(postgame.game.result, postgame),
      postgame.game.result,
      locale,
    );
    const detail = document.createElement('span');
    detail.className = 'replay-game-header-result-detail';
    detail.textContent = t(
      'watch.byReason',
      { reason: terminationLabel(postgame.game.termination, locale) },
      locale,
    );
    header.result.append(chip, detail);
    const plies = document.createElement('span');
    plies.textContent = t('watch.plyCount', { count: postgame.game.plyCount }, locale);
    const sep = document.createElement('span');
    sep.className = 'replay-game-header-sep';
    sep.textContent = '·';
    const clock = document.createElement('span');
    clock.textContent = timeControlLabel(postgame, locale);
    const sepRated = document.createElement('span');
    sepRated.className = 'replay-game-header-sep';
    sepRated.textContent = '·';
    const rated = document.createElement('span');
    rated.textContent = postgame.game.rated
      ? t('play.rated', {}, locale)
      : t('play.casual', {}, locale);
    header.meta.append(plies, sep, clock, sepRated, rated);
    // The tenant postgame payloads carry no seat-name fields, so the cells fall
    // back to the color labels (matchup name lives in the header title).
    const redCell = seatCell(t('replay.red', {}, locale));
    const blackCell = seatCell(t('replay.black', {}, locale));
    header.whiteCell.append(redCell.row);
    header.blackCell.append(blackCell.row);
    seatCells = { red: redCell, black: blackCell };

    const layout = document.createElement('div');
    layout.className = 'replay-layout replay-layout-all';
    boardTargets = [];
    for (const entry of adapter.viewEntries(postgame)) {
      // The center board reads "Truth" on watch, matching the dark-chess TV (the
      // postgame review keeps its own "Server truth" label).
      const label = localizePaneLabel(
        adapter.paneKind(entry.key) === 'truth' ? 'Truth' : entry.label,
        locale,
      );
      const pane = createPane(label, adapter.paneKind(entry.key), true, 'split');
      boardTargets.push({ pane, key: entry.key });
      layout.append(pane.el);
    }

    // Control bar below the boards (matches the dark-chess watch: no move list).
    const bar = document.createElement('div');
    bar.className = 'replay-control-bar';
    const first = controlButton('|<', t('watch.firstMove', {}, locale));
    const prev = controlButton('<', t('watch.previousMove', {}, locale));
    const play = controlButton(
      paused ? `▶ ${t('watch.play', {}, locale)}` : `⏸ ${t('watch.pause', {}, locale)}`,
      t('watch.playPause', {}, locale),
    );
    const next = controlButton('>', t('watch.nextMove', {}, locale));
    const last = controlButton('>|', t('watch.lastMove', {}, locale));
    const flip = controlButton('↕', t('watch.flipBoards', {}, locale));
    bar.append(first, prev, play, next, last, flip);
    if (adapter.reveal) {
      revealBtn = controlButton(
        revealed ? t('watch.hide', {}, locale) : t('watch.reveal', {}, locale),
        t('watch.revealHiddenIdentities', {}, locale),
      );
      revealBtn.title = t('watch.revealHiddenIdentitiesShortcut', {}, locale);
      revealBtn.onclick = toggleReveal;
      bar.append(revealBtn);
    }
    const plyLine = document.createElement('div');
    plyLine.className = 'replay-ply-line';
    const plyLabel = document.createElement('span');
    plyLine.append(plyLabel);

    controls = { first, prev, play, next, last, plyLabel };
    first.onclick = () => manualJump(0);
    prev.onclick = () => manualJump(currentPly - 1);
    next.onclick = () => manualJump(currentPly + 1);
    last.onclick = () => manualJump(maxPly);
    play.onclick = () => setPaused(!paused);
    flip.onclick = () => {
      boardOrientation = boardOrientation === 'red' ? 'black' : 'red';
      sync();
    };

    // Append directly to root (no wrapper), exactly like the dark-chess watch, so
    // the header/boards/control-bar spacing and alignment are inherited.
    root.replaceChildren(header.el, layout, bar, plyLine);

    sync();
    scheduleAuto();
  };

  // Single-entry prefetch cache: the showcase cycler warms the next same-variant
  // game's postgame while the current one plays, so advancing is instant. A
  // mismatched or failed prefetch just falls back to a fresh fetch, so it can never
  // surface the wrong game (or hidden info — it fetches the exact same postgame the
  // load would).
  let prefetched: { roomId: string; promise: ReturnType<typeof adapter.loadPostgame> } | null =
    null;

  const load = async (nextId: string): Promise<void> => {
    clearTimer();
    activeId = nextId;
    let result: Awaited<ReturnType<typeof adapter.loadPostgame>>;
    if (prefetched && prefetched.roomId === nextId) {
      const cached = prefetched.promise;
      prefetched = null;
      try {
        result = await cached;
      } catch {
        result = await adapter.loadPostgame(nextId);
      }
    } else {
      prefetched = null; // discard a stale prefetch (e.g. a jumpNow pool swap)
      result = await adapter.loadPostgame(nextId);
    }
    if (destroyed) return;
    if (!result.ok) {
      const notice = document.createElement('p');
      notice.className = 'watch-empty';
      notice.textContent = t('watch.gameLoadFailed', {}, locale);
      root.replaceChildren(notice);
      return;
    }
    buildGame(result.postgame);
  };

  // Keyboard reveal toggle (`h`), only when the tenant supports reveal.
  const onKeydown = (event: KeyboardEvent): void => {
    if (!adapter.reveal || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT')
    ) {
      return;
    }
    if (event.key === 'h' || event.key === 'H') {
      event.preventDefault();
      toggleReveal();
    }
  };
  if (adapter.reveal && !compact) window.addEventListener('keydown', onKeydown);
  const onAppearance = (): void => sync();
  if (adapter.appearanceEvent) window.addEventListener(adapter.appearanceEvent, onAppearance);

  // The view entry (and board orientation) for a requested perspective, resolved
  // through the adapter's paneKind. Orient a side view to that side; truth keeps
  // the red/first orientation. Null when the loaded game has no such view.
  const povTarget = (
    kind: 'white' | 'truth' | 'black',
  ): { key: ViewKey; orientation: 'red' | 'black' } | null => {
    if (!activePostgame) return null;
    for (const entry of adapter.viewEntries(activePostgame)) {
      if (adapter.paneKind(entry.key) === kind) {
        return { key: entry.key, orientation: kind === 'black' ? 'black' : 'red' };
      }
    }
    return null;
  };

  await load(roomId);

  return {
    activeSampleId: () => activeId,
    destroy: () => {
      destroyed = true;
      clearTimer();
      if (clockTickTimer !== null) {
        window.clearInterval(clockTickTimer);
        clockTickTimer = null;
      }
      if (adapter.reveal && !compact) window.removeEventListener('keydown', onKeydown);
      if (adapter.appearanceEvent) {
        window.removeEventListener(adapter.appearanceEvent, onAppearance);
      }
      root.replaceChildren();
    },
    loadGame: async (sampleId: string) => {
      await load(sampleId);
    },
    plyCount: () => maxPly,
    // manualJump already pauses autoplay, clamps, and re-syncs (which fires
    // onPlyChange). The /watch move list + scrubber drive the board through it.
    jumpToPly: (ply: number) => manualJump(ply),
    moveEntries: () => (activePostgame ? buildTenantMoveEntries(activePostgame) : []),
    // Re-point the single compact board at the view whose paneKind matches, then
    // re-render at the current ply (no glide: pov swap doesn't move the ply). A
    // kind the loaded game doesn't carry is a no-op. HIDDEN-INFO NOTE: watch only
    // serves COMPLETED games, so every per-side view is that player's own
    // now-public past view — showing it post-reveal leaks nothing new.
    setPov: (kind: 'white' | 'truth' | 'black') => {
      const target = povTarget(kind);
      if (!target || boardTargets.length === 0) return;
      boardTargets[0]!.key = target.key;
      boardOrientation = target.orientation;
      sync();
    },
    availablePovs: () => {
      if (!activePostgame) return [];
      const kinds = new Set<'white' | 'truth' | 'black'>();
      for (const entry of adapter.viewEntries(activePostgame)) {
        kinds.add(adapter.paneKind(entry.key));
      }
      return [...kinds];
    },
    prefetchGame: (nextId: string) => {
      if (destroyed || activeId === nextId || prefetched?.roomId === nextId) return;
      const promise = adapter.loadPostgame(nextId);
      // Swallow rejections so an unused/failed prefetch never becomes an unhandled
      // rejection; load() re-fetches on a cache miss anyway.
      void promise.catch(() => undefined);
      prefetched = { roomId: nextId, promise };
    },
    // Watch drives game selection through the queue; no internal auto-advance pool.
    updateLoopPool: () => {},
  };
}
