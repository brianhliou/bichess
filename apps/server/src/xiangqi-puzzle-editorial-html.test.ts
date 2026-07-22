import assert from 'node:assert/strict';
import test from 'node:test';
import type { XiangqiPuzzle } from '@mistboard/game';
import type { XiangqiPuzzleEditorialCandidate } from './persistence-xiangqi-puzzle-mining.js';
import {
  renderXiangqiEditorialMotifReviewHtml,
  selectXiangqiEditorialMotifRepresentatives,
} from './xiangqi-puzzle-editorial-html.js';
import {
  buildXiangqiEditorialReviewPacket,
  XIANGQI_EDITORIAL_RANKING_VERSION,
} from './xiangqi-puzzle-editorial-ranking.js';

function puzzle(id: string): XiangqiPuzzle {
  return {
    id,
    variant: 'xiangqi',
    title: id,
    initial: {
      id,
      board: {
        a1: { color: 'red', role: 'chariot' },
        e1: { color: 'red', role: 'general' },
        a2: { color: 'black', role: 'soldier' },
        b2: { color: 'black', role: 'chariot' },
        e10: { color: 'black', role: 'general' },
      },
      status: { type: 'playing', turn: 'red' },
      moveNumber: 1,
      progressClock: 0,
      positionCounts: {},
    },
    solution: [
      { from: 'a1', to: 'a2' },
      { from: 'b2', to: 'a2' },
      { from: 'e1', to: 'e2' },
    ],
    goal: { type: 'winning-advantage', winner: 'red' },
    themes: ['winning-material'],
  };
}

function entry(id: string): XiangqiPuzzleEditorialCandidate {
  const now = new Date('2026-07-21T00:00:00.000Z');
  return {
    candidate: {
      id,
      runId: 'run<&',
      historicalGameId: 'game',
      postBlunderPly: 2,
      positionKey: id,
      trigger: 'blunder',
      status: 'review',
      rejectionReason: null,
      puzzleData: puzzle(id),
      scanEvidence: { note: '<script>alert(1)</script>' },
      artifactSha256: null,
      createdAt: now,
      updatedAt: now,
    },
    selectionIndex: 1,
    cohort: 'representative-live',
    selectionEvidence: {},
    verifyJudgment: null,
    auditJudgment: null,
    latestReview: null,
    positionDuplicateCount: 1,
  };
}

test('selects one highest-ranked representative per material-concession motif', () => {
  const packet = buildXiangqiEditorialReviewPacket([entry('first'), entry('second')]);
  const selected = selectXiangqiEditorialMotifRepresentatives(packet);
  assert.deepEqual(
    selected.map((candidate) => candidate.candidate.id),
    ['first'],
  );
  assert.equal(selected[0]?.signals.materialConcessionMotifCount, 2);
});

test('renders a self-contained escaped board-and-evidence review packet', () => {
  const packet = buildXiangqiEditorialReviewPacket([entry('candidate<&')]);
  const html = renderXiangqiEditorialMotifReviewHtml(packet, {
    runId: 'run<&',
    generatedAt: '2026-07-21T00:00:00.000Z',
  });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /candidate&lt;&amp;/);
  assert.match(html, /run&lt;&amp;/);
  assert.match(html, /<svg/);
  assert.match(html, /a1-a2/);
  assert.match(html, /offered piece recaptured/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, new RegExp(XIANGQI_EDITORIAL_RANKING_VERSION));
});
