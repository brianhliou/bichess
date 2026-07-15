// Client-side ("local") engine analysis for the review board, powered by the
// vendored Fairy-Stockfish WASM build (apps/web/public/engine/fairy-stockfish).
//
// FSF-wasm is multi-threaded-only: it allocates a *shared* WebAssembly.Memory and
// THROWS when SharedArrayBuffer is unavailable, so the host document MUST be
// cross-origin isolated (COOP: same-origin + COEP). cevalSupported() gates on that;
// callers show a "reload to enable" affordance when it is false. Everything here is
// lazy — importing the module in a non-isolated page (or a test) does nothing until
// evaluate()/preloadEngine() is called.

// The ceval contract types live in ceval-types.ts (so the Misty backend can share them
// without a circular import); imported for local use and re-exported below for existing
// `from './ceval.js'` importers.
import type {
  CevalHandle,
  CevalLine,
  CevalRequest,
  CevalUpdate,
  CevalVariant,
} from './ceval-types.js';
import { isMistyCevalVariant, MistyCeval, mistyEngineName } from './misty-ceval.js';

export type { CevalHandle, CevalLine, CevalRequest, CevalUpdate, CevalVariant };

const ENGINE_BASE = '/engine/fairy-stockfish/';
// The vendored FSF assets live in public/ and are NOT content-hashed like the Vite
// bundle, so the CDN caches them by bare path for hours (max-age=14400) and a copy
// cached before a header/route change keeps serving stale. Every engine asset
// (script, wasm, AND the pthread worker) is versioned to force a fresh edge fetch
// on any change — critically the worker, which must carry its own COEP header to
// become cross-origin isolated; a stale header-less copy leaves it un-isolated and
// pthreads die. The worker loads its deps from a URL/blob the main thread posts to
// it (not from its own location), so a query on its URL is safe. Bump on any
// vendored-asset change (this CF config keys on the query string).
//
// The `-coepN` suffix is a cache-bust generation: a plain `1.1.11` had already
// been cached at the edge WITHOUT the COEP header (from a pre-fix request), so
// that key was poisoned. Bump the suffix to mint a fresh, never-cached key that
// fills from origin (which now always sends COEP) whenever the required response
// headers change.
const ENGINE_ASSET_VERSION = '1.1.11-coep1';
const engineAsset = (file: string): string => `${ENGINE_BASE}${file}?v=${ENGINE_ASSET_VERSION}`;

/** Human label for the engine, shown in the analysis panel. */
export const CEVAL_ENGINE_NAME = 'Fairy-Stockfish';

/** Whether the client engine for `variant` can run in this page. The Fairy-Stockfish
 *  variants need SharedArrayBuffer (cross-origin isolation); the single-threaded Misty
 *  wasm variants (banqi) do not, so they are always supported. Called with no argument,
 *  it reports the FSF requirement (back-compat). */
export function cevalSupported(variant?: CevalVariant): boolean {
  if (variant && isMistyCevalVariant(variant)) return true;
  return (
    typeof SharedArrayBuffer === 'function' &&
    typeof crossOriginIsolated === 'boolean' &&
    crossOriginIsolated === true
  );
}

/** Human label for the engine backing `variant`. */
export function cevalEngineName(variant: CevalVariant): string {
  return mistyEngineName(variant) ?? CEVAL_ENGINE_NAME;
}

// --- low-level engine (singleton) ---------------------------------------------

interface RawEngine {
  postMessage(cmd: string): void;
  addMessageListener(cb: (line: string) => void): void;
  FS: { writeFile(path: string, data: string | Uint8Array): void };
}

type StockfishFactory = (opts: { locateFile: (f: string) => string }) => Promise<RawEngine>;

declare global {
  // The classic engine script assigns this global (its UMD tail finds no
  // module/define in the browser, so it falls back to a global).
  // eslint-disable-next-line no-var
  var Stockfish: StockfishFactory | undefined;
}

class EngineCore {
  private listeners = new Set<(line: string) => void>();

  constructor(private raw: RawEngine) {
    raw.addMessageListener((line) => {
      for (const cb of [...this.listeners]) cb(line);
    });
  }

  send(cmd: string): void {
    this.raw.postMessage(cmd);
  }

  onLine(cb: (line: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  writeFile(path: string, data: string): void {
    this.raw.FS.writeFile(path, data);
  }

  waitFor(pred: (line: string) => boolean): Promise<string> {
    return new Promise((resolve) => {
      const off = this.onLine((line) => {
        if (pred(line)) {
          off();
          resolve(line);
        }
      });
    });
  }
}

let enginePromise: Promise<EngineCore> | null = null;

function injectEngineScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-fsf-engine]')) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.dataset.fsfEngine = '1';
    el.addEventListener('load', () => resolve());
    el.addEventListener('error', () => reject(new Error('ceval: failed to load engine script')));
    document.head.appendChild(el);
  });
}

async function loadEngineCore(): Promise<EngineCore> {
  if (!cevalSupported()) {
    throw new Error('ceval_unsupported: page is not cross-origin isolated');
  }
  await injectEngineScript(engineAsset('stockfish.js'));
  const factory = globalThis.Stockfish;
  if (typeof factory !== 'function') {
    throw new Error('ceval: engine global missing after script load');
  }
  const raw = await factory({ locateFile: (f) => engineAsset(f) });
  const core = new EngineCore(raw);

  core.send('uci');
  await core.waitFor((line) => line === 'uciok');

  // Modest resources: leave a core for the UI, cap threads/hash for a review board.
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 2) : 2;
  const threads = Math.max(1, Math.min(cores - 1, 8));
  core.send(`setoption name Threads value ${threads}`);
  core.send('setoption name Hash value 64');

  // Load our custom Fortress variant into the engine's in-memory FS. Standard
  // xiangqi is a Fairy-Stockfish built-in and needs no .ini.
  try {
    const ini = await fetch(`${ENGINE_BASE}fortress-xiangqi.ini`).then((r) => r.text());
    core.writeFile('fortress-xiangqi.ini', ini);
    core.send('setoption name VariantPath value fortress-xiangqi.ini');
  } catch {
    // Fortress analysis will be unavailable, but xiangqi still works.
  }

  const ready = core.waitFor((line) => line === 'readyok');
  core.send('isready');
  await ready;
  return core;
}

