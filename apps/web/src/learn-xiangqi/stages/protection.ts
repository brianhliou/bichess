// Xiangqi Learn — Stage: protection (lila protection.ts arc, xiangqi-ized).
// These levels have no apples and no scenario: success is the trivial default,
// and the detectCapture('unprotected') scan is the whole game. Any move that
// leaves a red piece hanging fails with the capture demonstrated. Xiangqi
// twists the arc: screens can be walked away (level 4) and cannons cannot
// capture without one (level 6, 8).

import { arrow, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // Escape: slide the chariot off the open file.
    goal: 'learn.xiangqi.protection.goal.escape',
    fen: '9/4r4/9/9/9/9/9/9/4R4/9 w',
    shapes: [arrow('e9', 'e2', 'red')],
    sampleSolution: 'e2d2',
  },
  {
    // Escape: the horse jumps out of the chariot's line.
    goal: 'learn.xiangqi.protection.goal.escape',
    fen: '9/9/9/9/9/2N4r1/9/9/9/9 w',
    sampleSolution: 'c5d7',
  },
  {
    // Defend: bring the chariot behind the soldier.
    goal: 'learn.xiangqi.protection.goal.defend',
    fen: '4r4/9/9/9/9/4P4/9/9/9/6R2 w',
    shapes: [arrow('e10', 'e5', 'red'), arrow('g1', 'e1', 'green')],
    sampleSolution: 'g1e1',
  },
  {
    // Xiangqi twist: walk the screen away and the cannon is harmless.
    goal: 'learn.xiangqi.protection.goal.removeScreen',
    fen: '2c6/9/9/2P6/9/9/2N6/9/9/9 w',
    shapes: [arrow('c10', 'c4', 'red')],
    sampleSolution: 'c7d7',
  },
  {
    // Escape: find the square the horse cannot reach.
    goal: 'learn.xiangqi.protection.goal.escape',
    fen: '9/9/9/9/6n2/1P7/5R3/9/9/9 w',
    sampleSolution: 'f4f5',
  },
  {
    // The cannon strikes at any distance. Move the elephant out of its file.
    goal: 'learn.xiangqi.protection.goal.noUndefended',
    fen: '4c4/9/9/4p4/9/9/7R1/4B4/9/9 w',
    sampleSolution: 'e3c5',
  },
  {
    // Find the hanging piece among the safe ones.
    goal: 'learn.xiangqi.protection.goal.noUndefended',
    fen: '1r7/9/9/9/9/9/4P4/1N4C2/9/9 w',
    sampleSolution: 'b3a5',
  },
  {
    // Capstone: defend from a distance.
    goal: 'learn.xiangqi.protection.goal.noUndefended',
    fen: '3r1c3/9/9/9/9/3N1P3/9/9/1C7/8R w',
    sampleSolution: 'i1d1',
  },
].map((level) => ({ nbMoves: 1, ...level }));

export const protectionStage = {
  key: 'protection',
  title: 'learn.xiangqi.protection.title',
  subtitle: 'learn.xiangqi.protection.subtitle',
  intro: 'learn.xiangqi.protection.intro',
  complete: 'learn.xiangqi.protection.complete',
  illustration: { glyph: '守' },
  copy: {
    'learn.xiangqi.protection.title': 'Protection',
    'learn.xiangqi.protection.subtitle': 'Keep your pieces safe',
    'learn.xiangqi.protection.intro':
      'A piece under attack is not lost yet. You can move it away, defend it so a capture can be answered, or break the attack itself.',
    'learn.xiangqi.protection.complete':
      'Well done! A piece you keep is a piece you can attack with later. Watch for cannons: they strike from across the board, but never without a screen.',
    'learn.xiangqi.protection.goal.escape': 'Your piece is under attack! Move it to safety.',
    'learn.xiangqi.protection.goal.defend':
      'Defend the attacked soldier. If they take it, you take back!',
    'learn.xiangqi.protection.goal.removeScreen':
      'The cannon needs its screen. Walk the screen away and the attack disappears!',
    'learn.xiangqi.protection.goal.noUndefended': 'One of your pieces hangs. Find it and save it!',
  },
  levels,
};
