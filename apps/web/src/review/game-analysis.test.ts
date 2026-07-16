import { describe, expect, it } from 'vitest';
import {
  computeGameAnalysis,
  judgmentGlyph,
  mergeDecisionAnalysis,
  type PlyDecision,
} from './game-analysis.js';

const evals = (cps: (number | null)[]) => ({
  engineId: 'pikafish',
  depth: 12,
  plies: cps.map((cp, ply) => ({ ply, cp, mate: null, best: null })),
});

describe('computeGameAnalysis', () => {
  it('assigns movers by ply parity (Red on odd plies)', () => {
    const a = computeGameAnalysis(evals([0, 20, 15, 30]));
    expect(a.moves.map((m) => m.mover)).toEqual(['red', 'black', 'red']);
    expect(a.moves.map((m) => m.ply)).toEqual([1, 2, 3]);
  });

  it('flags a Red blunder when Red POV collapses on a Red move', () => {
    // ply 1 is Red's move; Red POV drops 0 -> -600 (Red gave up ~30 win%).
    const a = computeGameAnalysis(evals([0, -600]));
    expect(a.moves[0]?.mover).toBe('red');
    expect(a.moves[0]?.judgment).toBe('blunder');
    expect(a.red.blunders).toBe(1);
    expect(a.red.accuracy).toBeLessThan(60);
    expect(a.black.blunders).toBe(0);
  });

  it('leaves a CHANCE (flip) ply unjudged and uncounted', () => {
    // Same collapse as above, but ply 1 is marked as a chance move (a flip). We can't yet
    // separate the decision from the reveal, so it gets no glyph and isn't counted.
    const a = computeGameAnalysis({ ...evals([0, -600]), chancePlies: [1] });
    expect(a.moves[0]?.mover).toBe('red');
    expect(a.moves[0]?.judgment).toBe(null);
    expect(a.red.blunders).toBe(0);
    expect(a.red.mistakes).toBe(0);
    expect(a.red.inaccuracies).toBe(0);
    // ACPL excludes the chance ply too (no attributable loss).
    expect(a.red.acpl).toBe(0);
  });

  it('a Black move that improves Black is not penalised', () => {
    // ply 2 is Black's move; Red POV drops 200 -> 0, i.e. Black improved.
    const a = computeGameAnalysis(evals([0, 200, 0]));
    const blackMove = a.moves.find((m) => m.mover === 'black');
    expect(blackMove?.judgment).toBeNull();
    expect(blackMove?.accuracy).toBeGreaterThan(95);
  });

  it('reports ACPL and keeps accuracy within [0, 100]', () => {
    const a = computeGameAnalysis(evals([0, 20, -10, 40]));
    expect(a.red.acpl).toBeGreaterThanOrEqual(0);
    expect(a.red.accuracy).toBeGreaterThanOrEqual(0);
    expect(a.red.accuracy).toBeLessThanOrEqual(100);
  });
});

describe('mergeDecisionAnalysis', () => {
  it('re-grades a reveal ply luck-free: a blundered choice now counts, a lucky crater does not', () => {
    // Red's ply-1 reveal realized as a crater (0 -> -600), which the base leaves unjudged. The
    // decomposition says the CHOICE was a blunder (decision accuracy 12) — so the merged summary
    // must surface that blunder and drop Red's accuracy, even though the base showed a clean 100%.
    const base = computeGameAnalysis({ ...evals([0, -600]), chancePlies: [1] });
    expect(base.red.blunders).toBe(0);
    expect(base.red.accuracy).toBe(100); // base excludes the reveal -> misleading clean sheet

    const decisions = new Map<number, PlyDecision>([[1, { accuracy: 12, judgment: 'blunder' }]]);
    const merged = mergeDecisionAnalysis(base, decisions);
    expect(merged.red.blunders).toBe(1);
    expect(merged.red.accuracy).toBeLessThan(60);
    expect(merged.red.acpl).toBe(0); // ACPL is dropped for chance variants
  });

  it('a fine reveal choice keeps accuracy high regardless of the realized swing', () => {
    // Same crater outcome, but the choice was near-best (decision accuracy 98, no judgment).
    const base = computeGameAnalysis({ ...evals([0, -600]), chancePlies: [1] });
    const decisions = new Map<number, PlyDecision>([[1, { accuracy: 98, judgment: null }]]);
    const merged = mergeDecisionAnalysis(base, decisions);
    expect(merged.red.blunders).toBe(0);
    expect(merged.red.accuracy).toBeGreaterThan(90);
  });

  it('leaves a reveal with no decision entry ungraded (dropped, not blamed)', () => {
    const base = computeGameAnalysis({ ...evals([0, -600]), chancePlies: [1] });
    const merged = mergeDecisionAnalysis(base, new Map());
    expect(merged.red.blunders).toBe(0);
    expect(merged.red.accuracy).toBe(100); // no gradeable move -> 100, not a misleading 0
  });
});

describe('judgmentGlyph', () => {
  it('maps each judgment to its lichess glyph + colour class', () => {
    expect(judgmentGlyph('blunder')).toEqual({ suffix: '??', suffixClass: 'blunder' });
    expect(judgmentGlyph('mistake')).toEqual({ suffix: '?', suffixClass: 'mistake' });
    expect(judgmentGlyph('inaccuracy')).toEqual({ suffix: '?!', suffixClass: 'inaccuracy' });
  });

  it('returns null for a fine move (no glyph)', () => {
    expect(judgmentGlyph(null)).toBeNull();
  });
});
