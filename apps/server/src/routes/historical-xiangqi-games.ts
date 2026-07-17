import type { IncomingMessage, ServerResponse } from 'node:http';
import * as persistence from './../persistence.js';
import { type HttpApiContext, requireMethod, requirePersistence, writeJson } from './lib.js';

type ParseResult =
  | { ok: true; filters: persistence.HistoricalXiangqiGameQueryFilters }
  | { ok: false; error: string };

const RESULTS = new Set<persistence.HistoricalXiangqiResult>(['1-0', '0-1', '1/2-1/2', '*']);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const RESERVED_SOURCES = new Set(['mistboard', 'broadcast']);

type UnifiedXiangqiSearchItem = {
  id: string;
  kind: 'mistboard' | 'historical' | 'broadcast';
  reviewUrl: string;
  sourceSlug: string;
  sourceName: string;
  sourceGameId: string | null;
  sourceUrl: string | null;
  eventName: string | null;
  eventNameEn: string | null;
  site: string | null;
  round: string | null;
  roundNameEn: string | null;
  board: string | null;
  playedOn: string | null;
  sortAt: string | null;
  redNameRaw: string | null;
  redNameEn: string | null;
  blackNameRaw: string | null;
  blackNameEn: string | null;
  result: persistence.HistoricalXiangqiResult;
  plyCount: number;
  moveFormat: string;
};

