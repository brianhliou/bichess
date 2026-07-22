import assert from 'node:assert/strict';
import test from 'node:test';
import type { XiangqiPuzzle } from '@mistboard/game';
import type {
  XiangqiPuzzleEditorialCandidate,
  XiangqiPuzzleMiningJudgment,
} from './persistence-xiangqi-puzzle-mining.js';
import {
  buildXiangqiEditorialReviewPacket,
  xiangqiEditorialCandidateSignals,
} from './xiangqi-puzzle-editorial-ranking.js';

const now = new Date('2026-07-21T00:00:00.000Z');

function judgment(
  candidateId: string,
  stage: 'verify' | 'audit',
  evidence: Record<string, unknown>,
): XiangqiPuzzleMiningJudgment {
  return {
    id: `${candidateId}-${stage}`,
    candidateId,
    stage,
    profileVersion: `${stage}-v1`,
    verdict: 'pass',
    reason: null,
    engineProfile: { engine: 'test' },
    evidence,
    artifactSha256: null,
    createdAt: now,
  };
}

function puzzle(id: string, solution: XiangqiPuzzle['solution']): XiangqiPuzzle {
  return {
    id,
    variant: 'xiangqi',
    title: id,
    initial: {
      id,
      board: {
        a1: { color: 'red', role: 'chariot' },
        a2: { color: 'black', role: 'soldier' },
        b2: { color: 'black', role: 'chariot' },
        c1: { color: 'red', role: 'horse' },
        c2: { color: 'black', role: 'cannon' },
      },
      status: { type: 'playing', turn: 'red' },
      moveNumber: 12,
      progressClock: 0,
      positionCounts: {},
    },
    solution,
    goal: { type: 'winning-advantage', winner: 'red', centipawns: 500 },
    themes: ['winning-material'],
  };
}

function entry(
  candidateId: string,
  candidatePuzzle: XiangqiPuzzle,
  swingCp: number,
): XiangqiPuzzleEditorialCandidate {
  return {
    candidate: {
      id: candidateId,
      runId: 'run-1',
      historicalGameId: `game-${candidateId}`,
      postBlunderPly: 18,
      positionKey: `position-${candidateId}`,
      trigger: 'eval-swing',
      status: 'review',
      rejectionReason: null,
      puzzleData: candidatePuzzle,
      scanEvidence: { swingCp },
      artifactSha256: null,
      createdAt: now,
      updatedAt: now,
    },
    selectionIndex: candidateId === 'sacrifice' ? 1 : 2,
    cohort: 'representative-live',
    selectionEvidence: {},
    verifyJudgment: judgment(candidateId, 'verify', {
      verifyBestCp: 500,
      verifySecondCp: 100,
    }),
    auditJudgment: judgment(candidateId, 'audit', {
      plies: [
        { gapCp: candidateId === 'sacrifice' ? 350 : 250, gapWinrate: 0.25 },
        { gapCp: 300, gapWinrate: candidateId === 'sacrifice' ? 0.2 : 0.1 },
      ],
    }),
    latestReview: null,
    positionDuplicateCount: 1,
  };
}

test('extracts transparent material and audit signals from a verified line', () => {
  const candidate = entry(
    'sacrifice',
    puzzle('sacrifice', [
      { from: 'a1', to: 'a2' },
      { from: 'b2', to: 'a2' },
      { from: 'c1', to: 'c2' },
    ]),
    700,
  );
  const signals = xiangqiEditorialCandidateSignals(candidate);
  assert.equal(signals.solverPlies, 2);
  assert.equal(signals.auditMinGapCp, 300);
  assert.equal(signals.auditMinGapWinrate, 0.2);
  assert.deepEqual(signals.material, {
    solverColor: 'red',
    quietFirstMove: false,
    immediateRecapture: true,
    materialConcededCp: 900,
    materialWonCp: 550,
    netMaterialCp: -350,
    maxMaterialDeficitCp: 800,
    maxLocalConcessionCp: 800,
    concededRoles: ['chariot'],
    wonRoles: ['soldier', 'cannon'],
    concessionEvents: [
      {
        solutionPly: 1,
        capturedRole: 'chariot',
        capturedValueCp: 900,
        capturedSquare: 'a2',
        capturedJustMovedPiece: true,
        precedingSolverMove: { from: 'a1', to: 'a2' },
        precedingSolverMoveQuiet: false,
        precedingCapturedRole: 'soldier',
        precedingCapturedValueCp: 100,
        localExchangeCp: -800,
        localConcessionCp: 800,
      },
    ],
  });
  assert.equal(
    signals.materialConcessionMotifKey,
    'winning-advantage|solver-plies:2|soldier>chariot:offered:800',
  );
});

test('builds distinct deterministic ranking lenses without collapsing interestingness', () => {
  const sacrifice = entry(
    'sacrifice',
    puzzle('sacrifice', [
      { from: 'a1', to: 'a2' },
      { from: 'b2', to: 'a2' },
      { from: 'c1', to: 'c2' },
    ]),
    500,
  );
  const swing = entry(
    'swing',
    puzzle('swing', [
      { from: 'c1', to: 'c2' },
      { from: 'b2', to: 'b1' },
      { from: 'c2', to: 'b2' },
    ]),
    900,
  );
  const packet = buildXiangqiEditorialReviewPacket([swing, sacrifice]);
  assert.deepEqual(packet.rankings['material-concession'], ['sacrifice', 'swing']);
  assert.deepEqual(packet.rankings['source-swing'], ['swing', 'sacrifice']);
  assert.equal(
    packet.candidates.find(({ candidate }) => candidate.id === 'swing')?.ranks['source-swing'],
    1,
  );
});

test('counts recurring material-concession motifs without treating them as duplicate positions', () => {
  const line = [
    { from: 'a1', to: 'a2' },
    { from: 'b2', to: 'a2' },
    { from: 'c1', to: 'c2' },
  ] as XiangqiPuzzle['solution'];
  const packet = buildXiangqiEditorialReviewPacket([
    entry('motif-a', puzzle('motif-a', line), 600),
    entry('motif-b', puzzle('motif-b', line), 500),
  ]);
  assert.equal(packet.candidates[0]?.signals.materialConcessionMotifCount, 2);
  assert.equal(packet.candidates[1]?.signals.materialConcessionMotifCount, 2);
  assert.notEqual(
    packet.candidates[0]?.candidate.positionKey,
    packet.candidates[1]?.candidate.positionKey,
  );
});
