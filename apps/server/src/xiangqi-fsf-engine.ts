// Fairy-Stockfish standard-Xiangqi provider for deliberately weakened,
// human-facing opponents. Unlike mainline Pikafish, FSF exposes Stockfish's
// stochastic Skill Level: internally it searches multiple root candidates and
// sometimes selects a plausible suboptimal move. This first profile copies the
// exact Lichess/PlayStrategy Level 1 settings (skill -9, depth 5, 50 ms).

import { fairyStockfishBestmove, UciEnginePool } from './uci-engine-harness.js';

export const XIANGQI_FSF_ENGINE_VERSION = '0.1.0';

export type XiangqiFsfEngineId = `fairy-stockfish-xiangqi-level-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

export type XiangqiFsfEngineTier = {
  id: XiangqiFsfEngineId;
  name: string;
  depth: number;
  movetimeMs: number;
  skill: number;
};

const XIANGQI_FSF_ENGINE_TIERS = [
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
] as const satisfies readonly XiangqiFsfEngineTier[];

export const XIANGQI_FSF_PLAYABLE_ENGINES: readonly XiangqiFsfEngineTier[] =
  XIANGQI_FSF_ENGINE_TIERS;

const XIANGQI_FSF_ENGINE_BY_ID: ReadonlyMap<string, XiangqiFsfEngineTier> = new Map(
  XIANGQI_FSF_ENGINE_TIERS.map((engine) => [engine.id, engine]),
);

const fsfPool = new UciEnginePool({
  name: 'xiangqi-fsf',
  maxProcessesEnvVar: 'MISTBOARD_XIANGQI_FSF_MAX_PROCESSES',
  queueTimeoutEnvVar: 'MISTBOARD_XIANGQI_FSF_QUEUE_TIMEOUT_MS',
  queueTimeoutMessage: 'fairy-stockfish-xiangqi concurrency queue timed out',
});

export function xiangqiFsfEngineTierFor(engineId: string | undefined): XiangqiFsfEngineTier | null {
  if (!engineId) return null;
  return XIANGQI_FSF_ENGINE_BY_ID.get(engineId) ?? null;
}

export async function xiangqiFsfLiveEngineMove(
  engineId: string,
  moves: string[],
  opts: { movetimeMs?: number } = {},
): Promise<string | null> {
  const tier = xiangqiFsfEngineTierFor(engineId);
  if (!tier) throw new Error(`unknown Fairy-Stockfish Xiangqi engine: ${engineId}`);
  const release = await fsfPool.acquire();
  try {
    const bestmove = await fairyStockfishBestmove({
      moves: moves.map(pikafishUciToFsfXiangqiUci),
      variant: 'xiangqi',
      skill: tier.skill,
      depth: tier.depth,
      movetimeMs: opts.movetimeMs ?? tier.movetimeMs,
    });
    return bestmove === null ? null : fsfXiangqiUciToPikafishUci(bestmove);
  } finally {
    release();
  }
}

/** Convert canonical server/Pikafish a0-i9 UCI into FSF's a1-i10 ranks. */
export function pikafishUciToFsfXiangqiUci(uci: string): string {
  const match = uci.match(/^([a-i])(\d)([a-i])(\d)$/);
  if (!match) throw new Error(`invalid Pikafish Xiangqi UCI: ${uci}`);
  return `${match[1]}${Number(match[2]) + 1}${match[3]}${Number(match[4]) + 1}`;
}

/** Convert FSF a1-i10 UCI back to canonical server/Pikafish a0-i9 UCI. */
export function fsfXiangqiUciToPikafishUci(uci: string): string {
  const match = uci.match(/^([a-i])(10|[1-9])([a-i])(10|[1-9])$/);
  if (!match) throw new Error(`invalid Fairy-Stockfish Xiangqi UCI: ${uci}`);
  return `${match[1]}${Number(match[2]) - 1}${match[3]}${Number(match[4]) - 1}`;
}
