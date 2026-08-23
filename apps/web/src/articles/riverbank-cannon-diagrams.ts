// Static marked-up diagrams for the riverbank-cannon article. Every position
// is replayed through the fog kernel (an illegal token throws at module load),
// so the diagrams cannot drift from the verified lines in
// docs-private/fog-xiangqi-balance/.
import {
  applyMove as applyXiangqiMove,
  createInitialXiangqiState,
  getPlayerView as getXiangqiPlayerView,
  type XiangqiGameState,
  type XiangqiSquare,
} from '@mistboard/game';
import {
  XQ_BOARD_H,
  XQ_BOARD_W,
  xqBoardGrid,
  xqBoardSvg,
  xqMoveDots,
  xqPiecesLayer,
  xqSvg,
} from './diagrams.js';

function play(id: string, tokens: string[]): XiangqiGameState {
  let s = createInitialXiangqiState(id);
  for (const t of tokens) {
    const m = /^([a-i](?:10|[1-9]))([a-i](?:10|[1-9]))$/.exec(t);
    if (!m) throw new Error(`riverbank diagram: bad token ${t}`);
    const next = applyXiangqiMove(s, {
      from: m[1] as XiangqiSquare,
      to: m[2] as XiangqiSquare,
    });
    if (next === s) throw new Error(`riverbank diagram: illegal ${t} in ${id}`);
    s = next;
  }
  return s;
}

const PAIR_W = XQ_BOARD_W * 2 + 28;
const BOARD_BLOCK_H = XQ_BOARD_H + 52;

// One move before mate on the stealth route. Black's developing moves match
// the replay beside this diagram.
const STEALTH = play('rb-stealth', ['b3d3', 'h10g8', 'd3d5', 'b10c8', 'd5e5', 'c7c6']);

export const RB_STEALTH_PAIR = () =>
  xqSvg(
    PAIR_W,
    BOARD_BLOCK_H,
    [
      xqBoardSvg({
        state: STEALTH,
        x: 0,
        y: 0,
        label: 'THE TRUTH',
        perspective: 'red',
        arrows: [
          { from: 'b3' as XiangqiSquare, to: 'd3' as XiangqiSquare },
          { from: 'd3' as XiangqiSquare, to: 'd5' as XiangqiSquare },
          { from: 'd5' as XiangqiSquare, to: 'e5' as XiangqiSquare },
        ],
        dots: [{ square: 'e10' as XiangqiSquare, capture: true }],
      }),
      xqBoardSvg({
        state: STEALTH,
        view: getXiangqiPlayerView(STEALTH, 'black', 'D'),
        x: XQ_BOARD_W + 28,
        y: 0,
        label: 'WHAT BLACK SEES',
        perspective: 'red',
      }),
    ].join(''),
  );

// The poisoned advisor, after Red takes the g10 elephant.
const TRAP = play('rb-trap', ['b3b5', 'd10e9', 'b5g5', 'b10c8', 'g5g10']);

export const RB_ADVISOR_TRAP = () =>
  xqSvg(
    XQ_BOARD_W,
    BOARD_BLOCK_H,
    xqBoardSvg({
      state: TRAP,
      x: 0,
      y: 0,
      label: 'THE POISONED ADVISOR',
      perspective: 'red',
      arrows: [{ from: 'g10' as XiangqiSquare, to: 'e10' as XiangqiSquare }],
      dots: [{ square: 'd10' as XiangqiSquare, blocked: true }],
    }),
  );

// The elephant seal with the cannon already on e5: snipe dead, both elephant
// home points covered.
const SEAL = play('rb-seal', ['b3b5', 'c10e8', 'b5e5']);

export const RB_SEAL_COVER = () =>
  xqSvg(
    XQ_BOARD_W,
    BOARD_BLOCK_H,
    xqBoardSvg({
      state: SEAL,
      x: 0,
      y: 0,
      label: 'ONE MOVE, THREE FILES',
      perspective: 'red',
      arrows: [
        { from: 'e8' as XiangqiSquare, to: 'c10' as XiangqiSquare },
        { from: 'e8' as XiangqiSquare, to: 'g10' as XiangqiSquare },
      ],
      dots: [{ square: 'e10' as XiangqiSquare, blocked: true }],
    }),
  );

// The tripwire timing, side by side: same push, one move apart.
const TRIP_FIRST = play('rb-trip-first', ['b3b5', 'a7a6', 'b5a5']);
const TRIP_LATE = play('rb-trip-late', ['b3b5', 'c10e8', 'b5a5', 'a7a6']);

export const RB_TRIPWIRE_PAIR = () =>
  xqSvg(
    PAIR_W,
    BOARD_BLOCK_H,
    [
      xqBoardSvg({
        state: TRIP_FIRST,
        x: 0,
        y: 0,
        label: 'SOLDIER FIRST',
        perspective: 'red',
        arrows: [{ from: 'a6' as XiangqiSquare, to: 'a5' as XiangqiSquare }],
        dots: [{ square: 'a5' as XiangqiSquare, capture: true }],
      }),
      xqBoardSvg({
        state: TRIP_LATE,
        x: XQ_BOARD_W + 28,
        y: 0,
        label: 'SOLDIER TOO LATE',
        perspective: 'red',
        arrows: [{ from: 'a5' as XiangqiSquare, to: 'a10' as XiangqiSquare }],
        dots: [{ square: 'a10' as XiangqiSquare, capture: true }],
      }),
    ].join(''),
  );

// The thesis picture: the cannon on the riverbank, one slide from firing down
// any of five files. Dots are the firing points, rings the targets.
const ARRIVED = play('rb-arrived', ['b3b5']);

