// Xiangqi Learn — Stage: the cannon (炮). The signature xiangqi piece: it
// MOVES like a chariot but CAPTURES by jumping exactly one piece (the screen).
// Movement levels use emptyApples (bare markers, no capture needed); capture
// levels place REAL enemy pieces as the target so the screen requirement does
// the teaching — a cannon jumps a screen to take a piece, never an empty point.
// Level 6 is a scripted scenario: the opponent walks into the cannon's fire.

import { and, extinct, pieceNotOn, scenarioComplete } from '../learn-assert.js';
import { arrow, circle, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // Pure movement: slides like a chariot.
    goal: 'learn.xiangqi.cannon.goal.1',
    fen: '9/9/9/9/9/9/9/9/4C4/9 w',
    apples: 'e6',
    emptyApples: true,
    nbMoves: 1,
    shapes: [arrow('e2', 'e6')],
  },
  {
    // Movement route planning.
    goal: 'learn.xiangqi.cannon.goal.2',
    fen: '9/9/2C6/9/9/9/9/9/9/9 w',
    apples: 'c3 h3',
    emptyApples: true,
    nbMoves: 2,
  },
  {
    // First screen capture: jump the friendly soldier to take a real piece.
    goal: 'learn.xiangqi.cannon.goal.3',
    fen: '9/9/4p4/9/9/4P4/9/9/4C4/9 w',
    nbMoves: 1,
    captures: 1,
    pointsForCapture: true,
    detectCapture: false,
    success: extinct('black'),
    sampleSolution: 'e2e8',
    shapes: [circle('e5', 'blue'), arrow('e2', 'e8')],
  },
  {
    // Reposition first, then use the screen. The cannon cannot reach the target
    // in one move; slide behind the soldier, then jump it.
    goal: 'learn.xiangqi.cannon.goal.4',
    fen: '9/5p3/9/9/5P3/9/9/9/2C6/9 w',
    nbMoves: 2,
    captures: 1,
    pointsForCapture: true,
    detectCapture: false,
    success: extinct('black'),
    sampleSolution: 'c2f2 f2f9',
  },
  {
    // The enemy's own pieces work as your screens. Jump one black soldier to
    // take the piece behind it, twice; the screens themselves stay put.
    goal: 'learn.xiangqi.cannon.goal.5',
    fen: '9/9/9/p2p2r2/9/9/p8/9/9/C8 w',
    nbMoves: 2,
    captures: 2,
    pointsForCapture: true,
    detectCapture: false,
    success: and(pieceNotOn('black', 'soldier', 'a7'), pieceNotOn('black', 'chariot', 'g7')),
    sampleSolution: 'a1a7 a7g7',
  },
  {
    // Scenario: the enemy chariot stops behind your horse. Blast it.
    // forcedReplies off: the chariot's stop is a scripted BLUNDER the copy
    // frames as such, not a claimed forced sequence.
    goal: 'learn.xiangqi.cannon.goal.6',
    fen: '7r1/9/9/9/9/7N1/9/7C1/9/9 b',
    color: 'red',
    nbMoves: 1,
    forcedReplies: false,
    scenario: [
      { move: { from: 'h10', to: 'h6' }, shapes: [arrow('h3', 'h6', 'green')] },
      { from: 'h3', to: 'h6' },
    ],
    success: scenarioComplete,
    detectCapture: false,
  },
  {
    // Capstone: a four-capture tour, each capture over its own screen.
    goal: 'learn.xiangqi.cannon.goal.7',
    fen: '9/9/2r2P2p/9/9/2P5P/9/9/p1C1P3p/9 w',
    nbMoves: 4,
    captures: 4,
    pointsForCapture: true,
    detectCapture: false,
    success: extinct('black'),
    sampleSolution: 'c2c8 c8i8 i8i2 i2a2',
  },
];

export const cannonStage = {
  key: 'cannon',
  title: 'learn.xiangqi.cannon.title',
  subtitle: 'learn.xiangqi.cannon.subtitle',
  intro: 'learn.xiangqi.cannon.intro',
  complete: 'learn.xiangqi.cannon.complete',
  illustration: { piece: 'cannon' },
  copy: {
    'learn.xiangqi.cannon.title': 'The cannon',
    'learn.xiangqi.cannon.subtitle': 'It jumps over a screen to capture',
    'learn.xiangqi.cannon.intro':
      'The cannon moves like the chariot, but it captures differently: it must jump over exactly one piece, called the screen. Any piece can be the screen, yours or theirs.',
    'learn.xiangqi.cannon.complete':
      'Well done! The cannon is the trickiest piece in xiangqi. Remember: it needs a screen to capture, and no screen to move. The cannon stars in the most famous named mates of all: 马后炮 and 重炮 are waiting for you in Mate patterns.',
    'learn.xiangqi.cannon.goal.1': 'The cannon slides like the chariot. Grab the star!',
    'learn.xiangqi.cannon.goal.2': 'Two stars, two moves. No jumping needed to move.',
    'learn.xiangqi.cannon.goal.3':
      'To capture, the cannon jumps over one screen. Jump your soldier and take the black soldier!',
    'learn.xiangqi.cannon.goal.4':
      'No screen, no capture. Line up behind your soldier, then take the black soldier.',
    'learn.xiangqi.cannon.goal.5':
      'Enemy pieces make fine screens too. Jump them to capture the pieces behind!',
    'learn.xiangqi.cannon.goal.6': 'The enemy chariot stopped behind your horse. Blast it!',
    'learn.xiangqi.cannon.goal.7': 'Four captures, one tour. Every capture needs its own screen.',
  },
  levels,
};
