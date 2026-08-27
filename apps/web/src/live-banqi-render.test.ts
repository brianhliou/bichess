import { describe, expect, it } from 'vitest';
import { renderBanqiBoardSvg } from './live-banqi-render.js';

describe('renderBanqiBoardSvg', () => {
  const view = {
    id: 'banqi-render',
    perspective: 'red',
    board: {
      a1: { color: 'red', role: 'chariot', faceDown: false },
      b1: { faceDown: true },
      c1: { color: 'black', role: 'horse', faceDown: false },
    },
    legalMoves: [
      { from: 'a1', to: 'b1' },
      { from: 'a1', to: 'c1' },
    ],
    captured: [],
    status: { type: 'playing', turn: 'red' },
    ply: 0,
    firstColor: 'red',
    moveNumber: 1,
  };

  it('renders target hover highlights inside the interactive hit layer', () => {
    const svg = renderBanqiBoardSvg(view as never, 'red', {
      interactive: true,
      selectedSquare: 'a1',
      legalMoves: view.legalMoves as never,
    });

    expect(svg).toContain('banqi-hit--target');
    expect(svg).toContain('banqi-target-hover');
    expect(svg).toContain('class="banqi-hint-capture"');
    expect(svg).toContain('class="banqi-hint"');
  });

  it('marks revealed and face-down dragged sources as origin shadows', () => {
    const revealed = renderBanqiBoardSvg(view as never, 'red', { draggingFrom: 'a1' });
    const hidden = renderBanqiBoardSvg(view as never, 'red', { draggingFrom: 'b1' });

    expect(revealed).toContain('banqi-piece banqi-drag-source');
    expect(hidden).toContain('banqi-back banqi-drag-source');
  });

  it('uses the shared origin wash and destination halo for a board move', () => {
    const svg = renderBanqiBoardSvg(
      { ...view, lastMove: { from: 'a1', to: 'c1' } } as never,
      'red',
    );

    expect(svg.match(/xq-live-lastmove-from/g)).toHaveLength(1);
    expect(svg.match(/xq-live-lastmove-ring/g)).toHaveLength(1);
    // The private marks this board used to draw are gone, not renamed alongside.
    expect(svg).not.toContain('banqi-last-from');
    expect(svg).not.toContain('banqi-last-ring');
    expect(svg).not.toContain('<rect class="banqi-last');
    expect(svg).not.toContain('banqi-last-collision');
  });

  it('uses one destination halo and no origin shadow for a flip', () => {
    const svg = renderBanqiBoardSvg(
      { ...view, lastMove: { from: 'a1', to: 'a1' } } as never,
      'red',
    );

    // A flip has no origin square, so the origin wash must not appear.
    expect(svg).not.toContain('xq-live-lastmove-from');
    expect(svg.match(/xq-live-lastmove-ring/g)).toHaveLength(1);
    expect(svg.match(/<circle class="banqi-last-reveal"/g)).toHaveLength(1);
  });

  it('keeps only the circular endpoints after mutual elimination', () => {
    const svg = renderBanqiBoardSvg(
      {
        ...view,
        board: { b1: { faceDown: true } },
        lastMove: { from: 'a1', to: 'c1' },
      } as never,
      'red',
    );

    expect(svg.match(/xq-live-lastmove-from/g)).toHaveLength(1);
    expect(svg.match(/xq-live-lastmove-ring/g)).toHaveLength(1);
    expect(svg).not.toContain('banqi-last-collision');
  });
});
