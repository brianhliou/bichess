// Xiangqi Learn — Stage: the general (帅). The piece the whole game is about.
// He moves one orthogonal step and can only stand on the nine palace points
// d1-f3; the geometry itself teaches the confinement (relaxed movegen never
// offers a point outside the palace). All levels use emptyApples: bare star
// markers, no phantom soldiers, because the general's intro stage is about
// walking, not capturing. The black general stays off the board (relaxed
// mode tolerates general-less fragments).
//
// Craft note: movement stages cannot fail, so the lever is par pressure.
// Each level teaches one palace concept and its nbMoves is the BFS optimum
// (verifier-enforced): L1 the four-direction gait, L2 the no-diagonal rule
// (stars sit ON the painted palace diagonal), L3 order matters (the star in
// front of your face is the trap), L4 a wall sweep with one unique optimal
// route. Design fact, brute-force verified: on the 3x3 palace a UNIQUE
// nearest star first can never break par, and a full four-corner tour costs
// at least 6 moves; hence L3 uses a nearest TIE and L4 sweeps three corners.

import { arrow, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // The gait: one orthogonal step at a time, from his home point. The
    // route bends (up, then left) so two of the four directions get used.
    // BFS par 2 (e2 then d2; d2 first costs 3).
    goal: 'learn.xiangqi.general.goal.1',
    fen: '9/9/9/9/9/9/9/9/9/4K4 w',
    apples: 'e2 d2',
    emptyApples: true,
    nbMoves: 2,
    shapes: [arrow('e1', 'e2'), arrow('e2', 'd2')],
  },
  {
    // The no-diagonal rule, taught by the board itself: the palace's painted
    // diagonal runs exactly d1-e2-f3, and both stars sit on it. The eye reads
    // "two diagonal slides"; the general has to take the stairs. Red arrow
    // marks the move that does not exist (soldier-stage convention), green
    // arrows show the first staircase. BFS par 4 (e2 in 2, then f3 in 2;
    // f3 first costs 6).
    goal: 'learn.xiangqi.general.goal.2',
    fen: '9/9/9/9/9/9/9/9/9/3K5 w',
    apples: 'e2 f3',
    emptyApples: true,
    nbMoves: 4,
    shapes: [arrow('d1', 'e2', 'red'), arrow('d1', 'e1', 'green'), arrow('e1', 'e2', 'green')],
  },
  {
    // ORDER MATTERS. Trap: e2 sits directly in front of the general and
    // begs to be grabbed first, but every e2-first order costs 5+ (e2, d2,
    // then the long walk to f1) and d2-first also costs 5. The unique par
    // route takes the corner spur FIRST: e1-f1 (star), back through e1 or
    // f2 to e2 (star), then d2 (star) = 4. The logic is discoverable: f1 is
    // a dead end, while e2 lies on the road to d2, so clear the dead end
    // before you take the road. BFS par 4; only an f1-first order achieves it.
    goal: 'learn.xiangqi.general.goal.3',
    fen: '9/9/9/9/9/9/9/9/9/4K4 w',
    apples: 'f1 e2 d2',
    emptyApples: true,
    nbMoves: 4,
  },
  {
    // Capstone: the wall sweep. One unique optimal ORDER (f3, d3, d1) and
    // one unique optimal PATH: f2-f3-e3-d3-d2-d1, tracing the palace edge
    // through three corners with zero slack; any other first star costs 7+.
    // (A true four-corner tour is 6+ moves even starting on a corner, so
    // the five-move sweep is the sharpest corner lesson the palace allows.)
    // BFS par 5.
    goal: 'learn.xiangqi.general.goal.4',
    fen: '9/9/9/9/9/9/9/9/5K3/9 w',
    apples: 'f3 d3 d1',
    emptyApples: true,
    nbMoves: 5,
  },
];

export const generalStage = {
  key: 'general',
  title: 'learn.xiangqi.general.title',
  subtitle: 'learn.xiangqi.general.subtitle',
  intro: 'learn.xiangqi.general.intro',
  complete: 'learn.xiangqi.general.complete',
  illustration: { piece: 'general' },
  copy: {
    'learn.xiangqi.general.title': 'The general',
    'learn.xiangqi.general.subtitle': 'Keep him safe inside the palace',
    'learn.xiangqi.general.intro':
      'The general is the most important piece in xiangqi. He moves one step at a time, up, down, or sideways, and he can never leave the palace: those nine points are his whole world.',
    'learn.xiangqi.general.complete':
      'You can command the general. Remember: the whole game is about this one piece. Lose him and you lose everything.',
    'learn.xiangqi.general.goal.1':
      'The general steps one point at a time: up, down, left, or right. Follow the arrows!',
    'learn.xiangqi.general.goal.2':
      'See the line painted across the palace? It is not for him. Generals never step diagonally. Take the stairs!',
    'learn.xiangqi.general.goal.3':
      'Slow pieces must plan. One of the near stars is a trap: pick the wrong first step and you run out of moves. Think, then walk!',
    'learn.xiangqi.general.goal.4':
      'March the palace walls, corner to corner to corner, with no wasted step. He should know his home by heart.',
  },
  levels,
};
