import { describe, expect, it } from 'vitest';
import { downloadRow, underboardPanel } from './underboard-tabs.js';

function shareInputs(): { fen: HTMLInputElement; moves: HTMLTextAreaElement } {
  return {
    fen: document.createElement('input'),
    moves: document.createElement('textarea'),
  };
}

describe('underboard Share & export downloads', () => {
  it('renders one download link per format, dressed like the copy buttons', () => {
    const row = downloadRow([
      { text: 'PGN', href: '/api/games/r1/export.pgn', filename: 'mistboard-r1.pgn' },
      { text: 'JSON', href: '/api/games/r1/export.json', filename: 'mistboard-r1.json' },
    ]);
    const anchors = [...row.querySelectorAll('a')];
    expect(row.querySelector('.review-share__label')?.textContent).toBe('Download');
    expect(anchors.map((a) => a.textContent)).toEqual(['PGN', 'JSON']);
    expect(anchors.map((a) => a.getAttribute('href'))).toEqual([
      '/api/games/r1/export.pgn',
      '/api/games/r1/export.json',
    ]);
    expect(anchors.map((a) => a.getAttribute('download'))).toEqual([
      'mistboard-r1.pgn',
      'mistboard-r1.json',
    ]);
    for (const anchor of anchors)
      expect(anchor.classList.contains('review-share__copy')).toBe(true);
  });

  it('appends shareExtra rows after FEN / Share / Moves in the Share & export tab', () => {
    const { fen, moves } = shareInputs();
    const panel = underboardPanel(document.createElement('div'), {
      hasAnalysis: false,
      shareFenInput: fen,
      shareMovesInput: moves,
      gameUrl: 'https://mistboard.com/game/r1',
      shareExtra: [
        downloadRow([{ text: 'PGN', href: '/api/games/r1/export.pgn', filename: 'r1.pgn' }]),
      ],
    });
    const tabs = [...panel.querySelectorAll('.review-underboard-tab')].map((b) => b.textContent);
    expect(tabs).toEqual(['Share & export']);
    const labels = [...panel.querySelectorAll('.review-share__label')].map((el) => el.textContent);
    expect(labels).toEqual(['FEN', 'Share', 'Moves', 'Download']);
  });
});

describe('underboard Share & export without an engine FEN', () => {
  it('omits the FEN row instead of rendering it empty', () => {
    const panel = underboardPanel(document.createElement('div'), {
      hasAnalysis: false,
      shareMovesInput: document.createElement('textarea'),
      gameUrl: 'https://mistboard.com/game/r1',
    });
    const labels = [...panel.querySelectorAll('.review-share__label')].map((el) => el.textContent);
    expect(labels).toEqual(['Share', 'Moves']);
  });
});
