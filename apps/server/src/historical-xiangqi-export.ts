// PGN for an imported archive game (GET /api/historical-xiangqi/games/:id/export.pgn).
//
// These games are third-party corpus rows, so the tag block attributes the
// ARCHIVE (Event/Site/Date/Round/Red/Black/Result as imported, plus the source
// name, URL, and license) and carries no Mistboard CC BY grant: the license is
// the source's, not ours. The movetext is WXF when the line replays under
// standard rules and ICCS coordinates otherwise (see xiangqi-game-export.ts).

import { DEFAULT_SITE_HOST } from './game-export-shared.js';
import type {
  HistoricalXiangqiGame,
  HistoricalXiangqiSource,
} from './persistence-historical-xiangqi.js';
import { xiangqiPgnStyle, xiangqiPgnWriter } from './xiangqi-game-export.js';

const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

// played_on is stored as an ISO date; PGN spells it with dots and fills an
// unknown date with question marks rather than inventing one.
export function historicalPgnDate(playedOn: string | null | undefined): string {
  const match = playedOn ? ISO_DATE_PREFIX.exec(playedOn) : null;
  return match ? `${match[1]}.${match[2]}.${match[3]}` : '????.??.??';
}

function optionalTag(name: string, value: string | null | undefined): Record<string, string> {
  const trimmed = value?.trim();
  return trimmed ? { [name]: trimmed } : {};
}

export function buildHistoricalXiangqiPgn(
  game: HistoricalXiangqiGame,
  source: HistoricalXiangqiSource,
  siteOrigin: string = DEFAULT_SITE_HOST,
): string {
  const tags: Record<string, string> = {
    Event: game.eventName?.trim() || '?',
    Site: game.site?.trim() || '?',
    Date: historicalPgnDate(game.playedOn),
    Round: game.round?.trim() || '-',
    Red: game.redNameRaw?.trim() || '?',
    Black: game.blackNameRaw?.trim() || '?',
    Result: game.result,
    Variant: 'Xiangqi',
    Source: source.name,
    ...optionalTag('SourceURL', source.sourceUrl),
    ...optionalTag('SourceLicense', source.license),
    ...optionalTag('SourceGameId', game.sourceGameId),
    ...optionalTag('SourceGameURL', game.sourceUrl),
    ...optionalTag('Board', game.board),
    ...optionalTag('Termination', game.termination),
    MistboardReview: `${siteOrigin}/historical-xiangqi/game/${game.id}`,
  };
  return xiangqiPgnWriter(game.moves, xiangqiPgnStyle(game.moves))(tags, game.result);
}
