import './game-shell.css';
import {
  applyMove,
  createInitialXiangqiState,
  getLegalMovesFrom,
  getPlayerView,
  type XiangqiCannonVisionMode,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiSquare,
} from '@mistboard/game';
import { initLiveSound, playSound } from './live-sound.js';
import type { SoundKind } from './live-state.js';
import { chooseFairMove } from './xiangqi-bot.js';
import {
  buildGodView,
  type CannonTargetMarker,
  type FogStyle,
  renderBoardSvg,
  renderBoardSvgReadOnly,
} from './xiangqi-spike.js';

const CANNON_MODE: XiangqiCannonVisionMode = 'D';
const FOG_STYLE: FogStyle = 'mask';
const CANNON_MARKER: CannonTargetMarker = 'corners';
const AI_MOVE_DELAY_MIN_MS = 260;
const AI_MOVE_DELAY_MAX_MS = 620;

type DemoState = {
  game: XiangqiGameState;
  humanColor: XiangqiColor;
  selection: XiangqiSquare | null;
  history: XiangqiMove[];
  cursor: number;
  note: string | null;
  aiThinking: boolean;
  referenceViewsVisible: boolean;
};

let active: { root: HTMLElement; state: DemoState } | null = null;
let aiTimer: number | null = null;

export function mountXiangqiDemo(root: HTMLElement): void {
  root.classList.add('landing-page', 'xiangqi-demo-route');
  initLiveSound();
  clearAiTimer();
  active = { root, state: freshState(Math.random() < 0.5 ? 'red' : 'black') };
  rerender();
  scheduleAiTurn();
}

function freshState(humanColor: XiangqiColor): DemoState {
  const game = createInitialXiangqiState('xq-demo');
  return {
    game,
    humanColor,
    selection: null,
    history: [],
    cursor: 0,
    note: humanColor === 'black' ? 'AI opens as Red.' : null,
    aiThinking: isAiTurnFor(game, humanColor),
    referenceViewsVisible: false,
  };
}

function gameAtCursor(history: XiangqiMove[], cursor: number): XiangqiGameState {
  let game = createInitialXiangqiState('xq-demo');
  for (let i = 0; i < cursor; i += 1) game = applyMove(game, history[i]);
  return game;
}

function isReplay(state: DemoState): boolean {
  return state.cursor < state.history.length;
}

function isAiTurn(state: DemoState): boolean {
  return isAiTurnFor(state.game, state.humanColor);
}

function isAiTurnFor(game: XiangqiGameState, humanColor: XiangqiColor): boolean {
  return game.status.type === 'playing' && game.status.turn !== humanColor;
}

function canSelect(state: DemoState, square: XiangqiSquare): boolean {
  if (state.game.status.type !== 'playing') return false;
  if (state.game.status.turn !== state.humanColor) return false;
  const piece = state.game.board[square];
  return piece?.color === state.humanColor;
}

function handleSquareClick(state: DemoState, square: XiangqiSquare): DemoState {
  if (isReplay(state)) return state;
  if (isAiTurn(state)) return state;
  if (state.game.status.type !== 'playing') return state;
  if (state.game.status.turn !== state.humanColor) return state;

  if (!state.selection) {
    if (!canSelect(state, square)) return state;
    return { ...state, selection: square, note: null };
  }

  if (state.selection === square) return { ...state, selection: null };

  const legal = getLegalMovesFrom(state.game, state.selection);
  const move = legal.find((m) => m.to === square);
  if (!move) {
    if (canSelect(state, square)) return { ...state, selection: square, note: null };
    return { ...state, selection: null };
  }

  const afterHuman = applyMove(state.game, move);
  playXiangqiMoveSound(state.game, afterHuman, move, state.humanColor, state.humanColor);
  const next = {
    ...state,
    game: afterHuman,
    selection: null,
    history: [...state.history, move],
    cursor: state.history.length + 1,
    note: `You moved ${move.from}-${move.to}.`,
    aiThinking: isAiTurnFor(afterHuman, state.humanColor),
    referenceViewsVisible: state.referenceViewsVisible || afterHuman.status.type === 'finished',
  };
  return next;
}

