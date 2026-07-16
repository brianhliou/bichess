// Xiangqi Learn — Stage: combat (实战演练). The capstone of the pieces +
// capture arc (lila combat.ts arc, xiangqi-ized): bigger mixed forces, longer
// clearing sequences, and the detectCapture('unprotected') scan live after
// every move. Success = every black piece captured; the last two levels score
// captures by piece value. Each level has at least one safe clearing order,
// proven by the sampleSolution the verifier replays through the runner.

import { extinct } from '../learn-assert.js';
import { arrow, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // Chariot tour: three loose black pieces, three captures, no danger if
    // you follow the line of the file and the rank.
    goal: 'learn.xiangqi.combat.goal.main',
    fen: '6n2/9/9/1p4p2/9/4P4/9/7N1/1R7/9 w',
    nbMoves: 3,
    captures: 3,
    shapes: [arrow('b2', 'b7'), arrow('b7', 'g7'), arrow('g7', 'g10', 'yellow')],
    sampleSolution: 'b2b7 b7g7 g7g10',
  },
  {
    // Order matters: the black horse eyes your soldier on e5. Remove the
    // attacker first, then mop up the soldier and the elephant.
    goal: 'learn.xiangqi.combat.goal.order',
    fen: '2b6/9/9/5n3/2p6/4P4/9/9/5RC2/9 w',
    nbMoves: 4,
    captures: 3,
    sampleSolution: 'f2f7 f7c7 c7c6 c6c10',
  },
  {
    // Screens: the cannon opens fire over the enemy soldier, then the
    // chariot finishes what the cannon cannot reach without a screen.
    goal: 'learn.xiangqi.combat.goal.screens',
    fen: '9/9/4b2n1/9/7p1/9/4P4/7C1/9/7R1 w',
    nbMoves: 4,
    captures: 3,
    sampleSolution: 'h3h8 h1h6 h6e6 e6e8',
  },
  {
    // Values on: the horse opens by taking the big chariot (90), then the
    // red chariot swings around the cannon's fire to clear the rest.
    goal: 'learn.xiangqi.combat.goal.values',
    fen: '9/2c6/5r3/9/4N1p2/2p6/6P2/9/R8/9 w',
    nbMoves: 5,
    captures: 4,
    showPieceValues: true,
    sampleSolution: 'e6f8 f8g6 a2a9 a9c9 c9c5',
  },
  {
    // Capstone: chariot, cannon and horse fight together. Take the chariot
    // before it takes yours, use the enemy soldier as your screen, and let
    // the horse land the last blow.
    goal: 'learn.xiangqi.combat.goal.final',
    fen: '7r1/9/9/2n1c4/9/2p6/9/1NC4R1/9/9 w',
    nbMoves: 5,
    captures: 4,
    showPieceValues: true,
    sampleSolution: 'h3h10 c3c7 h10e10 e10e7 b3c5',
  },
].map((level) => ({ pointsForCapture: true, success: extinct('black'), ...level }));

export const combatStage = {
  key: 'combat',
  title: 'learn.xiangqi.combat.title',
  subtitle: 'learn.xiangqi.combat.subtitle',
  intro: 'learn.xiangqi.combat.intro',
  complete: 'learn.xiangqi.combat.complete',
  illustration: { glyph: '战' },
  copy: {
    'learn.xiangqi.combat.title': 'Combat',
    'learn.xiangqi.combat.subtitle': 'Capture and defend',
    'learn.xiangqi.combat.intro':
      'Time for a real skirmish. Use everything you have learned: capture every black piece, and never leave your own hanging.',
    'learn.xiangqi.combat.complete':
      'Victory! You can attack, defend, and pick the right order to strike. Next: aim at the enemy general.',
    'learn.xiangqi.combat.goal.main': 'Take all the black pieces. Do not lose any of yours!',
    'learn.xiangqi.combat.goal.order':
      'A black piece is threatening you. Deal with the attacker first, then clean up.',
    'learn.xiangqi.combat.goal.screens':
      'Clear the board. The cannon needs a screen to capture, the chariot does not.',
    'learn.xiangqi.combat.goal.values':
      'Big pieces score big: chariot 90, cannon 45, horse 40. Take them all, safely.',
    'learn.xiangqi.combat.goal.final':
      'The last skirmish. Clear every black piece and keep your whole army standing.',
  },
  levels,
};
