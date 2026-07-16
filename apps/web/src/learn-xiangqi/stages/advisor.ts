// Xiangqi Learn — Stage: the advisor (仕). The general's bodyguard: one
// diagonal step, never outside the palace. A red advisor can only ever stand
// on FIVE points: d1 f1 e2 d3 f3, a star graph whose hub is e2 (every corner
// touches only the hub). The stage teaches that geometry: step (L1), the e2
// hub (L2), the full corner tour (L3), then a two-advisor teamwork capstone
// (L4: the pair sweeps three corners in 5 moves where the f1 advisor alone
// would need 6). Apples materialize as enemy soldiers; capture = the move.

import { arrow, circle, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // One diagonal step, up the palace diagonal onto the hub.
    goal: 'learn.xiangqi.advisor.goal.1',
    fen: '9/9/9/9/9/9/9/9/9/5A3 w',
    apples: 'e2',
    nbMoves: 1,
    shapes: [arrow('f1', 'e2')],
  },
  {
    // The hub: every advisor road runs through e2.
    goal: 'learn.xiangqi.advisor.goal.2',
    fen: '9/9/9/9/9/9/9/9/9/3A5 w',
    apples: 'e2 f3',
    nbMoves: 2,
    shapes: [circle('e2', 'blue')],
  },
  {
    // Full tour of the remaining corner points; back through e2 each time.
    goal: 'learn.xiangqi.advisor.goal.3',
    fen: '9/9/9/9/9/9/9/9/9/3A5 w',
    apples: 'f1 d3 f3',
    nbMoves: 6,
  },
  {
    // Capstone: two advisors share the work. The f1 advisor alone would need
    // six moves for these three corners; the pair finishes in five (BFS par).
    goal: 'learn.xiangqi.advisor.goal.4',
    fen: '9/9/9/9/9/9/9/9/4A4/5A3 w',
    apples: 'd1 d3 f3',
    nbMoves: 5,
  },
];

export const advisorStage = {
  key: 'advisor',
  title: 'learn.xiangqi.advisor.title',
  subtitle: 'learn.xiangqi.advisor.subtitle',
  intro: 'learn.xiangqi.advisor.intro',
  complete: 'learn.xiangqi.advisor.complete',
  illustration: { piece: 'advisor' },
  copy: {
    'learn.xiangqi.advisor.title': 'The advisor',
    'learn.xiangqi.advisor.subtitle': 'It never leaves the palace',
    'learn.xiangqi.advisor.intro':
      "The advisor is the general's bodyguard. It takes one diagonal step at a time and never leaves the palace: only five points can ever hold it.",
    'learn.xiangqi.advisor.complete':
      'Well done! The advisor lives and dies inside the palace. Keep it home: its whole job is shielding the general.',
    'learn.xiangqi.advisor.goal.1': 'One diagonal step. Grab the star!',
    'learn.xiangqi.advisor.goal.2':
      'Every advisor road runs through e2, the heart of the palace. Cross it and grab both stars.',
    'learn.xiangqi.advisor.goal.3':
      'Visit every corner of the palace. Back through the center each time!',
    'learn.xiangqi.advisor.goal.4':
      'Use both advisors! Alone, the far advisor needs six moves. As a team you can finish in five.',
  },
  levels,
};
