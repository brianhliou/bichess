// Xiangqi Learn — Stage: piece value (lila value.ts arc, xiangqi-ized) with
// REAL stakes: detectCapture stays on its 'unprotected' default, so a greedy
// capture that hangs your piece FAILS with the refutation demonstrated on the
// board. Every level offers several captures; exactly one completes it (the
// intent contract proves it). The arc escalates from flat arithmetic (chariot
// 90 > cannon 45 > horse 40 > elephant/advisor 20 > soldier 10) to the real
// lesson of value: the biggest piece you can take FOR FREE, value net of
// safety. Positions are tuned so the winning capture is always safe.

import { or, pieceNotOn } from '../learn-assert.js';
import { arrow, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // Chariot (90) vs soldier (10): the flat warm-up, with teeth. The black
    // horse on d3 watches b2, so grabbing the soldier loses your chariot;
    // taking the enemy chariot up the file is free.
    goal: 'learn.xiangqi.value.goal.chariotOverSoldier',
    fen: '9/9/4r4/9/9/9/9/3n5/1p2R4/9 w',
    shapes: [arrow('e2', 'e8', 'green')],
    success: pieceNotOn('black', 'chariot', 'e8'),
    sampleSolution: 'e2e8',
    intent: {
      solutions: 1,
      candidates: {
        assert: or(pieceNotOn('black', 'chariot', 'e8'), pieceNotOn('black', 'soldier', 'b2')),
        min: 2,
      },
    },
  },
  {
    // Cannon (45) vs horse (40): the close call. The horse on b5 is guarded
    // by the soldier on b6, so the 40-point grab costs 90; the cannon up the
    // file is unprotected.
    goal: 'learn.xiangqi.value.goal.cannonOverHorse',
    fen: '9/4c4/9/9/1p7/1n2R4/9/9/9/9 w',
    success: pieceNotOn('black', 'cannon', 'e9'),
    sampleSolution: 'e5e9',
    intent: {
      solutions: 1,
      candidates: {
        assert: or(pieceNotOn('black', 'cannon', 'e9'), pieceNotOn('black', 'horse', 'b5')),
        min: 2,
      },
    },
  },
  {
    // Two red pieces, two targets: the horse jump wins the enemy cannon (45)
    // but the black horse on h9 recaptures on f8; the cannon leap over the
    // soldier screen wins the chariot (90) clean. The e5 screen also shields
    // itself: the red horse guards e5 against the enemy chariot until the
    // chariot is off the board.
    goal: 'learn.xiangqi.value.goal.chariotOverCannon',
    fen: '9/4r2n1/5c3/9/6N2/4P4/9/9/4C4/9 w',
    success: pieceNotOn('black', 'chariot', 'e9'),
    sampleSolution: 'e2e9',
    intent: {
      solutions: 1,
      candidates: {
        assert: or(pieceNotOn('black', 'chariot', 'e9'), pieceNotOn('black', 'cannon', 'f8')),
        min: 2,
      },
    },
  },
  {
    // The flashy trap: the cannon's board-length leap only wins a soldier
    // (10), and the black chariot on b10 eats the cannon the moment it lands.
    // The quiet chariot slide wins the horse (40) for nothing.
    goal: 'learn.xiangqi.value.goal.flashyTrap',
    fen: '1r7/1p7/7n1/9/1p7/9/7R1/9/1C7/9 w',
    success: pieceNotOn('black', 'horse', 'h8'),
    sampleSolution: 'h4h8',
    intent: {
      solutions: 1,
      candidates: {
        assert: or(pieceNotOn('black', 'horse', 'h8'), pieceNotOn('black', 'soldier', 'b9')),
        min: 2,
      },
    },
  },
  {
    // Capstone: four captures on the compass points, value net of safety.
    // The enemy chariot (90) is guarded by the i6 soldier and the horse (40)
    // by the a6 soldier; the crossed soldier (10) is free but tiny. The
    // biggest UNDEFENDED piece is the cannon (45) straight up the file.
    goal: 'learn.xiangqi.value.goal.capstone',
    fen: '9/9/4c4/9/p7p/n3R3r/9/9/4p4/9 w',
    success: pieceNotOn('black', 'cannon', 'e8'),
    sampleSolution: 'e5e8',
    intent: {
      solutions: 1,
      candidates: {
        assert: or(
          pieceNotOn('black', 'cannon', 'e8'),
          pieceNotOn('black', 'chariot', 'i5'),
          pieceNotOn('black', 'horse', 'a5'),
          pieceNotOn('black', 'soldier', 'e2'),
        ),
        min: 4,
      },
    },
  },
].map((level) => ({
  nbMoves: 1,
  captures: 1,
  pointsForCapture: true,
  showPieceValues: true,
  rules: 'relaxed' as const,
  ...level,
}));

export const valueStage = {
  key: 'value',
  title: 'learn.xiangqi.value.title',
  subtitle: 'learn.xiangqi.value.subtitle',
  intro: 'learn.xiangqi.value.intro',
  complete: 'learn.xiangqi.value.complete',
  illustration: { glyph: '值' },
  copy: {
    'learn.xiangqi.value.title': 'Piece value',
    'learn.xiangqi.value.subtitle': 'Know what your pieces are worth',
    'learn.xiangqi.value.intro':
      'Pieces are not equal. The chariot is worth 90 points, the cannon 45, the horse 40, the elephant and advisor 20 each, and the soldier 10. Yes, one chariot is worth two cannons! When you have a choice of captures, take the most valuable piece. One more thing: a capture only counts if your piece survives it. Grab something guarded and you pay full price.',
    'learn.xiangqi.value.complete':
      'Well done! You know the scale: chariot 90, cannon 45, horse 40, elephant and advisor 20, soldier 10. And you know the fine print: a piece is only worth its points if you can take it for free. Trade up, never down, and never hand your piece back.',
    'learn.xiangqi.value.goal.chariotOverSoldier':
      'Your chariot can grab the soldier (10) or the chariot (90). The soldier is bait: a horse watches that point. Take the chariot!',
    'learn.xiangqi.value.goal.cannonOverHorse':
      'A close call: the cannon (45) is worth a little more than the horse (40). And that horse has a bodyguard. Take the cannon!',
    'learn.xiangqi.value.goal.chariotOverCannon':
      'Two of your pieces can capture. The horse can win a cannon (45), but a defender is waiting to strike back. Your cannon can win a chariot (90) for free. Take the chariot!',
    'learn.xiangqi.value.goal.flashyTrap':
      'The big leap looks tempting, but that soldier is only worth 10 and his chariot is watching. The quiet move wins a horse (40) for free. Take the safe prize!',
    'learn.xiangqi.value.goal.capstone':
      'Four captures, one right answer. The chariot (90) is defended, and so is the horse (40). Take the most valuable piece you can grab for free!',
  },
  levels,
};
