import { describe, expect, it } from 'vitest';
import { getMiniXiangqiPlayerView } from '@mistboard/game';
import {
  MINI_XIANGQI_DARK_STATE,
  MINI_XIANGQI_DARK_TRIPTYCH,
  MINI_XIANGQI_SOLDIER_DIAGRAM,
  MINI_XIANGQI_START_BOARD,
  miniXqFogBoardSvg,
} from './diagrams.js';

// Mini Xiangqi has no river, so a soldier moves sideways from move one. The
// article diagrams must draw it with the promoted-soldier art, the way Fortress
// Xiangqi's veterans do, or the picture contradicts the rule the page states.
// A shrouded blocker under fog stays a neutral "?" token: it stands for an
// unseen piece, so it must never draw soldier art of either kind.

const PLAIN_SOLDIER = /\/(red|black)-soldier\.png/;

describe('mini xiangqi article soldier art', () => {
  it('draws every soldier promoted on the full-information boards', () => {
    for (const svg of [MINI_XIANGQI_START_BOARD(), MINI_XIANGQI_SOLDIER_DIAGRAM()]) {
      expect(svg).toContain('crossed-soldier.png');
      expect(svg).not.toMatch(PLAIN_SOLDIER);
    }
  });

  it('promotes both sides on the dark triptych server-truth board', () => {
    const svg = MINI_XIANGQI_DARK_TRIPTYCH();
    expect(svg).toContain('red-crossed-soldier.png');
    expect(svg).toContain('black-crossed-soldier.png');
    expect(svg).not.toMatch(PLAIN_SOLDIER);
  });

  it('leaves shrouded blockers as hidden tokens, not soldiers', () => {
    const view = getMiniXiangqiPlayerView(MINI_XIANGQI_DARK_STATE, 'red');
    const svg = miniXqFogBoardSvg(view, 'mxq-fog-test');

    // Red sees its own soldiers (promoted) and Black's back rank only as
    // shrouded tokens, so no black soldier art of either kind appears.
    expect(svg).toContain('red-crossed-soldier.png');
    expect(svg).not.toContain('black-crossed-soldier.png');
    expect(svg).not.toMatch(PLAIN_SOLDIER);
    expect(svg).toContain('black hidden piece');
  });
});
