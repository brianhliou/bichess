// OG-card renderer for the xiangqi family (intersection boards: pieces on
// grid points, palace diagonals, optional river). The web's article diagrams
// (xqSvg / miniXqBoardSvg in apps/web/src/articles-data.ts) style via CSS
// classes and the user's piece-set preference, neither of which exists at
// server raster time — so share cards draw with a fixed palette, the
// traditional character set, and the baked Noto glyph paths. Zero font and
// zero stylesheet dependence: safe for resvg in a bare container.

import { XIANGQI_GLYPH_PATHS } from './generated/xiangqi-glyph-paths.js';

export type XiangqiOgRole =
  | 'general'
  | 'advisor'
  | 'elephant'
  | 'horse'
  | 'chariot'
  | 'cannon'
  | 'soldier';

export type XiangqiOgPiece = {
  file: number;
  rank: number;
  color: 'red' | 'black';
  role: XiangqiOgRole;
};

// Mirrors the TRADITIONAL table in apps/web/src/xiangqi-piece-sets.ts (the
// site default set). Keep in sync if that table ever changes.
const TRADITIONAL_GLYPHS: Record<'red' | 'black', Record<XiangqiOgRole, string>> = {
  red: {
    general: '帥',
    advisor: '仕',
    elephant: '相',
    horse: '傌',
    chariot: '俥',
    cannon: '炮',
    soldier: '兵',
  },
  black: {
    general: '將',
    advisor: '士',
    elephant: '象',
    horse: '馬',
    chariot: '車',
    cannon: '砲',
    soldier: '卒',
  },
};

// Palette mirrors the web's light-theme xq diagram values (articles.css
// --xq-diagram-*) plus the disc colors from renderXiangqiPieceGlyphed; fog
// matches the chess OG cards' solid fog so the card family reads as one set.
const BG = '#d9bd82';
const INK = '#4b3c2a';
const DISC = '#f3e6c4';
const RED = '#b91c1c';
const BLACK = '#1f2937';
// Same translucent dark-wood wash the web diagrams use (--xq-diagram-fog),
// slightly stronger for card contrast. Fogged pieces are filtered out before
// rendering, so the wash never has to hide anything.
const FOG = 'rgba(36, 25, 15, 0.6)';

export type XiangqiOgBoardOptions = {
  files: number; // points per row: 9 full xiangqi, 7 mini
  ranks: number; // points per column: 10 full xiangqi, 7 mini
  pieces: XiangqiOgPiece[];
  // Points hidden from the viewer; drawn as solid fog tiles over the board.
  fogPoints?: Array<{ file: number; rank: number }>;
  // Full xiangqi: interior vertical lines break between these two ranks.
  riverBetweenRanks?: [number, number];
  // Palace boxes (inclusive point ranges) that get corner-to-corner diagonals.
  palaces: Array<{ fileLo: number; fileHi: number; rankLo: number; rankHi: number }>;
  centerX: number; // width derives from the grid's aspect ratio, so center it
  y: number;
  height: number;
};

