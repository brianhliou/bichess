// Xiangqi Learn — Stage: stalemate wins (困毙). THE rule twist chess players
// must unlearn: a player with no legal moves LOSES in xiangqi, even when not
// in check (in chess the same position is a draw). Every level is strict-mode,
// one quiet move: after it, black must have ZERO legal moves for ANY piece and
// must NOT be in check. The strict kernel detects the stalemate on apply and
// awards the win to the mover, so success is stalemateWin('red').

import { stalemateWin } from '../learn-assert.js';
import { arrow, circle, type LearnLevelPartial } from '../learn-types.js';

// One-move strict levels: success is evaluated immediately after the player's
// move, so no scenario is needed (see AUTHORING.md strict-mode gotchas).
const common = {
  rules: 'strict',
  nbMoves: 1,
  detectCapture: false,
  success: stalemateWin('red'),
} as const;

const levels: LearnLevelPartial[] = [
  {
    // Bare general in the palace corner: d10 has only d9 and e10. A soldier on
    // e9 covers BOTH (forward e10, sideways d9) while never touching d10.
    ...common,
    goal: 'learn.xiangqi.stalemate.goal.seal',
    fen: '3k5/9/4P4/9/9/9/9/9/9/4K4 w',
    shapes: [arrow('e8', 'e9', 'green'), circle('d9', 'blue'), circle('e10', 'blue')],
    sampleSolution: 'e8e9',
  },
  {
    // Every black piece must be stuck. The g6 elephant is already frozen (both
    // eyes f7 and h7 are blocked); the same e9 soldier seal freezes the
    // general on f10 (e10 forward, f9 sideways) and black has nothing left.
    ...common,
    goal: 'learn.xiangqi.stalemate.goal.everyPiece',
    fen: '5k3/9/4P4/5P1P1/6b2/9/9/9/9/4K4 w',
    shapes: [circle('g6', 'blue')],
    sampleSolution: 'e8e9',
  },
  {
    // Soldier wall. The general on e10 has three squares (d10, f10, e9); the
    // d9 soldier already covers d10 and e9, pushing f8-f9 adds f10 and e9.
    // Neither soldier ever attacks e10 itself: seal, not check.
    ...common,
    goal: 'learn.xiangqi.stalemate.goal.wall',
    fen: '4k4/3P5/5P3/9/9/9/9/9/9/3K5 w',
    sampleSolution: 'f8f9',
  },
  {
    // Chariot file control + horse coverage. The e4 chariot holds the whole
    // e-file (e10 is out of bounds); the horse jump to c7 covers d9 without
    // giving check, and the general on d10 is out of squares.
    ...common,
    goal: 'learn.xiangqi.stalemate.goal.net',
    fen: '3k5/9/9/9/9/1N7/4R4/9/9/4K4 w',
    sampleSolution: 'b5c7',
  },
  {
    // Capstone: the tempting check loses the win. Rf5+ chases the general to
    // e10 (the chariot abandoned the e-file; the red general sits on d1, so
    // e10 is a real escape). The quiet horse move to g7 covers f9 instead,
    // the chariot keeps holding e10, and black is done.
    ...common,
    goal: 'learn.xiangqi.stalemate.goal.quiet',
    fen: '5k3/9/9/9/9/4R2N1/9/9/9/3K5 w',
    sampleSolution: 'h5g7',
  },
];

export const stalemateStage = {
  key: 'stalemate',
  title: 'learn.xiangqi.stalemate.title',
  subtitle: 'learn.xiangqi.stalemate.subtitle',
  intro: 'learn.xiangqi.stalemate.intro',
  complete: 'learn.xiangqi.stalemate.complete',
  illustration: { glyph: '困' },
  copy: {
    'learn.xiangqi.stalemate.title': 'Stalemate wins',
    'learn.xiangqi.stalemate.subtitle': 'No moves means you lose in xiangqi',
    'learn.xiangqi.stalemate.intro':
      'Chess players, unlearn this one: in chess, a player with no legal moves is stalemated and the game is a draw. In xiangqi they LOSE, even without check! This win is called kunbi (困毙). Seal every square, but do not give check.',
    'learn.xiangqi.stalemate.complete':
      'You mastered kunbi! In xiangqi you never need checkmate if you can leave your opponent with no move at all. Remember the quiet move: sealing the last square wins the game.',
    'learn.xiangqi.stalemate.goal.seal':
      'Black has only his general. Take away his last squares without giving check, and he loses!',
    'learn.xiangqi.stalemate.goal.everyPiece':
      'The elephant is already stuck: both of its eyes are blocked. Freeze the general too. Every black piece must be unable to move!',
    'learn.xiangqi.stalemate.goal.wall':
      'Build the soldier wall. Cover every square around the general, but never the general himself!',
    'learn.xiangqi.stalemate.goal.net':
      'Your chariot holds the file. Bring in the horse and black has nowhere left to go!',
    'learn.xiangqi.stalemate.goal.quiet':
      'A check would only chase the general to safety. Find the quiet move that leaves black nothing!',
  },
  levels,
};
