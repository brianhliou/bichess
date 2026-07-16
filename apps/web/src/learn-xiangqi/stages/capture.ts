// Xiangqi Learn — Stage: capturing (lila capture.ts arc, xiangqi-ized).
// Real captures, no apples: success = extinct('black'), every player move is a
// capture (nbMoves = captures), and the default detectCapture('unprotected')
// scan supplies the tension: take their pieces without hanging yours. The
// xiangqi twist escalates through the arc: shifting cannon screens (level 3)
// and horse legs (level 4) before the mixed-force capstone.

import { extinct } from '../learn-assert.js';
import { arrow, circle, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // Chariot takes one undefended soldier.
    goal: 'learn.xiangqi.capture.goal.one',
    fen: '9/9/9/9/4p4/9/9/9/4R4/9 w',
    nbMoves: 1,
    captures: 1,
    shapes: [arrow('e2', 'e6')],
    sampleSolution: 'e2e6',
  },
  {
    // Order matters: grab the soldier first and the black chariot takes you.
    goal: 'learn.xiangqi.capture.goal.order',
    fen: '9/4r4/9/9/9/4R4/9/9/4p4/9 w',
    nbMoves: 2,
    captures: 2,
    sampleSolution: 'e5e9 e9e2',
  },
  {
    // Cannon tour: each capture jumps a different screen.
    goal: 'learn.xiangqi.capture.goal.screens',
    fen: '9/9/9/9/2b1P1b2/9/2P6/9/2C6/9 w',
    nbMoves: 2,
    captures: 2,
    sampleSolution: 'c2c6 c6g6',
  },
  {
    // Horse tour: the cannon is one jump away, but your own soldier stands on
    // the leg. Go the long way around.
    goal: 'learn.xiangqi.capture.goal.legs',
    fen: '9/9/9/7p1/5c3/4P1p2/4N4/9/9/9 w',
    nbMoves: 3,
    captures: 3,
    shapes: [arrow('e4', 'f6', 'red'), circle('e5', 'red')],
    sampleSolution: 'e4g5 g5h7 h7f6',
  },
  {
    // Capstone: mixed force, safe order required. Cannon first hangs your
    // chariot to the black one: the enemy chariot dies first.
    goal: 'learn.xiangqi.capture.goal.capstone',
    fen: '9/1p2r4/7n1/9/9/7P1/9/7C1/4R4/9 w',
    nbMoves: 3,
    captures: 3,
    sampleSolution: 'e2e9 h3h8 e9b9',
  },
].map((level) => ({ ...level, pointsForCapture: true, success: extinct('black') }));

export const captureStage = {
  key: 'capture',
  title: 'learn.xiangqi.capture.title',
  subtitle: 'learn.xiangqi.capture.subtitle',
  intro: 'learn.xiangqi.capture.intro',
  complete: 'learn.xiangqi.capture.complete',
  illustration: { glyph: '吃' },
  copy: {
    'learn.xiangqi.capture.title': 'Capturing',
    'learn.xiangqi.capture.subtitle': 'Take the enemy pieces',
    'learn.xiangqi.capture.intro':
      'To capture, move your piece onto an enemy piece. Take every black piece, but stay sharp: your pieces can be captured too.',
    'learn.xiangqi.capture.complete':
      'Well done! Capturing wins material, and material wins games. Pick the order that keeps your own pieces safe.',
    'learn.xiangqi.capture.goal.one': 'Use your chariot to capture the black soldier!',
    'learn.xiangqi.capture.goal.order':
      'Take both black pieces without losing yours! The capture order matters.',
    'learn.xiangqi.capture.goal.screens':
      'Capture both elephants with your cannon. Every capture needs its own screen.',
    'learn.xiangqi.capture.goal.legs':
      'Capture all three pieces with your horse. Your soldier blocks one leg: jump around it.',
    'learn.xiangqi.capture.goal.capstone':
      'Capture everything and lose nothing! The most dangerous enemy piece goes first.',
  },
  levels,
};
