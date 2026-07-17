// Config entries for the variant PvE smokes. Each prod-<variant>-smoke.mjs
// entry point is one row here plus a two-line script; the shared runner lives
// in variant-smoke.mjs.
//
// Engine-seat assertions are version-agnostic by prefix wherever the engine id
// carries a version suffix. Pinning a specific version silently breaks the
// smoke on every engine bump: the check never matches the new seat id and the
// smoke times out on a perfectly healthy engine (hit exactly this on the DXQ
// v1.0 -> v1.1 flip, fixed in bfb02b95). `equals` is reserved for ids with no
// version suffix at all.

export const VARIANT_SMOKE_CONFIGS = {
  fortress: {
    name: 'fortress',
    label: 'Fortress',
    usage: 'npm run prod:smoke:fortress -- [options]',
    gameSpecId: 'fortress-xiangqi',
    defaultTimeoutMs: 40_000,
    // Prod assigns the Fairy-Stockfish Fortress Xiangqi engine to the red seat
    // for a PvE room. The smoke asserts this exact seat so a silent
    // engine-routing change (wrong engine, or none) reds the release rather
    // than passing on a stub. The id names a strength level, not a version, so
    // an exact match is safe here.
    engineSeat: { equals: 'fairy-stockfish-fortress-xiangqi-strong' },
  },
  dmx: {
    name: 'dmx',
    label: 'DMX',
    usage: 'npm run prod:smoke:dmx -- [options]',
    gameSpecId: 'dark-mini-xiangqi',
    defaultTimeoutMs: 20_000,
    // version-agnostic: any DMX engine id (python-dmx-*), per the bfb02b95
    // lesson above.
    engineSeat: { prefix: 'python-dmx-' },
  },
  dxq: {
    name: 'dxq',
    label: 'DXQ',
    usage: 'npm run prod:smoke:dxq -- [options]',
    gameSpecId: 'dark-xiangqi',
    defaultTimeoutMs: 80_000,
    // version-agnostic: any Dark Xiangqi engine id (python-fdx-*).
    engineSeat: { prefix: 'python-fdx-' },
  },
};

export function matchesEngineSeat(engineSeat, seatId) {
  if (typeof seatId !== 'string') return false;
  if (engineSeat.equals !== undefined) return seatId === engineSeat.equals;
  return seatId.startsWith(engineSeat.prefix);
}
