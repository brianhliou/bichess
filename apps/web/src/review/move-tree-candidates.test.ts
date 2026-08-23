// Chance plies show RANKED ALTERNATIVES where perfect-information plies show a refutation
// line: past a reveal nothing is knowable, so a line would be fiction. These pin the block's
// contract — ordering preserved, the played row marked, and the block surviving on a ply that
// has candidates but neither advice text nor variations.
import { describe, expect, it } from 'vitest';
import { createGameTree, type VariantTreeAdapter } from './game-tree.js';
import { createMoveTree, type MoveTreeAnnotation } from './move-tree.js';

type M = { id: string };
type T = { ply: number };

const adapter: VariantTreeAdapter<M, T, T> = {
  initialTruth: () => ({ ply: 0 }),
  isLegal: () => true,
  applyMove: (truth: T) => ({ ply: truth.ply + 1 }),
  project: (truth: T) => [{ key: 'truth', label: 'Truth', tier: 'primary' as const, view: truth }],
  moveLabel: (move: M) => move.id,
  moveKey: (move: M) => move.id,
  fromUci: (uci: string) => ({ id: uci }),
  toEngineUci: (move: M) => move.id,
  mode: 'perfect-info',
};

function mount(annotation: MoveTreeAnnotation): HTMLElement {
  const tree = createGameTree(adapter);
  const path = tree.addMove([], { id: 'e8-a8' })!;
  const moveTree = createMoveTree(tree, { onJump: () => {} });
  moveTree.rebuild();
  const byKey = new Map<string, MoveTreeAnnotation>([[path.join('/'), annotation]]);
  moveTree.annotate(byKey);
  return moveTree.el;
}

const CANDIDATES = [
  { label: 'e8-a8', win: 61.4 },
  { label: 'b3-b7', win: 55.2, played: true },
  { label: 'h1-h5', win: 48.9 },
];

describe('ranked candidates block', () => {
  it('renders the candidates in the order given, best first', () => {
    const el = mount({
      comment: 'Mistake. e8-a8 was best.',
      commentClass: 'mistake',
      candidates: CANDIDATES,
    });
    const rows = [...el.querySelectorAll('.move-tree__candidate')];
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.querySelector('.move-tree__candidate-move')?.textContent)).toEqual([
      'e8-a8',
      'b3-b7',
      'h1-h5',
    ]);
    // Rank labels are positional, so a reordering upstream cannot silently mislabel them.
    expect(rows.map((r) => r.querySelector('.move-tree__candidate-rank')?.textContent)).toEqual([
      '1.',
      '2.',
      '3.',
    ]);
  });

  it('marks the played move so the reader is not counting rows to find themselves', () => {
    const el = mount({ comment: 'Mistake.', commentClass: 'mistake', candidates: CANDIDATES });
    const played = [...el.querySelectorAll('.move-tree__candidate--played')];
    expect(played.length).toBe(1);
    expect(played[0]!.querySelector('.move-tree__candidate-move')?.textContent).toBe('b3-b7');
    expect(played[0]!.textContent).toContain('played');
  });

  it('rounds the win% for display', () => {
    const el = mount({ candidates: CANDIDATES });
    const wins = [...el.querySelectorAll('.move-tree__candidate-win')].map((n) => n.textContent);
    expect(wins).toEqual(['61%', '55%', '49%']);
  });

  it('renders on a ply with candidates but no advice text and no variations', () => {
    // A fine reveal is unjudged (no glyph, no advice), but its alternatives are still worth
    // showing. Without this the block would fall through to the plain move row and vanish.
    const el = mount({ candidates: CANDIDATES });
    expect(el.querySelector('.move-tree__candidates')).not.toBeNull();
    expect(el.querySelector('.move-tree__comment')).toBeNull();
  });

  it('draws nothing when there are no candidates', () => {
    const el = mount({ comment: 'Mistake.', commentClass: 'mistake' });
    expect(el.querySelector('.move-tree__candidates')).toBeNull();
  });
});