function rerender(): void {
  if (!active) return;
  const { root, state } = active;
  const view = getPlayerView(state.game, state.humanColor, CANNON_MODE);
  const aiColor = opposite(state.humanColor);
  const boardSvg = isReplay(state)
    ? renderBoardSvgReadOnly(view, state.humanColor, state.game, FOG_STYLE, 'demo', CANNON_MARKER)
    : renderBoardSvg(
        view,
        state.humanColor,
        state.game,
        state.selection,
        FOG_STYLE,
        'demo',
        CANNON_MARKER,
      );

  root.replaceChildren();
  const page = document.createElement('main');
  page.className = 'xiangqi-demo';
  page.innerHTML = `
    <style>${STYLE}</style>
    <div class="xqd-shell">
      <header class="xqd-header">
        <div>
          <p class="xqd-kicker">Private demo</p>
          <h1>Fog Xiangqi</h1>
        </div>
        <a class="xqd-rules-link" href="/rules/fog-xiangqi">Rules</a>
      </header>
      <section class="xqd-game" aria-label="Fog Xiangqi game">
        <aside class="xqd-sidebar">
          <section class="xqd-panel" aria-label="Game controls">
            <div class="xqd-side" role="group" aria-label="Choose side">
              ${sideButton(state, 'red')}
              ${sideButton(state, 'black')}
            </div>
            <button class="xqd-button" data-action="reset">Reset</button>
          </section>
          <section class="xqd-status" aria-live="polite">
            <div class="xqd-status-main">${statusText(state)}</div>
            <div class="xqd-status-sub">You: ${labelColor(state.humanColor)} · AI: ${labelColor(aiColor)} · ${state.history.length} ply</div>
            ${noteHtml(state)}
          </section>
          ${movesHtml(state)}
        </aside>
        <div class="xqd-board-wrap">
          ${boardSvg}
        </div>
      </section>
      ${state.referenceViewsVisible ? viewsHtml(state) : ''}
    </div>
  `;
  root.append(page);
  attachHandlers(page);
}

function viewsHtml(state: DemoState): string {
  const redView = getPlayerView(state.game, 'red', CANNON_MODE);
  const truthView = buildGodView(state.game, CANNON_MODE);
  const blackView = getPlayerView(state.game, 'black', CANNON_MODE);
  const board = (label: string, view: ReturnType<typeof getPlayerView>, orient: XiangqiColor) => `
    <div class="xqd-view-card">
      <div class="xqd-view-label">${label}</div>
      ${renderBoardSvgReadOnly(view, orient, state.game, FOG_STYLE, `demo-${label.toLowerCase()}`, CANNON_MARKER)}
    </div>
  `;
  return `
    <section class="xqd-views" aria-label="Red, truth, and Black views">
      <h2>Reference views</h2>
      <div class="xqd-view-grid">
        ${board('Red', redView, 'red')}
        ${board('Truth', truthView, 'red')}
        ${board('Black', blackView, 'black')}
      </div>
    </section>
  `;
}

function movesHtml(state: DemoState): string {
  const rows: string[] = [];
  for (let i = 0; i < state.history.length; i += 2) {
    const moveNumber = i / 2 + 1;
    const redPly = i + 1;
    const blackPly = i + 2;
    rows.push(`
      <li class="xqd-move-row">
        <span class="xqd-move-number">${moveNumber}</span>
        ${moveButton(state.history[i], redPly, state.cursor, 'red')}
        ${moveButton(state.history[i + 1], blackPly, state.cursor, 'black')}
      </li>
    `);
  }
  return `
    <section class="xqd-moves" aria-label="Move list">
      <div class="xqd-moves-head">
        <div class="xqd-moves-title">Moves</div>
        <div class="xqd-replay-controls" aria-label="Replay controls">
          <button class="xqd-replay-button" data-action="ply-prev" aria-label="Previous move"${state.cursor === 0 ? ' disabled' : ''}>‹</button>
          <button class="xqd-replay-button" data-action="ply-next" aria-label="Next move"${state.cursor === state.history.length ? ' disabled' : ''}>›</button>
          <button class="xqd-replay-live" data-action="ply-live"${state.cursor === state.history.length ? ' disabled' : ''}>Live</button>
        </div>
      </div>
      ${
        rows.length > 0
          ? `<ol class="xqd-move-list">${rows.join('')}</ol>`
          : '<div class="xqd-move-empty">No moves yet</div>'
      }
    </section>
  `;
}

