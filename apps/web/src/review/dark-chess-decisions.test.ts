import { describe, expect, it } from 'vitest';
import {
  type DarkChessDecision,
  decisionView,
  summarizeDecisions,
} from './dark-chess-decisions.js';

// The server sends win% directly, mover POV: bestWin / playedWin / playedRank.
function decision(p: Partial<DarkChessDecision>): DarkChessDecision {
  return { ply: 1, mover: 'white', bestWin: 50, playedWin: 50, playedRank: 1, ...p };
}

// Fog losses are graded on their chess-scale equivalent (x2, see FOG_DECISION_SCALE),
// so every bar sits at half its lila value in belief-relative points: inaccuracy at
// 2.5, mistake at 5, blunder at 7.5.
describe('decisionView grading', () => {
  it('leaves a loss under the scaled inaccuracy bar unjudged', () => {
    const v = decisionView(decision({ bestWin: 52.4, playedWin: 50 }));
    expect(v.judgment).toBeNull();
  });

  it('marks an inaccuracy from 2.5 belief-relative points', () => {
    expect(decisionView(decision({ bestWin: 52.5, playedWin: 50 })).judgment).toBe('inaccuracy');
  });

  it('marks a mistake from 5, and a blunder from 7.5', () => {
    expect(decisionView(decision({ bestWin: 55, playedWin: 50 })).judgment).toBe('mistake');
    expect(decisionView(decision({ bestWin: 57.5, playedWin: 50 })).judgment).toBe('blunder');
  });

  // The case that prompted the recalibration: an early queen sortie, played 19th of
  // the root moves, giving up 5.70 points of expected win. On the raw bars that was
  // an "inaccuracy" — the same label as a half-point slip — because the whole fog
  // distribution sat under them.
  it('grades the measured rank-19 queen sortie as a mistake, not an inaccuracy', () => {
    const v = decisionView(decision({ bestWin: 52.2, playedWin: 46.5, playedRank: 19 }));
    expect(v.judgment).toBe('mistake');
  });

  it('reports the raw belief-relative loss, not the scaled one', () => {
    // The scaling exists to place the bars; the number itself stays the real
    // expected-win cost over the mover's belief.
    expect(decisionView(decision({ bestWin: 56, playedWin: 50 })).decisionLoss).toBe(6);
  });

  it('clamps decisionLoss at 0 (played can never beat best)', () => {
    expect(decisionView(decision({ bestWin: 50, playedWin: 55 })).decisionLoss).toBe(0);
  });

  // Rank is context, never severity: many moves can be "better" in a position where
  // none of it costs anything.
  it('does not grade a deep rank when the loss is flat', () => {
    expect(
      decisionView(decision({ bestWin: 50.4, playedWin: 50, playedRank: 27 })).judgment,
    ).toBeNull();
  });

  it('does not escalate a tier for a deep rank', () => {
    const shallow = decisionView(decision({ bestWin: 53, playedWin: 50, playedRank: 2 }));
    const deep = decisionView(decision({ bestWin: 53, playedWin: 50, playedRank: 27 }));
    expect(deep.judgment).toBe(shallow.judgment);
    expect(deep.playedRank).toBe(27);
  });
});

describe('decisionView accuracy', () => {
  it('scores accuracy on the same scaled loss the judgment uses', () => {
    // Grading and accuracy must move together; a game cannot read 96% accurate while
    // its moves are marked as blunders.
    const clean = decisionView(decision({ bestWin: 50, playedWin: 50 }));
    const blunder = decisionView(decision({ bestWin: 60, playedWin: 50 }));
    expect(clean.accuracy).toBe(100);
    expect(blunder.judgment).toBe('blunder');
    expect(blunder.accuracy).toBeLessThan(70);
  });
});

describe('summarizeDecisions', () => {
  it('averages accuracy per player and indexes views by ply', () => {
    const summary = summarizeDecisions([
      decision({ ply: 1, mover: 'white', bestWin: 60, playedWin: 50 }),
      decision({ ply: 2, mover: 'black', bestWin: 50, playedWin: 50 }),
    ]);
    expect(summary.white.decisions).toBe(1);
    expect(summary.white.decisionAccuracy).toBeLessThan(70);
    expect(summary.black.decisionAccuracy).toBe(100);
    expect(summary.byPly.get(1)?.judgment).toBe('blunder');
  });

  it('reports 100% for a player with no analyzed decisions', () => {
    const summary = summarizeDecisions([decision({ mover: 'white' })]);
    expect(summary.black.decisions).toBe(0);
    expect(summary.black.decisionAccuracy).toBe(100);
  });
});
