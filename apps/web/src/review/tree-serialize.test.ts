// Proves the study persistence primitive: a tree with variations AND user
// annotations (comments / shapes / glyphs / gamebook) survives serialize →
// deserialize → serialize unchanged, positions are rebuilt from UCIs alone (no
// stored board state), mainline order is preserved, and a corrupt/illegal blob
// degrades to its legal prefix instead of throwing. Moves are drawn from the real
// xiangqi kernel so they are guaranteed legal (same pattern as game-tree.test.ts).

import {
  applyStandardXiangqiMove,
  createInitialXiangqiState,
  getStandardXiangqiLegalMoves,
  type XiangqiMove,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { createGameTree, ROOT_PATH } from './game-tree.js';
import { deserializeTree, type SerializedTree, serializeTree } from './tree-serialize.js';
import { xiangqiTreeAdapter } from './xiangqi-tree-adapter.js';

function realMoves(): { mainline: XiangqiMove[]; altFirst: XiangqiMove } {
  const s0 = createInitialXiangqiState('fixture');
  const first = getStandardXiangqiLegalMoves(s0);
  const m1 = first[0]!;
  const altFirst = first[1]!;
  const s1 = applyStandardXiangqiMove(s0, m1);
  const m2 = getStandardXiangqiLegalMoves(s1)[0]!;
  const s2 = applyStandardXiangqiMove(s1, m2);
  const m3 = getStandardXiangqiLegalMoves(s2)[0]!;
  return { mainline: [m1, m2, m3], altFirst };
}

// A 3-ply mainline + a root variation, with an annotation on the root, a mainline
// node, and the variation node.
function annotatedTree() {
  const { mainline, altFirst } = realMoves();
  const tree = createGameTree(xiangqiTreeAdapter, mainline);
  const branch = tree.addMove(ROOT_PATH, altFirst)!;
  const firstMainline = [tree.root.children[0]!.id];

  tree.annotateAt(ROOT_PATH, { comments: [{ by: 'u1', text: 'Start position.' }] });
  tree.annotateAt(firstMainline, {
    glyphs: [1],
    shapes: [{ kind: 'arrow', brush: 'green', orig: mainline[0]!.from, dest: mainline[0]!.to }],
    gamebook: { hint: 'Develop a piece.' },
  });
  tree.annotateAt(branch, { comments: [{ by: 'u1', text: 'Also playable.' }] });
  return { tree, mainline, altFirst, firstMainline, branch };
}

describe('tree-serialize', () => {
  it('round-trips a tree with variations and annotations unchanged', () => {
    const { tree } = annotatedTree();
    const s1 = serializeTree(tree, xiangqiTreeAdapter);
    const rebuilt = deserializeTree(xiangqiTreeAdapter, s1);
    const s2 = serializeTree(rebuilt, xiangqiTreeAdapter);
    expect(s2).toEqual(s1);
  });

  it('preserves annotation content across a round trip', () => {
    const { tree, firstMainline } = annotatedTree();
    const rebuilt = deserializeTree(xiangqiTreeAdapter, serializeTree(tree, xiangqiTreeAdapter));

    expect(rebuilt.nodeAt(ROOT_PATH)?.annotations?.comments?.[0]?.text).toBe('Start position.');
    const node = rebuilt.nodeAt(firstMainline);
    expect(node?.annotations?.glyphs).toEqual([1]);
    expect(node?.annotations?.gamebook?.hint).toBe('Develop a piece.');
    expect(node?.annotations?.shapes?.[0]?.kind).toBe('arrow');
  });

  it('rebuilds positions from UCIs alone (no stored board state)', () => {
    const { tree, mainline } = annotatedTree();
    const rebuilt = deserializeTree(xiangqiTreeAdapter, serializeTree(tree, xiangqiTreeAdapter));
    // The mainline reconstructs to full depth and the tip truth is playable.
    expect(rebuilt.last()).toHaveLength(mainline.length);
    const tip = rebuilt.nodeAt(rebuilt.last());
    expect(tip?.ply).toBe(mainline.length);
    expect(rebuilt.project(tip!)).toHaveLength(1); // open variant → single truth view
  });

  it('keeps children[0] as the mainline (variation order preserved)', () => {
    const { tree, mainline, altFirst } = annotatedTree();
    const s1 = serializeTree(tree, xiangqiTreeAdapter);
    expect(s1.root.children).toHaveLength(2);
    expect(s1.root.children[0]?.uci).toBe(xiangqiTreeAdapter.toEngineUci(mainline[0]!));
    expect(s1.root.children[1]?.uci).toBe(xiangqiTreeAdapter.toEngineUci(altFirst));
  });

  it('prunes empty annotations from the blob', () => {
    const { mainline } = realMoves();
    const tree = createGameTree(xiangqiTreeAdapter, mainline);
    tree.annotateAt([tree.root.children[0]!.id], { comments: [], shapes: [], glyphs: [] });
    const s1 = serializeTree(tree, xiangqiTreeAdapter);
    expect(s1.root.children[0]?.annotations).toBeUndefined();
  });

  it('drops an unparseable or illegal node and its subtree, keeping legal siblings', () => {
    const { mainline } = realMoves();
    const legalUci = xiangqiTreeAdapter.toEngineUci(mainline[0]!);
    const corrupt: SerializedTree = {
      version: 1,
      root: {
        children: [
          { uci: 'z9z9', children: [{ uci: legalUci, children: [] }] }, // unparseable → whole subtree dropped
          { uci: legalUci, children: [] }, // legal → grafted
        ],
      },
    };
    const tree = deserializeTree(xiangqiTreeAdapter, corrupt);
    expect(tree.root.children).toHaveLength(1);
    expect(tree.root.children[0]?.id).toBe(legalUci);
  });
});
