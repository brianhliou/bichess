// Mistboard TV renderer for Crossroads Chess. The generic chess replay path
// only understands standard chess GameEvent logs; Crossroads has its own
// runtime event family, so watch uses the postgame API and SVG board renderer.
import type { CrossroadsChessColor } from '@mistboard/game';
import {
  type CrossroadsChessPostgameResponse,
  loadCrossroadsChessPostgame,
  postgameReplayMaxPly,
  postgameViewAtPly,
} from './crossroads-chess-postgame.js';
import {
  readCrossroadsChessAppearance,
  renderCrossroadsChessBoardSvg,
} from './crossroads-chess-render.js';
import type { GameMeta, ReplayHandle } from './replay.js';
import { createPane, type ReplayPaneHandle } from './replay-board.js';
import { createGameHeaderStrip } from './replay-meta.js';
import { boardAppearanceChangedEvent } from './theme.js';
import { formatClock } from './web-utils.js';

const AUTO_PLAY_PLY_MS = 1100;
const AUTO_PLAY_LOOP_HOLD_MS = 2600;

export type CrossroadsChessWatchReplayOptions = {
  autoplay?: boolean;
  metadataByRoomId?: Record<string, GameMeta>;
  /** Fires after a distinct autoplay or manual ply change. */
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

type SeatCell = { row: HTMLElement; clock: HTMLElement };

function resultChipKind(result: string): 'white' | 'red' | 'draw' {
  if (result === 'white-wins') return 'white';
  if (result === 'red-wins') return 'red';
  return 'draw';
}

function resultLabel(result: string): string {
  if (result === 'white-wins') return 'White wins';
  if (result === 'red-wins') return 'Red wins';
  return 'Draw';
}

function labelize(value: string): string {
  const spaced = value.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function timeControlLabel(postgame: CrossroadsChessPostgameResponse): string {
  const tc = postgame.game.timeControl ?? postgame.state.timeControl;
  if (!tc) return 'Untimed';
  return `${Math.round(tc.initialMs / 60000)}+${Math.round(tc.incrementMs / 1000)}`;
}

function matchupLabel(mode: string): string {
  if (mode === 'pve') return 'Human vs engine';
  if (mode === 'eve') return 'Engine vs engine';
  return 'Human vs human';
}

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

function clockSeries(
  postgame: CrossroadsChessPostgameResponse,
): Array<Record<CrossroadsChessColor, number>> | null {
  const tc = postgame.game.timeControl ?? postgame.state.timeControl;
  if (!tc) return null;
  const raw = postgame.clocks ?? [];
  const maxPly = postgameReplayMaxPly(postgame);
  const series: Array<Record<CrossroadsChessColor, number>> = [];
  let last: Record<CrossroadsChessColor, number> = raw[0] ?? {
    red: tc.initialMs,
    white: tc.initialMs,
  };
  for (let ply = 0; ply <= maxPly; ply += 1) {
    last = raw[ply] ?? last;
    series[ply] = last;
  }
  return series;
}

function controlButton(symbol: string, aria: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'replay-button';
  button.textContent = symbol;
  button.setAttribute('aria-label', aria);
  return button;
}

export async function mountCrossroadsChessWatchReplay(
  root: HTMLElement,
  roomId: string,
  options: CrossroadsChessWatchReplayOptions,
): Promise<ReplayHandle> {
  const autoplay = options.autoplay ?? true;
  const onPlyChange = options.onPlyChange;

  let activeId = roomId;
  let destroyed = false;
  let timer: number | null = null;
  let paused = !autoplay;

  let pane: ReplayPaneHandle | null = null;
  let controls: ControlRefs | null = null;
  let seatCells: { red: SeatCell; white: SeatCell } | null = null;
  let clocks: Array<Record<CrossroadsChessColor, number>> | null = null;
  let incrementMs = 0;
  let clockAnim: {
    side: CrossroadsChessColor;
    startVal: number;
    floorVal: number;
    shownAt: number;
  } | null = null;
  let clockTickTimer: number | null = null;
  let maxPly = 0;
  let currentPly = 0;
  let lastNotifiedPly: number | null = null;
  let boardOrientation: CrossroadsChessColor = 'white';
  let activePostgame: CrossroadsChessPostgameResponse | null = null;

  const clearTimer = (): void => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  const sync = (): void => {
    if (!activePostgame || !controls || !pane) return;
    const view =
      postgameViewAtPly(activePostgame, boardOrientation, currentPly) ?? activePostgame.view;
    pane.boardEl.innerHTML = renderCrossroadsChessBoardSvg(view, {
      perspective: boardOrientation,
      showFog: false,
      ...readCrossroadsChessAppearance(),
    });

    const result = currentPly >= maxPly ? ` - ${resultLabel(activePostgame.game.result)}` : '';
    controls.plyLabel.textContent = `Ply ${currentPly} / ${maxPly}${result}`;
    controls.first.disabled = currentPly <= 0;
    controls.prev.disabled = currentPly <= 0;
    controls.next.disabled = currentPly >= maxPly;
    controls.last.disabled = currentPly >= maxPly;

    const toMove = currentPly >= maxPly ? null : currentPly % 2 === 0 ? 'white' : 'red';
    if (seatCells) {
      if (clocks) {
        const at = clocks[Math.min(currentPly, clocks.length - 1)] ?? clocks[0]!;
        seatCells.white.clock.textContent = formatClock(at.white);
        seatCells.red.clock.textContent = formatClock(at.red);
      }
      seatCells.white.row.classList.toggle('active', toMove === 'white');
      seatCells.red.row.classList.toggle('active', toMove === 'red');
    }
    if (toMove && clocks) {
      const startVal = clocks[Math.min(currentPly, clocks.length - 1)]?.[toMove] ?? 0;
      const nextVal = clocks[currentPly + 1]?.[toMove];
      clockAnim = {
        side: toMove,
        startVal,
        floorVal: nextVal === undefined ? startVal : Math.max(0, nextVal - incrementMs),
        shownAt: Date.now(),
      };
    } else {
      clockAnim = null;
    }
    if (onPlyChange && lastNotifiedPly !== currentPly) {
      lastNotifiedPly = currentPly;
      onPlyChange(currentPly, maxPly);
    }
  };

  const tickClock = (): void => {
    if (!seatCells || !clockAnim) return;
    const fraction = Math.min((Date.now() - clockAnim.shownAt) / AUTO_PLAY_PLY_MS, 1);
    const displayed = Math.max(
      0,
      clockAnim.startVal - (clockAnim.startVal - clockAnim.floorVal) * fraction,
    );
    seatCells[clockAnim.side].clock.textContent = formatClock(displayed);
  };

  const scheduleAuto = (): void => {
    if (paused || destroyed || maxPly <= 0) return;
    clearTimer();
    const atEnd = currentPly >= maxPly;
    timer = window.setTimeout(
      () => {
        if (destroyed) return;
        currentPly = atEnd ? 0 : currentPly + 1;
        sync();
        scheduleAuto();
      },
      atEnd ? AUTO_PLAY_LOOP_HOLD_MS : AUTO_PLAY_PLY_MS,
    );
  };

  const setPaused = (next: boolean): void => {
    paused = next;
    if (controls) controls.play.textContent = paused ? '▶ Play' : '⏸ Pause';
    if (paused) clearTimer();
    else scheduleAuto();
  };

  const manualJump = (ply: number): void => {
    setPaused(true);
    currentPly = Math.max(0, Math.min(maxPly, ply));
    sync();
  };

  const buildGame = (postgame: CrossroadsChessPostgameResponse): void => {
    activePostgame = postgame;
    maxPly = postgameReplayMaxPly(postgame);
    currentPly = 0;
    lastNotifiedPly = null;
    paused = !autoplay;
    boardOrientation = 'white';
    incrementMs = (postgame.game.timeControl ?? postgame.state.timeControl)?.incrementMs ?? 0;

    const header = createGameHeaderStrip();
    header.title.textContent = matchupLabel(postgame.game.mode);
    const chip = document.createElement('span');
    chip.className = `replay-game-header-result-chip replay-game-header-result-${resultChipKind(postgame.game.result)}`;
    chip.textContent = resultLabel(postgame.game.result);
    const detail = document.createElement('span');
    detail.className = 'replay-game-header-result-detail';
    detail.textContent = `by ${labelize(postgame.game.termination)}`;
    header.result.append(chip, detail);
    const plies = document.createElement('span');
    plies.textContent = `${postgame.game.plyCount} plies`;
    const sep = document.createElement('span');
    sep.className = 'replay-game-header-sep';
    sep.textContent = '·';
    const clock = document.createElement('span');
    clock.textContent = timeControlLabel(postgame);
    const sepRated = document.createElement('span');
    sepRated.className = 'replay-game-header-sep';
    sepRated.textContent = '·';
    const rated = document.createElement('span');
    rated.textContent = postgame.game.rated ? 'Rated' : 'Casual';
    header.meta.append(plies, sep, clock, sepRated, rated);
    const whiteCell = seatCell(postgame.game.whiteName || 'White');
    const redCell = seatCell(postgame.game.redName || 'Red');
    header.whiteCell.append(whiteCell.row);
    header.blackCell.append(redCell.row);
    seatCells = { red: redCell, white: whiteCell };
    clocks = clockSeries(postgame);

    const layout = document.createElement('div');
    layout.className = 'replay-layout replay-layout-crossroads watch-crossroads-layout';
    // Single board on the watch page; a "Full board" pane label is redundant
    // with the matchup header above, so drop it (also reclaims vertical room).
    pane = createPane('', 'truth', false);
    pane.labelEl.remove();
    pane.boardEl.classList.add('crossroads-watch-board');
    layout.append(pane.el);

    const bar = document.createElement('div');
    bar.className = 'replay-control-bar';
    const first = controlButton('|<', 'First move');
    const prev = controlButton('<', 'Previous move');
    const play = controlButton(paused ? '▶ Play' : '⏸ Pause', 'Play / pause');
    const next = controlButton('>', 'Next move');
    const last = controlButton('>|', 'Last move');
    const flip = controlButton('↕ Flip', 'Flip board');
    bar.append(first, prev, play, next, last, flip);
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
      boardOrientation = boardOrientation === 'white' ? 'red' : 'white';
      sync();
    };

    root.replaceChildren(header.el, layout, bar, plyLine);

    sync();
    scheduleAuto();
    if (clockTickTimer === null) clockTickTimer = window.setInterval(tickClock, 100);
  };

  const load = async (nextId: string): Promise<void> => {
    clearTimer();
    activeId = nextId;
    const result = await loadCrossroadsChessPostgame(nextId);
    if (destroyed) return;
    if (!result.ok) {
      const notice = document.createElement('p');
      notice.className = 'watch-empty';
      notice.textContent = 'This game could not be loaded.';
      root.replaceChildren(notice);
      return;
    }
    buildGame(result.postgame);
  };

  const syncAppearance = (): void => sync();
  window.addEventListener(boardAppearanceChangedEvent, syncAppearance);

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
      window.removeEventListener(boardAppearanceChangedEvent, syncAppearance);
      root.replaceChildren();
    },
    loadGame: async (sampleId: string) => {
      await load(sampleId);
    },
    jumpToPly: (ply: number) => manualJump(ply),
    plyCount: () => maxPly,
    updateLoopPool: () => {},
  };
}