function moveButton(
  move: XiangqiMove | undefined,
  ply: number,
  cursor: number,
  color: XiangqiColor,
): string {
  if (!move) return `<span class="xqd-move ${color} empty"></span>`;
  const activeClass = cursor === ply ? ' is-current' : '';
  return `<button class="xqd-move ${color}${activeClass}" data-ply="${ply}" aria-current="${cursor === ply ? 'step' : 'false'}">${formatMove(move)}</button>`;
}

function sideButton(state: DemoState, color: XiangqiColor): string {
  const pressed = state.humanColor === color ? 'true' : 'false';
  const activeClass = state.humanColor === color ? ' is-active' : '';
  return `<button class="xqd-side-button${activeClass}" data-side="${color}" aria-pressed="${pressed}">${labelColor(color)}</button>`;
}

function statusText(state: DemoState): string {
  if (isReplay(state)) return `Replay: ply ${state.cursor}.`;
  if (isAiTurn(state)) return state.aiThinking ? 'AI thinking.' : 'AI move.';
  const { status } = state.game;
  if (status.type === 'finished') {
    if (status.winner)
      return `${labelColor(status.winner)} wins by ${formatReason(status.reason)}.`;
    return `Draw by ${formatReason(status.reason)}.`;
  }
  if (status.type === 'aborted') return 'Game aborted.';
  return status.turn === state.humanColor ? 'Your move.' : 'AI move.';
}

function noteHtml(state: DemoState): string {
  if (isReplay(state)) return '<div class="xqd-note">Tap Live to continue.</div>';
  const text = state.selection ? 'Choose a destination.' : state.note;
  if (!text) return '<div class="xqd-note xqd-note-empty" aria-hidden="true">.</div>';
  return `<div class="xqd-note">${text}</div>`;
}

function labelColor(color: XiangqiColor): string {
  return color === 'red' ? 'Red' : 'Black';
}

function opposite(color: XiangqiColor): XiangqiColor {
  return color === 'red' ? 'black' : 'red';
}

function formatReason(reason: string): string {
  return reason.replace(/_/g, ' ');
}

function formatMove(move: XiangqiMove | undefined): string {
  return move ? `${move.from}-${move.to}` : '';
}

function setCursor(state: DemoState, cursor: number): DemoState {
  const clamped = Math.max(0, Math.min(state.history.length, cursor));
  const game = gameAtCursor(state.history, clamped);
  const live = clamped === state.history.length;
  return {
    ...state,
    game,
    cursor: clamped,
    selection: null,
    note: null,
    aiThinking: live && isAiTurnFor(game, state.humanColor),
  };
}

function clearAiTimer(): void {
  if (aiTimer === null) return;
  window.clearTimeout(aiTimer);
  aiTimer = null;
}

function scheduleAiTurn(): void {
  if (!active) return;
  const state = active.state;
  if (isReplay(state) || !isAiTurn(state)) {
    clearAiTimer();
    return;
  }
  if (aiTimer !== null) return;

  const delay =
    AI_MOVE_DELAY_MIN_MS + Math.random() * (AI_MOVE_DELAY_MAX_MS - AI_MOVE_DELAY_MIN_MS);
  aiTimer = window.setTimeout(() => {
    aiTimer = null;
    if (!active) return;
    const current = active.state;
    if (isReplay(current) || !isAiTurn(current)) return;
    if (current.game.status.type !== 'playing') return;
    const color = current.game.status.turn;
    const move = chooseFairMove(current.game, color, CANNON_MODE);
    if (!move) {
      active.state = { ...current, aiThinking: false, note: 'AI has no move.' };
      rerender();
      return;
    }
    const nextGame = applyMove(current.game, move);
    playXiangqiMoveSound(current.game, nextGame, move, color, current.humanColor);
    active.state = {
      ...current,
      game: nextGame,
      selection: null,
      history: [...current.history, move],
      cursor: current.history.length + 1,
      note: `AI moved ${move.from}-${move.to}.`,
      aiThinking: false,
      referenceViewsVisible: current.referenceViewsVisible || nextGame.status.type === 'finished',
    };
    rerender();
  }, delay);
}

