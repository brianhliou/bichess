// Shared client-engine (ceval) contract types. Extracted from ceval.ts so both the
// Fairy-Stockfish backend (ceval.ts) and the Misty wasm backend (misty-ceval.ts) can
// depend on the interface without a circular import (ceval.ts value-imports MistyCeval;
// misty-ceval.ts would otherwise type-import back from ceval.ts). ceval.ts re-exports
// everything here, so existing `from './ceval.js'` importers are unaffected.

/** Variants a client engine can evaluate. `xiangqi`/`fortressxiangqi` run on the shared
 *  Fairy-Stockfish instance (ceval.ts); `banqi` runs on a separate Misty wasm backend
 *  (misty-ceval.ts) — createCeval() dispatches by variant. */
export type CevalVariant = 'xiangqi' | 'fortressxiangqi' | 'banqi' | 'jungleflip';

export interface CevalLine {
  /** 1-based rank within MultiPV (1 = best). */
  multipv: number;
  depth: number;
  /** Centipawns, side-to-move POV; null when `mate` is set. */
  scoreCp: number | null;
  /** Signed moves-to-mate, side-to-move POV; null otherwise. */
  mate: number | null;
  /** Principal variation, engine UCI. */
  pvUci: string[];
}

export interface CevalUpdate {
  depth: number;
  seldepth: number;
  nodes: number;
  nps: number;
  /** Lines sorted ascending by multipv. Scores are from the side-to-move POV. */
  lines: CevalLine[];
}

export interface CevalRequest {
  /** Move history from the base position, in engine UCI. */
  movesUci: string[];
  /** Base position as an engine FEN. Omit to analyse from the standard start
   *  position (the review board's whole-game replay); set it to analyse a
   *  mid-game position that has no start-position move list, e.g. a mined puzzle
   *  that begins partway through a game. `movesUci` are then applied on top. */
  initialFen?: string;
  /** Number of ranked lines to return (default 1). */
  multiPv?: number;
  /** Cap search depth; the engine streams shallower updates first (default 18). */
  maxDepth?: number;
  /** Progressive callback fired as depth increases (throttled). */
  onUpdate?: (update: CevalUpdate) => void;
}

export interface CevalHandle {
  readonly variant: CevalVariant;
  /** Warm the engine ahead of the first evaluate (load + init). Idempotent. */
  preload(): Promise<void>;
  /** Evaluate a position; resolves with the deepest update reached. */
  evaluate(req: CevalRequest): Promise<CevalUpdate>;
  /** Halt the current search (the pending evaluate never resolves). */
  stop(): void;
  dispose(): void;
}
