import { describe, expect, test } from 'vitest';
import { parseXiangqiGameSource } from './xiangqi-game-source.js';

describe('parseXiangqiGameSource', () => {
  test('reads each of the three game surfaces from a full URL', () => {
    expect(parseXiangqiGameSource('https://mistboard.com/xiangqi/game/xq_abc')).toEqual({
      kind: 'mistboard',
      id: 'xq_abc',
    });
    expect(parseXiangqiGameSource('https://mistboard.com/historical-xiangqi/game/hxq_123')).toEqual(
      { kind: 'historical', id: 'hxq_123' },
    );
    expect(
      parseXiangqiGameSource('https://mistboard.com/broadcast/xiangqi/board/b-7?ply=12'),
    ).toEqual({ kind: 'broadcast', id: 'b-7' });
  });

  test('accepts a bare path and a bare id', () => {
    expect(parseXiangqiGameSource('/xiangqi/game/xq_abc')?.kind).toBe('mistboard');
    expect(parseXiangqiGameSource('xq_abc')).toEqual({ kind: 'mistboard', id: 'xq_abc' });
    expect(parseXiangqiGameSource('hxq_123')).toEqual({ kind: 'historical', id: 'hxq_123' });
  });

  test('refuses anything it cannot route rather than guessing', () => {
    // A wrong guess imports the wrong game, which is worse than refusing.
    expect(parseXiangqiGameSource('https://lichess.org/abcd1234')).toBeNull();
    expect(parseXiangqiGameSource('https://mistboard.com/jungle/game/jg_1')).toBeNull();
    expect(parseXiangqiGameSource('some notes about a game')).toBeNull();
    expect(parseXiangqiGameSource('   ')).toBeNull();
  });

  test('a query string or trailing segment does not leak into the id', () => {
    expect(parseXiangqiGameSource('/xiangqi/game/xq_abc?tab=moves')?.id).toBe('xq_abc');
    expect(parseXiangqiGameSource('/xiangqi/game/xq_abc#ply3')?.id).toBe('xq_abc');
  });
});
