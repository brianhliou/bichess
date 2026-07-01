// Exhaustive verification of jungleFlipIsDeadPosition (the "dead position" draw rule)
// against an INDEPENDENT brute-force retrograde solve of the two-piece subgame. The
// production rule is a closed-form parity shortcut; this test replaces the shortcut with
// a full backward-induction solve over every (pursuer square, evader square, side-to-move)
// state and asserts the two agree for ALL ~30k one-piece-each positions. If the parity
// formula is ever wrong — even for a single position — this fails.

import assert from 'node:assert/strict';
import test from 'node:test';
import { jungleRankBeats } from './variants-jungle.js';
import {
  type JungleFlipGameState,
  type JungleFlipPieceRole,
  jungleFlipIsDeadPosition,
  jungleFlipSquareFromIndex,
} from './variants-jungle-flip.js';

const N = 16;
const ROLES: JungleFlipPieceRole[] = [
  'rat',
  'cat',
  'dog',
  'wolf',
  'leopard',
  'tiger',
  'lion',
  'elephant',
];

// Orthogonal adjacency on the 4×4 (index = file + rank*4).
const ADJ: number[][] = Array.from({ length: N }, (_, i) => {
  const file = i % 4;
  const rank = Math.floor(i / 4);
  const n: number[] = [];
  if (file > 0) n.push(i - 1);
  if (file < 3) n.push(i + 1);
  if (rank > 0) n.push(i - 4);
  if (rank < 3) n.push(i + 4);
  return n;
});

// Retrograde solve of "can the pursuer force a capture?" for the pursuer-vs-evader chase:
// both move one orthogonal step per turn (must move), the pursuer captures by stepping onto
// the evader, the evader may not step onto the pursuer. win[(p,e,stm)] with stm 0 = pursuer
// to move. This is the exact game dynamics for one piece each, independent of the ranks.
const win = new Array<boolean>(N * N * 2).fill(false);
const wi = (p: number, e: number, stm: 0 | 1): number => (p * N + e) * 2 + stm;
for (let changed = true; changed; ) {
  changed = false;
  for (let p = 0; p < N; p++) {
    for (let e = 0; e < N; e++) {
      if (p === e) continue;
      if (!win[wi(p, e, 0)]) {
        // pursuer to move: win if it can capture now or reach a won position
        const v = ADJ[p].some((p2) => p2 === e || win[wi(p2, e, 1)]);
        if (v) {
          win[wi(p, e, 0)] = true;
          changed = true;
        }
      }
      if (!win[wi(p, e, 1)]) {
        // evader to move: pursuer wins only if EVERY legal escape still loses
        const escapes = ADJ[e].filter((e2) => e2 !== p);
        const v = escapes.length > 0 && escapes.every((e2) => win[wi(p, e2, 0)]);
        if (v) {
          win[wi(p, e, 1)] = true;
          changed = true;
        }
      }
    }
  }
}

function twoPieceState(
  redRole: JungleFlipPieceRole,
  redIdx: number,
  blackRole: JungleFlipPieceRole,
  blackIdx: number,
  ply: number,
): JungleFlipGameState {
  return {
    id: 'test',
    board: {
      [jungleFlipSquareFromIndex(redIdx)]: { color: 'red', role: redRole, faceDown: false },
      [jungleFlipSquareFromIndex(blackIdx)]: { color: 'black', role: blackRole, faceDown: false },
    },
    status: { type: 'playing', turn: ply % 2 === 0 ? 'red' : 'black' },
    ply,
    firstColor: 'red', // red seat ⇒ red ink; ply parity picks which ink is to move
    moveNumber: Math.floor(ply / 2) + 1,
    noProgressClock: 0,
    repCounts: {},
    captures: [],
  };
}

// Ground-truth draw verdict from the brute solve (or the equal-rank trade rule).
function bruteIsDraw(
  redRole: JungleFlipPieceRole,
  redIdx: number,
  blackRole: JungleFlipPieceRole,
  blackIdx: number,
  ply: number,
): boolean {
  if (redRole === blackRole) return true; // equal rank → trade-only → draw
  const redPursues = jungleRankBeats(redRole, blackRole) && !jungleRankBeats(blackRole, redRole);
  const pursuerIdx = redPursues ? redIdx : blackIdx;
  const evaderIdx = redPursues ? blackIdx : redIdx;
  const moverInk = ply % 2 === 0 ? 'red' : 'black';
  const pursuerToMove = moverInk === (redPursues ? 'red' : 'black');
  return !win[wi(pursuerIdx, evaderIdx, pursuerToMove ? 0 : 1)];
}

test('jungleFlipIsDeadPosition matches an exhaustive brute-force solve for every 1-v-1', () => {
  const mismatches: string[] = [];
  let checked = 0;
  for (const redRole of ROLES) {
    for (const blackRole of ROLES) {
      for (let redIdx = 0; redIdx < N; redIdx++) {
        for (let blackIdx = 0; blackIdx < N; blackIdx++) {
          if (redIdx === blackIdx) continue;
          for (const ply of [0, 1]) {
            checked++;
            const state = twoPieceState(redRole, redIdx, blackRole, blackIdx, ply);
            const got = jungleFlipIsDeadPosition(state);
            const want = bruteIsDraw(redRole, redIdx, blackRole, blackIdx, ply);
            if (got !== want && mismatches.length < 10) {
              mismatches.push(
                `red ${redRole}@${jungleFlipSquareFromIndex(redIdx)} vs black ${blackRole}@${jungleFlipSquareFromIndex(blackIdx)} ply=${ply}: got ${got}, want ${want}`,
              );
            }
          }
        }
      }
    }
  }
  assert.equal(checked, ROLES.length * ROLES.length * N * (N - 1) * 2);
  assert.deepEqual(
    mismatches,
    [],
    `dead-position classifier disagrees with brute solve:\n${mismatches.join('\n')}`,
  );
});

// Sanity: the actual drawn game (elephant vs tiger, same-colour, elephant to move) is dead,
// and a winnable one (opposite colour, pursuer to move) is not.
test('dead-position sanity: the reported game is dead, a winnable mirror is not', () => {
  const idx = (sq: string): number => {
    const file = sq.charCodeAt(0) - 97;
    const rank = Number(sq[1]) - 1;
    return file + rank * 4;
  };
  // elephant b3, tiger a4 (diagonal / same colour). red=elephant, ply 0 ⇒ elephant to move.
  const dead = twoPieceState('elephant', idx('b3'), 'tiger', idx('a4'), 0);
  assert.equal(jungleFlipIsDeadPosition(dead), true);
  // elephant a1, tiger c2 (opposite colour), elephant to move ⇒ forced win, NOT dead.
  const winnable = twoPieceState('elephant', idx('a1'), 'tiger', idx('c2'), 0);
  assert.equal(jungleFlipIsDeadPosition(winnable), false);
});
