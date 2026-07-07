import type { XiangqiBroadcastBoard } from '@mistboard/game';
import * as persistence from './persistence.js';

export type XiangqiBroadcastSourceSnapshot = {
  tour: unknown;
  rounds: unknown[];
  boards: unknown[];
};

export type XiangqiBroadcastSourceFetch = (
  url: string,
  init: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export type XiangqiBroadcastPollErrorKind =
  | 'source_http_error'
  | 'source_fetch_error'
  | 'source_timeout'
  | 'source_malformed';

export type XiangqiBroadcastPollResult =
  | {
      ok: true;
      sourceUrl: string;
      tourSlug: string;
      roundsImported: number;
      boardsSeen: number;
      boardsFailed: number;
      updates: persistence.XiangqiBroadcastBoardUpdateResult[];
    }
  | {
      ok: false;
      sourceUrl: string;
      kind: XiangqiBroadcastPollErrorKind;
      message: string;
    };

type SnapshotValidationResult =
  | { ok: true; snapshot: XiangqiBroadcastSourceSnapshot }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateSourceSnapshot(value: unknown): SnapshotValidationResult {
  if (!isRecord(value)) return { ok: false, message: 'source snapshot must be an object' };
  if (!Array.isArray(value.rounds)) return { ok: false, message: 'source.rounds must be an array' };
  if (!Array.isArray(value.boards)) return { ok: false, message: 'source.boards must be an array' };
  return {
    ok: true,
    snapshot: {
      tour: value.tour,
      rounds: value.rounds,
      boards: value.boards,
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function recordSourceError(input: {
  sourceUrl: string;
  kind: XiangqiBroadcastPollErrorKind;
  message: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await persistence.recordXiangqiBroadcastSyncLog({
    severity: 'error',
    kind: input.kind,
    message: input.message,
    payload: {
      sourceUrl: input.sourceUrl,
      ...input.payload,
    },
  });
}

async function fetchSourceJson(input: {
  sourceUrl: string;
  timeoutMs: number;
  fetchImpl: XiangqiBroadcastSourceFetch;
}): Promise<
  { ok: true; value: unknown } | { ok: false; kind: XiangqiBroadcastPollErrorKind; message: string }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  timeout.unref?.();

  try {
    const response = await input.fetchImpl(input.sourceUrl, { signal: controller.signal });
    if (!response.ok) {
      return {
        ok: false,
        kind: 'source_http_error',
        message: `source answered HTTP ${response.status}`,
      };
    }
    return { ok: true, value: await response.json() };
  } catch (error) {
    return {
      ok: false,
      kind: isAbortError(error) ? 'source_timeout' : 'source_fetch_error',
      message: isAbortError(error)
        ? `source timed out after ${input.timeoutMs}ms`
        : errorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function pollXiangqiBroadcastSourceOnce(input: {
  sourceUrl: string;
  allowCorrection?: boolean;
  timeoutMs?: number;
  fetchImpl?: XiangqiBroadcastSourceFetch;
}): Promise<XiangqiBroadcastPollResult> {
  const timeoutMs = input.timeoutMs ?? 5_000;
  const fetchImpl =
    input.fetchImpl ??
    ((url, init) =>
      fetch(url, init) as Promise<{
        ok: boolean;
        status: number;
        json(): Promise<unknown>;
      }>);

  const fetched = await fetchSourceJson({
    sourceUrl: input.sourceUrl,
    timeoutMs,
    fetchImpl,
  });
  if (!fetched.ok) {
    await recordSourceError({
      sourceUrl: input.sourceUrl,
      kind: fetched.kind,
      message: fetched.message,
      payload: { timeoutMs },
    });
    return { ok: false, sourceUrl: input.sourceUrl, kind: fetched.kind, message: fetched.message };
  }

  const parsed = validateSourceSnapshot(fetched.value);
  if (!parsed.ok) {
    await recordSourceError({
      sourceUrl: input.sourceUrl,
      kind: 'source_malformed',
      message: parsed.message,
      payload: { body: fetched.value },
    });
    return {
      ok: false,
      sourceUrl: input.sourceUrl,
      kind: 'source_malformed',
      message: parsed.message,
    };
  }

  let imported: persistence.XiangqiBroadcastImportResult;
  try {
    imported = await persistence.importXiangqiBroadcastPack({
      tour: parsed.snapshot.tour,
      rounds: parsed.snapshot.rounds,
      boards: [],
    });
  } catch (error) {
    const message = errorMessage(error);
    await recordSourceError({
      sourceUrl: input.sourceUrl,
      kind: 'source_malformed',
      message,
      payload: { phase: 'tour_round_import' },
    });
    return {
      ok: false,
      sourceUrl: input.sourceUrl,
      kind: 'source_malformed',
      message,
    };
  }

  const updates: persistence.XiangqiBroadcastBoardUpdateResult[] = [];
  for (const board of parsed.snapshot.boards as XiangqiBroadcastBoard[]) {
    updates.push(
      await persistence.applyXiangqiBroadcastBoardUpdate(board, {
        allowCorrection: input.allowCorrection,
        source: input.sourceUrl,
      }),
    );
  }

  return {
    ok: true,
    sourceUrl: input.sourceUrl,
    tourSlug: imported.tourSlug,
    roundsImported: imported.roundsImported,
    boardsSeen: parsed.snapshot.boards.length,
    boardsFailed: updates.filter((update) => !update.ok).length,
    updates,
  };
}

export async function pollXiangqiBroadcastSourceLoop(input: {
  sourceUrl: string;
  intervalMs: number;
  timeoutMs?: number;
  allowCorrection?: boolean;
  signal?: AbortSignal;
  wait?: (ms: number) => Promise<void>;
  onResult?: (result: XiangqiBroadcastPollResult) => void;
}): Promise<void> {
  const wait = input.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  while (!input.signal?.aborted) {
    const result = await pollXiangqiBroadcastSourceOnce({
      sourceUrl: input.sourceUrl,
      timeoutMs: input.timeoutMs,
      allowCorrection: input.allowCorrection,
    });
    input.onResult?.(result);
    if (input.signal?.aborted) break;
    await wait(input.intervalMs);
  }
}
