import {
  applyMove,
  createInitialXiangqiState,
  getStandardXiangqiPlayerView,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiSquare,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { xqPiecesLayer } from './articles/diagrams.js';
import { renderDarkXiangqiBoardSvg } from './live-dark-xiangqi.js';
import { renderJieqiBoardSvg } from './live-jieqi-render.js';
import { xiangqiBoardSvg } from './xiangqi-board.js';
import { drawsCrossedSoldier } from './xiangqi-crossed-soldier.js';
import { renderXiangqiPieceGlyphed } from './xiangqi-piece-sets.js';

// A xiangqi soldier past the river draws with the promoted-soldier art. The rule
// was open-coded once per renderer, and the copies drifted: the live standard
// board and the video frame had it, the article replay embed, the article
// diagrams and every fog-xiangqi board did not. Same soldier, same square, two
// different pieces depending on which page you were looking at.
//
// So: assert the predicate, then assert that each board renderer actually
// reaches the art. A shared helper nobody calls is the same bug with a nicer
// name, which is why these render real SVG instead of spying on the helper.

describe('drawsCrossedSoldier', () => {
  it('promotes a soldier only once it is in the enemy half', () => {
    // Red owns ranks 1-5, black owns 6-10.
    expect(drawsCrossedSoldier({ color: 'red', role: 'soldier' }, 5)).toBe(false);
    expect(drawsCrossedSoldier({ color: 'red', role: 'soldier' }, 6)).toBe(true);
    expect(drawsCrossedSoldier({ color: 'black', role: 'soldier' }, 6)).toBe(false);
    expect(drawsCrossedSoldier({ color: 'black', role: 'soldier' }, 5)).toBe(true);
  });

  it('leaves every other role alone wherever it stands', () => {
    for (const role of ['general', 'advisor', 'elephant', 'horse', 'chariot', 'cannon']) {
      expect(drawsCrossedSoldier({ color: 'red', role }, 10)).toBe(false);
      expect(drawsCrossedSoldier({ color: 'black', role }, 1)).toBe(false);
    }
  });
});

/** How many pieces on this board asked for the crossed art. */
function crossedCount(svg: string): number {
  return [...svg.matchAll(/crossed-soldier/g)].length;
}

/** Red soldier a4 walks to a6, one rank past the river. */
function stateWithACrossedSoldier(): XiangqiGameState {
  const moves: XiangqiMove[] = [
    { from: 'a4', to: 'a5' },
    { from: 'b10', to: 'c8' },
    { from: 'a5', to: 'a6' },
  ] as Array<{ from: XiangqiSquare; to: XiangqiSquare }>;
  let state = createInitialXiangqiState('crossed-soldier-test');
  for (const move of moves) state = applyMove(state, move) as XiangqiGameState;
  return state;
}

describe('every xiangqi board renderer reaches the promoted-soldier art', () => {
  const crossedState = stateWithACrossedSoldier();
  const crossedView = getStandardXiangqiPlayerView(crossedState, 'red');
  const startState = createInitialXiangqiState('start');
  const startView = getStandardXiangqiPlayerView(startState, 'red');

  it('is not vacuous: the default piece set really ships crossed-soldier art', () => {
    // DEFAULT_XIANGQI_PIECE_SET is 'international', the set the art lives in.
    // If that flips to a set without the art, every case below goes quiet and
    // this is the assertion that says so.
    const plain = renderXiangqiPieceGlyphed({ color: 'red', role: 'soldier' }, 'international', {});
    const promoted = renderXiangqiPieceGlyphed({ color: 'red', role: 'soldier' }, 'international', {
      crossed: true,
    });
    expect(crossedCount(plain)).toBe(0);
    expect(crossedCount(promoted)).toBe(1);
  });

  it('draws it on the shared standard board (live, study, review, replay, puzzles)', () => {
    const idle = { interactive: false, selectedSquare: null, draggingFrom: null } as const;
    expect(crossedCount(xiangqiBoardSvg(crossedView, 'red', idle))).toBe(1);
    expect(crossedCount(xiangqiBoardSvg(startView, 'red', idle))).toBe(0);
  });

  it('draws it in article diagrams', () => {
    expect(crossedCount(xqPiecesLayer(crossedState, null, 0, 0, 'red'))).toBe(1);
    expect(crossedCount(xqPiecesLayer(startState, null, 0, 0, 'red'))).toBe(0);
  });

  it('draws it on the fog-xiangqi board, and never on a shrouded placeholder', () => {
    const fog = renderDarkXiangqiBoardSvg(
      {
        id: 'fog',
        perspective: 'red',
        board: {
          // Own crossed soldier: visible, and promoted.
          a6: { piece: { color: 'red', role: 'soldier' }, shrouded: false },
          // An enemy piece deep in red's half whose identity is hidden. It
          // renders through the soldier placeholder, and must NOT promote:
          // that would assert a role the viewer has not been shown.
          e3: { color: 'black', shrouded: true },
        },
        visibleSquares: ['a6', 'e3'],
        legalMoves: [],
        status: { type: 'playing', turn: 'red' },
        moveNumber: 4,
        captures: { red: [], black: [] },
      },
      'red',
      { showFog: false },
    );
    expect(crossedCount(fog)).toBe(1);
  });

  it('draws it on the jieqi board, and never on a face-down piece', () => {
    const jieqi = renderJieqiBoardSvg(
      {
        id: 'jieqi',
        perspective: 'red',
        board: {
          a6: { color: 'red', role: 'soldier', faceDown: false },
          // Face-down: drawn as a colour-known back, identity unknown.
          e3: { color: 'black', faceDown: true },
        },
        legalMoves: [],
        captured: [],
        inCheck: false,
        status: { type: 'playing', turn: 'red' },
        moveNumber: 4,
      },
      'red',
    );
    expect(crossedCount(jieqi)).toBe(1);
  });
});
