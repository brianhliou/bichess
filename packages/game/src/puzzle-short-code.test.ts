import assert from 'node:assert/strict';
import test from 'node:test';
import {
  looksLikePuzzleShortCode,
  puzzleShortCode,
  resolvePuzzleShortCode,
} from './puzzle-short-code.js';
import { FORTRESS_XIANGQI_PUZZLES } from './puzzles-fortress-xiangqi.js';
import { JUNGLE_PUZZLES } from './puzzles-jungle.js';
import { MINI_XIANGQI_PUZZLES } from './puzzles-mini-xiangqi.js';
import { XIANGQI_PUZZLES } from './puzzles-xiangqi.js';

// Every id resolvable through the server's puzzleById() choke point. Keep in
// sync with routes/puzzles.ts:puzzleById (same four registries).
const ALL_PUZZLE_IDS: readonly string[] = [
  ...MINI_XIANGQI_PUZZLES,
  ...FORTRESS_XIANGQI_PUZZLES,
  ...JUNGLE_PUZZLES,
  ...XIANGQI_PUZZLES,
].map((puzzle) => puzzle.id);

test('puzzle short codes are deterministic and well-formed', () => {
  for (const id of ALL_PUZZLE_IDS) {
    const code = puzzleShortCode(id);
    assert.equal(code, puzzleShortCode(id), `unstable code for ${id}`);
    assert.ok(looksLikePuzzleShortCode(code), `malformed code ${code} for ${id}`);
  }
});

// The whole design (display-only code that still locates a puzzle) rests on the
// code being collision-free across the loaded corpus. If a future puzzle import
// collides, this fails loudly rather than silently resolving to the wrong game.
test('puzzle short codes are unique across the loaded corpus', () => {
  const seen = new Map<string, string>();
  for (const id of ALL_PUZZLE_IDS) {
    const code = puzzleShortCode(id);
    const prior = seen.get(code);
    assert.equal(
      prior,
      undefined,
      `short-code collision "${code}": ${prior} and ${id} (bump CODE_LENGTH or reseed)`,
    );
    seen.set(code, id);
  }
});

test('resolvePuzzleShortCode inverts the code back to its id', () => {
  const sample = ALL_PUZZLE_IDS.slice(0, 50);
  for (const id of sample) {
    const code = puzzleShortCode(id);
    assert.equal(resolvePuzzleShortCode(code, ALL_PUZZLE_IDS), id);
  }
});

test('resolvePuzzleShortCode rejects non-code and unknown input', () => {
  // A full id is not a short code, so the scan is skipped entirely.
  assert.equal(resolvePuzzleShortCode('xq-mined-hxq_deadbeef-60', ALL_PUZZLE_IDS), null);
  // Well-formed but not present in the corpus.
  assert.equal(resolvePuzzleShortCode('zzzzz', []), null);
});
