import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { XiangqiMove, XiangqiSquare } from './variants-xiangqi.js';
import { ARBITER_ADJUDICATED_DRAWS } from './variants-xiangqi.js';
import { formatXiangqiMoves } from './xiangqi-notation-format.js';

// Our kernel auto-draws on repetition and on the progress clock; real tournament
// records run past both. Before the 2026-08-28 fix, notating such a game
// silently dropped to raw coordinates from the auto-draw onward -- 18 plies of a
// 1965 championship game and 16 of the 2025 world final rendered as `f6-g6`,
// in a shipped article and study. Same root cause as the broadcast-ingestion bug,
// in a third place, which is why the policy now lives beside the end-reason type
// rather than inside whichever module noticed it first.

const iccs = (line: string): XiangqiMove[] =>
  line
    .trim()
    .split(/\s+/)
    .map((token) => ({
      from: `${token[0]}${Number(token[1]) + 1}` as XiangqiSquare,
      to: `${token[2]}${Number(token[3]) + 1}` as XiangqiSquare,
    }));

type NotationCase = {
  key: string;
  adjudicatedAt: number;
  reason: string;
  plies: number;
  red: string;
  black: string;
  iccs: string;
};

// Real games, not a hand-made line: a synthetic repetition stacks two chariots
// on one file, which has NO relative notation and legitimately falls back to a
// coordinate. Only a real record separates the bug from that.
const fixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/xiangqi-notation/adjudicated-records.json', import.meta.url),
    'utf8',
  ),
) as { cases: NotationCase[] };

const isCoordinate = (label: string): boolean => /^[a-i]\d+-[a-i]\d+$/.test(label);

test('the fixture covers both ways this kernel ends a game the record ran past', () => {
  assert.deepEqual(fixture.cases.map((c) => c.reason).sort(), ['progress-clock', 'repetition']);
});

for (const style of ['wxf', 'chinese-simplified'] as const) {
  test(`a record played past an adjudicated draw notates in ${style}`, () => {
    for (const testCase of fixture.cases) {
      const moves = iccs(testCase.iccs);
      assert.equal(moves.length, testCase.plies, `${testCase.key}: fixture drifted`);
      const labels = formatXiangqiMoves(moves, style);
      const bad = labels
        .map((label, index) => ({ label, ply: index + 1 }))
        .filter((entry) => isCoordinate(entry.label));
      assert.deepEqual(
        bad,
        [],
        `${testCase.key} (${testCase.reason} at ply ${testCase.adjudicatedAt}) degraded to coordinates`,
      );
    }
  });
}

// The policy is shared on purpose: broadcast ingestion, persistence and notation
// all replay finished records and all need the same answer. Live adjudication
// needs the opposite one, which is why checkmate and stalemate stay out.
test('only arbiter-decided draws are resumable', () => {
  assert.deepEqual([...ARBITER_ADJUDICATED_DRAWS].sort(), ['progress-clock', 'repetition']);
  for (const terminal of ['checkmate', 'stalemate', 'resignation', 'timeout'] as const) {
    assert.equal(ARBITER_ADJUDICATED_DRAWS.has(terminal), false);
  }
});

// An actually illegal move must still stop the line: resuming past an auto-draw
// is not a licence to notate moves the board would refuse.
test('an illegal move still falls back to coordinates', () => {
  const labels = formatXiangqiMoves(iccs('h2e2 h9g7 a0a9'), 'wxf');
  assert.match(labels[2] ?? '', /^[a-i]\d+-[a-i]\d+$/);
});
