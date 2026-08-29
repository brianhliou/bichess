// The `!` rule needs three inputs the review has to carry from the sweep: the
// runner-up line at the position the move was played from, the mover's eval two
// plies back, and (for a declined offer) the line after the capture. Before #315
// the sweep stored none of them and `praiseByPly` passed none of them, so `!`
// could not fire in production no matter what the rules said.
//
// These mount the real xiangqi review, so they exercise the whole path: server
// row shape -> praiseByPly POV conversion and ply indexing -> the variant hook ->
// classifyXiangqiMove -> the move list. The "without" cases are exactly the old
// behaviour, so a regression that drops any of the three wiring steps fails here.
import type { XiangqiMove } from '@mistboard/game';
import { afterEach, describe, expect, it } from 'vitest';
import type { GameAnalysis, PlyEval } from './game-analysis.js';
import { mountXiangqiReview } from './xiangqi-review.js';

// 1. b3-e3  cannon to the centre file
// 2. b8-e8  black answers on the same file
// 3. b1-c3  the move under test: a quiet horse development, no capture, nothing
//    offered on c3, and the horse was not en prise on b1 (so not a rescue).
const PLAYED: XiangqiMove[] = [
  { from: 'b3', to: 'e3' },
  { from: 'b8', to: 'e8' },
  { from: 'b1', to: 'c3' },
];

// Red POV throughout (the mover of the tested ply is Red, so no flip is applied).
// cp 120 -> ~60.9 win%, cp 250 -> ~71.5, cp 60 -> ~55.5, cp 240 -> ~71.1. That
// clears every threshold the `great` rule checks: an only-move gap of ~16 (>= 10),
// something to punish of ~10.6 (>= 5), winBefore inside (50, 90], winAfter >= 50.
const SECOND: PlyEval['second'] = { move: 'h1g3', cp: 60, mate: null };

function evals(over: { second?: PlyEval['second']; twoAgoCp?: number }): PlyEval[] {
  return [
    { ply: 0, cp: 0, mate: null, best: 'b3e3', pv: ['b3e3'] },
    { ply: 1, cp: over.twoAgoCp ?? 120, mate: null, best: 'b8e8', pv: ['b8e8'] },
    {
      ply: 2,
      cp: 250,
      mate: null,
      best: 'b1c3',
      pv: ['b1c3'],
      ...(over.second ? { second: over.second } : {}),
    },
    { ply: 3, cp: 240, mate: null, best: 'h8e8', pv: ['h8e8'] },
  ];
}

function analysis(over: { second?: PlyEval['second']; twoAgoCp?: number }): GameAnalysis {
  return {
    engineId: 'test',
    depth: 12,
    evals: evals(over),
    moves: [
      { ply: 1, mover: 'red', judgment: null, accuracy: 99 },
      { ply: 2, mover: 'black', judgment: null, accuracy: 99 },
      { ply: 3, mover: 'red', judgment: null, accuracy: 99 },
    ],
    chancePlies: [],
    bestPlayedPlies: [],
    red: { accuracy: 99, inaccuracies: 0, mistakes: 0, blunders: 0, acpl: 5 },
    black: { accuracy: 99, inaccuracies: 0, mistakes: 0, blunders: 0, acpl: 5 },
  };
}

function mount(game: GameAnalysis): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  mountXiangqiReview(root, {
    ariaLabel: 'Review',
    title: 'Review',
    summary: '',
    moves: PLAYED,
    analysis: {
      requestLabel: 'Analyse',
      fetchCached: async () => game,
      run: async () => game,
    },
  });
  return root;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function comments(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.move-tree__comment')].map((el) => el.textContent ?? '');
}

describe('xiangqi positive-glyph wiring', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('praises the only good move when the sweep stored a runner-up line', async () => {
    const root = mount(analysis({ second: SECOND }));
    await settle();
    expect(comments(root).join(' ')).toContain('Great move.');
  });

  // The pre-#315 row shape: identical in every other way. If this ever starts
  // praising, the rule stopped depending on the runner-up and the gap check is dead.
  it('stays silent on a row cached before the runner-up was stored', async () => {
    const root = mount(analysis({}));
    await settle();
    expect(comments(root).join(' ')).not.toContain('Great move.');
  });

  // `winTwoPliesAgo` reads the ply-2 row, not the ply-1 row. Hand it a position
  // that was already this good two plies back and the move punishes nothing.
  it('stays silent when there was nothing to punish two plies back', async () => {
    const root = mount(analysis({ second: SECOND, twoAgoCp: 250 }));
    await settle();
    expect(comments(root).join(' ')).not.toContain('Great move.');
  });
});
