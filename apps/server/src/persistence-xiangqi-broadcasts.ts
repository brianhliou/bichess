import type {
  XiangqiBroadcastBoard,
  XiangqiBroadcastPlayerTag,
  XiangqiBroadcastResult,
  XiangqiBroadcastRound,
  XiangqiBroadcastTour,
  XiangqiGameStatus,
  XiangqiMove,
} from '@mistboard/game';
import {
  replayXiangqiBroadcastBoard,
  validateXiangqiBroadcastBoard,
  validateXiangqiBroadcastRound,
  validateXiangqiBroadcastTour,
} from '@mistboard/game';
import type pg from 'pg';
import { getPool, withTransaction } from './persistence-db.js';

export type StoredXiangqiBroadcastTour = XiangqiBroadcastTour & {
  createdAt: Date;
  updatedAt: Date;
};

export type StoredXiangqiBroadcastRound = XiangqiBroadcastRound & {
  createdAt: Date;
  updatedAt: Date;
};

export type StoredXiangqiBroadcastBoard = XiangqiBroadcastBoard & {
  plyCount: number;
  finalStatus: XiangqiGameStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type XiangqiBroadcastSyncLogSeverity = 'info' | 'warning' | 'error';

export type XiangqiBroadcastSyncLog = {
  id: number;
  tourSlug: string | null;
  roundId: string | null;
  boardId: string | null;
  sourceBoardId: string | null;
  severity: XiangqiBroadcastSyncLogSeverity;
  kind: string;
  message: string;
  payload: Record<string, unknown>;
  createdAt: Date;
};

export type XiangqiBroadcastImportError = {
  boardId?: string;
  sourceBoardId?: string;
  kind: string;
  message: string;
};

export type XiangqiBroadcastImportResult = {
  tourSlug: string;
  roundsImported: number;
  boardsImported: number;
  boardsSkipped: number;
  errors: XiangqiBroadcastImportError[];
};

export type XiangqiBroadcastBoardUpdateStatus =
  | 'created'
  | 'unchanged'
  | 'extended'
  | 'updated'
  | 'corrected';

export type XiangqiBroadcastBoardUpdateResult =
  | {
      ok: true;
      boardId: string;
      status: XiangqiBroadcastBoardUpdateStatus;
      plyCount: number;
    }
  | {
      ok: false;
      boardId?: string;
      sourceBoardId?: string;
      kind: string;
      message: string;
    };

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

type TourRow = {
  slug: string;
  name: string;
  location: string | null;
  source_url: string | null;
  starts_at: Date | null;
  ends_at: Date | null;
  payload: XiangqiBroadcastTour;
  created_at: Date;
  updated_at: Date;
};

type RoundRow = {
  id: string;
  tour_slug: string;
  name: string;
  starts_at: Date | null;
  source_url: string | null;
  payload: XiangqiBroadcastRound;
  created_at: Date;
  updated_at: Date;
};

type BoardRow = {
  id: string;
  tour_slug: string;
  round_id: string;
  source_board_id: string;
  board_number: number;
  red: XiangqiBroadcastPlayerTag;
  black: XiangqiBroadcastPlayerTag;
  status: XiangqiBroadcastBoard['status'];
  result: XiangqiBroadcastResult;
  moves: XiangqiMove[];
  source_url: string | null;
  ply_count: number;
  final_status: XiangqiGameStatus;
  payload: XiangqiBroadcastBoard;
  created_at: Date;
  updated_at: Date;
};

type SyncLogRow = {
  id: string;
  tour_slug: string | null;
  round_id: string | null;
  board_id: string | null;
  source_board_id: string | null;
  severity: XiangqiBroadcastSyncLogSeverity;
  kind: string;
  message: string;
  payload: Record<string, unknown>;
  created_at: Date;
};

function optionalDate(value: string | undefined): string | null {
  return value ?? null;
}

function optionalString(value: string | undefined): string | null {
  return value ?? null;
}

function tourFromRow(row: TourRow): StoredXiangqiBroadcastTour {
  return {
    ...row.payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function roundFromRow(row: RoundRow): StoredXiangqiBroadcastRound {
  return {
    ...row.payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function boardFromRow(row: BoardRow): StoredXiangqiBroadcastBoard {
  return {
    ...row.payload,
    plyCount: row.ply_count,
    finalStatus: row.final_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getBoardById(
  client: Queryable,
  boardId: string,
): Promise<StoredXiangqiBroadcastBoard | null> {
  const { rows } = await client.query<BoardRow>(
    `SELECT * FROM xiangqi_broadcast_boards WHERE id = $1`,
    [boardId],
  );
  return rows[0] ? boardFromRow(rows[0]) : null;
}

function syncLogFromRow(row: SyncLogRow): XiangqiBroadcastSyncLog {
  return {
    id: Number(row.id),
    tourSlug: row.tour_slug,
    roundId: row.round_id,
    boardId: row.board_id,
    sourceBoardId: row.source_board_id,
    severity: row.severity,
    kind: row.kind,
    message: row.message,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

async function upsertTour(client: Queryable, tour: XiangqiBroadcastTour): Promise<void> {
  await client.query(
    `INSERT INTO xiangqi_broadcast_tours
       (slug, name, location, source_url, starts_at, ends_at, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       location = EXCLUDED.location,
       source_url = EXCLUDED.source_url,
       starts_at = EXCLUDED.starts_at,
       ends_at = EXCLUDED.ends_at,
       payload = EXCLUDED.payload,
       updated_at = now()`,
    [
      tour.slug,
      tour.name,
      optionalString(tour.location),
      optionalString(tour.sourceUrl),
      optionalDate(tour.startsAt),
      optionalDate(tour.endsAt),
      JSON.stringify(tour),
    ],
  );
}

async function upsertRound(client: Queryable, round: XiangqiBroadcastRound): Promise<void> {
  await client.query(
    `INSERT INTO xiangqi_broadcast_rounds
       (id, tour_slug, name, starts_at, source_url, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       tour_slug = EXCLUDED.tour_slug,
       name = EXCLUDED.name,
       starts_at = EXCLUDED.starts_at,
       source_url = EXCLUDED.source_url,
       payload = EXCLUDED.payload,
       updated_at = now()`,
    [
      round.id,
      round.tourSlug,
      round.name,
      optionalDate(round.startsAt),
      optionalString(round.sourceUrl),
      JSON.stringify(round),
    ],
  );
}

async function upsertBoard(
  client: Queryable,
  board: XiangqiBroadcastBoard,
  plyCount: number,
  finalStatus: XiangqiGameStatus,
): Promise<void> {
  await client.query(
    `INSERT INTO xiangqi_broadcast_boards
       (id, tour_slug, round_id, source_board_id, board_number, red, black, status, result,
        moves, source_url, ply_count, final_status, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10::jsonb,
             $11, $12, $13::jsonb, $14::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       tour_slug = EXCLUDED.tour_slug,
       round_id = EXCLUDED.round_id,
       source_board_id = EXCLUDED.source_board_id,
       board_number = EXCLUDED.board_number,
       red = EXCLUDED.red,
       black = EXCLUDED.black,
       status = EXCLUDED.status,
       result = EXCLUDED.result,
       moves = EXCLUDED.moves,
       source_url = EXCLUDED.source_url,
       ply_count = EXCLUDED.ply_count,
       final_status = EXCLUDED.final_status,
       payload = EXCLUDED.payload,
       updated_at = now()`,
    [
      board.id,
      board.tourSlug,
      board.roundId,
      board.sourceBoardId,
      board.boardNumber,
      JSON.stringify(board.red),
      JSON.stringify(board.black),
      board.status,
      board.result,
      JSON.stringify(board.moves),
      optionalString(board.sourceUrl),
      plyCount,
      JSON.stringify(finalStatus),
      JSON.stringify(board),
    ],
  );
}

async function appendSyncLog(
  client: Queryable,
  input: {
    tourSlug?: string;
    roundId?: string;
    boardId?: string;
    sourceBoardId?: string;
    severity: XiangqiBroadcastSyncLogSeverity;
    kind: string;
    message: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO xiangqi_broadcast_sync_logs
       (tour_slug, round_id, board_id, source_board_id, severity, kind, message, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      input.tourSlug ?? null,
      input.roundId ?? null,
      input.boardId ?? null,
      input.sourceBoardId ?? null,
      input.severity,
      input.kind,
      input.message,
      JSON.stringify(input.payload ?? {}),
    ],
  );
}

export async function recordXiangqiBroadcastSyncLog(input: {
  tourSlug?: string;
  roundId?: string;
  boardId?: string;
  sourceBoardId?: string;
  severity: XiangqiBroadcastSyncLogSeverity;
  kind: string;
  message: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await withTransaction(async (client) => {
    await appendSyncLog(client, input);
  });
}

function rawString(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  return typeof raw[key] === 'string' ? raw[key] : undefined;
}

async function skipBoard(
  client: Queryable,
  rawBoard: unknown,
  kind: string,
  message: string,
  payload: Record<string, unknown>,
): Promise<XiangqiBroadcastImportError> {
  const boardId = rawString(rawBoard, 'id');
  const sourceBoardId = rawString(rawBoard, 'sourceBoardId');
  await appendSyncLog(client, {
    tourSlug: rawString(rawBoard, 'tourSlug'),
    roundId: rawString(rawBoard, 'roundId'),
    boardId,
    sourceBoardId,
    severity: 'error',
    kind,
    message,
    payload,
  });
  return {
    ...(boardId ? { boardId } : {}),
    ...(sourceBoardId ? { sourceBoardId } : {}),
    kind,
    message,
  };
}

function rejectedBoardUpdate(
  error: XiangqiBroadcastImportError,
): Extract<XiangqiBroadcastBoardUpdateResult, { ok: false }> {
  return { ok: false, ...error };
}

function movesEqual(a: readonly XiangqiMove[], b: readonly XiangqiMove[]): boolean {
  return (
    a.length === b.length &&
    a.every((move, index) => move.from === b[index]?.from && move.to === b[index]?.to)
  );
}

function isMovePrefix(prefix: readonly XiangqiMove[], value: readonly XiangqiMove[]): boolean {
  if (prefix.length > value.length) return false;
  return movesEqual(prefix, value.slice(0, prefix.length));
}

function boardTagsEqual(
  a: Pick<XiangqiBroadcastBoard, 'red' | 'black' | 'status' | 'result' | 'sourceUrl'>,
  b: Pick<XiangqiBroadcastBoard, 'red' | 'black' | 'status' | 'result' | 'sourceUrl'>,
): boolean {
  return (
    JSON.stringify(a.red) === JSON.stringify(b.red) &&
    JSON.stringify(a.black) === JSON.stringify(b.black) &&
    a.status === b.status &&
    a.result === b.result &&
    a.sourceUrl === b.sourceUrl
  );
}

async function roundBelongsToTour(
  client: Queryable,
  roundId: string,
  tourSlug: string,
): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM xiangqi_broadcast_rounds WHERE id = $1 AND tour_slug = $2`,
    [roundId, tourSlug],
  );
  return (rowCount ?? 0) > 0;
}

export async function applyXiangqiBroadcastBoardUpdate(
  rawBoard: unknown,
  options: { allowCorrection?: boolean; source?: string } = {},
): Promise<XiangqiBroadcastBoardUpdateResult> {
  return await withTransaction(async (client) => {
    const boardResult = validateXiangqiBroadcastBoard(rawBoard);
    if (!boardResult.ok) {
      return rejectedBoardUpdate(
        await skipBoard(client, rawBoard, 'schema_validation_failed', boardResult.errors[0]!, {
          errors: boardResult.errors,
          source: options.source,
        }),
      );
    }

    const board = boardResult.value;
    if (!(await roundBelongsToTour(client, board.roundId, board.tourSlug))) {
      return rejectedBoardUpdate(
        await skipBoard(
          client,
          board,
          'reference_validation_failed',
          `unknown round ${board.roundId} for tour ${board.tourSlug}`,
          { source: options.source },
        ),
      );
    }

    const replay = replayXiangqiBroadcastBoard(board);
    if (!replay.ok) {
      return rejectedBoardUpdate(
        await skipBoard(client, board, 'illegal_move', replay.reason, {
          ply: replay.ply,
          move: replay.move,
          source: options.source,
        }),
      );
    }

    const existing = await getBoardById(client, board.id);
    if (!existing) {
      await upsertBoard(client, board, replay.plies, replay.finalStatus);
      return { ok: true, boardId: board.id, status: 'created', plyCount: replay.plies };
    }

    if (movesEqual(existing.moves, board.moves)) {
      if (boardTagsEqual(existing, board)) {
        return { ok: true, boardId: board.id, status: 'unchanged', plyCount: existing.plyCount };
      }
      await upsertBoard(client, board, replay.plies, replay.finalStatus);
      return { ok: true, boardId: board.id, status: 'updated', plyCount: replay.plies };
    }

    if (isMovePrefix(existing.moves, board.moves)) {
      await upsertBoard(client, board, replay.plies, replay.finalStatus);
      return { ok: true, boardId: board.id, status: 'extended', plyCount: replay.plies };
    }

    if (isMovePrefix(board.moves, existing.moves)) {
      return { ok: true, boardId: board.id, status: 'unchanged', plyCount: existing.plyCount };
    }

    if (options.allowCorrection) {
      await upsertBoard(client, board, replay.plies, replay.finalStatus);
      await appendSyncLog(client, {
        tourSlug: board.tourSlug,
        roundId: board.roundId,
        boardId: board.id,
        sourceBoardId: board.sourceBoardId,
        severity: 'warning',
        kind: 'corrected',
        message: 'accepted explicit correction for non-prefix board update',
        payload: {
          previousPlyCount: existing.plyCount,
          nextPlyCount: replay.plies,
          source: options.source,
        },
      });
      return { ok: true, boardId: board.id, status: 'corrected', plyCount: replay.plies };
    }

    return rejectedBoardUpdate(
      await skipBoard(
        client,
        board,
        'incompatible_update',
        'incoming move list is neither a duplicate, stale prefix, nor legal extension',
        {
          previousPlyCount: existing.plyCount,
          nextPlyCount: board.moves.length,
          source: options.source,
        },
      ),
    );
  });
}

export async function importXiangqiBroadcastPack(input: {
  tour: unknown;
  rounds: unknown[];
  boards: unknown[];
}): Promise<XiangqiBroadcastImportResult> {
  const tourResult = validateXiangqiBroadcastTour(input.tour);
  if (!tourResult.ok) throw new Error(`invalid broadcast tour: ${tourResult.errors.join('; ')}`);

  const rounds: XiangqiBroadcastRound[] = [];
  for (const [index, rawRound] of input.rounds.entries()) {
    const result = validateXiangqiBroadcastRound(rawRound);
    if (!result.ok) {
      throw new Error(`invalid broadcast round ${index + 1}: ${result.errors.join('; ')}`);
    }
    if (result.value.tourSlug !== tourResult.value.slug) {
      throw new Error(`round ${result.value.id} belongs to ${result.value.tourSlug}`);
    }
    rounds.push(result.value);
  }
  const roundIds = new Set(rounds.map((round) => round.id));

  return await withTransaction(async (client) => {
    await upsertTour(client, tourResult.value);
    for (const round of rounds) await upsertRound(client, round);

    let boardsImported = 0;
    let boardsSkipped = 0;
    const errors: XiangqiBroadcastImportError[] = [];

    for (const rawBoard of input.boards) {
      const boardResult = validateXiangqiBroadcastBoard(rawBoard);
      if (!boardResult.ok) {
        boardsSkipped += 1;
        errors.push(
          await skipBoard(client, rawBoard, 'schema_validation_failed', boardResult.errors[0]!, {
            errors: boardResult.errors,
          }),
        );
        continue;
      }

      const board = boardResult.value;
      if (board.tourSlug !== tourResult.value.slug || !roundIds.has(board.roundId)) {
        boardsSkipped += 1;
        const message =
          board.tourSlug !== tourResult.value.slug
            ? `board belongs to ${board.tourSlug}, expected ${tourResult.value.slug}`
            : `unknown round ${board.roundId}`;
        errors.push(
          await skipBoard(client, board, 'reference_validation_failed', message, {
            tourSlug: tourResult.value.slug,
            roundIds: [...roundIds],
          }),
        );
        continue;
      }

      const replay = replayXiangqiBroadcastBoard(board);
      if (!replay.ok) {
        boardsSkipped += 1;
        errors.push(
          await skipBoard(client, board, 'illegal_move', replay.reason, {
            ply: replay.ply,
            move: replay.move,
          }),
        );
        continue;
      }

      await upsertBoard(client, board, replay.plies, replay.finalStatus);
      boardsImported += 1;
    }

    return {
      tourSlug: tourResult.value.slug,
      roundsImported: rounds.length,
      boardsImported,
      boardsSkipped,
      errors,
    };
  });
}

export async function getXiangqiBroadcastTour(
  slug: string,
): Promise<StoredXiangqiBroadcastTour | null> {
  const { rows } = await getPool().query<TourRow>(
    `SELECT * FROM xiangqi_broadcast_tours WHERE slug = $1`,
    [slug],
  );
  return rows[0] ? tourFromRow(rows[0]) : null;
}

export async function listXiangqiBroadcastTours(): Promise<StoredXiangqiBroadcastTour[]> {
  const { rows } = await getPool().query<TourRow>(
    `SELECT * FROM xiangqi_broadcast_tours ORDER BY starts_at DESC NULLS LAST, slug`,
  );
  return rows.map(tourFromRow);
}

export async function listXiangqiBroadcastRounds(
  tourSlug: string,
): Promise<StoredXiangqiBroadcastRound[]> {
  const { rows } = await getPool().query<RoundRow>(
    `SELECT * FROM xiangqi_broadcast_rounds
      WHERE tour_slug = $1
      ORDER BY starts_at NULLS LAST, id`,
    [tourSlug],
  );
  return rows.map(roundFromRow);
}

export async function listXiangqiBroadcastBoards(
  roundId: string,
): Promise<StoredXiangqiBroadcastBoard[]> {
  const { rows } = await getPool().query<BoardRow>(
    `SELECT * FROM xiangqi_broadcast_boards
      WHERE round_id = $1
      ORDER BY board_number, id`,
    [roundId],
  );
  return rows.map(boardFromRow);
}

export async function getXiangqiBroadcastBoard(
  boardId: string,
): Promise<StoredXiangqiBroadcastBoard | null> {
  const { rows } = await getPool().query<BoardRow>(
    `SELECT * FROM xiangqi_broadcast_boards WHERE id = $1`,
    [boardId],
  );
  return rows[0] ? boardFromRow(rows[0]) : null;
}

export async function listXiangqiBroadcastSyncLogs(input: {
  tourSlug?: string;
  boardId?: string;
}): Promise<XiangqiBroadcastSyncLog[]> {
  const clauses: string[] = [];
  const values: string[] = [];
  if (input.tourSlug) {
    values.push(input.tourSlug);
    clauses.push(`tour_slug = $${values.length}`);
  }
  if (input.boardId) {
    values.push(input.boardId);
    clauses.push(`board_id = $${values.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await getPool().query<SyncLogRow>(
    `SELECT * FROM xiangqi_broadcast_sync_logs ${where} ORDER BY created_at DESC, id DESC`,
    values,
  );
  return rows.map(syncLogFromRow);
}
