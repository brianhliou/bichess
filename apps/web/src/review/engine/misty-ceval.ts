// Client-side ("local") engine analysis for the Misty family of Rust engines, compiled to
// WebAssembly: Banqi (MistyBanqi), Flip Jungle (MistyJungleFlip), and vanilla Jungle
// (MistyJungle). This is the second ceval backend — the Fairy-Stockfish one in ceval.ts
// drives xiangqi/fortress; this one drives the Rust-engine variants (the hidden-info flip
// ones AND perfect-info Jungle), which are Rust, not FSF. Both satisfy the same CevalHandle
// contract so the engine panel is backend-agnostic.
//
// Key differences from the FSF backend:
//  - SINGLE-THREADED wasm: no SharedArrayBuffer, so NO cross-origin isolation needed
//    (cevalSupported() is unconditionally true for these variants).
//  - SINGLE-SHOT, not iterative-deepening: the search runs once against a node budget and
//    returns the top-K root moves (MistyBanqi's `root_move_values` — exact per-move evals),
//    so evaluate() resolves with one update rather than streaming depth-by-depth.
//  - FEN-per-position, not moves-from-startpos: a flip variant's position is fed as a
//    redacted FEN (face-down tiles as X); the panel supplies initialFen, movesUci is empty.
import type {
  CevalHandle,
  CevalLine,
  CevalRequest,
  CevalUpdate,
  CevalVariant,
} from './ceval-types.js';

// Vendored wasm assets live in public/ (like the FSF build) and are cache-busted by this
// version query. The worker's own imports are unversioned (bare path), so the main thread
// posts the versioned URLs in `init` — bump this on any vendored-asset change to mint fresh
// edge cache keys for the worker script, the JS glue, AND the wasm.
// -coep1: the 0.2.4-2 keys were edge-cached before the server started sending
// COEP/CORP on /engine/<pkg>/ assets (2026-07-16); fresh keys pick the headers up.
const MISTY_ASSET_VERSION = '0.2.4-coep1';

interface MistyEngineConfig {
  /** Public base path of the vendored wasm build. */
  base: string;
  /** wasm-pack module basename (`<name>.js` + `<name>_bg.wasm`) under `base`. */
  moduleName: string;
  /** Human label shown in the panel. */
  engineName: string;
  /** Depth-selector value (14/18/22/26) → search node budget. A Misty engine searches to a
   *  node budget, not a fixed depth, so we translate the panel's "Depth" knob into nodes. */
  nodesForDepth: (maxDepth: number) => number;
}

const MISTY_CONFIGS: Record<string, MistyEngineConfig> = {
  banqi: {
    base: '/engine/misty-banqi/',
    moduleName: 'banqi_wasm',
    engineName: 'MistyBanqi',
    // 14→280k … 26→520k: a review-board-appropriate budget (~100-400ms/position).
    nodesForDepth: (maxDepth) => Math.max(80_000, maxDepth * 20_000),
  },
  jungleflip: {
    base: '/engine/misty-jungle-flip/',
    moduleName: 'jungle_flip_wasm',
    engineName: 'MistyJungleFlip',
    // Same budget shape as banqi; the 4×4 flip board resolves comparably fast per position.
    nodesForDepth: (maxDepth) => Math.max(80_000, maxDepth * 20_000),
  },
  jungle: {
    base: '/engine/misty-jungle/',
    moduleName: 'jungle_wasm',
    engineName: 'MistyJungle',
    // Same budget shape; the 7×9 perfect-info board reaches ~depth 6-8 in this range.
    nodesForDepth: (maxDepth) => Math.max(80_000, maxDepth * 20_000),
  },
};

/** Variants served by a Misty wasm backend (vs the FSF backend in ceval.ts). */
export function isMistyCevalVariant(variant: CevalVariant): boolean {
  return variant === 'banqi' || variant === 'jungleflip' || variant === 'jungle';
}

export function mistyEngineName(variant: CevalVariant): string | null {
  return MISTY_CONFIGS[variant]?.engineName ?? null;
}

interface PendingAnalyze {
  resolve: (json: string) => void;
  reject: (err: Error) => void;
}

/** A CevalHandle backed by a Misty wasm engine running in a dedicated module worker. */
export class MistyCeval implements CevalHandle {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingAnalyze>();
  private token = 0;
  private readonly config: MistyEngineConfig;

