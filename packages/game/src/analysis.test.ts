import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accuracyPercent, gameAccuracy, moveJudgment, winPercent } from './analysis.js';

test('winPercent is 50 at even and monotonic in cp', () => {
  assert.equal(winPercent(0, null), 50);
  assert.ok(winPercent(200, null) > 50);
  assert.ok(winPercent(-200, null) < 50);
  assert.ok(winPercent(800, null) > winPercent(200, null));
  // Null (unknown) reads as even.
  assert.equal(winPercent(null, null), 50);
});

test('winPercent maps mates through the lila mate->cp ladder', () => {
  // A mate is close to (but not exactly) certain, and closer mates are worth more.
  assert.ok(winPercent(null, 1) > 99);
  assert.ok(winPercent(null, -1) < 1);
  assert.ok(winPercent(null, 1) > winPercent(null, 9));
  // A mate always beats the cp clamp ceiling (mate-in-10+ = 1100cp > 1000cp).
  assert.ok(winPercent(null, 15) > winPercent(1000, null));
});

test('winPercent clamps extreme cp so it never exceeds the bounds', () => {
  assert.ok(winPercent(100000, null) <= 100);
  assert.ok(winPercent(-100000, null) >= 0);
});

test('accuracyPercent is 100 for a non-losing move and falls with the win drop', () => {
  assert.equal(accuracyPercent(60, 60), 100);
  assert.equal(accuracyPercent(60, 62), 100); // gained win% -> no penalty
  assert.ok(accuracyPercent(60, 40) < accuracyPercent(60, 55));
  const acc = accuracyPercent(80, 30);
  assert.ok(acc >= 0 && acc < 40);
});

test('moveJudgment thresholds blunder/mistake/inaccuracy by win drop', () => {
  assert.equal(moveJudgment(60, 58), null); // 2 pts, fine
  assert.equal(moveJudgment(60, 54), 'inaccuracy'); // 6 pts
  assert.equal(moveJudgment(60, 48), 'mistake'); // 12 pts
  assert.equal(moveJudgment(60, 44), 'blunder'); // 16 pts (lila blunder = 15+)
  assert.equal(moveJudgment(60, 30), 'blunder'); // 30 pts
  assert.equal(moveJudgment(40, 60), null); // improved, not a mistake
});

test('gameAccuracy is near-100 for a clean game and punishes a blunder harmonically', () => {
  // 12 flat moves: nobody loses win%.
  const flat = Array.from({ length: 13 }, () => 50);
  const clean = gameAccuracy(flat);
  assert.ok(clean.first > 95);
  assert.ok(clean.second > 95);

  // Same game, but the first mover throws move 7 (50 -> 10 for them).
  const blundered = [...flat];
  for (let i = 7; i < blundered.length; i += 1) blundered[i] = 10;
  const swung = gameAccuracy(blundered);
  assert.ok(swung.first < clean.first - 20); // harmonic mean makes one blunder hurt
  assert.ok(swung.second > 95); // the opponent's moves stay clean
});

test('gameAccuracy handles degenerate inputs', () => {
  assert.deepEqual(gameAccuracy([]), { first: 0, second: 0 });
  assert.deepEqual(gameAccuracy([50]), { first: 0, second: 0 });
  // One move: only the first mover has an accuracy sample. The second mover made no gradeable
  // move, so they have no errors to count → 100% (not a misleading 0%).
  const one = gameAccuracy([50, 40]);
  assert.ok(one.first > 0 && one.first < 100);
  assert.equal(one.second, 100);
});

test('gameAccuracy drops a reveal ply (null override) from the graded accuracy', () => {
  // A curve where the FIRST mover's ply-1 move looks like a big blunder (50 -> 15) but it is a
  // reveal (luck): dropping ply 1 should lift their accuracy well above the un-overridden version.
  const curve = [50, 15, 40, 45, 42];
  const graded = gameAccuracy(curve);
  const revealDropped = gameAccuracy(curve, new Map([[1, null]]));
  assert.ok(revealDropped.first > graded.first, 'dropping the unlucky reveal raises accuracy');
});

test('gameAccuracy substitutes a luck-free accuracy for a reveal ply', () => {
  // Same curve: ply 1 realized as a 50->15 crater, but the luck-free DECISION was near-perfect.
  // Overriding ply 1 with a high accuracy should grade the first mover well above the realized
  // (outcome-graded) version, and above simply dropping the ply (which adds no positive sample).
  const curve = [50, 15, 40, 45, 42];
  const realized = gameAccuracy(curve);
  const luckFree = gameAccuracy(curve, new Map([[1, 99]]));
  assert.ok(luckFree.first > realized.first, 'a luck-free decision beats the crater outcome');
});
