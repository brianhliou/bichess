import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIECE_SVGS } from '@mistboard/board-render';
import {
  type Board,
  type Color,
  darkChessVariant,
  type GameEvent,
  replayGameEvents,
  type Square,
} from '@mistboard/game';
import { svgToPng } from '../og-image.js';

// CLI: tsx generate-bicolor-screenshot.ts [sampleName] [targetPly]
//   sampleName  defaults to "sample-1"
//   targetPly   defaults to 18 (half-moves played)
//
// Renders both POVs of the same fog-of-war position from a real corpus game
// using the user's default theme — tournament green board + solid fog.

const here = dirname(fileURLToPath(import.meta.url));
const sampleName = process.argv[2] ?? 'sample-4';
const targetPly = Number(process.argv[3] ?? 26);
const samplePath = resolve(
  here,
  '..',
  '..',
  '..',
  'web',
  'public',
  'replay-samples',
  `${sampleName}.jsonl`,
);
const outPath = resolve(here, '..', '..', '..', 'web', 'public', 'screenshot-bicolor.png');

// Tournament-green + solid-fog tokens, mirrored from
// apps/web/src/styles.css :root[data-board-theme="green"] and
// :root[data-fog-theme="solid"].
const LIGHT_SQUARE = '#eeeed2';
const DARK_SQUARE = '#769656';
const FOG_LIGHT_FILL = '#17261a';
const FOG_DARK_FILL = '#17261a';
const FOG_SHADOW = '#3a523f';
const CANVAS_BG = '#0f1115';
const WORDMARK_FILL = '#e5e7eb';
const LABEL_FILL = '#9ca3af';
const CAPTION_FILL = '#9ca3af';

const text = await fs.readFile(samplePath, 'utf8');
const allEvents: GameEvent[] = text
  .trim()
  .split('\n')
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l) as GameEvent);

let moveCount = 0;
const truncated: GameEvent[] = [];
for (const ev of allEvents) {
  truncated.push(ev);
  if (ev.type === 'move-played') {
    moveCount += 1;
    if (moveCount >= targetPly) break;
  }
}

const projection = replayGameEvents(truncated);
const state = projection.state;

const ALL_SQUARES: Square[] = [];
for (const file of 'abcdefgh') {
  for (let rank = 1; rank <= 8; rank += 1) {
    ALL_SQUARES.push(`${file}${rank}` as Square);
  }
}

type PieceOnBoard = { file: number; rank: number; color: Color; role: string };

function boardToPieces(board: Board): PieceOnBoard[] {
  const out: PieceOnBoard[] = [];
  for (const [sq, piece] of Object.entries(board)) {
    if (!piece) continue;
    const file = sq.charCodeAt(0) - 97;
    const rank = Number(sq[1]) - 1;
    out.push({ file, rank, color: piece.color, role: piece.role });
  }
  return out;
}

function squareToFileRank(sq: Square): { file: number; rank: number } {
  return { file: sq.charCodeAt(0) - 97, rank: Number(sq[1]) - 1 };
}

