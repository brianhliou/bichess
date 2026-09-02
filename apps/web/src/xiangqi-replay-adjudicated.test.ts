import {
  ARBITER_ADJUDICATED_DRAWS,
  applyMove,
  createInitialXiangqiState,
  parseStandardXiangqiFen,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { articles } from './articles-data.js';

// A tournament record runs straight past a repetition. Xiangqi's repetition and
// progress-clock draws are claimed by a player or called by an arbiter, never
// automatic, which is exactly what ARBITER_ADJUDICATED_DRAWS exists to say.
//
// The replay widget was the one record-replaying surface that did not resume
// past them. In the 2015 world final both sides shuffled a horse and a cannon
// for eight plies; the kernel called the threefold at ply 200 and every position
// after that froze, so half the engine lines pointed into a position that could
// not move. The notation under the board stayed correct the whole time, because
// formatXiangqiMoves already resumes, which is what made it confusing.
//
// This replays every article board the way the widget does and requires the
// state array to reach the final ply.
const conv = (square: string) => `${square[0]}${Number(square[1]) + 1}`;
const toMove = (token: string) =>
  ({ from: conv(token.slice(0, 2)), to: conv(token.slice(2, 4)) }) as never;

type Board = {
  spec: {
    iccs: string;
    startFen?: string;
    annotations?: { byPly: Record<string, { line?: string }> };
  };
};

const boards: Array<{ slug: string; index: number; board: Board }> = articles.flatMap((article) =>
  (article.sections ?? [])
    .flatMap((section) => section.blocks ?? [])
    .flatMap((block) => (block?.kind === 'xq-replay' ? [block as unknown as Board] : []))
    .map((board, index) => ({ slug: article.slug, index, board })),
);

/** The widget's own loop, including the resume.
 *
 *  `startFen` has to be honoured here or this check silently stops testing any
 *  board that does not begin from the opening. It replayed every spec from the
 *  initial position until 2026-09-01, when the puzzle-mining article added six
 *  mid-game boards and all six reported "stopped after 0 plies": the moves were
 *  fine, the starting position was wrong. The widget parses startFen at
 *  xiangqi-replay.ts and takes its first mover from the FEN, so this does too,
 *  including the turn parity the adjudicated-draw resume depends on. */
function statesFor(spec: { iccs: string; startFen?: string }) {
  const moves = spec.iccs.trim().split(/\s+/).filter(Boolean);
  const parsed = spec.startFen ? parseStandardXiangqiFen(spec.startFen, 'test') : null;
  const start = parsed?.ok === true ? parsed.state : createInitialXiangqiState('test');
  const firstMover = start.status.type === 'playing' ? start.status.turn : 'red';
  const states = [start];
  moves.forEach((token, index) => {
    let state = states[states.length - 1] as { status: { type: string; reason?: string } };
    if (
      state.status.type === 'finished' &&
      ARBITER_ADJUDICATED_DRAWS.has(state.status.reason as never)
    ) {
      const mover = index % 2 === 0 ? firstMover : firstMover === 'red' ? 'black' : 'red';
      state = { ...state, status: { type: 'playing', turn: mover } } as never;
    }
    states.push(applyMove(state as never, toMove(token)));
  });
  return { moves, states };
}

describe('replaying a record past an adjudicated draw', () => {
  it('reaches the last ply of every board in every article', () => {
    const truncated: string[] = [];
    for (const { slug, index, board } of boards) {
      const { moves, states } = statesFor(board.spec);
      // A frozen game repeats one state, so the tail is identical objects.
      const advanced = states.filter((s, i) => i === 0 || s !== states[i - 1]).length - 1;
      if (advanced < moves.length) {
        truncated.push(
          `${slug} board ${index}: stopped after ${advanced} of ${moves.length} plies`,
        );
      }
    }
    expect(truncated, `boards that stop early:\n${truncated.join('\n')}`).toEqual([]);
  });

  it('keeps every engine line, not just its first move', () => {
    const short: string[] = [];
    for (const { slug, index, board } of boards) {
      const { states } = statesFor(board.spec);
      for (const [plyKey, annotation] of Object.entries(board.spec.annotations?.byPly ?? {})) {
        if (!annotation.line) continue;
        const ply = Number(plyKey);
        const line = annotation.line.trim().split(/\s+/).filter(Boolean);
        let state = states[ply - 1] as { status: { type: string; reason?: string } };
        let played = 0;
        for (const [step, token] of line.entries()) {
          if (
            state.status.type === 'finished' &&
            ARBITER_ADJUDICATED_DRAWS.has(state.status.reason as never)
          ) {
            const turn = (ply - 1 + step) % 2 === 0 ? 'red' : 'black';
            state = { ...state, status: { type: 'playing', turn } } as never;
          }
          const next = applyMove(state as never, toMove(token));
          if (next === state) break;
          state = next as never;
          played += 1;
        }
        if (played < line.length) {
          short.push(`${slug} board ${index} ply ${ply}: ${played} of ${line.length} moves replay`);
        }
      }
    }
    expect(short, `engine lines cut short:\n${short.slice(0, 10).join('\n')}`).toEqual([]);
  });

  it('has a board that actually needs the resume, so this is not vacuous', () => {
    // Without at least one repetition-terminated record in the corpus, both
    // assertions above pass for free and stop protecting anything.
    const needsResume = boards.filter(({ board }) => {
      const moves = board.spec.iccs.trim().split(/\s+/).filter(Boolean);
      let state = createInitialXiangqiState('probe') as {
        status: { type: string; reason?: string };
      };
      for (const token of moves) {
        const next = applyMove(state as never, toMove(token)) as never;
        if (next === state) return state.status.type === 'finished';
        state = next;
      }
      return false;
    });
    expect(needsResume.length, 'no board hits an adjudicated draw any more').toBeGreaterThan(0);
  });
});
