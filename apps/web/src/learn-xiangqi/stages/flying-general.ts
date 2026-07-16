// Xiangqi Learn — Stage: the flying general (对面笑). The two generals may
// never face each other on an open file: strict mode enforces it, and this
// stage first states the rule, then weaponizes it. Your general projects an
// invisible laser down its open file: the enemy general can never step into
// it, and can never capture a piece if doing so would leave the generals
// facing. All four levels are strict-mode mate-in-one.

import { mate } from '../learn-assert.js';
import { arrow, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // The rule as a mating net: your general on the open e-file cuts e10, so
    // one chariot check along the f-file is mate.
    goal: 'learn.xiangqi.flyingGeneral.goal.rule',
    fen: '5k3/9/9/9/9/R8/9/9/9/4K4 w',
    shapes: [arrow('e1', 'e10', 'red'), arrow('a5', 'f5', 'green')],
    sampleSolution: 'a5f5',
  },
  {
    // Open the file: the chariot itself is the last screen on your general's
    // file. Stepping off it delivers check AND unleashes the general's stare.
    goal: 'learn.xiangqi.flyingGeneral.goal.open',
    fen: '3k5/9/9/9/9/9/4R4/9/9/4K4 w',
    sampleSolution: 'e4d4',
  },
  {
    // The general as a defender: the chariot lands right next to the enemy
    // general, and capturing it is illegal because the generals would face.
    goal: 'learn.xiangqi.flyingGeneral.goal.support',
    fen: '3k5/3n5/9/9/9/4R4/9/9/9/4K4 w',
    sampleSolution: 'e5e10',
  },
  {
    // Capstone: cannon check over your own crossed soldier (a screen black
    // cannot remove), flight square cut by your general's open file.
    goal: 'learn.xiangqi.flyingGeneral.goal.capstone',
    fen: '5k3/9/9/9/5P3/9/7C1/9/9/4K4 w',
    sampleSolution: 'h4f4',
  },
].map((level) => ({
  nbMoves: 1,
  rules: 'strict' as const,
  detectCapture: false,
  success: mate('red'),
  ...level,
}));

export const flyingGeneralStage = {
  key: 'flying-general',
  title: 'learn.xiangqi.flyingGeneral.title',
  subtitle: 'learn.xiangqi.flyingGeneral.subtitle',
  intro: 'learn.xiangqi.flyingGeneral.intro',
  complete: 'learn.xiangqi.flyingGeneral.complete',
  illustration: { glyph: '飞' },
  copy: {
    'learn.xiangqi.flyingGeneral.title': 'The flying general',
    'learn.xiangqi.flyingGeneral.subtitle': 'Generals must never face each other',
    'learn.xiangqi.flyingGeneral.intro':
      'The two generals may never face each other on an open file. Your general beams an invisible threat down its file: the enemy general cannot step into it, ever. Great players use this rule as an extra attacker.',
    'learn.xiangqi.flyingGeneral.complete':
      'Well done! Your general is more than a piece to protect: on an open file it fights like a hidden chariot. Players have a name for this weapon: 白脸将 (báiliǎn jiàng), the white-face general, also called 对面笑, the face-to-face smile. Watch for it in every endgame.',
    'learn.xiangqi.flyingGeneral.goal.rule':
      "Generals may never face each other on an open file. So the black general cannot step onto your general's file. Check on the f-file is mate in one!",
    'learn.xiangqi.flyingGeneral.goal.open':
      "Your chariot is the last piece on your general's file. Move it to give check, and the file opens: the escape square is gone. Mate in one!",
    'learn.xiangqi.flyingGeneral.goal.support':
      'Land your chariot right next to the black general. Capturing it is illegal: the generals would face each other. Mate in one!',
    'learn.xiangqi.flyingGeneral.goal.capstone':
      'Combine your weapons: the cannon checks over a screen while your general seals the open file. Mate in one!',
  },
  levels,
};
