import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fsfXiangqiUciToPikafishUci,
  pikafishUciToFsfXiangqiUci,
  XIANGQI_FSF_PLAYABLE_ENGINES,
  xiangqiFsfEngineTierFor,
} from './xiangqi-fsf-engine.js';

test('FSF Xiangqi ladder matches the Lichess/PlayStrategy weakening profiles', () => {
  assert.deepEqual(XIANGQI_FSF_PLAYABLE_ENGINES, [
    {
      id: 'fairy-stockfish-xiangqi-level-1',
      name: 'Fairy-Stockfish - Level 1',
      skill: -9,
      depth: 5,
      movetimeMs: 50,
    },
    {
      id: 'fairy-stockfish-xiangqi-level-2',
      name: 'Fairy-Stockfish - Level 2',
      skill: -5,
      depth: 5,
      movetimeMs: 100,
    },
    {
      id: 'fairy-stockfish-xiangqi-level-3',
      name: 'Fairy-Stockfish - Level 3',
      skill: -1,
      depth: 5,
      movetimeMs: 150,
    },
    {
      id: 'fairy-stockfish-xiangqi-level-4',
      name: 'Fairy-Stockfish - Level 4',
      skill: 3,
      depth: 5,
      movetimeMs: 200,
    },
    {
      id: 'fairy-stockfish-xiangqi-level-5',
      name: 'Fairy-Stockfish - Level 5',
      skill: 7,
      depth: 5,
      movetimeMs: 300,
    },
    {
      id: 'fairy-stockfish-xiangqi-level-6',
      name: 'Fairy-Stockfish - Level 6',
      skill: 11,
      depth: 8,
      movetimeMs: 400,
    },
    {
      id: 'fairy-stockfish-xiangqi-level-7',
      name: 'Fairy-Stockfish - Level 7',
      skill: 16,
      depth: 13,
      movetimeMs: 500,
    },
    {
      id: 'fairy-stockfish-xiangqi-level-8',
      name: 'Fairy-Stockfish - Level 8',
      skill: 20,
      depth: 22,
      movetimeMs: 1_000,
    },
  ]);
  assert.equal(xiangqiFsfEngineTierFor('unknown'), null);
});

test('translates between Pikafish and Fairy-Stockfish Xiangqi ranks', () => {
  assert.equal(pikafishUciToFsfXiangqiUci('b0c2'), 'b1c3');
  assert.equal(pikafishUciToFsfXiangqiUci('h2h9'), 'h3h10');
  assert.equal(fsfXiangqiUciToPikafishUci('b1c3'), 'b0c2');
  assert.equal(fsfXiangqiUciToPikafishUci('h3h10'), 'h2h9');
  assert.throws(() => pikafishUciToFsfXiangqiUci('b1c10'), /invalid Pikafish/);
  assert.throws(() => fsfXiangqiUciToPikafishUci('b0c2'), /invalid Fairy-Stockfish/);
});
