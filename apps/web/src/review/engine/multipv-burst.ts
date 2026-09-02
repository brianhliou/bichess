import type { CevalLine } from './ceval-types.js';
import type { InfoFields } from './uci-info.js';

/**
 * Groups UCI `info ... multipv N ... pv ...` lines into complete bursts.
 *
 * Stockfish-family engines re-print EVERY MultiPV line each time one PV
 * finishes (after the first few seconds of a search), and the lines it has not
 * re-searched yet carry the previous depth. The engine's own burst is always
 * self-consistent: the new best line goes to the front and the others keep
 * their order, so no two lines share a first move. The client used to store
 * each line by its multipv index and render on the FIRST line of a burst, then
 * throttle away the two that completed it, so a stale copy of the new best
 * line (same first move, older depth, older score) sat on screen until the
 * next burst, seconds later. Only a complete burst is a renderable state.
 *
 * A burst is complete when it holds `multiPv` lines, or when the next burst
 * starts (a position with fewer legal moves than MultiPV prints fewer lines),
 * or on `flush()` at bestmove. Aspiration fail-high/fail-low lines (`lowerbound`
 * / `upperbound`) are not scores; they are dropped, not stored.
 */
export interface MultiPvBurstCollector {
  /** Feed one parsed info line. Returns the lines of a burst that just completed, else null. */
  push(info: InfoFields): CevalLine[] | null;
  /** Return the pending, incomplete burst (bestmove ends a search mid-burst), else null. */
  flush(): CevalLine[] | null;
}

export function createMultiPvBurstCollector(multiPv: number): MultiPvBurstCollector {
  const expected = Math.max(1, Math.floor(multiPv));
  let pending = new Map<number, CevalLine>();

  const take = (): CevalLine[] => {
    const lines = [...pending.values()].sort((a, b) => a.multipv - b.multipv);
    pending = new Map();
    return lines;
  };

  return {
    push(info) {
      if (!info.pvUci.length || info.bound) return null;
      let completed: CevalLine[] | null = null;
      // A new multipv 1 opens the next burst; whatever is pending was a short
      // burst (fewer legal moves than MultiPV) and is complete as it stands.
      if (info.multipv === 1 && pending.size > 0) completed = take();
      pending.set(info.multipv, {
        multipv: info.multipv,
        depth: info.depth,
        scoreCp: info.scoreCp,
        mate: info.mate,
        pvUci: info.pvUci,
      });
      if (pending.size >= expected) {
        // Two bursts closed on one line: the short one first, then this one.
        // Callers render the latest, so the short one is dropped.
        completed = take();
      }
      return completed;
    },
    flush() {
      return pending.size > 0 ? take() : null;
    },
  };
}

export interface ThrottledEmitter {
  /** Emit now if the throttle window has passed, else once at its trailing edge. */
  schedule(): void;
  /** Drop a pending trailing emit (the search ended, or was superseded). */
  cancel(): void;
}

/**
 * Leading-plus-trailing throttle. The old leading-only throttle is what let a
 * mid-burst snapshot stick: it fired on the first line of a burst and then
 * swallowed the lines that completed it, with nothing scheduled to render the
 * finished state. Here a suppressed emit is deferred to the window's end, so
 * the latest complete burst always reaches the screen.
 */
export function createThrottledEmitter(intervalMs: number, emit: () => void): ThrottledEmitter {
  let lastEmit = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = (): void => {
    timer = undefined;
    lastEmit = Date.now();
    emit();
  };
  return {
    schedule() {
      if (timer !== undefined) return;
      const wait = intervalMs - (Date.now() - lastEmit);
      if (wait <= 0) fire();
      else timer = setTimeout(fire, wait);
    },
    cancel() {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
