import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  type CurrentGame,
  collectCurrentGames,
  currentGameBoardPayload,
  hydrateCorrespondenceRooms,
} from '../current-games.js';
import { listWatchChannels } from '../watch-channels.js';
import { type HttpApiContext, requireMethod, writeJson } from './lib.js';

// GET /api/games/current — every game in progress right now (live and
// correspondence, every variant), for the /games page. Public, no persistence
// required (in-memory rooms list under dev:memory; the correspondence index is
// folded in when a database is attached).
//
// Query:
//   channel=<watch channel id>   only that channel's games (default: all)
//   known=<roomId>:<ply>,...     boards the client already shows at that ply;
//                                their payload is omitted while unchanged
//
// Board payloads ride along ONLY for 'open' games (see current-games.ts): a
// masked or sealed game is a card with players, clocks and move count, never a
// position.
export const CURRENT_GAMES_CHANNEL_ALL = 'all';

export async function tryHandle(
  ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  parsedUrl: URL,
): Promise<boolean> {
  if (pathname !== '/api/games/current') return false;
  if (!requireMethod(request, response, 'GET')) return true;
  const channels = listWatchChannels().filter((channel) => channel.gameSpecIds.length > 0);
  const channelParam = parsedUrl.searchParams.get('channel') ?? CURRENT_GAMES_CHANNEL_ALL;
  if (
    channelParam !== CURRENT_GAMES_CHANNEL_ALL &&
    !channels.some((channel) => channel.id === channelParam)
  ) {
    writeJson(response, 404, { error: 'unknown_watch_channel' });
    return true;
  }
  const now = Date.now();
  const deadlines = await hydrateCorrespondenceRooms(ctx);
  const all = collectCurrentGames(ctx, now, deadlines);
  const known = parseKnown(parsedUrl.searchParams.get('known'));
  const selected =
    channelParam === CURRENT_GAMES_CHANNEL_ALL
      ? all
      : all.filter((game) => game.channelId === channelParam);
  const games = await Promise.all(
    selected.map(async (game) => {
      const knownPly = known.get(game.roomId);
      if (knownPly !== undefined && knownPly >= game.ply) return game;
      const payload = await currentGameBoardPayload(game);
      return payload ? { ...game, payload } : game;
    }),
  );
  writeJson(response, 200, {
    channel: channelParam,
    channels: channels.map((channel) => ({
      family: channel.family,
      gameSpecIds: channel.gameSpecIds,
      id: channel.id,
      label: channel.label,
      count: all.filter((game) => game.channelId === channel.id).length,
    })),
    games,
    now: new Date(now).toISOString(),
    total: all.length,
  });
  return true;
}

function parseKnown(value: string | null): Map<string, number> {
  const known = new Map<string, number>();
  if (!value) return known;
  for (const entry of value.split(',')) {
    const separator = entry.lastIndexOf(':');
    if (separator <= 0) continue;
    const ply = Number(entry.slice(separator + 1));
    if (!Number.isInteger(ply) || ply < 0) continue;
    known.set(entry.slice(0, separator), ply);
  }
  return known;
}

export type { CurrentGame };
