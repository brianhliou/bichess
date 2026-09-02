import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMultiPvBurstCollector, createThrottledEmitter } from './multipv-burst.js';
import { parseInfo } from './uci-info.js';

const info = (line: string) => {
  const parsed = parseInfo(line);
  if (!parsed) throw new Error(`not an info line: ${line}`);
  return parsed;
};

describe('createMultiPvBurstCollector', () => {
  it('reports a burst only once all MultiPV lines are in', () => {
    const c = createMultiPvBurstCollector(3);
    expect(c.push(info('info depth 22 multipv 1 score cp -50 pv a1a2 b7c7'))).toBeNull();
    expect(c.push(info('info depth 22 multipv 2 score cp -70 pv b2b3 b7c7'))).toBeNull();
    const burst = c.push(info('info depth 22 multipv 3 score cp -80 pv f2f3 b7c7'));
    expect(burst?.map((l) => [l.multipv, l.pvUci[0], l.scoreCp])).toEqual([
      [1, 'a1a2', -50],
      [2, 'b2b3', -70],
      [3, 'f2f3', -80],
    ]);
  });

  it('never surfaces a new best line beside its own stale copy (the /analysis duplicate)', () => {
    // Depth 22 ranked f2f3 third. At depth 23 the engine promotes it to first
    // and re-prints the other two from depth 22 behind it. A per-index map
    // rendered after the first line of that burst showed f2f3 twice.
    const c = createMultiPvBurstCollector(3);
    c.push(info('info depth 22 multipv 1 score cp -50 pv a1a2 b7c7'));
    c.push(info('info depth 22 multipv 2 score cp -70 pv b2b3 b7c7'));
    c.push(info('info depth 22 multipv 3 score cp -80 pv f2f3 b7c7 b2b3'));
    expect(c.push(info('info depth 23 multipv 1 score cp -60 pv f2f3 b7c7 b2b3 b8c6'))).toBeNull();
    expect(c.push(info('info depth 22 multipv 2 score cp -50 pv a1a2 b7c7'))).toBeNull();
    const burst = c.push(info('info depth 22 multipv 3 score cp -70 pv b2b3 b7c7'));
    expect(burst?.map((l) => l.pvUci[0])).toEqual(['f2f3', 'a1a2', 'b2b3']);
    expect(new Set(burst?.map((l) => l.pvUci[0])).size).toBe(3);
  });

  it('closes a short burst when the next multipv 1 arrives (fewer legal moves than MultiPV)', () => {
    const c = createMultiPvBurstCollector(3);
    expect(c.push(info('info depth 5 multipv 1 score mate 1 pv a1a2'))).toBeNull();
    expect(c.push(info('info depth 5 multipv 2 score cp 0 pv b2b3'))).toBeNull();
    const closed = c.push(info('info depth 6 multipv 1 score mate 1 pv a1a2'));
    expect(closed?.map((l) => [l.multipv, l.depth])).toEqual([
      [1, 5],
      [2, 5],
    ]);
    expect(c.flush()?.map((l) => [l.multipv, l.depth])).toEqual([[1, 6]]);
  });

  it('completes every line as a burst at MultiPV 1', () => {
    const c = createMultiPvBurstCollector(1);
    expect(c.push(info('info depth 3 multipv 1 score cp 10 pv a1a2'))?.length).toBe(1);
    expect(c.push(info('info depth 4 multipv 1 score cp 12 pv a1a2'))?.[0].depth).toBe(4);
    expect(c.flush()).toBeNull();
  });

  it('drops aspiration bound lines and pv-less lines', () => {
    const c = createMultiPvBurstCollector(1);
    expect(c.push(info('info depth 18 multipv 1 score cp -77 upperbound pv f2e2 b7c7'))).toBeNull();
    expect(c.push(info('info depth 18 multipv 1 score cp -61 lowerbound pv f2e2'))).toBeNull();
    expect(c.push(info('info depth 18 currmove f2e2 currmovenumber 1'))).toBeNull();
    expect(c.push(info('info depth 18 multipv 1 score cp -96 pv e1e4 b7c7'))?.[0].scoreCp).toBe(
      -96,
    );
  });

  it('flush returns the pending burst once, for the bestmove tail', () => {
    const c = createMultiPvBurstCollector(2);
    c.push(info('info depth 9 multipv 1 score cp 1 pv a1a2'));
    expect(c.flush()?.length).toBe(1);
    expect(c.flush()).toBeNull();
  });
});

describe('createThrottledEmitter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('emits on the leading edge, then once at the trailing edge for a burst of calls', () => {
    const emit = vi.fn();
    const e = createThrottledEmitter(80, emit);
    e.schedule();
    expect(emit).toHaveBeenCalledTimes(1);
    e.schedule();
    e.schedule();
    expect(emit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(79);
    expect(emit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('cancel drops the pending trailing emit', () => {
    const emit = vi.fn();
    const e = createThrottledEmitter(80, emit);
    e.schedule();
    e.schedule();
    e.cancel();
    vi.advanceTimersByTime(200);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
