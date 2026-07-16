/* tslint:disable */
/* eslint-disable */

/**
 * Evaluate a full-board Jungle FEN and return the top-`multipv` legal moves as JSON,
 * ranked best-first, each with an exact side-to-move centipawn score.
 *
 * Returns `{"lines":[{"uci":"d1d2","cp":123,"depth":6},...]}`, or `{"error":"bad_fen"}` on a
 * malformed FEN, or `{"lines":[]}` when there is no legal move (terminal). `cp` is the
 * engine's native side-to-move score (WIN = 1_000_000; the browser normalizes POV to Red and
 * maps through its win% curve — a decisive |cp| renders as checkmate). The search
 * self-bounds its iterative deepening at the engine core's MAX_DEPTH.
 */
export function analyze(fen: string, nodes: number, multipv: number): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly analyze: (a: number, b: number, c: number, d: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