function renderBoard(
  pieces: PieceOnBoard[],
  fogSquares: Square[],
  x: number,
  y: number,
  size: number,
  orientation: Color,
): string {
  const sq = size / 8;
  const out: string[] = [];
  const fogCoords = fogSquares.map(squareToFileRank);
  const fileToCol = (file: number): number => (orientation === 'white' ? file : 7 - file);
  const rankToRow = (rank: number): number => (orientation === 'white' ? 7 - rank : rank);

  out.push(`<g>`);
  for (let f = 0; f < 8; f += 1) {
    for (let r = 0; r < 8; r += 1) {
      const isLight = (f + r) % 2 === 1;
      const sx = x + fileToCol(f) * sq;
      const sy = y + rankToRow(r) * sq;
      out.push(
        `<rect x="${sx}" y="${sy}" width="${sq}" height="${sq}" fill="${isLight ? LIGHT_SQUARE : DARK_SQUARE}"/>`,
      );
    }
  }
  const fogSet = new Set(fogCoords.map((c) => `${c.file},${c.rank}`));
  for (const piece of pieces) {
    if (fogSet.has(`${piece.file},${piece.rank}`)) continue;
    const svg = PIECE_SVGS[`${piece.color}:${piece.role}`];
    if (!svg) continue;
    const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const px = x + fileToCol(piece.file) * sq;
    const py = y + rankToRow(piece.rank) * sq;
    out.push(
      `<svg x="${px}" y="${py}" width="${sq}" height="${sq}" viewBox="0 0 45 45">${inner}</svg>`,
    );
  }
  for (const fog of fogCoords) {
    const fx = x + fileToCol(fog.file) * sq;
    const fy = y + rankToRow(fog.rank) * sq;
    const isLight = (fog.file + fog.rank) % 2 === 1;
    out.push(
      `<rect x="${fx}" y="${fy}" width="${sq}" height="${sq}" fill="${isLight ? FOG_LIGHT_FILL : FOG_DARK_FILL}"/>`,
    );
    out.push(
      `<rect x="${fx + 0.5}" y="${fy + 0.5}" width="${sq - 1}" height="${sq - 1}" fill="none" stroke="${FOG_SHADOW}" stroke-width="1"/>`,
    );
  }
  out.push(`</g>`);
  return out.join('');
}

const pieces = boardToPieces(state.board);
const whiteView = darkChessVariant.getPlayerView(state, 'white');
const blackView = darkChessVariant.getPlayerView(state, 'black');
const whiteVisible = new Set(whiteView.visibleSquares);
const blackVisible = new Set(blackView.visibleSquares);
const whiteFog = ALL_SQUARES.filter((s) => !whiteVisible.has(s));
const blackFog = ALL_SQUARES.filter((s) => !blackVisible.has(s));

const W = 1800;
const H = 900;
const boardSize = 580;
const gap = 120;
const boardY = 220;
const labelY = boardY - 30;
const totalWidth = 2 * boardSize + gap;
const startX = Math.round((W - totalWidth) / 2);
const leftX = startX;
const rightX = startX + boardSize + gap;
const FONT = 'system-ui, -apple-system, Helvetica, Arial, sans-serif';

const parts: string[] = [];
parts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
);
parts.push(`<rect width="${W}" height="${H}" fill="${CANVAS_BG}"/>`);
parts.push(
  `<text x="80" y="100" fill="${WORDMARK_FILL}" font-family="${FONT}" font-size="32" font-weight="700" letter-spacing="3">MISTBOARD</text>`,
);
parts.push(
  `<text x="${leftX + boardSize / 2}" y="${labelY}" text-anchor="middle" fill="${LABEL_FILL}" font-family="${FONT}" font-size="26" letter-spacing="2">WHITE'S VIEW</text>`,
);
parts.push(
  `<text x="${rightX + boardSize / 2}" y="${labelY}" text-anchor="middle" fill="${LABEL_FILL}" font-family="${FONT}" font-size="26" letter-spacing="2">BLACK'S VIEW</text>`,
);
parts.push(renderBoard(pieces, whiteFog, leftX, boardY, boardSize, 'white'));
parts.push(renderBoard(pieces, blackFog, rightX, boardY, boardSize, 'black'));
parts.push(
  `<text x="${W / 2}" y="850" text-anchor="middle" fill="${CAPTION_FILL}" font-family="${FONT}" font-size="26" font-weight="500">The same position. Two players. Two views.</text>`,
);
parts.push(`</svg>`);

const svg = parts.join('');
const png = svgToPng(svg, CANVAS_BG);
await fs.writeFile(outPath, png);
console.log(
  `wrote ${outPath} (${png.byteLength} bytes), source=${sampleName}, ply=${targetPly}, visible: white=${whiteView.visibleSquares.length}, black=${blackView.visibleSquares.length}`,
);
