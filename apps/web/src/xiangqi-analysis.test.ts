import { beforeEach, describe, expect, it } from 'vitest';
import { mountXiangqiAnalysis } from './xiangqi-analysis.js';
import { mountXiangqiAnalysisPage } from './xiangqi-analysis-page.js';

// DOM coverage for the imported-game analysis surface (everything except the WASM
// engine, which happy-dom can't run — cevalSupported() is false here, so the
// engine panel mounts disabled and never touches SharedArrayBuffer).

const OPENING = [
  { from: 'h3', to: 'e3' } as const,
  { from: 'h8', to: 'e8' } as const,
  { from: 'h1', to: 'g3' } as const,
];

function freshRoot(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

describe('mountXiangqiAnalysis', () => {
  it('renders the board, engine panel, move tree, and navigation from a move list', () => {
    const root = freshRoot();
    mountXiangqiAnalysis(root, [...OPENING]);
    expect(root.querySelector('.xiangqi-live-board')).not.toBeNull();
    expect(root.querySelector('.engine-panel')).not.toBeNull();
    const text = root.textContent ?? '';
    expect(text).toContain('h3-e3');
    expect(text).toContain('h1-g3');
    // Interactive tree UI: a move tree + the playback control bar (below the box).
    expect(root.querySelector('.move-tree')).not.toBeNull();
    expect(root.querySelector('.review-controls')).not.toBeNull();
    // The last seeded move is the current node on mount.
    expect(root.querySelector('.review-move-list__move--current')?.textContent).toContain('h1-g3');
    // whole-game analysis entry point (the client ceval sweep is click-gated, so
    // no engine loads here — only the request button renders)
    expect(root.textContent).toContain('Analyse the whole game');
    // Meta card carries the finalized xiangqi variant marker (site-wide icon
    // language), not just the text glyph.
    expect(
      root.querySelector('.game-meta-card__icon [data-variant-marker-id="xiangqi"]'),
    ).not.toBeNull();
    // The engine-arrow overlay layer mounts empty (engine off).
    expect(root.querySelector('.xq-live-arrows')).not.toBeNull();
    expect(root.querySelectorAll('.xq-live-arrows .xq-arrow')).toHaveLength(0);
    root.remove();
  });

  it('surfaces a truncation notice when the move list goes illegal', () => {
    const root = freshRoot();
    mountXiangqiAnalysis(root, [{ from: 'b1', to: 'b2' }]); // illegal horse move → legal prefix is empty
    expect(root.textContent).toMatch(/Truncated import/i);
    root.remove();
  });

  it('accepts click-to-move for both sides from the start position (red then black)', () => {
    // Regression: the tree adapter projected the view for a fixed 'red'
    // perspective, whose legalMoves are EMPTY on black's turn, so the board
    // rejected every black move after red's first (ply 1 was a dead end).
    const root = freshRoot();
    mountXiangqiAnalysis(root, []);
    const clickSquare = (square: string): void => {
      const hit = root.querySelector(`[data-square="${square}"]`);
      if (!hit) throw new Error(`square ${square} not found`);
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };
    // Red's first move: cannon h3-e3.
    clickSquare('h3');
    clickSquare('e3');
    expect(root.querySelector('.move-tree')?.textContent).toContain('h3-e3');
    // Black's reply: cannon h8-e8. Must be selectable and land in the tree.
    clickSquare('h8');
    clickSquare('e8');
    expect(root.querySelector('.move-tree')?.textContent).toContain('h8-e8');
    expect(root.querySelector('.review-move-list__move--current')?.textContent).toContain('h8-e8');
    root.remove();
  });
});

describe('mountXiangqiAnalysisPage', () => {
  // The page reads window.location.search; a prior test's import pushes ?moves=...,
  // which would otherwise leak into the next test's URL.
  beforeEach(() => {
    window.history.pushState({}, '', '/analysis/xiangqi');
  });

  it('opens the empty board at the start position when the URL carries no moves', () => {
    const root = freshRoot();
    mountXiangqiAnalysisPage(root);
    // Lichess-style: the interactive board opens directly (no paste-form gate).
    expect(root.querySelector('.xiangqi-live-board')).not.toBeNull();
    expect(root.querySelector('.move-tree')).not.toBeNull();
    expect(root.querySelector('.dxq-postgame__actions')).toBeNull();
    expect(root.textContent).not.toContain('Import game');
    expect(root.textContent).not.toContain('Save as study');
    expect(root.textContent).not.toContain('Back home');
    root.remove();
  });

  it('seeds the board from a ?moves= link', () => {
    window.history.pushState({}, '', '/analysis/xiangqi?moves=h3e3,h8e8');
    const root = freshRoot();
    mountXiangqiAnalysisPage(root);
    expect(root.querySelector('.xiangqi-live-board')).not.toBeNull();
    expect(root.textContent).toContain('h3-e3');
    root.remove();
  });

  it('sizes the review shell for the square-grid river gutter', () => {
    window.history.pushState({}, '', '/analysis/xiangqi?xqLayout=cell');
    const root = freshRoot();
    mountXiangqiAnalysisPage(root);
    expect(
      root
        .querySelector<HTMLElement>('.review-shell__cluster')
        ?.style.getPropertyValue('--uni-board-aspect'),
    ).toBe((540 / 612).toFixed(4));
    root.remove();
  });
});