  constructor(readonly variant: CevalVariant) {
    const config = MISTY_CONFIGS[variant];
    if (!config) throw new Error(`misty-ceval: no config for variant ${variant}`);
    this.config = config;
  }

  /** Spin up the worker and initialize the wasm (idempotent). */
  preload(): Promise<void> {
    if (!this.readyPromise) this.readyPromise = this.spawn();
    return this.readyPromise;
  }

  private spawn(): Promise<void> {
    const v = MISTY_ASSET_VERSION;
    const worker = new Worker(`${this.config.base}worker.js?v=${v}`, { type: 'module' });
    this.worker = worker;
    worker.onmessage = (event: MessageEvent) => this.onMessage(event.data);
    return new Promise<void>((resolve, reject) => {
      const onReady = (event: MessageEvent) => {
        const msg = event.data;
        if (msg?.type === 'ready') {
          worker.removeEventListener('message', onReady);
          resolve();
        } else if (msg?.type === 'error' && msg.id === undefined) {
          worker.removeEventListener('message', onReady);
          reject(new Error(msg.error ?? 'misty-ceval: worker init failed'));
        }
      };
      worker.addEventListener('message', onReady);
      worker.onerror = (e) => reject(new Error(`misty-ceval: worker error: ${e.message}`));
      worker.postMessage({
        type: 'init',
        jsUrl: `${this.config.base}${this.config.moduleName}.js?v=${v}`,
        wasmUrl: `${this.config.base}${this.config.moduleName}_bg.wasm?v=${v}`,
      });
    });
  }

  private onMessage(msg: { type: string; id?: number; json?: string; error?: string }): void {
    if (msg.id === undefined) return; // init-phase messages handled in spawn()
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    this.pending.delete(msg.id);
    if (msg.type === 'result' && typeof msg.json === 'string') entry.resolve(msg.json);
    else entry.reject(new Error(msg.error ?? 'misty-ceval: analyze failed'));
  }

  async evaluate(req: CevalRequest): Promise<CevalUpdate> {
    await this.preload();
    const myToken = ++this.token; // supersede any in-flight evaluate
    const fen = req.initialFen;
    if (!fen) {
      // Misty engines are FEN-per-position; a caller must supply the redacted FEN.
      throw new Error('misty-ceval: initialFen required (flip variants have no startpos)');
    }
    const multiPv = req.multiPv ?? 1;
    const nodes = this.config.nodesForDepth(req.maxDepth ?? 18);
    const json = await this.send(fen, nodes, multiPv);
    if (this.token !== myToken) {
      // A newer evaluate superseded us; return an empty update rather than stale lines.
      return { depth: 0, seldepth: 0, nodes: 0, nps: 0, lines: [] };
    }
    const update = parseMistyUpdate(json, nodes);
    req.onUpdate?.(update);
    return update;
  }

  private send(fen: string, nodes: number, multipv: number): Promise<string> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error('misty-ceval: worker not ready'));
    const id = this.nextId++;
    return new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ type: 'analyze', id, fen, nodes, multipv });
    });
  }

  stop(): void {
    // The wasm search is synchronous in the worker and can't be interrupted mid-run; a
    // bumped token makes any in-flight result resolve to an empty update, and the bounded
    // node budget keeps a single search short.
    this.token++;
  }

  dispose(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    for (const entry of this.pending.values()) {
      entry.reject(new Error('misty-ceval: disposed'));
    }
    this.pending.clear();
  }
}

/** Parse the worker's `{"lines":[{uci,cp,depth}]}` JSON into a single-shot CevalUpdate. */
export function parseMistyUpdate(json: string, nodeBudget: number): CevalUpdate {
  let parsed: { lines?: Array<{ uci: string; cp: number; depth: number }>; error?: string };
  try {
    parsed = JSON.parse(json);
  } catch {
    return { depth: 0, seldepth: 0, nodes: 0, nps: 0, lines: [] };
  }
  const rawLines = parsed.lines ?? [];
  const lines: CevalLine[] = rawLines.map((line, i) => ({
    multipv: i + 1,
    depth: line.depth,
    scoreCp: line.cp,
    mate: null,
    pvUci: [line.uci],
  }));
  const depth = lines[0]?.depth ?? 0;
  return { depth, seldepth: depth, nodes: nodeBudget, nps: 0, lines };
}
