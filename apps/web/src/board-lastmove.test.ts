import {
  applyBanqiMove,
  applyFortressXiangqiMove,
  applyJieqiMove,
  applyMiniXiangqiOpenMove,
  applyMove as applyXiangqiMove,
  createInitialBanqiState,
  createInitialFortressXiangqiState,
  createInitialJieqiState,
  createInitialMiniXiangqiState,
  createInitialXiangqiState,
  getBanqiLegalMoves,
  getBanqiPlayerView,
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
import { renderBanqiBoardSvg } from './live-banqi-render.js';
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
    // Canonical (xiangqi, piece 54): the origin wash sits 4 units outside the
    // piece radius (r=31) and the destination ring's outer edge lands on the same
    // 31, so the pair reads as one size with two treatments. Default strokes.
    expect(boardLastMoveMarkersSvg({ from: { x: 10, y: 20 }, to: { x: 30, y: 40 } }, 54)).toBe(
      '<circle class="xq-live-lastmove-cell xq-live-lastmove-from" cx="10" cy="20" r="31"/>' +
        '<circle class="xq-live-lastmove-ring" cx="30" cy="40" r="29"/>',
    );
    expect(boardLastMoveStyleAttr(54)).toBe('');

    // A 72-unit-cell board (piece 65) renders the same picture at its own scale.
    expect(boardLastMoveMarkersSvg({ from: { x: 10, y: 20 }, to: { x: 30, y: 40 } }, 65)).toBe(
      '<circle class="xq-live-lastmove-cell xq-live-lastmove-from" cx="10" cy="20" r="37.31"/>' +
        '<circle class="xq-live-lastmove-ring" cx="30" cy="40" r="34.91"/>',
    );
    expect(boardLastMoveStyleAttr(65)).toBe(
      ' style="--board-lastmove-stroke:4.81;--board-lastmove-origin-stroke:2.41"',
    );
  });

  it('marks only the endpoints it is given', () => {
    // A drop has no origin square: destination halo only, never a stray disc.
    expect(boardLastMoveMarkersSvg({ from: null, to: { x: 30, y: 40 } }, 54)).toBe(
      '<circle class="xq-live-lastmove-ring" cx="30" cy="40" r="29"/>',
    );
    expect(boardLastMoveMarkersSvg({ from: { x: 10, y: 20 }, to: null }, 54)).toBe(
      '<circle class="xq-live-lastmove-cell xq-live-lastmove-from" cx="10" cy="20" r="31"/>',
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
      name: 'banqi',
      svg: () => {
        // Banqi opens face-down, so the first legal move is a flip (a self-move).
        // Play two: the second is a board move, which is the case with an origin.
        let state = createInitialBanqiState('lastmove-bq');
        for (let i = 0; i < 24; i += 1) {
          const move = getBanqiLegalMoves(state).find((m) => m.from !== m.to);
          if (move)
            return renderBanqiBoardSvg(getBanqiPlayerView(applyBanqiMove(state, move), 'red'));
          state = applyBanqiMove(state, getBanqiLegalMoves(state)[0]!);
        }
        throw new Error('no banqi board move found');
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
      expect(svg).not.toContain('banqi-last-from');
      expect(svg).not.toContain('banqi-last-ring');
    });

    it(`${board.name} wraps pieces in square-keyed slots so the glide can find them`, () => {
      // glideSvgPiece and drawMarkerOnArrival both locate the settled piece by
      // [data-piece-square]. A board that paints pieces without slots renders
      // correctly and silently never animates, which is how jieqi and banqi sat
      // un-animated until 2026-08-27.
      expect(board.svg()).toMatch(/data-piece-square="[a-z]\d+"/);
    });
  }
});
