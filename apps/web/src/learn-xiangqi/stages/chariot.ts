// Xiangqi Learn — Stage: the chariot (车). The FIRST stage of the course, so
// level 1 stays a free one-move grab with a hint arrow; from level 2 on the
// stage teaches sliding-piece ROUTE PLANNING: order-matters star pairs, then
// friendly walls (the chariot cannot jump), then a boxed-in maze, then a
// greedy-trap capstone. Apples are bare markers (emptyApples), NOT
// materialized as blocking soldiers: the chariot is a sliding piece, so its
// legal-move dots must extend the full rank/file THROUGH and BEYOND a star.
// Obstacles are therefore RED (friendly) pieces on plausible home points:
// they block the slide and cannot be captured. NOTE the verifier's BFS moves
// every red piece (and eats a star with ANY red move onto it), so walls sit
// where moving them never shortcuts the route and where they cannot reach a
// star cheaply themselves. Par counts (nbMoves) are BFS-verified optimal.

import { arrow, circle, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // The course's first-ever move: one straight slide, arrow shows the way.
    goal: 'learn.xiangqi.chariot.goal.1',
    fen: '9/9/9/9/9/9/9/9/4R4/9 w',
    apples: 'e7',
    emptyApples: true,
    nbMoves: 1,
    shapes: [arrow('e2', 'e7')],
  },
  {
    // Order matters, no arrow: h3 shares the chariot's file, c3 does not.
    // h8-h3-c3 = 2; grabbing c3 first (h8-c8-c3-h3) costs 3.
    goal: 'learn.xiangqi.chariot.goal.2',
    fen: '9/9/7R1/9/9/9/9/9/9/9 w',
    apples: 'h3 c3',
    emptyApples: true,
    nbMoves: 2,
  },
  {
    // First wall: your own soldier on its home point a4 blocks the a-file.
    // The direct a1-a8 slide does not exist; detour a1-b1-b8-a8 = 3. The
    // soldier marching to the star itself also costs 3+, so par holds.
    goal: 'learn.xiangqi.chariot.goal.3',
    fen: '9/9/9/9/9/9/P8/9/9/R8 w',
    apples: 'a8',
    emptyApples: true,
    nbMoves: 3,
    shapes: [circle('a4', 'red'), arrow('a1', 'a8', 'red')],
  },
  {
    // Boxed in by its own army (elephants c1/g1, advisor e2, all on home
    // points): from e1 the chariot has exactly two exits, d1 and f1, and
    // only one leads anywhere. The single par route: e1-f1-f5-b5-b9.
    // The d1 exit reaches no star in one move, so it can never make par;
    // sliding the advisor aside opens file e but there is no star on it.
    goal: 'learn.xiangqi.chariot.goal.4',
    fen: '9/9/9/9/9/9/9/9/4A4/2B1R1B2 w',
    apples: 'f5 b5 b9',
    emptyApples: true,
    nbMoves: 4,
  },
  {
    // Capstone greedy trap: f4 sits right next to the chariot but is the
    // TAIL of the chain. Nearest-first (f4 then f1) strands the rest and
    // costs 7. The par tour eats a star on every move and is forced from
    // the far end: e6-a6-a10-f10-f4-f1 = 5.
    goal: 'learn.xiangqi.chariot.goal.5',
    fen: '9/9/9/9/4R4/9/9/9/9/9 w',
    apples: 'a6 a10 f10 f4 f1',
    emptyApples: true,
    nbMoves: 5,
  },
];

export const chariotStage = {
  key: 'chariot',
  title: 'learn.xiangqi.chariot.title',
  subtitle: 'learn.xiangqi.chariot.subtitle',
  intro: 'learn.xiangqi.chariot.intro',
  complete: 'learn.xiangqi.chariot.complete',
  illustration: { piece: 'chariot' },
  copy: {
    'learn.xiangqi.chariot.title': 'The chariot',
    'learn.xiangqi.chariot.subtitle': 'It moves in straight lines',
    'learn.xiangqi.chariot.intro':
      'The chariot is the strongest piece on the board. It slides any distance along a rank or file. Click or drag to move it.',
    'learn.xiangqi.chariot.complete':
      'Congratulations! You can command a chariot. Chariots win most games, so develop them early.',
    'learn.xiangqi.chariot.goal.1': 'Click on the chariot and grab the star!',
    'learn.xiangqi.chariot.goal.2':
      'Two stars, two moves. One star is already on your line. Grab that one first!',
    'learn.xiangqi.chariot.goal.3':
      'Your own soldier is in the way, and chariots cannot jump. Find a road around!',
    'learn.xiangqi.chariot.goal.4':
      'Boxed in by your own army! Only one exit leads to the stars. Pick it and sweep them up.',
    'learn.xiangqi.chariot.goal.5':
      'Five stars, five moves. Do not chase the closest star: read the whole board, then ride the line!',
  },
  levels,
};
