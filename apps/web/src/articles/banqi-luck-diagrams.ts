// Before/after boards of the skill-vs-luck article's ply-6 flip (g3), built on
// the shared banqi diagram helpers so they match the rules article's furniture.
// The position replays through the real kernel from the exhibit game's deal, so
// the diagrams cannot drift from the game they describe.
import {
  BANQI_BOARD_H,
  BANQI_BOARD_W,
  BANQI_CELL,
  BANQI_MARGIN,
  banqiBoardGrid,
  banqiPiecesFromView,
  banqiReplayViewAt,
  xqSvg,
} from './diagrams.js';
import { BANQI_LUCK_GAME } from './content/banqi-luck-game.js';

// g3 = col 6, row 1 in the diagram grid (row = 4 - rank).
const FLIP_COL = 6;
const FLIP_ROW = 1;
const TITLE_H = 28;

function flipHighlight(x0: number, y0: number): string {
  const x = x0 + BANQI_MARGIN + FLIP_COL * BANQI_CELL;
  const y = y0 + BANQI_MARGIN + FLIP_ROW * BANQI_CELL;
  return `<rect x="${x + 2}" y="${y + 2}" width="${BANQI_CELL - 4}" height="${BANQI_CELL - 4}" rx="6" fill="none" stroke="var(--site-accent, #b8434e)" stroke-width="3"/>`;
}

function flipBoard(ply: number, title: string): () => string {
  return () =>
    xqSvg(
      BANQI_BOARD_W,
      BANQI_BOARD_H + TITLE_H,
      [
        `<text x="${BANQI_BOARD_W / 2}" y="14" font-family="system-ui, sans-serif" font-size="13" font-weight="700" class="xq-diagram-title" text-anchor="middle">${title}</text>`,
        banqiBoardGrid(0, TITLE_H),
        banqiPiecesFromView(
          banqiReplayViewAt(BANQI_LUCK_GAME.deal, BANQI_LUCK_GAME.moves, ply),
          0,
          TITLE_H,
        ),
        flipHighlight(0, TITLE_H),
      ].join(''),
    );
}

export const BANQI_LUCK_FLIP_BEFORE = flipBoard(5, 'BEFORE: THE G3 TILE, FACE DOWN');
export const BANQI_LUCK_FLIP_AFTER = flipBoard(6, 'AFTER: MY OWN SOLDIER');
