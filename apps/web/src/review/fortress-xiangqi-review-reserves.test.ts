// In a drop variant the reserve is part of the POSITION, not a capture ledger:
// a fortress board with hidden pockets does not say what is droppable, so the
// position cannot be read. These rows were removed once already as ordinary
// captured material (#166) and had to come back; this pins them so the next
// review-surface tidy cannot quietly take them again.
//
// Covers review / analysis / study in one place: all three mount this same
// presentation through mountTreeReview.
import { type FortressXiangqiMove, fsfUciToFortressXiangqiMove } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { mountFortressXiangqiReview } from './fortress-xiangqi-review.js';

const move = (uci: string): FortressXiangqiMove => {
  const m = fsfUciToFortressXiangqiMove(uci);
  if (!m) throw new Error(`bad uci ${uci}`);
  return m;
};

// Opening of the article's sample game, far enough in that both sides have
// captured: by here Red holds a soldier and Black holds a chariot.
const MOVES = [
  'b2b3',
  'f7f6',
  'f2f3',
  'c8c5',
  'c1b2',
  'b7c7',
  'f1e3',
  'g8f7',
  'e3c4',
  'c5f5',
  'g2f2',
  'b8c6',
  'a2a3',
  'a7b7',
  'g1g4',
  'f6g6',
  'a1a2',
  'f7f6',
  'g4e4',
  'f5f2',
].map(move);

function mount(moves: FortressXiangqiMove[]): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  mountFortressXiangqiReview(root, {
    ariaLabel: 'Fortress review',
    title: 'Fortress review',
    summary: '',
    moves,
    analysis: null,
  });
  return root;
}

describe('Fortress review reserves', () => {
  it('renders both pockets as material rows', () => {
    const root = mount(MOVES);
    const rows = root.querySelectorAll('.review-material-row');
    expect(rows).toHaveLength(2);
  });

  it('keeps both rows mounted from the start, before anything is captured', () => {
    // The empty case is the one that regressed: rows that only appear on the
    // first capture are what shoved the rail and got the feature pulled. The
    // band height itself is CSS, so what is assertable here is that both hosts
    // exist and stay in the document with an empty pocket.
    const root = mount([]);
    const rows = root.querySelectorAll('.review-material-row');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.isConnected).toBe(true);
      // Carries the shared pocket class the reserved-band CSS keys off.
      expect(row.classList.contains('drop-mini-reserve-strip')).toBe(true);
    }
  });

  it('shows captured pieces in the pockets once material has been taken', () => {
    const root = mount(MOVES);
    const tiles = root.querySelectorAll('.review-material-row .drop-mini-reserve-piece');
    expect(tiles.length).toBeGreaterThan(0);
  });
});
