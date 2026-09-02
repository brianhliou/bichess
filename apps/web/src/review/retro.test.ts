// The retro state machine over a hand-built tree: which plies are candidates,
// how a try is graded (engine line / terminal → win, the played move → fail, a
// free try → the local engine within RETRO_TOLERANCE), and the navigation
// states around it. No DOM, no board, no engine: the host seam is faked.
import { describe, expect, it, vi } from 'vitest';
import type { GameAnalysis, PlyEval } from './game-analysis.js';
import type { GameTreeNode, TreePath } from './game-tree.js';
import { createRetro, RETRO_GRADE_DEPTH, type RetroHost } from './retro.js';

type Node = GameTreeNode<string, string>;

function node(id: string, parent: Node | null, ply: number): Node {
  const n = {
    id,
    move: parent ? id : null,
    ply,
    truth: `${id}@${ply}`,
    parent,
    children: [] as Node[],
    label: id,
  } as unknown as Node;
  if (parent) parent.children.push(n);
  return n;
}

function pathOf(n: Node): TreePath {
  const out: string[] = [];
  for (let cur: Node | null = n; cur?.parent; cur = cur.parent) out.unshift(cur.id);
  return out;
}

const ev = (ply: number, cp: number): PlyEval => ({ ply, cp, mate: null, best: null });

/** Mainline: root → r1 (red) → b1 (black, fault: blunder) → r2 → b2 (black, mistake).
 *  Each fault's parent carries a comp (engine) child = the solution. */
function fixture() {
  const root = node('root', null, 0);
  const r1 = node('r1', root, 1);
  const b1 = node('b1', r1, 2);
  const r2 = node('r2', b1, 3);
  const b2 = node('b2', r2, 4);
  const sol1 = node('sol1', r1, 2);
  const sol2 = node('sol2', r2, 4);
  const comp = new Set([sol1, sol2]);
  const analysis: GameAnalysis = {
    engineId: 'test',
    depth: 12,
    // Red-POV evals: black's b1 hands red +300 (black 50% → 25%), b2 hands red another 200.
    evals: [ev(0, 0), ev(1, 0), ev(2, 300), ev(3, 300), ev(4, 500)],
    moves: [
      { ply: 1, mover: 'red', judgment: null, accuracy: 100 },
      { ply: 2, mover: 'black', judgment: 'blunder', accuracy: 30 },
      { ply: 3, mover: 'red', judgment: 'inaccuracy', accuracy: 90 },
      { ply: 4, mover: 'black', judgment: 'mistake', accuracy: 60 },
    ],
    chancePlies: [],
    unstablePlies: [],
    bestPlayedPlies: [],
    red: { accuracy: 95, inaccuracies: 1, mistakes: 0, blunders: 0, acpl: 5 },
    black: { accuracy: 45, inaccuracies: 0, mistakes: 1, blunders: 1, acpl: 250 },
  };
  let current: Node = b2;
  const deleted: TreePath[] = [];
  const ensureOn = vi.fn();
  const redraw = vi.fn();
  const host: RetroHost<Node> & { navigate(n: Node): void } = {
    analysis,
    mainline: () => [root, r1, b1, r2, b2],
    pathTo: pathOf,
    currentPath: () => pathOf(current),
    currentNode: () => current,
    go(path) {
      let n: Node = root;
      for (const id of path) n = n.children.find((c) => c.id === id)!;
      current = n;
      ctrl?.onNavigate();
    },
    deleteAt(path) {
      deleted.push(path);
      const parent = current;
      parent.children = parent.children.filter((c) => pathOf(c).join('/') !== path.join('/'));
    },
    isCompNode: (n) => comp.has(n),
    isTerminal: (n) => n.id === 'mate',
    engine: { supported: true, ensureOn },
    redraw,
    // A try played on the board: the host adds the node and navigates to it.
    navigate(n) {
      current = n;
      ctrl?.onNavigate();
    },
  };
  let ctrl: ReturnType<typeof createRetro<string, string>> | null = null;
  const make = (side: 'red' | 'black') => {
    ctrl = createRetro<string, string>(host, side);
    return ctrl;
  };
  return { host, make, nodes: { root, r1, b1, r2, b2, sol1, sol2 }, deleted, ensureOn, redraw };
}

const line = (depth: number, scoreCp: number) => [
  { multipv: 1, depth, scoreCp, mate: null, pvUci: ['x'] },
];

describe('retro candidates', () => {
  it("lists only the side's mistakes and blunders that have an engine line, and opens on the first", () => {
    const f = fixture();
    const ctrl = f.make('black');
    expect(ctrl.completion()).toEqual([0, 2]);
    expect(ctrl.current()?.fault.node).toBe(f.nodes.b1);
    expect(ctrl.current()?.solution.node).toBe(f.nodes.sol1);
    // Opened on the position the mistake was played FROM.
    expect(f.host.currentNode()).toBe(f.nodes.r1);
    expect(ctrl.feedback()).toBe('find');
    expect(ctrl.hidesPly(2)).toBe(true);
    expect(ctrl.hidesPly(4)).toBe(true);
    expect(ctrl.showBadNode()).toBe(f.nodes.b1);
    expect(ctrl.hideEngineOutput()).toBe(true);
    expect(ctrl.preventGoingToNextMove()).toBe(true);
  });

  it("red's inaccuracy is not a candidate: nothing to review", () => {
    const f = fixture();
    const ctrl = f.make('red');
    expect(ctrl.completion()).toEqual([0, 0]);
    expect(ctrl.current()).toBeNull();
  });
});

