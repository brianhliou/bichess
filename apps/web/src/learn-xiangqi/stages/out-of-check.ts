// Xiangqi Learn — Stage: out of check (应将). Lila outOfCheck arc with real
// stakes. Strict movegen already forces the player to answer the check, so the
// craft lives in the REFUTATIONS: detectCapture stays on its 'unprotected'
// default, every level (after the forced-move opener) offers several legal
// escapes, and exactly one does not immediately lose material. Wrong answers
// are refuted on the board: blockers get eaten by the checker, greedy captures
// run into a defender, and the cannon's screen turns out to be poisoned.
// Taxonomy escalates run → block → capture → screen play → capstone.

import { not, selfCheck } from '../learn-assert.js';
import { arrow, type LearnLevelPartial } from '../learn-types.js';

/** The player answered the check: red's own general is no longer attacked.
 *  Under strict rules every LEGAL move satisfies this, so as an intent
 *  candidates assert it counts exactly the legal escapes. */
const escaped = not(selfCheck('red'));

const levels: LearnLevelPartial[] = [
  {
    // Run, the teaching level: the chariot owns the e-file and Kf1 is the
    // single legal move (d1 is flying-general illegal against the black
    // general on d10). The arrows are the one hint this stage gives.
    goal: 'learn.xiangqi.outOfCheck.goal.escape',
    fen: '3k5/9/9/9/4r4/9/9/9/9/4K4 w',
    shapes: [arrow('e6', 'e1', 'red'), arrow('e1', 'f1', 'green')],
    sampleSolution: 'e1f1',
    intent: { solutions: 1, candidates: { assert: escaped, min: 1 } },
  },
  {
    // Run, now with temptations: the horse can block on e3 or e5, but the
    // checking chariot eats either blocker for free. Only the sidestep to f1
    // costs nothing (d1 stays flying-general illegal).
    goal: 'learn.xiangqi.outOfCheck.goal.fleeTrap',
    fen: '3k5/9/9/9/4r4/9/6N2/9/9/4K4 w',
    sampleSolution: 'e1f1',
    intent: { solutions: 1, candidates: { assert: escaped, min: 3 } },
  },
  {
    // Block: the general is stuck (f1 covered by the f2 soldier, d1 flying-
    // general illegal, e2 stays on the file). Three blocks exist: the horse
    // hangs on e5 and e7, but the chariot block on e3 is defended by the i3
    // cannon over the g3 soldier screen. The screen also stops the cannon
    // from blocking on e3 itself. The cannon sits on i3, not h3: on h3 the
    // screen soldier could snap it up (gxh3) and the recapture Rh3 would be
    // an illegal pin-break, the e3 chariot being the check blocker.
    goal: 'learn.xiangqi.outOfCheck.goal.block',
    fen: '3k5/9/4r4/9/6N2/9/9/1R4p1C/5p3/4K4 w',
    sampleSolution: 'b3e3',
    intent: { solutions: 1, candidates: { assert: escaped, min: 3 } },
  },
  {
    // Capture: the checking chariot is all alone, so the horse just takes it.
    // Every block (horse e6, chariot e3, cannon e5) feeds the chariot a free
    // piece, and the f2 soldier plus flying-general keep the general home.
    goal: 'learn.xiangqi.outOfCheck.goal.capture',
    fen: '3k5/9/4r4/6N2/9/8C/9/1R7/5p3/4K4 w',
    sampleSolution: 'g7e8',
    intent: { solutions: 1, candidates: { assert: escaped, min: 4 } },
  },
  {
    // Screen play: the cannon checks over the e5 soldier. Two screens stop a
    // cannon, and three pieces can volunteer: the horse (e3), the cannon lift
    // (e7), and the chariot (e6). The f5 horse eats the first two; only the
    // chariot slides onto the line for free. Capturing the e5 soldier is not
    // even legal: the capturer would become the new screen. The f2 soldier
    // covers f1 and the open d-file keeps d1 flying-general illegal.
    goal: 'learn.xiangqi.outOfCheck.goal.screen',
    fen: '3k5/9/4c4/8C/R8/4pn3/6N2/9/5p3/4K4 w',
    sampleSolution: 'a6e6',
    intent: { solutions: 1, candidates: { assert: escaped, min: 3 } },
  },
  {
    // Capstone, all three at once: chariot takes chariot looks natural but
    // the g7 horse guards theirs, and both blocks (horse e3, cannon e5) are
    // chariot food. Only the quiet general step to d1 survives (f1 is
    // flying-general illegal against the black general on f10). The b8 horse
    // guards a6: the threat scan covers EVERY red piece, so after the flee
    // the enemy chariot's rank-6 grab of ours must have a recapture.
    goal: 'learn.xiangqi.outOfCheck.goal.best',
    fen: '5k3/9/1N7/6n2/R3r4/8C/9/9/6N2/4K4 w',
    sampleSolution: 'e1d1',
    intent: { solutions: 1, candidates: { assert: escaped, min: 4 } },
  },
].map((level) => ({
  rules: 'strict',
  nbMoves: 1,
  success: escaped,
  ...level,
}));

export const outOfCheckStage = {
  key: 'out-of-check',
  title: 'learn.xiangqi.outOfCheck.title',
  subtitle: 'learn.xiangqi.outOfCheck.subtitle',
  intro: 'learn.xiangqi.outOfCheck.intro',
  complete: 'learn.xiangqi.outOfCheck.complete',
  illustration: { glyph: '应' },
  copy: {
    'learn.xiangqi.outOfCheck.title': 'Out of check',
    'learn.xiangqi.outOfCheck.subtitle': 'Defend your general, at no cost',
    'learn.xiangqi.outOfCheck.intro':
      'Check! Your general is attacked and you must answer right away. Run, capture the attacker, or block the path. But careless rescues backfire: block with the wrong piece and the enemy simply eats it. Find the escape that costs you nothing.',
    'learn.xiangqi.outOfCheck.complete':
      'Congratulations! Run, capture, or block: your general always has a plan. Just count the cost before you choose. And when a cannon checks, play with its screen: a second screen shuts it down, but a poisoned screen can cost you a piece.',
    'learn.xiangqi.outOfCheck.goal.escape':
      'Check! The chariot attacks your general. Step aside to the safe point in the palace.',
    'learn.xiangqi.outOfCheck.goal.fleeTrap':
      'Check! Your horse can jump in the way, but the chariot eats it for free on either square. Walk your general to safety instead.',
    'learn.xiangqi.outOfCheck.goal.block':
      'Your general cannot run this time. Three pieces can block, but only one blocker is defended. Your cannon has its back!',
    'learn.xiangqi.outOfCheck.goal.capture':
      'The enemy chariot is loud but all alone. Blocking only feeds it a free piece. Capture the checker!',
    'learn.xiangqi.outOfCheck.goal.screen':
      'A cannon needs exactly one screen to strike. Put a second piece on the line and it cannot jump! But the enemy horse watches two of the squares. Only one screen comes for free.',
    'learn.xiangqi.outOfCheck.goal.best':
      'A real scramble. Chariot takes chariot looks natural, but their horse guards it. Every block hangs too. Sometimes the general must save himself: find the quiet step!',
  },
  levels,
};
