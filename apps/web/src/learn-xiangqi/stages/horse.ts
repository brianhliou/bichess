// Xiangqi Learn — Stage: the horse (马). One point straight, one point
// diagonally out; a piece on the first point (the leg) blocks the jump. This
// is THE xiangqi horse lesson: chess knights fly over pieces, xiangqi horses
// do not. Levels 1-3 teach the L-jump across all eight directions; levels 4-5
// are leg-block mazes with frozen enemy soldiers on the legs; level 6 is a
// six-star capstone tour. Apples materialize as enemy soldiers, so captures
// obey real horse geometry. Par counts (nbMoves) are BFS-verified optimal.

import { arrow, circle, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // One clean jump: step forward (e3), land diagonally out (f4).
    goal: 'learn.xiangqi.horse.goal.1',
    fen: '9/9/9/9/9/9/9/9/4N4/9 w',
    apples: 'f4',
    nbMoves: 1,
    shapes: [arrow('e2', 'f4')],
  },
  {
    // A four-jump chain: e4-f6-h5-g3-e2, bending through four directions.
    goal: 'learn.xiangqi.horse.goal.2',
    fen: '9/9/9/9/9/9/4N4/9/9/9 w',
    apples: 'f6 h5 g3 e2',
    nbMoves: 4,
  },
  {
    // The other four directions: f3-e5-c6-e7-f5.
    goal: 'learn.xiangqi.horse.goal.3',
    fen: '9/9/9/9/9/9/9/5N3/9/9 w',
    apples: 'e5 c6 e7 f5',
    nbMoves: 4,
  },
  {
    // First leg block: the soldier on e5 blocks the one-jump route e4-f6
    // (and d6). The detour costs three: e4-c5-d7-f6 or e4-g5-h7-f6.
    goal: 'learn.xiangqi.horse.goal.4',
    fen: '9/9/9/9/9/4p4/4N4/9/9/9 w',
    apples: 'f6',
    nbMoves: 3,
    shapes: [circle('e5', 'red'), arrow('e4', 'f6', 'red')],
  },
  {
    // Leg maze: e3 blocks BOTH forward jumps from e2, so the horse must swing
    // wide: e2-g3-f5-g7-e6, eating the f5 star on the way around.
    goal: 'learn.xiangqi.horse.goal.5',
    fen: '9/9/9/9/9/9/9/4p4/4N4/9 w',
    apples: 'f5 e6',
    nbMoves: 4,
  },
  {
    // Capstone: a six-jump tour from the horse's home point,
    // b1-d2-f3-e5-c6-d8-f7, changing direction at every step.
    goal: 'learn.xiangqi.horse.goal.6',
    fen: '9/9/9/9/9/9/9/9/9/1N7 w',
    apples: 'd2 f3 e5 c6 d8 f7',
    nbMoves: 6,
  },
];

export const horseStage = {
  key: 'horse',
  title: 'learn.xiangqi.horse.title',
  subtitle: 'learn.xiangqi.horse.subtitle',
  intro: 'learn.xiangqi.horse.intro',
  complete: 'learn.xiangqi.horse.complete',
  illustration: { piece: 'horse' },
  copy: {
    'learn.xiangqi.horse.title': 'The horse',
    'learn.xiangqi.horse.subtitle': 'One point straight, one point out',
    'learn.xiangqi.horse.intro':
      'The horse moves one point along a line, then one point diagonally outward. It cannot jump over pieces: a piece standing on that first point blocks the move. That point is called the horse leg.',
    'learn.xiangqi.horse.complete':
      'Well ridden! Remember the leg: a horse in the open is strong, a horse with blocked legs is helpless. Watch the legs, yours and theirs. The best horse posts even have names centuries old: the stable horse 卧槽马 and the fishing horse 钓鱼马 await you in Mate patterns.',
    'learn.xiangqi.horse.goal.1': 'One step up the line, one step out. Grab the star!',
    'learn.xiangqi.horse.goal.2': 'Four stars, four jumps. Each one bends a different way.',
    'learn.xiangqi.horse.goal.3': 'Grab all the stars. The horse jumps in eight directions.',
    'learn.xiangqi.horse.goal.4':
      'A piece on the leg blocks the jump. The soldier blocks the short way, so ride around it!',
    'learn.xiangqi.horse.goal.5':
      'Both legs ahead are blocked. Swing around the side and follow the stars.',
    'learn.xiangqi.horse.goal.6': 'Six stars, six jumps. Check every leg before you leap!',
  },
  levels,
};
