// Diagrams for the puzzle-mining explainer.
//
// The featured position is a REAL published puzzle, copied verbatim from the
// production corpus rather than hand-built: xq-mined-hxq_4128172ffd3416562994b5d0-84,
// ply 84 of an ElephantChess game played 2026-04-22. Its solution is
// b3-h3, a4-c3, h3-h9, and h3 is empty at the start, which is what makes it an
// honest illustration of the article's claim that two thirds of these tactics
// open with a move that captures nothing.
//
// The state is constructed directly instead of replayed from the opening: a
// mined puzzle starts from an arbitrary mid-game position, and the board map is
// the puzzle record's own `initial.board`.
import type { XiangqiGameState, XiangqiSquare } from '@mistboard/game';
import { XQ_BOARD_H, XQ_BOARD_W, xqBoardSvg, xqSvg } from './diagrams.js';

const FEATURED: XiangqiGameState = {
  id: 'pm-featured',
  board: {
    a4: { role: 'horse', color: 'black' },
    b3: { role: 'chariot', color: 'red' },
    c1: { role: 'cannon', color: 'black' },
    d5: { role: 'horse', color: 'black' },
    e1: { role: 'general', color: 'red' },
    e2: { role: 'advisor', color: 'red' },
    e9: { role: 'advisor', color: 'black' },
    f9: { role: 'general', color: 'black' },
    g8: { role: 'horse', color: 'red' },
    i7: { role: 'soldier', color: 'black' },
    c10: { role: 'elephant', color: 'black' },
    d10: { role: 'advisor', color: 'black' },
    g10: { role: 'horse', color: 'red' },
  },
  status: { type: 'playing', turn: 'red' },
  moveNumber: 43,
  progressClock: 0,
  positionCounts: {},
} as XiangqiGameState;

const BOARD_BLOCK_H = XQ_BOARD_H + 52;

// The key move alone. No dots on h3: the point of the diagram is that the
// square the chariot is heading for is empty.
export const PM_QUIET_KEY_MOVE = () =>
  xqSvg(
    XQ_BOARD_W,
    BOARD_BLOCK_H,
    xqBoardSvg({
      state: FEATURED,
      x: 0,
      y: 0,
      label: 'RED TO MOVE',
      perspective: 'red',
      arrows: [{ from: 'b3' as XiangqiSquare, to: 'h3' as XiangqiSquare }],
    }),
  );

// After the chariot has crossed and Black has interposed the horse on c3, the
// mate lands on h9. The dot marks the mating square.
const AFTER: XiangqiGameState = {
  ...FEATURED,
  id: 'pm-featured-mate',
  board: (() => {
    const board = { ...FEATURED.board } as Record<string, unknown>;
    delete board.b3;
    delete board.a4;
    board.h3 = { role: 'chariot', color: 'red' };
    board.c3 = { role: 'horse', color: 'black' };
    return board;
  })() as XiangqiGameState['board'],
} as XiangqiGameState;

export const PM_MATE_LANDS = () =>
  xqSvg(
    XQ_BOARD_W,
    BOARD_BLOCK_H,
    xqBoardSvg({
      state: AFTER,
      x: 0,
      y: 0,
      label: 'AND MATE ON h9',
      perspective: 'red',
      arrows: [{ from: 'h3' as XiangqiSquare, to: 'h9' as XiangqiSquare }],
      dots: [{ square: 'h9' as XiangqiSquare, capture: false }],
    }),
  );
