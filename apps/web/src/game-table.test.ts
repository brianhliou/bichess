import { describe, expect, it } from 'vitest';
import { createGameTable } from './game-table.js';

describe('createGameTable', () => {
  it('provides the shared room and watch right-column contract', () => {
    const table = createGameTable();

    expect(table.el.classList.contains('game-console')).toBe(true);
    expect(table.el.querySelectorAll('.round-table__box')).toHaveLength(1);
    expect(table.refs.replayControls).toHaveLength(4);
    expect(table.refs.movesRoot.contains(table.refs.moveList)).toBe(true);
    expect(table.refs.playerTop.classList.contains('round-table__player--top')).toBe(true);
    expect(table.refs.playerBottom.classList.contains('round-table__player--bottom')).toBe(true);
  });
});
