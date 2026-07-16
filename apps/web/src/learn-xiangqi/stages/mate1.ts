// Xiangqi Learn — Stage: mate in one (lila checkmate1.ts arc, xiangqi-ized).
// Every level is strict mode: the real kernel detects checkmate on apply, so
// success is simply mate('red') and the sampleSolution must genuinely mate.
// The arc climbs through the classic xiangqi mating shapes: cornered-general
// chariot mate, double cannon (重炮), smothered cannon (闷宫), corner horse
// (挂角马), soldier mate, the flying-general file cut, then a fuller-board
// capstone where only one of several checks is mate.

import { mate, not } from '../learn-assert.js';
import { arrow, type LearnLevelPartial } from '../learn-types.js';

const common = {
  nbMoves: 1,
  rules: 'strict',
  detectCapture: false,
  success: mate('red'),
  failure: not(mate('red')),
  showFailureFollowUp: true,
} as const;

const levels: LearnLevelPartial[] = [
  {
    // L1 — bare chariot vs the cornered general: black's own cannon on f9
    // blocks the only flight square, so the back-rank check is mate.
    goal: 'learn.xiangqi.mate1.goal.chariot',
    fen: '5k3/5c3/9/9/R8/9/9/9/9/4K4 w',
    shapes: [arrow('a6', 'a10', 'green')],
    sampleSolution: 'a6a10',
  },
  {
    // L2 — double cannon mate (重炮): the front cannon is the screen for the
    // back one, and any advisor interposing on e9 becomes a screen itself.
    goal: 'learn.xiangqi.mate1.goal.doubleCannon',
    fen: '3aka3/9/9/9/9/4C4/9/1C7/9/4K4 w',
    sampleSolution: 'b3e3',
  },
  {
    // L3 — smothered cannon mate (闷宫): the advisors on e9 and f10 box in
    // their own general; f10 is the screen and d10 is covered through it.
    goal: 'learn.xiangqi.mate1.goal.smother',
    fen: '4ka3/4a4/9/9/9/9/9/8C/9/4K4 w',
    sampleSolution: 'i3i10',
  },
  {
    // L4 — corner horse mate (挂角马): the horse on the palace corner point
    // f8 checks e10; the soldier on e8 guards the e9 flight.
    goal: 'learn.xiangqi.mate1.goal.horse',
    fen: '3aka3/9/4P4/9/6N2/9/9/9/9/4K4 w',
    sampleSolution: 'g6f8',
  },
  {
    // L5 — soldier mate on the doorstep: three soldiers in the palace; the
    // attacked e9 soldier steps up to e10 and mates sideways.
    goal: 'learn.xiangqi.mate1.goal.soldier',
    fen: '3P1k3/4P1P2/5a3/9/9/9/9/9/9/4K4 w',
    sampleSolution: 'e9e10',
  },
  {
    // L6 — flying-general mate (白脸将): the red general watches the open
    // e-file, so the black general may not step onto e10; the chariot check
    // on the d-file is mate.
    goal: 'learn.xiangqi.mate1.goal.flying',
    fen: '3k5/9/9/9/9/9/7R1/9/9/4K4 w',
    sampleSolution: 'h4d4',
  },
  {
    // L7 — capstone: a fuller board with several checks (soldier takes e9,
    // cannon to e4) but only the back-rank smother Ci10 is mate.
    goal: 'learn.xiangqi.mate1.goal.capstone',
    fen: '2b1ka3/4aP1R1/9/2n6/9/9/8C/9/1r7/3AK1B2 w',
    sampleSolution: 'i4i10',
  },
].map((level) => ({ ...common, ...level }));

export const mate1Stage = {
  key: 'mate1',
  title: 'learn.xiangqi.mate1.title',
  subtitle: 'learn.xiangqi.mate1.subtitle',
  intro: 'learn.xiangqi.mate1.intro',
  complete: 'learn.xiangqi.mate1.complete',
  illustration: { glyph: '杀' },
  copy: {
    'learn.xiangqi.mate1.title': 'Mate in one',
    'learn.xiangqi.mate1.subtitle': 'Win the game',
    'learn.xiangqi.mate1.intro':
      'You win by checkmate: attack the enemy general so no reply can save it. Each position here hides a single move that ends the game. Find it!',
    'learn.xiangqi.mate1.complete':
      'Well done! You now know the classic mating shapes: the cornered general, the double cannon, the smothered palace, the corner horse, and the flying-general file. Each has carried a Chinese name for centuries. You will meet them again, by name, in the Mate patterns stage.',
    'learn.xiangqi.mate1.goal.chariot':
      'The black general hides in the corner, and its own cannon blocks the way out. Mate in one with your chariot!',
    'learn.xiangqi.mate1.goal.doubleCannon':
      'Two cannons, one file: the front cannon is the screen for the back one. Line them up for the double cannon mate, 重炮!',
    'learn.xiangqi.mate1.goal.smother':
      'The black advisors box in their own general. Fire your cannon down the back rank for the sealed palace mate, 闷宫!',
    'learn.xiangqi.mate1.goal.horse':
      'Hop your horse onto the palace corner for the corner horse mate, 挂角马. Your soldier already guards the escape square.',
    'learn.xiangqi.mate1.goal.soldier':
      'Humble soldiers are deadly inside the palace. One small step forward is mate!',
    'learn.xiangqi.mate1.goal.flying':
      'Generals may never face each other on an open file. Your general watches the middle file, so the black general cannot step onto it. Check from the side: the white-face general mate, 白脸将!',
    'learn.xiangqi.mate1.goal.capstone':
      'A real battle. Several moves give check, but only one is mate. Find it!',
  },
  levels,
};
