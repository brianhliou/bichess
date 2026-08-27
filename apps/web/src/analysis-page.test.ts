import { describe, expect, it } from 'vitest';
import { ANALYSIS_VARIANTS } from './analysis-catalog.js';
import { mountAnalysisPage } from './analysis-page.js';

// End-to-end wiring (jsdom): every catalog variant mounts a working analysis
// board — the variant dropdown (with the current variant selected), the meta
// card, and the tree review's move list. This is the registry-driven
// conformance test for the /analysis surface: a catalog entry whose loader or
// review mount breaks fails here, not in prod.

describe('analysis page', () => {
  for (const variant of ANALYSIS_VARIANTS) {
    it(`mounts the ${variant.id} analysis board with the variant picker`, async () => {
      const root = document.createElement('div');
      document.body.append(root);
      try {
        await mountAnalysisPage(root, variant.id);

        const select = root.querySelector<HTMLSelectElement>('.analysis-variant-picker select');
        expect(select, 'variant dropdown').not.toBeNull();
        expect(select!.value).toBe(variant.id);
        expect(select!.options.length).toBe(ANALYSIS_VARIANTS.length);

        // The selected option carries the site label.
        expect(select!.selectedOptions[0]?.textContent).toBe(variant.label);

        // The tree review mounted: a move list ready for branching.
        expect(root.querySelector('.review-move-list'), 'move list').not.toBeNull();
        // All analysis variants share one board-perimeter contract, including
        // fog variants that do not yet mount an eval gauge.
        expect(root.classList.contains('analysis-route')).toBe(true);
        expect(root.querySelector('.review-shell--analysis')).not.toBeNull();
        expect(root.querySelector('.review-shell--game')).toBeNull();
        // Lichess minimalism: the dropdown IS the left rail — no meta card.
        expect(root.querySelector('.game-meta-card')).toBeNull();
        // Every analysis board carries the FEN + moves import block, and the
        // FEN box is editable (position input is a catalog-wide contract).
        expect(root.querySelector('.review-import'), 'import block').not.toBeNull();
        expect(root.querySelector<HTMLInputElement>('.review-import input')?.readOnly).toBe(false);
      } finally {
        root.remove();
      }
    });
  }
});