describe('retro grading', () => {
  it('the played mistake fails without an engine, and returns to the position', () => {
    const f = fixture();
    const ctrl = f.make('black');
    f.host.navigate(f.nodes.b1);
    expect(ctrl.feedback()).toBe('fail');
    expect(f.host.currentNode()).toBe(f.nodes.r1);
    expect(f.ensureOn).not.toHaveBeenCalled();
    expect(f.deleted).toEqual([]); // the played move is never deleted
    expect(ctrl.isSolving()).toBe(true);
  });

  it("the engine's own line wins outright", () => {
    const f = fixture();
    const ctrl = f.make('black');
    f.host.navigate(f.nodes.sol1);
    expect(ctrl.feedback()).toBe('win');
    expect(ctrl.completion()).toEqual([1, 2]);
    expect(ctrl.hidesPly(2)).toBe(false);
    expect(ctrl.hidesPly(4)).toBe(true);
  });

  it('a game-ending move wins outright', () => {
    const f = fixture();
    const ctrl = f.make('black');
    const mate = node('mate', f.nodes.r1, 2);
    f.host.navigate(mate);
    expect(ctrl.feedback()).toBe('win');
  });

  it('a free try goes to the local engine, and wins within the tolerance', () => {
    const f = fixture();
    const ctrl = f.make('black');
    const attempt = node('try', f.nodes.r1, 2);
    f.host.navigate(attempt);
    expect(ctrl.feedback()).toBe('eval');
    expect(f.ensureOn).toHaveBeenCalledTimes(1);
    expect(ctrl.hideEngineOutput()).toBe(false);
    // Too shallow: no verdict yet.
    ctrl.onEngineLines(line(RETRO_GRADE_DEPTH - 1, 0));
    expect(ctrl.feedback()).toBe('eval');
    // Side to move is RED after black's try; +20 for red is 50 - ~2 for black,
    // within 4 points of black's 50% before the blunder.
    ctrl.onEngineLines(line(RETRO_GRADE_DEPTH, 20));
    expect(ctrl.feedback()).toBe('win');
  });

  it('a free try that still loses ground fails, and the scaffolding node is deleted', () => {
    const f = fixture();
    const ctrl = f.make('black');
    const attempt = node('try', f.nodes.r1, 2);
    f.host.navigate(attempt);
    // Red to move at +250: black is ~29%, well under 50 - 4.
    ctrl.onEngineLines(line(RETRO_GRADE_DEPTH, 250));
    expect(ctrl.feedback()).toBe('fail');
    expect(f.host.currentNode()).toBe(f.nodes.r1);
    expect(f.deleted).toEqual([['r1', 'try']]);
  });

  it('a mate found by the mover wins even against a big pre-mistake edge', () => {
    const f = fixture();
    const ctrl = f.make('black');
    const attempt = node('try', f.nodes.r1, 2);
    f.host.navigate(attempt);
    // Red to move, mated in 2: side-to-move mate is negative.
    ctrl.onEngineLines([{ multipv: 1, depth: 20, scoreCp: null, mate: -2, pvUci: ['x'] }]);
    expect(ctrl.feedback()).toBe('win');
  });

  it('engine lines for another position are ignored', () => {
    const f = fixture();
    const ctrl = f.make('black');
    const attempt = node('try', f.nodes.r1, 2);
    f.host.navigate(attempt);
    f.host.navigate(f.nodes.r1); // browsed back mid-search
    expect(ctrl.feedback()).toBe('find');
    ctrl.onEngineLines(line(20, 0));
    expect(ctrl.feedback()).toBe('find');
  });

  it('reports the engine as unavailable while grading in a browser without one', () => {
    const f = fixture();
    f.host.engine = { supported: false, ensureOn: () => {} };
    const ctrl = f.make('black');
    f.host.navigate(node('try', f.nodes.r1, 2));
    expect(ctrl.feedback()).toBe('eval');
    expect(ctrl.engineUnavailable()).toBe(true);
  });
});

describe('retro navigation', () => {
  it('browsing away is off-track; returning resumes', () => {
    const f = fixture();
    const ctrl = f.make('black');
    f.host.navigate(f.nodes.root);
    expect(ctrl.feedback()).toBe('offTrack');
    expect(ctrl.showBadNode()).toBeNull();
    f.host.navigate(f.nodes.r1);
    expect(ctrl.feedback()).toBe('find');
  });

  it('view solution jumps to the engine line and counts as solved; next moves on; the end follows', () => {
    const f = fixture();
    const ctrl = f.make('black');
    ctrl.viewSolution();
    expect(ctrl.feedback()).toBe('view');
    expect(f.host.currentNode()).toBe(f.nodes.sol1);
    expect(ctrl.completion()).toEqual([1, 2]);
    ctrl.jumpToNext();
    expect(ctrl.current()?.fault.node).toBe(f.nodes.b2);
    expect(f.host.currentNode()).toBe(f.nodes.r2);
    ctrl.skip();
    expect(ctrl.current()).toBeNull();
    expect(ctrl.completion()).toEqual([2, 2]);
    expect(ctrl.hidesPly(2)).toBe(false);
    ctrl.reset();
    expect(ctrl.completion()).toEqual([0, 2]);
    expect(ctrl.current()?.fault.node).toBe(f.nodes.b1);
  });
});
