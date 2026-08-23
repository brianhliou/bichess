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
import { XQ_BOARD_H, XQ_BOARD_W, xqBoardSvg, xqSvg } from './diagrams.js';

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