type UnifiedXiangqiSearchChunk = {
  games: UnifiedXiangqiSearchItem[];
  total: number;
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  parsedUrl: URL,
): Promise<boolean> {
  const detailMatch = pathname.match(/^\/api\/historical-xiangqi\/games\/([^/]+)$/);
  if (detailMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const game = await persistence.getHistoricalXiangqiGame(decodeURIComponent(detailMatch[1]!));
    if (game?.visibility !== 'public') {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    writeJson(response, 200, { game });
    return true;
  }

  if (pathname !== '/api/historical-xiangqi/games') return false;
  if (!requireMethod(request, response, 'GET')) return true;
  if (!requirePersistence(response)) return true;

  const parsed = parseHistoricalXiangqiGameQuery(parsedUrl.searchParams);
  if (!parsed.ok) {
    writeJson(response, 400, { error: parsed.error });
    return true;
  }

  const page = await queryUnifiedXiangqiGames(parsed.filters);
  writeJson(response, 200, {
    games: page.games,
    total: page.total,
    offset: parsed.filters.offset ?? 0,
    limit: parsed.filters.limit ?? 50,
  });
  return true;
}

async function queryUnifiedXiangqiGames(filters: persistence.HistoricalXiangqiGameQueryFilters) {
  const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
  const offset = Math.max(0, filters.offset ?? 0);
  const source = filters.sourceSlug;
  const fetchLimit = Math.min(200, offset + limit);
  const chunks: UnifiedXiangqiSearchChunk[] = [];

  if (!source || source === 'mistboard') {
    chunks.push(await queryMistboardXiangqiGames(filters, fetchLimit));
  }
  if (!source || source === 'broadcast') {
    chunks.push(await queryBroadcastXiangqiGames(filters, fetchLimit));
  }
  if (!source || !RESERVED_SOURCES.has(source)) {
    chunks.push(await queryHistoricalXiangqiGames(filters, fetchLimit));
  }

  const games = chunks
    .flatMap((chunk) => chunk.games)
    .sort((a, b) => compareSearchItems(a, b))
    .slice(offset, offset + limit);
  return { games, total: chunks.reduce((sum, chunk) => sum + chunk.total, 0) };
}

async function queryHistoricalXiangqiGames(
  filters: persistence.HistoricalXiangqiGameQueryFilters,
  limit: number,
): Promise<UnifiedXiangqiSearchChunk> {
  const page = await persistence.queryHistoricalXiangqiGames({
    ...filters,
    visibility: 'public',
    offset: 0,
    limit,
  });
  return {
    games: page.games.map((game) => ({
      id: game.id,
      kind: 'historical',
      reviewUrl: `/historical-xiangqi/game/${encodeURIComponent(game.id)}`,
      sourceSlug: game.sourceSlug,
      sourceName: game.sourceName,
      sourceGameId: game.sourceGameId ?? null,
      sourceUrl: game.sourceUrl ?? null,
      eventName: game.eventName ?? null,
      eventNameEn: null,
      site: game.site ?? null,
      round: game.round ?? null,
      roundNameEn: null,
      board: game.board ?? null,
      playedOn: game.playedOn ?? null,
      sortAt: game.playedOn ?? null,
      redNameRaw: game.redNameRaw ?? null,
      redNameEn: null,
      blackNameRaw: game.blackNameRaw ?? null,
      blackNameEn: null,
      result: game.result,
      plyCount: game.plyCount,
      moveFormat: game.moveFormat,
    })),
    total: page.total,
  };
}

async function queryMistboardXiangqiGames(
  filters: persistence.HistoricalXiangqiGameQueryFilters,
  limit: number,
): Promise<UnifiedXiangqiSearchChunk> {
  const result = mistboardResult(filters.result);
  if (filters.result && !result) return { games: [], total: 0 };
  const page = await persistence.queryGames({
    variant: 'xiangqi',
    ...(result ? { result } : {}),
    ...(typeof filters.plyMin === 'number' ? { plyMin: filters.plyMin } : {}),
    ...(typeof filters.plyMax === 'number' ? { plyMax: filters.plyMax } : {}),
    ...(filters.playedFrom ? { endedFrom: new Date(`${filters.playedFrom}T00:00:00.000Z`) } : {}),
    ...(filters.playedTo ? { endedTo: new Date(`${filters.playedTo}T00:00:00.000Z`) } : {}),
    offset: 0,
    limit,
  });
  const player = filters.player ? filters.player.toLocaleLowerCase() : null;
  const event = filters.event ? filters.event.toLocaleLowerCase() : null;
  const games: UnifiedXiangqiSearchItem[] = page.games
    .filter((game) => game.visibility === 'public')
    .filter((game) =>
      player
        ? [game.whiteName, game.blackName].some((name) =>
            name?.toLocaleLowerCase().includes(player),
          )
        : true,
    )
    .filter((game) => (event ? game.corpusId?.toLocaleLowerCase().includes(event) : true))
    .map((game) => ({
      id: game.roomId,
      kind: 'mistboard',
      reviewUrl: `/xiangqi/game/${encodeURIComponent(game.roomId)}`,
      sourceSlug: 'mistboard',
      sourceName: 'Mistboard',
      sourceGameId: game.roomId,
      sourceUrl: null,
      eventName: game.corpusId,
      eventNameEn: null,
      site: null,
      round: null,
      roundNameEn: null,
      board: null,
      playedOn: game.endedAt.toISOString().slice(0, 10),
      sortAt: game.endedAt.toISOString(),
      redNameRaw: game.whiteName,
      redNameEn: null,
      blackNameRaw: game.blackName,
      blackNameEn: null,
      result: historicalResult(game.result),
      plyCount: game.plyCount,
      moveFormat: 'mistboard',
    }));
  return { games, total: games.length };
}

async function queryBroadcastXiangqiGames(
  filters: persistence.HistoricalXiangqiGameQueryFilters,
  limit: number,
): Promise<UnifiedXiangqiSearchChunk> {
  if (filters.result === '*') return { games: [], total: 0 };
  const boards = await persistence.queryCompletedXiangqiBroadcastBoards({
    player: filters.player,
    event: filters.event,
    result: filters.result,
    playedFrom: filters.playedFrom,
    playedTo: filters.playedTo,
    plyMin: filters.plyMin,
    plyMax: filters.plyMax,
    limit,
  });
  const games: UnifiedXiangqiSearchItem[] = boards.map((board) => ({
    id: board.id,
    kind: 'broadcast',
    reviewUrl: `/broadcast/xiangqi/board/${encodeURIComponent(board.id)}`,
    sourceSlug: 'broadcast',
    sourceName: 'Broadcast',
    sourceGameId: board.sourceBoardId,
    sourceUrl: board.sourceUrl,
    eventName: board.tourName,
    eventNameEn: board.tourNameEn,
    site: null,
    round: board.roundName,
    roundNameEn: board.roundNameEn,
    board: String(board.boardNumber),
    playedOn: board.playedOn,
    sortAt: board.playedOn ?? board.updatedAt.toISOString(),
    redNameRaw: board.redName,
    redNameEn: board.redNameEn,
    blackNameRaw: board.blackName,
    blackNameEn: board.blackNameEn,
    result: board.result,
    plyCount: board.plyCount,
    moveFormat: 'broadcast',
  }));
  return { games, total: games.length };
}

function compareSearchItems(a: UnifiedXiangqiSearchItem, b: UnifiedXiangqiSearchItem): number {
  const left = a.sortAt ?? '';
  const right = b.sortAt ?? '';
  if (left !== right) return right.localeCompare(left);
  return b.id.localeCompare(a.id);
}

function mistboardResult(
  result: persistence.HistoricalXiangqiResult | undefined,
): persistence.GameResult | null {
  if (!result) return null;
  if (result === '1-0') return 'red-wins';
  if (result === '0-1') return 'black-wins';
  if (result === '1/2-1/2') return 'draw';
  return null;
}

function historicalResult(result: string): persistence.HistoricalXiangqiResult {
  if (result === 'red-wins' || result === 'white-wins') return '1-0';
  if (result === 'black-wins') return '0-1';
  if (result === 'draw') return '1/2-1/2';
  return '*';
}

export function parseHistoricalXiangqiGameQuery(search: URLSearchParams): ParseResult {
  const filters: persistence.HistoricalXiangqiGameQueryFilters = {};
  setTrimmed(filters, 'sourceSlug', search.get('source'));
  setTrimmed(filters, 'player', search.get('player'));
  setTrimmed(filters, 'event', search.get('event'));

  const result = search.get('result');
  if (result) {
    if (!RESULTS.has(result as persistence.HistoricalXiangqiResult)) {
      return { ok: false, error: 'invalid_result' };
    }
    filters.result = result as persistence.HistoricalXiangqiResult;
  }

  const from = search.get('from');
  if (from) {
    if (!isDateOnly(from)) return { ok: false, error: 'invalid_from' };
    filters.playedFrom = from;
  }

  const to = search.get('to');
  if (to) {
    if (!isDateOnly(to)) return { ok: false, error: 'invalid_to' };
    filters.playedTo = nextUtcDate(to);
  }

  const plyMin = parseBoundedInt(search.get('plyMin'), 0, 1000);
  if (!plyMin.ok) return { ok: false, error: 'invalid_ply_min' };
  if (plyMin.value !== null) filters.plyMin = plyMin.value;

  const plyMax = parseBoundedInt(search.get('plyMax'), 0, 1000);
  if (!plyMax.ok) return { ok: false, error: 'invalid_ply_max' };
  if (plyMax.value !== null) filters.plyMax = plyMax.value;

  const offset = parseBoundedInt(search.get('offset'), 0, 1_000_000);
  if (!offset.ok) return { ok: false, error: 'invalid_offset' };
  if (offset.value !== null) filters.offset = offset.value;

  const limit = parseBoundedInt(search.get('limit'), 1, 200);
  if (!limit.ok) return { ok: false, error: 'invalid_limit' };
  if (limit.value !== null) filters.limit = limit.value;

  return { ok: true, filters };
}

function setTrimmed<T extends Record<string, unknown>, K extends keyof T>(
  target: T,
  key: K,
  value: string | null,
): void {
  const trimmed = value?.trim();
  if (trimmed) target[key] = trimmed as T[K];
}

function isDateOnly(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function nextUtcDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function parseBoundedInt(
  value: string | null,
  min: number,
  max: number,
): { ok: true; value: number | null } | { ok: false } {
  if (value === null || value.trim() === '') return { ok: true, value: null };
  if (!/^\d+$/.test(value)) return { ok: false };
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return { ok: false };
  return { ok: true, value: parsed };
}
