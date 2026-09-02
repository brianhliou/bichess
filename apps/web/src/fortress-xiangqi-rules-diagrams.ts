// Inline board diagrams for the Fortress Xiangqi rules article.
//
// Built on the live board renderer (renderFortressXiangqiBoardSvg) so every
// diagram shows the exact furniture a player sees (corner palaces, river band,
// Treasure disc) and tracks the reader's xiangqi board theme + piece set. Each
// export is a render thunk: the article renderer re-runs it when the xiangqi
// appearance picker changes.
//
// Move and drop targets are computed through the real kernel
// (getFortressXiangqiLegalMoves), never hand-listed, so a rules change that
// touches movement or drop regions redraws these diagrams correctly. Blocked
// crosses are pedagogy, not rules claims: eye-blocks are derived by diffing the
// kernel's targets with and without the blocker; river-locks are annotated.
// The example positions mirror the collaborator sheet's movement guide.

import {
  createInitialFortressXiangqiState,
  type FortressXiangqiBoard,
  type FortressXiangqiDropRole,
  type FortressXiangqiGameState,
  type FortressXiangqiPlayerView,
  type FortressXiangqiSquare,
  getFortressXiangqiLegalMoves,
  getFortressXiangqiPlayerView,
  isFortressXiangqiDropMove,
} from '@mistboard/game';
import {
  type FortressXiangqiBoardRenderOptions,
  installFortressXiangqiBoardStyles,
  renderFortressXiangqiBoardSvg,
} from './fortress-xiangqi-render.js';

const ROW_GAP = 30;
const ROW_LABEL_H = 44;

// The live renderer emits a viewBox-only <svg class="fxq-board"> whose global
// CSS rule is width:100%. In an article figure there is no live-board container
// to size it, so each diagram carries its own inline width cap (inline beats
// the class rule), the same trick the jungle rules diagrams use.
function responsive(svg: string, maxWidth: number): string {
  return svg.replace(
    '<svg ',
    `<svg width="100%" style="max-width:${maxWidth}px;height:auto;display:block;margin:0 auto" `,
  );
}

function boardSvg(
  view: FortressXiangqiPlayerView,
  options: FortressXiangqiBoardRenderOptions,
): string {
  installFortressXiangqiBoardStyles();
  // Article framing is authored: the figure is sized by its own width cap, and
  // a coordinate gutter appearing only for readers who play with coordinates on
  // would reflow the prose around it.
  return renderFortressXiangqiBoardSvg(view, 'red', { coordinates: false, ...options });
}

function diagram(
  view: FortressXiangqiPlayerView,
  options: FortressXiangqiBoardRenderOptions,
  maxWidth: number,
): string {
  return responsive(boardSvg(view, options), maxWidth);
}

