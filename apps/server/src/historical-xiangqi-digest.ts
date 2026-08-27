// The identity of an archive game row.
//
// `historical_xiangqi_games.content_sha256` is UNIQUE and `ON CONFLICT
// (content_sha256)` is the only thing standing between a re-import and a
// duplicate, so this function decides what "the same game" means. It lives in
// its own module because two callers must agree on it forever: the importer
// that writes rows, and the rehash script that repairs them. Two copies of this
// logic would drift, and the failure mode of drift here is a silently doubled
// corpus.
//
// Keyed on CONTENT, never on the source's own labels. ElephantChess re-anonymizes
// every monthly release: the same underlying game returns with a fresh game_id
// and fresh player pseudonyms. Measured on the real June and July 2026 dumps,
// they share ZERO source ids and 10,469 identical games, so a digest over source
// labels deduplicates nothing across releases.
//
// Measured collisions within a dump for (playedOn, result, moves): 0 of 11,767
// (July) and 0 of 10,471 (June). Dropping playedOn takes that to 10 and 7, so the
// date is load-bearing.

import { createHash } from 'node:crypto';
import type { XiangqiMove } from '@mistboard/game';

export interface HistoricalXiangqiDigestInput {
  playedOn: string | null;
  result: string;
  moves: readonly XiangqiMove[];
}

export function historicalXiangqiDigest(game: HistoricalXiangqiDigestInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        playedOn: game.playedOn,
        result: game.result,
        moves: game.moves.map((move) => `${move.from}${move.to}`),
      }),
    )
    .digest('hex');
}
