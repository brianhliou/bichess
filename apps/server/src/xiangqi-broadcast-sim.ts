import type {
  XiangqiBroadcastBoard,
  XiangqiBroadcastTape,
  XiangqiBroadcastTapeEvent,
} from '@mistboard/game';
import { validateXiangqiBroadcastBoard, validateXiangqiBroadcastTape } from '@mistboard/game';
import type { XiangqiBroadcastFixturePack } from './import-xiangqi-broadcast.js';
import * as persistence from './persistence.js';

export type XiangqiBroadcastTapeFrame = {
  atMs: number;
  event: XiangqiBroadcastTapeEvent;
  board: XiangqiBroadcastBoard;
};

export type XiangqiBroadcastSourceMode = 'clean' | 'stale' | 'malformed' | 'error' | 'timeout';

export type XiangqiBroadcastSourceResponse =
  | { status: 200; body: { tour: unknown; rounds: unknown[]; boards: XiangqiBroadcastBoard[] } }
  | { status: 500; body: { error: string } }
  | { status: 200; body: { malformed: true; boards: unknown } };

export type XiangqiBroadcastTapeRunResult = {
  framesApplied: number;
  updates: persistence.XiangqiBroadcastBoardUpdateResult[];
};

function cloneBoard(board: XiangqiBroadcastBoard): XiangqiBroadcastBoard {
  return JSON.parse(JSON.stringify(board)) as XiangqiBroadcastBoard;
}

function emptyLiveBoard(board: XiangqiBroadcastBoard): XiangqiBroadcastBoard {
  return {
    ...cloneBoard(board),
    status: 'scheduled',
    result: '*',
    moves: [],
  };
}

function fixtureBoards(pack: XiangqiBroadcastFixturePack): Map<string, XiangqiBroadcastBoard> {
  const boards = new Map<string, XiangqiBroadcastBoard>();
  for (const rawBoard of pack.boards) {
    const parsed = validateXiangqiBroadcastBoard(rawBoard);
    if (!parsed.ok) throw new Error(`invalid fixture board: ${parsed.errors.join('; ')}`);
    boards.set(parsed.value.id, emptyLiveBoard(parsed.value));
  }
  return boards;
}

function validatedTape(rawTape: unknown): XiangqiBroadcastTape {
  const parsed = validateXiangqiBroadcastTape(rawTape);
  if (!parsed.ok) throw new Error(`invalid broadcast tape: ${parsed.errors.join('; ')}`);
  return parsed.value;
}

export function applyXiangqiBroadcastTapeEvent(
  current: XiangqiBroadcastBoard,
  event: XiangqiBroadcastTapeEvent,
): XiangqiBroadcastBoard {
  const moves = event.moves ?? [...current.moves, ...(event.append ?? [])];
  const result = event.result ?? current.result;
  const status = event.status ?? (result !== '*' ? 'complete' : current.status);
  return {
    ...cloneBoard(current),
    moves: [...moves],
    status,
    result,
  };
}

export function buildXiangqiBroadcastTapeFrames(
  pack: XiangqiBroadcastFixturePack,
  rawTape: unknown,
): XiangqiBroadcastTapeFrame[] {
  const tape = validatedTape(rawTape);
  const boards = fixtureBoards(pack);
  const frames: XiangqiBroadcastTapeFrame[] = [];

  for (const event of tape.events) {
    const current = boards.get(event.boardId);
    if (!current) throw new Error(`tape references unknown board ${event.boardId}`);
    const next = applyXiangqiBroadcastTapeEvent(current, event);
    boards.set(event.boardId, next);
    frames.push({ atMs: event.atMs, event, board: cloneBoard(next) });
  }

  return frames;
}

export function xiangqiBroadcastBoardsAt(
  pack: XiangqiBroadcastFixturePack,
  rawTape: unknown,
  atMs: number,
): XiangqiBroadcastBoard[] {
  const boards = fixtureBoards(pack);
  for (const frame of buildXiangqiBroadcastTapeFrames(pack, rawTape)) {
    if (frame.atMs > atMs) break;
    boards.set(frame.board.id, frame.board);
  }
  return [...boards.values()].sort(
    (a, b) => a.boardNumber - b.boardNumber || a.id.localeCompare(b.id),
  );
}

export function xiangqiBroadcastSourceResponse(
  pack: XiangqiBroadcastFixturePack,
  rawTape: unknown,
  atMs: number,
  mode: XiangqiBroadcastSourceMode = 'clean',
): XiangqiBroadcastSourceResponse {
  if (mode === 'error') return { status: 500, body: { error: 'fixture_source_error' } };
  if (mode === 'malformed')
    return { status: 200, body: { malformed: true, boards: { bad: true } } };
  const effectiveAtMs = mode === 'stale' ? Math.max(0, atMs - 5000) : atMs;
  return {
    status: 200,
    body: {
      tour: pack.tour,
      rounds: pack.rounds,
      boards: xiangqiBroadcastBoardsAt(pack, rawTape, effectiveAtMs),
    },
  };
}

export async function runXiangqiBroadcastTape(input: {
  pack: XiangqiBroadcastFixturePack;
  tape: unknown;
  allowCorrection?: boolean;
  wait?: (ms: number) => Promise<void>;
  speed?: number | 'instant';
}): Promise<XiangqiBroadcastTapeRunResult> {
  await persistence.importXiangqiBroadcastPack({
    tour: input.pack.tour,
    rounds: input.pack.rounds,
    boards: [],
  });

  const frames = buildXiangqiBroadcastTapeFrames(input.pack, input.tape);
  const updates: persistence.XiangqiBroadcastBoardUpdateResult[] = [];
  let previousAtMs = 0;
  for (const frame of frames) {
    if (input.speed !== 'instant' && input.speed !== undefined) {
      const waitMs = Math.max(0, frame.atMs - previousAtMs) / input.speed;
      if (waitMs > 0) await input.wait?.(waitMs);
    }
    previousAtMs = frame.atMs;
    updates.push(
      await persistence.applyXiangqiBroadcastBoardUpdate(frame.board, {
        allowCorrection: input.allowCorrection,
        source: 'fixture-tape',
      }),
    );
  }

  return { framesApplied: frames.length, updates };
}