// Place one rendered board inside a row: give its <svg> explicit x/y/width/
// height and take its own viewBox as the footprint, so the row geometry can
// never desync from what the live renderer actually emits.
//
// This rewrites the live renderer's opening tag, so the match has to survive
// that tag growing new classes and attributes. It did not. The anchor used to
// be the literal `<svg class="fxq-board" `, and once the board gained layout
// and theme classes the replace became a silent no-op: every board in a row
// lost its position, defaulted to filling the whole wrapper viewport, and the
// boards stacked on each other and on their labels (fixed 2026-09-02). Hence
// the loose match and the throw — a composition step that cannot place its
// content must fail, not render garbage.
function placeBoard(
  svg: string,
  x: number,
  y: number,
): { svg: string; width: number; height: number } {
  const openTag = svg.match(/<svg class="fxq-board[^>]*>/)?.[0];
  if (!openTag) {
    throw new Error(
      'fortress rules diagram: no <svg class="fxq-board..."> in the rendered board — the live renderer changed its opening tag and rows can no longer position it',
    );
  }
  const viewBox = openTag.match(/viewBox="-?[\d.]+ -?[\d.]+ ([\d.]+) ([\d.]+)"/);
  if (!viewBox) {
    throw new Error('fortress rules diagram: board <svg> has no readable viewBox');
  }
  const width = Number(viewBox[1]);
  const height = Number(viewBox[2]);
  const placed = openTag
    // Drop only the `fxq-board` token: its global `width: 100%` rule would beat
    // the width attribute below. The layout/theme classes beside it are what the
    // installed board styles key on, so they stay.
    .replace(/ class="fxq-board ?/, ' class="')
    .replace('<svg ', `<svg x="${x}" y="${y}" width="${width}" height="${height}" `);
  return { svg: svg.replace(openTag, placed), width, height };
}

// Two labeled boards side by side in one responsive <svg>.
function boardRow(items: Array<{ label: string; svg: string }>, maxWidth: number): string {
  const parts: string[] = [];
  let x = 0;
  let tallest = 0;
  for (const item of items) {
    const board = placeBoard(item.svg, x, ROW_LABEL_H);
    parts.push(
      `<text x="${x + board.width / 2}" y="${ROW_LABEL_H - 16}" text-anchor="middle" font-size="26" font-weight="700" letter-spacing="2.6" style="fill: var(--site-muted, #6b7280)">${item.label}</text>`,
      board.svg,
    );
    x += board.width + ROW_GAP;
    tallest = Math.max(tallest, board.height);
  }
  const totalW = Math.max(x - ROW_GAP, 0);
  const totalH = ROW_LABEL_H + tallest;
  return responsive(
    `<svg viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Storm the Fortress movement diagram">${parts.join('')}</svg>`,
    maxWidth,
  );
}

// A minimal playing state around a hand-set board, for kernel target queries.
// Both generals are always present so check legality is evaluated for real.
function stateWith(
  board: FortressXiangqiBoard,
  hand: Partial<Record<FortressXiangqiDropRole, number>> = {},
): FortressXiangqiGameState {
  return {
    id: 'rules-diagram',
    board,
    hands: { red: hand, black: {} },
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    positionCounts: {},
  };
}

function viewOf(state: FortressXiangqiGameState): FortressXiangqiPlayerView {
  return getFortressXiangqiPlayerView(state, 'red');
}

function boardTargetsFrom(
  state: FortressXiangqiGameState,
  from: FortressXiangqiSquare,
): FortressXiangqiSquare[] {
  return getFortressXiangqiLegalMoves(state)
    .filter((move) => !isFortressXiangqiDropMove(move) && move.from === from)
    .map((move) => move.to);
}

function dropTargets(
  state: FortressXiangqiGameState,
  role: FortressXiangqiDropRole,
): FortressXiangqiSquare[] {
  return getFortressXiangqiLegalMoves(state)
    .filter((move) => isFortressXiangqiDropMove(move) && move.drop === role)
    .map((move) => move.to);
}

// The destinations a blocker takes away: kernel targets from the open position
// minus kernel targets with the blocker on the board.
function blockedByComparison(
  open: FortressXiangqiGameState,
  blocked: FortressXiangqiGameState,
  from: FortressXiangqiSquare,
): FortressXiangqiSquare[] {
  const reachable = new Set(boardTargetsFrom(blocked, from));
  return boardTargetsFrom(open, from).filter((sq) => !reachable.has(sq));
}

function movesBoard(
  state: FortressXiangqiGameState,
  from: FortressXiangqiSquare,
  extra: Partial<FortressXiangqiBoardRenderOptions> = {},
): string {
  return boardSvg(viewOf(state), {
    selectedSquare: from,
    targets: boardTargetsFrom(state, from),
    ...extra,
  });
}

const GENERALS: FortressXiangqiBoard = {
  b2: { color: 'red', role: 'general' },
  f7: { color: 'black', role: 'general' },
};

// Clean starting position: corner palaces, river band, the Treasure on each
// side's outer palace corner. Used as both the page board and the index card.
export const FORTRESS_XIANGQI_START_BOARD = () =>
  diagram(viewOf(createInitialFortressXiangqiState('rules-diagram')), {}, 420);

// ── Per-piece movement diagrams ─────────────────────────────────────────────

// Chariot: any distance orthogonally; the black soldier on d7 shows a capture.
export const FORTRESS_XIANGQI_CHARIOT_DIAGRAM = () => {
  const state = stateWith({
    ...GENERALS,
    d4: { color: 'red', role: 'chariot' },
    d7: { color: 'black', role: 'soldier' },
  });
  return diagram(
    viewOf(state),
    { selectedSquare: 'd4', targets: boardTargetsFrom(state, 'd4') },
    380,
  );
};

// Cannon: moves like the chariot on open lines, captures only by jumping
// exactly one screen piece.
export const FORTRESS_XIANGQI_CANNON_DIAGRAM = () => {
  const moves = stateWith({ ...GENERALS, d4: { color: 'red', role: 'cannon' } });
  const captureState = stateWith({
    ...GENERALS,
    d2: { color: 'red', role: 'cannon' },
    d4: { color: 'red', role: 'soldier' },
    d7: { color: 'black', role: 'chariot' },
  });
  const captureOnly = boardTargetsFrom(captureState, 'd2').filter(
    (sq) => captureState.board[sq] !== undefined,
  );
  return boardRow(
    [
      { label: 'MOVES', svg: movesBoard(moves, 'd4') },
      {
        label: 'SCREEN CAPTURE',
        svg: boardSvg(viewOf(captureState), { selectedSquare: 'd2', targets: captureOnly }),
      },
    ],
    640,
  );
};

// Horse: one orthogonal step then one diagonal out; the orthogonal leg blocks.
export const FORTRESS_XIANGQI_HORSE_DIAGRAM = () => {
  const open = stateWith({ ...GENERALS, d4: { color: 'red', role: 'horse' } });
  const blocked = stateWith({
    ...GENERALS,
    d4: { color: 'red', role: 'horse' },
    d5: { color: 'black', role: 'soldier' },
  });
  return boardRow(
    [
      { label: 'MOVES', svg: movesBoard(open, 'd4') },
      {
        label: 'LEG BLOCKED',
        svg: movesBoard(blocked, 'd4', {
          blockedSquares: blockedByComparison(open, blocked, 'd4'),
        }),
      },
    ],
    640,
  );
};

// Elephant: exactly two points diagonally, blocked at the midpoint, and never
// across the river. The river cross is annotated (it is structural, not a
// removable blocker); the eye-block cross is kernel-derived.
export const FORTRESS_XIANGQI_ELEPHANT_DIAGRAM = () => {
  const river = stateWith({ ...GENERALS, b3: { color: 'red', role: 'elephant' } });
  const eyeOpen = stateWith({ ...GENERALS, d1: { color: 'red', role: 'elephant' } });
  const eyeBlocked = stateWith({
    ...GENERALS,
    d1: { color: 'red', role: 'elephant' },
    e2: { color: 'black', role: 'soldier' },
  });
  return boardRow(
    [
      { label: 'RIVER-LOCKED', svg: movesBoard(river, 'b3', { blockedSquares: ['d5'] }) },
      {
        label: 'EYE BLOCKED',
        svg: movesBoard(eyeBlocked, 'd1', {
          blockedSquares: blockedByComparison(eyeOpen, eyeBlocked, 'd1'),
        }),
      },
    ],
    640,
  );
};

// Advisor: one point diagonally, confined to its palace.
export const FORTRESS_XIANGQI_ADVISOR_DIAGRAM = () => {
  const state = stateWith({
    b2: { color: 'red', role: 'advisor' },
    b1: { color: 'red', role: 'general' },
    f7: { color: 'black', role: 'general' },
  });
  return diagram(
    viewOf(state),
    { selectedSquare: 'b2', targets: boardTargetsFrom(state, 'b2') },
    380,
  );
};

// General: one point orthogonally, confined to its palace.
export const FORTRESS_XIANGQI_GENERAL_DIAGRAM = () => {
  const state = stateWith(GENERALS);
  return diagram(
    viewOf(state),
    { selectedSquare: 'b2', targets: boardTargetsFrom(state, 'b2') },
    380,
  );
};

// Soldier: one point forward before the river; forward or sideways after.
export const FORTRESS_XIANGQI_SOLDIER_DIAGRAM = () => {
  // Veteran soldier: forward and sideways from the opening move (no river gate).
  // The cross behind it marks the one direction it can never take.
  const state = stateWith({ ...GENERALS, d4: { color: 'red', role: 'soldier' } });
  return diagram(
    viewOf(state),
    {
      selectedSquare: 'd4',
      targets: boardTargetsFrom(state, 'd4'),
      blockedSquares: ['d3'],
    },
    380,
  );
};

// The Treasure in the open: one step in any of the eight directions, all game.
// The enemy soldier on e5 shows that it captures the same way it moves.
export const FORTRESS_XIANGQI_TREASURE_DIAGRAM = () => {
  const state = stateWith({
    ...GENERALS,
    d4: { color: 'red', role: 'treasure' },
    e5: { color: 'black', role: 'soldier' },
  });
  return diagram(
    viewOf(state),
    { selectedSquare: 'd4', targets: boardTargetsFrom(state, 'd4') },
    380,
  );
};

// ── Drop-region diagrams ────────────────────────────────────────────────────

// Defender drop region, advisor: only the empty points of its own palace.
export const FORTRESS_XIANGQI_ADVISOR_DROP_DIAGRAM = () => {
  const state = stateWith(GENERALS, { advisor: 1 });
  return diagram(viewOf(state), { targets: dropTargets(state, 'advisor') }, 380);
};

// Defender drop region, elephant: any empty point in its own half.
export const FORTRESS_XIANGQI_ELEPHANT_DROP_DIAGRAM = () => {
  const state = stateWith(GENERALS, { elephant: 1 });
  return diagram(viewOf(state), { targets: dropTargets(state, 'elephant') }, 380);
};
