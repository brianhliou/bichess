import { isFortressXiangqiDropMove } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { fortressXiangqiArticle } from './articles/content/fortress-xiangqi.js';
import type { FortressXiangqiReplayBlock } from './articles/types.js';
import { replayFortressXiangqiNotation } from './fortress-xiangqi-replay.js';

function articleReplayBlock(): FortressXiangqiReplayBlock {
  for (const section of fortressXiangqiArticle.sections) {
    for (const block of section.blocks ?? []) {
      if (block.kind === 'fortress-xiangqi-replay') return block;
    }
  }
  throw new Error('Fortress Xiangqi article is missing its replay block');
}

describe('Fortress Xiangqi article replay', () => {
  it('replays the sample game through the Fortress Xiangqi kernel', () => {
    const block = articleReplayBlock();
    const replay = replayFortressXiangqiNotation(block.spec.moves);

    expect(replay.tokens).toHaveLength(87);
    expect(replay.moves).toHaveLength(87);
    expect(replay.states).toHaveLength(88);
    expect(replay.moves.filter(isFortressXiangqiDropMove)).toHaveLength(20);
    expect(block.caption).toBeUndefined();
    expect(replay.states.at(-1)?.status).toMatchObject({
      type: 'finished',
      winner: 'red',
      reason: 'checkmate',
    });
  });
});