function playXiangqiMoveSound(
  before: XiangqiGameState,
  after: XiangqiGameState,
  move: XiangqiMove,
  mover: XiangqiColor,
  humanColor: XiangqiColor,
): void {
  const captured = before.board[move.to];
  let kind: SoundKind = 'move';
  if (captured && captured.color !== mover) {
    if (captured.role === 'general') kind = 'king-capture';
    else if (captured.color === humanColor) kind = 'captured';
    else kind = 'capture';
  }
  playSound(kind);
  if (after.status.type === 'finished' && after.status.winner !== null) {
    playSound(after.status.winner === humanColor ? 'win' : 'lose');
  }
}

function attachHandlers(page: HTMLElement): void {
  page.querySelectorAll<HTMLButtonElement>('[data-side]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!active) return;
      const side = btn.dataset.side;
      if (side !== 'red' && side !== 'black') return;
      clearAiTimer();
      active.state = freshState(side);
      rerender();
      scheduleAiTurn();
    });
  });

  page.querySelector<HTMLButtonElement>('[data-action="reset"]')?.addEventListener('click', () => {
    if (!active) return;
    clearAiTimer();
    active.state = freshState(active.state.humanColor);
    rerender();
    scheduleAiTurn();
  });

  page.querySelectorAll<HTMLButtonElement>('[data-ply]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!active) return;
      const ply = Number(btn.dataset.ply);
      if (!Number.isInteger(ply)) return;
      clearAiTimer();
      active.state = setCursor(active.state, ply);
      rerender();
      scheduleAiTurn();
    });
  });

  for (const [action, delta] of [
    ['ply-prev', -1],
    ['ply-next', 1],
  ] as const) {
    page
      .querySelector<HTMLButtonElement>(`[data-action="${action}"]`)
      ?.addEventListener('click', () => {
        if (!active) return;
        clearAiTimer();
        active.state = setCursor(active.state, active.state.cursor + delta);
        rerender();
        scheduleAiTurn();
      });
  }

  page
    .querySelector<HTMLButtonElement>('[data-action="ply-live"]')
    ?.addEventListener('click', () => {
      if (!active) return;
      clearAiTimer();
      active.state = setCursor(active.state, active.state.history.length);
      rerender();
      scheduleAiTurn();
    });

  page.querySelectorAll<SVGElement>('[data-square]').forEach((el) => {
    el.addEventListener('click', () => {
      if (!active) return;
      const square = el.dataset.square as XiangqiSquare | undefined;
      if (!square) return;
      active.state = handleSquareClick(active.state, square);
      rerender();
      scheduleAiTurn();
    });
  });
}

