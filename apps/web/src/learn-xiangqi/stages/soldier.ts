// Xiangqi Learn — Stage: the soldier (兵). Ports lila's pawn-stage arc, with
// the river crossing standing in for promotion as the milestone: soldiers step
// one point forward, NEVER backward, and unlock the sideways step on rank 6+.
// All levels are emptyApples (bare markers): phantom soldiers would distort
// the forward-only geometry the stage is teaching. Pars are BFS-verified
// optimal, and since a soldier can never retreat, star ORDER is load-bearing
// on the zigzag levels.

import { arrow, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // One point forward at a time: three humble steps to the star.
    goal: 'learn.xiangqi.soldier.goal.1',
    fen: '9/9/9/9/9/9/9/9/4P4/9 w',
    apples: 'e5',
    emptyApples: true,
    nbMoves: 3,
    shapes: [arrow('e2', 'e3'), arrow('e3', 'e4'), arrow('e4', 'e5')],
  },
  {
    // Forward only: the red arrow marks the move that does not exist.
    // Pre-river, the soldier cannot reach anything behind or beside it;
    // the star sits straight ahead. Soldier on file c (a faithful red
    // soldier file) so a pre-river square never looks off to a xiangqi eye.
    goal: 'learn.xiangqi.soldier.goal.2',
    fen: '9/9/9/9/9/9/9/2P6/9/9 w',
    apples: 'c5',
    emptyApples: true,
    nbMoves: 2,
    shapes: [arrow('c3', 'c4', 'green'), arrow('c3', 'c2', 'red')],
  },
  {
    // THE milestone: cross the river, then the brand-new sideways step.
    goal: 'learn.xiangqi.soldier.goal.3',
    fen: '9/9/9/9/9/4P4/9/9/9/9 w',
    apples: 'f6',
    emptyApples: true,
    nbMoves: 2,
    shapes: [arrow('e5', 'e6', 'green'), arrow('e6', 'f6', 'blue')],
  },
  {
    // Post-river zigzag: closer star first (e7 then g7 = 5; the reverse
    // order wastes two sidesteps coming back).
    goal: 'learn.xiangqi.soldier.goal.4',
    fen: '9/9/9/9/2P6/9/9/9/9/9 w',
    apples: 'e7 g7',
    emptyApples: true,
    nbMoves: 5,
  },
  {
    // Order is everything: taking d8 first strands the soldier above f6
    // forever. Rank-mate first (f6), then climb: 2 + 4 = 6.
    goal: 'learn.xiangqi.soldier.goal.5',
    fen: '9/9/9/9/3P5/9/9/9/9/9 w',
    apples: 'f6 d8',
    emptyApples: true,
    nbMoves: 6,
  },
  {
    // Two soldiers: the crossed one can sidestep to d7 but never come back
    // for e5; the rear one marches up for it. Each star has exactly one
    // sensible owner.
    goal: 'learn.xiangqi.soldier.goal.6',
    fen: '9/9/9/4P4/9/9/9/4P4/9/9 w',
    apples: 'd7 e5',
    emptyApples: true,
    nbMoves: 3,
  },
  {
    // Capstone, three soldiers: a4 sweeps a5 then b6 (3), e6 pushes to e8
    // (2), i4 marches i5 i6 (2). No single soldier can cover for another
    // without going the long way round.
    goal: 'learn.xiangqi.soldier.goal.7',
    fen: '9/9/9/9/4P4/9/P7P/9/9/9 w',
    apples: 'a5 b6 e8 i5 i6',
    emptyApples: true,
    nbMoves: 7,
  },
];

export const soldierStage = {
  key: 'soldier',
  title: 'learn.xiangqi.soldier.title',
  subtitle: 'learn.xiangqi.soldier.subtitle',
  intro: 'learn.xiangqi.soldier.intro',
  complete: 'learn.xiangqi.soldier.complete',
  illustration: { piece: 'soldier' },
  copy: {
    'learn.xiangqi.soldier.title': 'The soldier',
    'learn.xiangqi.soldier.subtitle': 'Forward only, sideways after the river',
    'learn.xiangqi.soldier.intro':
      'Soldiers step one point straight forward and can never move backward. Cross the river and they earn a new power: the sideways step.',
    'learn.xiangqi.soldier.complete':
      'Congratulations! Soldiers never retreat, and they grow stronger across the river. Push them forward together and they can win the game: two soldiers at the palace gates have their own battle name, 二鬼拍门, two ghosts pounding the gates.',
    'learn.xiangqi.soldier.goal.1':
      'The soldier steps one point forward at a time. March to the star!',
    'learn.xiangqi.soldier.goal.2':
      'No turning back! A soldier can never move backward or sideways before the river. Forward, march!',
    'learn.xiangqi.soldier.goal.3':
      'Cross the river! On the far side, your soldier can also step sideways. Grab the star!',
    'learn.xiangqi.soldier.goal.4': 'Sidestep and push forward. Take the closer star first!',
    'learn.xiangqi.soldier.goal.5':
      'Plan your order! You can slide along a rank all day, but you can never come back down. Clear your own rank first.',
    'learn.xiangqi.soldier.goal.6':
      'Each star can only be reached by one soldier. Send the right one!',
    'learn.xiangqi.soldier.goal.7': 'Soldiers are weak alone but strong together. Use all three!',
  },
  levels,
};