/** Warm the engine up ahead of the first evaluate (script + wasm + variant load). */
export function preloadEngine(): Promise<void> {
  if (!enginePromise) enginePromise = loadEngineCore();
  return enginePromise.then(() => undefined);
}

function engine(): Promise<EngineCore> {
  if (!enginePromise) enginePromise = loadEngineCore();
  return enginePromise;
}

// --- info-line parsing --------------------------------------------------------

export interface InfoFields {
  depth: number;
  seldepth: number;
  multipv: number;
  scoreCp: number | null;
  mate: number | null;
  nodes: number;
  nps: number;
  pvUci: string[];
}

/** Parse a UCI `info` line into fields. Exported for tests. Returns null for
 *  `info string ...` and non-info lines. */
export function parseInfo(line: string): InfoFields | null {
  const t = line.split(/\s+/);
  if (t[0] !== 'info' || t[1] === 'string') return null;
  const f: InfoFields = {
    depth: 0,
    seldepth: 0,
    multipv: 1,
    scoreCp: null,
    mate: null,
    nodes: 0,
    nps: 0,
    pvUci: [],
  };
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        f.depth = Number(t[++i]);
        break;
      case 'seldepth':
        f.seldepth = Number(t[++i]);
        break;
      case 'multipv':
        f.multipv = Number(t[++i]);
        break;
      case 'nodes':
        f.nodes = Number(t[++i]);
        break;
      case 'nps':
        f.nps = Number(t[++i]);
        break;
      case 'score':
        if (t[i + 1] === 'cp') {
          f.scoreCp = Number(t[i + 2]);
          i += 2;
        } else if (t[i + 1] === 'mate') {
          f.mate = Number(t[i + 2]);
          i += 2;
        }
        break;
      case 'pv':
        f.pvUci = t.slice(i + 1);
        return f;
    }
  }
  return f;
}

const EMIT_THROTTLE_MS = 80;

// --- public handle ------------------------------------------------------------

class Ceval implements CevalHandle {
  private token = 0;
  private currentOff: (() => void) | null = null;

  constructor(readonly variant: CevalVariant) {}

  preload(): Promise<void> {
    return preloadEngine();
  }

  async evaluate(req: CevalRequest): Promise<CevalUpdate> {
    const core = await engine();
    this.stop(); // supersede any in-flight search
    const myToken = ++this.token;
    const multiPv = req.multiPv ?? 1;
    const maxDepth = req.maxDepth ?? 18;

    core.send('stop');
    core.send(`setoption name UCI_Variant value ${this.variant}`);
    core.send(`setoption name MultiPV value ${multiPv}`);
    const base = req.initialFen ? `fen ${req.initialFen}` : 'startpos';
    core.send(
      req.movesUci.length ? `position ${base} moves ${req.movesUci.join(' ')}` : `position ${base}`,
    );

    const byPv = new Map<number, CevalLine>();
    let depth = 0;
    let seldepth = 0;
    let nodes = 0;
    let nps = 0;
    let lastEmit = 0;
    let started = false;

    const snapshot = (): CevalUpdate => ({
      depth,
      seldepth,
      nodes,
      nps,
      lines: [...byPv.values()].sort((a, b) => a.multipv - b.multipv),
    });

    return await new Promise<CevalUpdate>((resolve) => {
      const off = core.onLine((line) => {
        if (this.token !== myToken || !started) return;
        if (line.startsWith('info ')) {
          const info = parseInfo(line);
          if (!info) return;
          if (info.depth) depth = info.depth;
          if (info.seldepth) seldepth = info.seldepth;
          if (info.nodes) nodes = info.nodes;
          if (info.nps) nps = info.nps;
          if (info.pvUci.length) {
            byPv.set(info.multipv, {
              multipv: info.multipv,
              depth: info.depth,
              scoreCp: info.scoreCp,
              mate: info.mate,
              pvUci: info.pvUci,
            });
            const now = Date.now();
            if (req.onUpdate && now - lastEmit > EMIT_THROTTLE_MS) {
              lastEmit = now;
              req.onUpdate(snapshot());
            }
          }
        } else if (line.startsWith('bestmove')) {
          off();
          if (this.currentOff === off) this.currentOff = null;
          const final = snapshot();
          req.onUpdate?.(final);
          resolve(final);
        }
      });
      this.currentOff = off;

      const ready = core.waitFor((line) => line === 'readyok');
      core.send('isready');
      void ready.then(() => {
        if (this.token !== myToken) return;
        started = true;
        core.send(`go depth ${maxDepth}`);
      });
    });
  }

  stop(): void {
    this.token++; // supersede: in-flight listeners bail
    if (this.currentOff) {
      this.currentOff();
      this.currentOff = null;
    }
    void engine()
      .then((core) => core.send('stop'))
      .catch(() => {});
  }

  dispose(): void {
    this.stop();
  }
}

export function createCeval(variant: CevalVariant): CevalHandle {
  if (isMistyCevalVariant(variant)) return new MistyCeval(variant);
  return new Ceval(variant);
}