const STYLE = `
  .xiangqi-demo-route {
    background: #f4f7f1;
  }
  .xiangqi-demo {
    min-height: 100vh;
    width: 100%;
    margin: 0 auto;
    padding: 20px;
    color: #1f2521;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .xqd-shell {
    width: min(100%, 1160px);
    margin: 0 auto;
  }
  .xqd-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }
  .xqd-kicker {
    margin: 0 0 3px;
    font-size: 12px;
    letter-spacing: 0;
    color: #657569;
  }
  .xqd-header h1 {
    margin: 0;
    font-size: 30px;
    line-height: 1.05;
    letter-spacing: 0;
  }
  .xqd-game {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    grid-template-areas: "board sidebar";
    gap: 24px;
    align-items: start;
  }
  .xqd-sidebar {
    grid-area: sidebar;
    position: sticky;
    top: 18px;
  }
  .xqd-rules-link,
  .xqd-button,
  .xqd-side-button {
    appearance: none;
    border: 1px solid #c6d1c8;
    border-radius: 6px;
    background: #ffffff;
    color: #1f2521;
    min-height: 40px;
    padding: 0 12px;
    font: inherit;
    font-size: 14px;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .xqd-rules-link:hover,
  .xqd-button:hover,
  .xqd-side-button:hover {
    background: #eef4ec;
  }
  .xqd-panel {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    margin-bottom: 14px;
  }
  .xqd-side {
    display: inline-grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    padding: 4px;
    border: 1px solid #d8e0d8;
    border-radius: 8px;
    background: #e9efe7;
  }
  .xqd-side-button {
    border-color: transparent;
    background: transparent;
  }
  .xqd-side-button.is-active {
    background: #1f2521;
    border-color: #1f2521;
    color: #f7e8c5;
  }
  .xqd-status {
    min-height: 112px;
    border-top: 1px solid #d8ddd8;
    border-bottom: 1px solid #d8ddd8;
    padding: 14px 0;
    margin-bottom: 14px;
  }
  .xqd-status-main {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.2;
  }
  .xqd-status-sub,
  .xqd-note {
    margin-top: 6px;
    color: #657569;
    font-size: 13px;
    line-height: 1.35;
  }
  .xqd-note {
    min-height: 18px;
  }
  .xqd-note-empty {
    visibility: hidden;
  }
  .xqd-moves {
    min-height: 0;
  }
  .xqd-moves-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }
  .xqd-moves-title {
    color: #657569;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.2;
  }
  .xqd-replay-controls {
    display: inline-flex;
    gap: 4px;
  }
  .xqd-replay-button,
  .xqd-replay-live {
    appearance: none;
    border: 1px solid #c6d1c8;
    border-radius: 5px;
    background: #ffffff;
    color: #1f2521;
    min-width: 28px;
    height: 26px;
    padding: 0 7px;
    font: inherit;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
  }
  .xqd-replay-button:hover,
  .xqd-replay-live:hover,
  .xqd-move:hover {
    background: #eef4ec;
  }
  .xqd-replay-button[disabled],
  .xqd-replay-live[disabled] {
    opacity: 0.42;
    cursor: default;
  }
  .xqd-move-list {
    display: flex;
    max-height: 190px;
    flex-direction: column;
    gap: 3px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
    scrollbar-width: thin;
  }
  .xqd-move-row {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    min-height: 28px;
    border-bottom: 1px solid #dfe6df;
    font-size: 13px;
    line-height: 1.2;
  }
  .xqd-move-number {
    color: #657569;
    font-variant-numeric: tabular-nums;
  }
  .xqd-move {
    appearance: none;
    border: 0;
    background: transparent;
    padding: 0;
    overflow: hidden;
    color: #1f2521;
    font: inherit;
    font-variant-numeric: tabular-nums;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  .xqd-move.black {
    color: #49544c;
  }
  .xqd-move.empty {
    cursor: default;
  }
  .xqd-move.is-current {
    color: #0f5f2a;
    font-weight: 700;
  }
  .xqd-move-empty {
    min-height: 28px;
    color: #657569;
    font-size: 13px;
  }
  .xqd-board-wrap {
    grid-area: board;
    display: flex;
    justify-content: center;
    width: 100%;
    overflow: hidden;
  }
  .xqd-views {
    margin-top: 28px;
    padding-top: 18px;
    border-top: 1px solid #d8ddd8;
  }
  .xqd-views h2 {
    margin: 0 0 12px;
    font-size: 16px;
    line-height: 1.2;
    letter-spacing: 0;
  }
  .xqd-view-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    align-items: start;
  }
  .xqd-view-card {
    min-width: 0;
    padding: 10px;
    border: 1px solid #d8e0d8;
    border-radius: 8px;
    background: #ffffff;
  }
  .xqd-view-label {
    margin-bottom: 8px;
    color: #657569;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.2;
  }
  .xqd-view-card .xq-board-svg {
    max-width: 100%;
  }
  .xq-board-svg {
    width: 100%;
    max-width: 552px;
    height: auto;
    display: block;
    box-sizing: border-box;
    border: 1px solid #c7b27d;
    border-radius: 8px;
    overflow: hidden;
    background: #f5dca8;
    box-shadow: 0 1px 0 rgba(29, 37, 34, 0.08);
    touch-action: manipulation;
  }
  .xq-board-bg { fill: #f5dca8; }
  .xq-grid line, .xq-palace line, .xq-marks line { stroke: #5a3a14; }
  .xq-grid line, .xq-palace line { stroke-width: 1.2; }
  .xq-marks line { stroke-width: 1.0; }
  .xq-river-label {
    font-family: serif;
    font-size: 22px;
    fill: #5a3a14;
    text-anchor: middle;
    dominant-baseline: central;
    letter-spacing: 4px;
  }
  .xq-fog { fill: #2a2218; opacity: 0.55; }
  .xq-fog-mask { fill: #2a2218; opacity: 0.7; }
  .xq-lastmove { fill: #f59e0b; opacity: 0.22; }
  .xq-selection-ring { fill: none; stroke: #f59e0b; stroke-width: 3; }
  .xq-hint-dot { fill: #15803d; opacity: 0.85; }
  .xq-hint-capture {
    fill: none;
    stroke: #b91c1c;
    stroke-width: 3;
    opacity: 0.85;
    stroke-dasharray: 5 4;
  }
  .xq-cannon-target-mark {
    fill: none;
    stroke: #2563eb;
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.88;
  }
  .xq-cannon-target-ring {
    fill: none;
    stroke: #2563eb;
    stroke-width: 3;
    opacity: 0.9;
  }
  .xq-cannon-target-line {
    stroke: #2563eb;
    stroke-width: 7;
    stroke-linecap: round;
    opacity: 0.26;
  }
  .xq-cannon-target-badge { fill: #2563eb; stroke: #f5dca8; stroke-width: 1.5; }
  .xq-cannon-target-badge-text {
    fill: #fff;
    font-family: serif;
    font-size: 11px;
    font-weight: 700;
    text-anchor: middle;
    dominant-baseline: central;
    pointer-events: none;
  }
  .xq-hit { fill: transparent; cursor: pointer; }
  @media (min-width: 901px) {
    .xiangqi-demo {
      height: 100vh;
      overflow: hidden;
      padding-top: 16px;
      padding-bottom: 14px;
    }
    .xqd-header {
      margin-bottom: 12px;
    }
    .xqd-header h1 {
      font-size: 28px;
    }
    .xqd-game {
      gap: 20px;
    }
    .xqd-board-wrap .xq-board-svg {
      width: auto;
      max-width: 100%;
      height: min(55vh, 520px);
    }
    .xqd-views {
      margin-top: 16px;
      padding-top: 12px;
    }
    .xqd-views h2 {
      margin-bottom: 8px;
      font-size: 14px;
    }
    .xqd-view-grid {
      gap: 12px;
    }
    .xqd-view-card {
      display: flex;
      min-height: 0;
      flex-direction: column;
      align-items: center;
      padding: 8px;
    }
    .xqd-view-label {
      align-self: flex-start;
      margin-bottom: 4px;
    }
    .xqd-view-card .xq-board-svg {
      width: auto;
      max-width: 100%;
      height: min(22vh, 190px);
    }
  }
  @media (max-width: 900px) {
    .xiangqi-demo {
      height: 100vh;
      overflow: hidden;
      padding: 14px;
    }
    .xqd-header {
      margin-bottom: 10px;
    }
    .xqd-game {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .xqd-sidebar {
      position: static;
      width: 100%;
    }
    .xqd-panel {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: stretch;
      gap: 10px;
      margin-bottom: 8px;
    }
    .xqd-status {
      min-height: 78px;
      padding: 10px 0;
      margin-bottom: 8px;
    }
    .xqd-status-main {
      font-size: 17px;
    }
    .xqd-board-wrap {
      order: 2;
    }
    .xqd-board-wrap .xq-board-svg {
      width: auto;
      max-width: 100%;
      height: min(34vh, 320px);
    }
    .xqd-moves {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 8px;
      align-items: center;
    }
    .xqd-moves-head {
      margin-bottom: 0;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }
    .xqd-move-list {
      display: flex;
      max-height: none;
      flex-direction: row;
      gap: 6px;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: thin;
    }
    .xqd-move-row {
      display: inline-grid;
      grid-template-columns: auto auto auto;
      gap: 5px;
      flex: 0 0 auto;
      min-height: 28px;
      padding: 0 8px;
      border: 1px solid #d8e0d8;
      border-radius: 6px;
      background: #ffffff;
    }
    .xqd-move {
      padding: 0;
    }
    .xqd-move-empty {
      min-height: 24px;
      white-space: nowrap;
    }
    .xqd-views {
      margin-top: 12px;
      padding-top: 10px;
    }
    .xqd-views h2 {
      margin-bottom: 8px;
      font-size: 14px;
    }
    .xqd-view-grid {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: thin;
    }
    .xqd-view-card {
      flex: 0 0 136px;
      padding: 7px;
    }
    .xqd-view-label {
      margin-bottom: 4px;
    }
    .xqd-view-card .xq-board-svg {
      width: auto;
      max-width: 100%;
      height: min(11vh, 108px);
    }
  }
  @media (max-width: 560px) {
    .xiangqi-demo {
      padding: 12px 14px;
    }
    .xqd-header h1 {
      font-size: 24px;
    }
    .xqd-panel {
      align-items: stretch;
    }
    .xqd-button {
      min-width: 76px;
    }
  }
`;