export const RB_FIVE_FILES = () =>
  xqSvg(
    XQ_BOARD_W,
    BOARD_BLOCK_H,
    xqBoardSvg({
      state: ARRIVED,
      x: 0,
      y: 0,
      label: 'ONE SLIDE FROM EVERYTHING',
      perspective: 'red',
      dots: [
        { square: 'a5' as XiangqiSquare },
        { square: 'c5' as XiangqiSquare },
        { square: 'e5' as XiangqiSquare },
        { square: 'g5' as XiangqiSquare },
        { square: 'i5' as XiangqiSquare },
      ],
    }),
  );

// Black's complete three-move answer: edge soldier, central elephant, far horse.
const SHELTER = play('rb-shelter', ['b3b5', 'a7a6', 'b5e5', 'c10e8', 'h1g3', 'h10i8']);

export const RB_SHELTER = () =>
  xqSvg(
    XQ_BOARD_W,
    BOARD_BLOCK_H,
    xqBoardSvg({
      state: SHELTER,
      x: 0,
      y: 0,
      label: 'THE THREE-MOVE ANSWER',
      perspective: 'red',
      arrows: [
        { from: 'e8' as XiangqiSquare, to: 'c10' as XiangqiSquare },
        { from: 'e8' as XiangqiSquare, to: 'g10' as XiangqiSquare },
      ],
      dots: [
        { square: 'a5' as XiangqiSquare },
        { square: 'e10' as XiangqiSquare, blocked: true },
      ],
    }),
  );

// The counter-battery, answered: red seals his center before grabbing, and the
// battery on e6 is frozen (two screens to e1). Red's converged plan: the edges.
const BATTERY_FROZEN = play('rb-battery-frozen', ['b3b5', 'h8h6', 'g1e3', 'h6e6']);

export const RB_BATTERY_FROZEN = () =>
  xqSvg(
    XQ_BOARD_W,
    BOARD_BLOCK_H,
    xqBoardSvg({
      state: BATTERY_FROZEN,
      x: 0,
      y: 0,
      label: 'THE BATTERY, FROZEN',
      perspective: 'red',
      arrows: [{ from: 'b5' as XiangqiSquare, to: 'i5' as XiangqiSquare }],
      dots: [{ square: 'e1' as XiangqiSquare, blocked: true }],
    }),
  );

// Branch L: red recaptured the tripwire soldier, and the recapture is the
// screen for black's counter-shot at the corner chariot.
const CANNON_DOWN = play('rb-cannon-down', ['b3b5', 'a7a6', 'b5a5', 'a6a5', 'a4a5', 'b8a8']);

export const RB_CANNON_DOWN = () =>
  xqSvg(
    XQ_BOARD_W,
    BOARD_BLOCK_H,
    xqBoardSvg({
      state: CANNON_DOWN,
      x: 0,
      y: 0,
      label: 'THE RECAPTURE IS A GIFT',
      perspective: 'red',
      arrows: [{ from: 'a8' as XiangqiSquare, to: 'a1' as XiangqiSquare }],
      dots: [{ square: 'a1' as XiangqiSquare, capture: true }],
    }),
  );

// Branch W: the landed cannon is a freeze, not a raider. Its bites lose to
// recaptures; the horse and elephant beside it hold the back rank shut.
const CHARIOT_DOWN = play('rb-chariot-down', ['b3b5', 'a7a6', 'b5i5', 'c10e8', 'i5i10']);

export const RB_CHARIOT_DOWN = () =>
  xqSvg(
    XQ_BOARD_W,
    BOARD_BLOCK_H,
    xqBoardSvg({
      state: CHARIOT_DOWN,
      x: 0,
      y: 0,
      label: 'THE FREEZE',
      perspective: 'red',
      arrows: [
        { from: 'i10' as XiangqiSquare, to: 'g10' as XiangqiSquare },
        { from: 'i10' as XiangqiSquare, to: 'f10' as XiangqiSquare },
        { from: 'e8' as XiangqiSquare, to: 'g10' as XiangqiSquare },
      ],
    }),
  );

// Article-card thumbnail: the core position (cannon landed on the riverbank,
// five firing points dotted, five targets ringed) as a FULL board, centered in
// the card's 8:5 frame with blank margins left and right. Thunk so the card
// tracks the xiangqi piece-set picker.
export const RB_THUMBNAIL = () => {
  const scale = 192 / (XQ_BOARD_H + 8);
  const width = XQ_BOARD_W * scale;
  const tx = (320 - width) / 2;
  const body = [
    `<rect x="0" y="0" width="${XQ_BOARD_W}" height="${XQ_BOARD_H}" rx="10" class="xq-diagram-bg"/>`,
    xqBoardGrid(0, 0, 'red'),
    xqMoveDots(
      [
        { square: 'a5' as XiangqiSquare },
        { square: 'c5' as XiangqiSquare },
        { square: 'e5' as XiangqiSquare },
        { square: 'g5' as XiangqiSquare },
        { square: 'i5' as XiangqiSquare },
        { square: 'a10' as XiangqiSquare, capture: true },
        { square: 'c10' as XiangqiSquare, capture: true },
        { square: 'e10' as XiangqiSquare, capture: true },
        { square: 'g10' as XiangqiSquare, capture: true },
        { square: 'i10' as XiangqiSquare, capture: true },
      ],
      0,
      0,
      'red',
    ),
    xqPiecesLayer(ARRIVED, null, 0, 0, 'red'),
  ].join('');
  return `<svg class="xq-article-svg" viewBox="0 0 320 200" role="img" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto"><g transform="translate(${tx.toFixed(1)} 4) scale(${scale.toFixed(4)})">${body}</g></svg>`;
};
