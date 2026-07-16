// Xiangqi Learn — Stage: the elephant (相). It steps exactly two points
// diagonally, is blocked when the midpoint (the "eye") is occupied, and may
// never cross the river. A red elephant can only ever stand on seven points:
// a3 c1 c5 e3 g1 g5 i3. Every apple below sits on that web; the eyes
// (b2 d2 f2 h2 b4 d4 f4 h4) are never elephant points, so materialized
// apples never block a route by accident. Level 3 blocks an eye with a
// frozen black soldier (the player cannot move it away) to force a detour.

import { arrow, circle, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // One two-step diagonal hop.
    goal: 'learn.xiangqi.elephant.goal.1',
    fen: '9/9/9/9/9/9/9/4B4/9/9 w',
    apples: 'c5',
    nbMoves: 1,
    shapes: [arrow('e3', 'c5')],
  },
  {
    // A short tour: hop point to point along the web.
    goal: 'learn.xiangqi.elephant.goal.2',
    fen: '9/9/9/9/9/9/9/9/9/2B6 w',
    apples: 'e3 g5',
    nbMoves: 2,
  },
  {
    // Eye-block: the black soldier on d2 plugs the eye of c1-e3.
    // Detour: c1 -> a3 -> c5 -> e3.
    goal: 'learn.xiangqi.elephant.goal.3',
    fen: '9/9/9/9/9/9/9/9/3p5/2B6 w',
    apples: 'e3',
    nbMoves: 3,
    shapes: [circle('d2', 'red')],
  },
  {
    // The river limit: c5 and g5 are as far as the elephant ever goes.
    // a3 -> c5 -> e3 -> g5.
    goal: 'learn.xiangqi.elephant.goal.4',
    fen: '9/9/9/9/9/9/9/B8/9/9 w',
    apples: 'c5 g5',
    nbMoves: 3,
  },
  {
    // Capstone: walk the whole seven-point web from g1.
    // g1 -> i3 -> g5 -> e3 -> c5 -> a3 -> c1.
    goal: 'learn.xiangqi.elephant.goal.5',
    fen: '9/9/9/9/9/9/9/9/9/6B2 w',
    apples: 'i3 g5 e3 c5 a3 c1',
    nbMoves: 6,
  },
];

export const elephantStage = {
  key: 'elephant',
  title: 'learn.xiangqi.elephant.title',
  subtitle: 'learn.xiangqi.elephant.subtitle',
  intro: 'learn.xiangqi.elephant.intro',
  complete: 'learn.xiangqi.elephant.complete',
  illustration: { piece: 'elephant' },
  copy: {
    'learn.xiangqi.elephant.title': 'The elephant',
    'learn.xiangqi.elephant.subtitle': 'Two diagonal steps, never across the river',
    'learn.xiangqi.elephant.intro':
      'The elephant steps exactly two points diagonally. If the point between (its eye) is occupied, the move is blocked. It can never cross the river: it guards your side of the board.',
    'learn.xiangqi.elephant.complete':
      'Well done! The elephant only ever visits seven points on your side. It is a defender: keep it home to shield your general.',
    'learn.xiangqi.elephant.goal.1': 'Two steps, one hop. Grab the star!',
    'learn.xiangqi.elephant.goal.2': 'Hop from point to point and grab both stars.',
    'learn.xiangqi.elephant.goal.3':
      'A piece on the middle point blocks the elephant: its eye is poked. Find the way around!',
    'learn.xiangqi.elephant.goal.4':
      'The elephant can never cross the river. These riverbank points are its front line: it is a defender.',
    'learn.xiangqi.elephant.goal.5':
      'Tour the whole web! The elephant only ever stands on seven points.',
  },
  levels,
};