// Renders from Red's perspective: rank 1 at the bottom.
export function renderXiangqiOgBoardSvg(opts: XiangqiOgBoardOptions): string {
  const { files, ranks, pieces, fogPoints = [], riverBetweenRanks, palaces } = opts;
  // Ratios from the web diagrams (cell 31, margin 18, piece 28).
  const cell = opts.height / (ranks - 1 + 2 * 0.58);
  const margin = 0.58 * cell;
  const pieceSize = 0.9 * cell;
  const width = 2 * margin + (files - 1) * cell;
  const px = (file: number) => margin + file * cell;
  const py = (rank: number) => margin + (ranks - rank) * cell;

  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${width}" height="${opts.height}" rx="8" fill="${BG}"/>`);
  for (let rank = 1; rank <= ranks; rank += 1) {
    parts.push(
      `<line x1="${px(0)}" y1="${py(rank)}" x2="${px(files - 1)}" y2="${py(rank)}" stroke="${INK}" stroke-width="1"/>`,
    );
  }
  for (let file = 0; file < files; file += 1) {
    const edge = file === 0 || file === files - 1;
    if (riverBetweenRanks && !edge) {
      // Interior verticals stop at the river banks.
      parts.push(
        `<line x1="${px(file)}" y1="${py(ranks)}" x2="${px(file)}" y2="${py(riverBetweenRanks[1])}" stroke="${INK}" stroke-width="1"/>`,
      );
      parts.push(
        `<line x1="${px(file)}" y1="${py(riverBetweenRanks[0])}" x2="${px(file)}" y2="${py(1)}" stroke="${INK}" stroke-width="1"/>`,
      );
    } else {
      parts.push(
        `<line x1="${px(file)}" y1="${py(ranks)}" x2="${px(file)}" y2="${py(1)}" stroke="${INK}" stroke-width="1"/>`,
      );
    }
  }
  for (const palace of palaces) {
    parts.push(
      `<line x1="${px(palace.fileLo)}" y1="${py(palace.rankHi)}" x2="${px(palace.fileHi)}" y2="${py(palace.rankLo)}" stroke="${INK}" stroke-width="1"/>`,
    );
    parts.push(
      `<line x1="${px(palace.fileHi)}" y1="${py(palace.rankHi)}" x2="${px(palace.fileLo)}" y2="${py(palace.rankLo)}" stroke="${INK}" stroke-width="1"/>`,
    );
  }
  const fogged = new Set(fogPoints.map((point) => `${point.file}:${point.rank}`));
  for (const piece of pieces) {
    if (fogged.has(`${piece.file}:${piece.rank}`)) continue; // hidden from the viewer
    parts.push(xiangqiOgPieceSvg(px(piece.file), py(piece.rank), pieceSize, piece));
  }
  // Full-cell tiles with no gap or rounding, so adjacent fog fuses into one
  // translucent region instead of reading as a checkerboard of holes. Tiles
  // on edge points stretch through the board margin so fog meets the frame,
  // clipped to the board's rounded corners.
  if (fogPoints.length > 0) {
    const clipId = `xq-og-fog-clip-${files}x${ranks}`;
    parts.push(
      `<clipPath id="${clipId}"><rect x="0" y="0" width="${width}" height="${opts.height}" rx="8"/></clipPath>`,
    );
    const fogParts: string[] = [];
    for (const point of fogPoints) {
      const x0 = point.file === 0 ? 0 : px(point.file) - cell / 2;
      const x1 = point.file === files - 1 ? width : px(point.file) + cell / 2;
      const y0 = point.rank === ranks ? 0 : py(point.rank) - cell / 2;
      const y1 = point.rank === 1 ? opts.height : py(point.rank) + cell / 2;
      fogParts.push(
        `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${FOG}"/>`,
      );
    }
    parts.push(`<g clip-path="url(#${clipId})">${fogParts.join('')}</g>`);
  }
  return `<svg x="${opts.centerX - width / 2}" y="${opts.y}" width="${width}" height="${opts.height}" viewBox="0 0 ${width} ${opts.height}">${parts.join('')}</svg>`;
}

function xiangqiOgPieceSvg(cx: number, cy: number, size: number, piece: XiangqiOgPiece): string {
  const colorHex = piece.color === 'red' ? RED : BLACK;
  const glyph = TRADITIONAL_GLYPHS[piece.color][piece.role];
  const path = XIANGQI_GLYPH_PATHS[glyph];
  if (!path) {
    throw new Error(`no baked glyph path for ${glyph} (${piece.color} ${piece.role})`);
  }
  const scale = size / 100;
  return [
    `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${scale})">`,
    `<circle cx="50" cy="50" r="46" fill="${DISC}" stroke="${colorHex}" stroke-width="2.5"/>`,
    `<circle cx="50" cy="50" r="38" fill="none" stroke="${colorHex}" stroke-width="1.5"/>`,
    `<path d="${path}" fill="${colorHex}"/>`,
    `</g>`,
  ].join('');
}
