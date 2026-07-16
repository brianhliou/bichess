import { describe, expect, it } from 'vitest';
import { renderJungleFlipBoardSvg } from './jungle-flip-render.js';
import { renderJungleBoardSvg } from './jungle-render.js';

describe('Jungle-family last-move indicators', () => {
  it('uses a disc shadow and destination halo for a Jungle move', () => {
    const svg = renderJungleBoardSvg(
      { a4: { color: 'red', role: 'rat' } },
      { lastMove: { from: 'a3', to: 'a4' }, shadow: false },
    );

    expect(svg.match(/<circle class="jungle-last-move-from"/g)).toHaveLength(1);
    expect(svg.match(/<circle class="jungle-last-move-ring"/g)).toHaveLength(1);
    expect(svg).not.toContain('<rect class="jungle-last-move');
    expect(svg).not.toContain('jungle-last-move-reveal');
    expect(svg).not.toContain('jungle-last-move-collision');
  });

  it('uses the same two-part disc grammar for a Flip Jungle board move', () => {
    const svg = renderJungleFlipBoardSvg(
      { b1: { faceDown: false, color: 'red', role: 'rat' } },
      { lastMove: { from: 'a1', to: 'b1' }, shadow: false },
    );

    expect(svg.match(/<circle class="jungle-last-move-from"/g)).toHaveLength(1);
    expect(svg.match(/<circle class="jungle-last-move-ring"/g)).toHaveLength(1);
    expect(svg).not.toContain('jungle-last-move-collision');
  });

  it('uses one destination halo and no origin shadow for a Flip Jungle flip', () => {
    const svg = renderJungleFlipBoardSvg(
      { a1: { faceDown: false, color: 'red', role: 'rat' } },
      { lastMove: { from: 'a1', to: 'a1' }, shadow: false },
    );

    expect(svg).not.toContain('class="jungle-last-move-from"');
    expect(svg.match(/<circle class="jungle-last-move-ring"/g)).toHaveLength(1);
    expect(svg.match(/<circle class="jungle-last-move-ring-edge"/g)).toHaveLength(1);
    expect(svg.match(/<circle class="jungle-last-move-reveal"/g)).toHaveLength(1);
  });

  it('keeps only the circular endpoints after mutual elimination', () => {
    const svg = renderJungleFlipBoardSvg(
      { d4: { faceDown: true } },
      { lastMove: { from: 'c1', to: 'c2' }, shadow: false },
    );

    expect(svg.match(/<circle class="jungle-last-move-from"/g)).toHaveLength(1);
    expect(svg.match(/<circle class="jungle-last-move-ring"/g)).toHaveLength(1);
    expect(svg).not.toContain('jungle-last-move-collision');
  });
});
