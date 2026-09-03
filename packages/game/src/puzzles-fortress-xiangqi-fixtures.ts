// Curated TEST fixture corpus for Fortress Xiangqi puzzles.
//
// Since #183 the SERVED corpus lives in the committed seed assets
// (packages/game/seed/puzzles/fortress-xiangqi.json +
// seed/source-games/fortress-xiangqi.json), synced into the `puzzles` /
// `puzzle_source_games` tables by the server (apps/server/src/puzzle-store.ts).
// The whole Fortress set stays hidden from the discoverable pool while the
// variant is demoted (see routes/puzzles.ts), but remains resolvable by id.
// These few records exist only so kernel/unit/adapter tests have realistic
// puzzles to exercise without the full corpus: verbatim copies of seed records
// (pinned as a subset by puzzles-seed.test.ts) covering mined mate-in-ones and
// tactic winning-advantage lines with source games.
//
// Do not hand-edit records here; if the seed corpus changes (re-mine), refresh
// any stale fixture from the seed JSON.

import type {
  FortressXiangqiPuzzle,
  FortressXiangqiSourceGame,
} from './puzzles-fortress-xiangqi.js';

// Fortress Xiangqi ships NO puzzles as of 2026-09-03. The corpus was mined under
// the veteran soldier and the roaming Treasure; the 2026-09-02 rules change made
// 18 of 88 solutions illegal and left 9 more starting from positions the game can
// no longer reach. Brian's call: Fortress does not need puzzles right now, so the
// corpus is emptied rather than re-mined. The registry plumbing stays so a future
// re-mine (scripts/variant-lab/fortress-xiangqi-puzzle-miner.ts) is a data change.

export const FIXTURE_FORTRESS_XIANGQI_PUZZLES: readonly FortressXiangqiPuzzle[] = [];

// Source games referenced by the tactic fixtures above (sourceGame.gameId).
export const FIXTURE_FORTRESS_XIANGQI_SOURCE_GAMES: readonly FortressXiangqiSourceGame[] = [];
