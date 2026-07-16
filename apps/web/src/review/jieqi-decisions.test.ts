import { describe, expect, it } from 'vitest';
import { decisionView, type JieqiDecision, summarizeDecisions } from './jieqi-decisions.js';

// The server now sends win% directly (mover POV): bestWin / playedWin / realizedWin.
function decision(p: Partial<JieqiDecision>): JieqiDecision {
  return {
    ply: 1,
    mover: 'red',
    bestWin: 50,
    playedWin: 50,
    realizedWin: 50,
    playedRank: 1,
    ...p,
  };
}

describe('decisionView', () => {
  it('leaves a within-noise decision loss unjudged (win% deadband)', () => {
    // A 3-point decision loss is inside the ~5-point noise floor, so no glyph.
    const v = decisionView(decision({ bestWin: 53, playedWin: 50 }));
    expect(v.judgment).toBeNull();
    expect(v.decisionLoss).toBe(3);
  });

  it('grades a real decision loss beyond the noise floor', () => {
    const v = decisionView(decision({ bestWin: 70, playedWin: 45 }));
    expect(v.judgment).toBe('blunder'); // a 25-point drop
    expect(v.decisionLoss).toBe(25);
  });

  it('decisionLoss is clamped at 0 (played can never beat best)', () => {
    const v = decisionView(decision({ bestWin: 50, playedWin: 55 }));
    expect(v.decisionLoss).toBe(0);
  });

  it('luck is the signed swing of realized vs the played move’s pool mean', () => {
    // Perfect choice (played == best) but the reveal came out below its average: pure bad luck.
    const v = decisionView(decision({ bestWin: 60, playedWin: 60, realizedWin: 48 }));
    expect(v.judgment).toBeNull(); // the DECISION was best
    expect(v.luck).toBe(-12); // realized - played
  });

  it('0 luck means the reveal came out exactly at its pool average', () => {
    const v = decisionView(decision({ playedWin: 55, realizedWin: 55 }));
    expect(v.luck).toBe(0);
  });
});

describe('summarizeDecisions', () => {
  it('aggregates decision accuracy per mover (skill only, no summed luck)', () => {
    const summary = summarizeDecisions([
      decision({ ply: 1, mover: 'red', bestWin: 60, playedWin: 60, realizedWin: 40 }), // perfect, unlucky
      decision({ ply: 3, mover: 'red', bestWin: 70, playedWin: 40, realizedWin: 45 }), // poor choice
      decision({ ply: 2, mover: 'black', bestWin: 55, playedWin: 55, realizedWin: 80 }), // perfect, lucky
    ]);
    expect(summary.red.reveals).toBe(2);
    expect(summary.black.reveals).toBe(1);
    // Red made one perfect + one poor decision → accuracy below 100.
    expect(summary.red.decisionAccuracy).toBeLessThan(100);
    // Black's single reveal was a perfect choice → ~100% decision accuracy.
    expect(summary.black.decisionAccuracy).toBeGreaterThan(95);
    // No netLuck field: luck is per-move, never summed.
    expect('netLuck' in summary.red).toBe(false);
    expect(summary.byPly.get(3)?.mover).toBe('red');
  });

  it('a player with no reveals reports 100% decision accuracy', () => {
    const summary = summarizeDecisions([
      decision({ ply: 1, mover: 'red', bestWin: 50, playedWin: 50, realizedWin: 50 }),
    ]);
    expect(summary.black.reveals).toBe(0);
    expect(summary.black.decisionAccuracy).toBe(100);
  });
});
