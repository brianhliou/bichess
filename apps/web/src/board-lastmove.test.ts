import {
  applyFortressXiangqiMove,
  applyJieqiMove,
  applyMiniXiangqiOpenMove,
  applyMove as applyXiangqiMove,
  createInitialFortressXiangqiState,
  createInitialJieqiState,
  createInitialMiniXiangqiState,
  createInitialXiangqiState,
  getFortressXiangqiLegalMoves,
  getFortressXiangqiPlayerView,
  getJieqiLegalMoves,
  getJieqiPlayerView,
  getMiniXiangqiOpenLegalMoves,
  getMiniXiangqiOpenPlayerView,
  getStandardXiangqiPlayerView,
  STANDARD_JIEQI_DEAL,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { boardLastMoveMarkersSvg, boardLastMoveStyleAttr } from './board-lastmove.js';
import { renderFortressXiangqiBoardSvg } from './fortress-xiangqi-render.js';
import { renderJieqiBoardSvg } from './live-jieqi-render.js';
import { renderMiniXiangqiBoardSvg } from './live-mini-xiangqi-render.js';
import { renderXiangqiBoardSvg } from './xiangqi-board.js';

// Every token board drew the last move its own way until 2026-08-27 (the homepage
// game viewer and the daily-puzzle widget one band below it disagreed on screen).
// These assert the ONE language, per renderer, so a new board cannot quietly opt
// out of it: an origin disc at the piece radius plus a destination halo just
// inside it, and no private per-variant marker class.
describe('shared last-move language', () => {
  it('scales the radii and the ring stroke with the board piece size', () => {
    // Canonical (xiangqi, piece 54): r=27 origin, r=26 ring, CSS-default stroke.
    expect(boardLastMoveMarkersSvg({ from: { x: 10, y: 20 }, to: { x: 30, y: 40 } }, 54)).toBe(
      '<circle class="xq-live-lastmove-cell xq-live-lastmove-from" cx="10" cy="20" r="27"/>' +
        '<circle class="xq-live-lastmove-ring" cx="30" cy="40" r="26"/>',
    );
    expect(boardLastMoveStyleAttr(54)).toBe('');

    // A 72-unit-cell board (piece 65) renders the same picture at its own scale.
    expect(boardLastMoveMarkersSvg({ from: { x: 10, y: 20 }, to: { x: 30, y: 40 } }, 65)).toBe(
      '<circle class="xq-live-lastmove-cell xq-live-lastmove-from" cx="10" cy="20" r="32.5"/>' +
        '<circle class="xq-live-lastmove-ring" cx="30" cy="40" r="31.3"/>',
    );
    expect(boardLastMoveStyleAttr(65)).toBe(' style="--board-lastmove-stroke:4.81"');
  });

  it('marks only the endpoints it is given', () => {
    // A drop has no origin square: destination halo only, never a stray disc.
    expect(boardLastMoveMarkersSvg({ from: null, to: { x: 30, y: 40 } }, 54)).toBe(
      '<circle class="xq-live-lastmove-ring" cx="30" cy="40" r="26"/>',
    );
    expect(boardLastMoveMarkersSvg({ from: { x: 10, y: 20 }, to: null }, 54)).toBe(
      '<circle class="xq-live-lastmove-cell xq-live-lastmove-from" cx="10" cy="20" r="27"/>',
    );
    expect(boardLastMoveMarkersSvg({}, 54)).toBe('');
  });

  const boards = [
    {
      name: 'xiangqi',
      svg: () => {
        const state = applyXiangqiMove(createInitialXiangqiState('lastmove-xq'), {
          from: 'b3',
          to: 'e3',
        });
        return renderXiangqiBoardSvg(getStandardXiangqiPlayerView(state, 'red'));
      },
    },
    {
      name: 'jieqi',
      svg: () => {
        const initial = createInitialJieqiState('lastmove-jq', STANDARD_JIEQI_DEAL);
        const state = applyJieqiMove(initial, getJieqiLegalMoves(initial)[0]!);
        return renderJieqiBoardSvg(getJieqiPlayerView(state, 'red'));
      },
    },
    {
      name: 'mini xiangqi',
      svg: () => {
        const initial = createInitialMiniXiangqiState('lastmove-mini');
        const state = applyMiniXiangqiOpenMove(initial, getMiniXiangqiOpenLegalMoves(initial)[0]!);
        return renderMiniXiangqiBoardSvg(getMiniXiangqiOpenPlayerView(state, 'red'), 'red', {
          showFog: false,
        });
      },
    },
    {
      name: 'fortress xiangqi',
      svg: () => {
        const initial = createInitialFortressXiangqiState('lastmove-fxq');
        const state = applyFortressXiangqiMove(initial, getFortressXiangqiLegalMoves(initial)[0]!);
        return renderFortressXiangqiBoardSvg(getFortressXiangqiPlayerView(state, 'red'), 'red');
      },
    },
  ] as const;

  for (const board of boards) {
    it(`${board.name} draws the shared origin disc and destination halo`, () => {
      const svg = board.svg();
      expect(svg.match(/xq-live-lastmove-from/g)).toHaveLength(1);
      expect(svg.match(/xq-live-lastmove-ring/g)).toHaveLength(1);
      // The retired per-variant marker classes, one per renderer.
      expect(svg).not.toContain('jieqi-last"');
      expect(svg).not.toContain('mini-xq-last"');
      expect(svg).not.toContain('fxq-last"');
    });
  }
});
