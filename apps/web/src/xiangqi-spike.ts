// FoW Xiangqi spike — hidden local-only playable surface.
// See docs-private/fog-of-war/library/variants/fow-xiangqi.md (Phase A).
//
// Phase A scope (this file):
//   - 9×10 board with palace cross-lines and river band
//   - Pieces placed on intersections via getPlayerView
//   - Fog dots at intersections the perspective player cannot see
//   - Click-to-move (Step 7)
//   - POV switcher: red / black / god-view (Step 7)
//   - Cannon-vision mode bakeoff: A / D / E (Step 8)

import {
  applyMove,
  computeVision,
  coordOf,
  createInitialXiangqiState,
  getLegalMoves,
  getLegalMovesFrom,
  getPlayerView,
  squareOf,
  type XiangqiCannonVisionMode,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiPiece,
  type XiangqiPlayerView,
  type XiangqiSquare,
} from '@mistboard/game';
import { buildNav } from './site-shell.js';
import { setBoardFamily, xiangqiAppearanceChangedEvent } from './theme.js';
import { chooseHandTunedMove } from './xiangqi-bot.js';
import { xiangqiFogRegion } from './xiangqi-fog.js';
import { renderXiangqiPiece } from './xiangqi-pieces.js';

// ── Geometry ───────────────────────────────────────────────────────────────

const CELL = 60;
const MARGIN = 36;
const PIECE_SIZE = 52;
const FILES = 9;
const RANKS = 10;
const WIDTH = MARGIN * 2 + (FILES - 1) * CELL;
const HEIGHT = MARGIN * 2 + (RANKS - 1) * CELL;
const RIVER_TOP = MARGIN + 4 * CELL;
const RIVER_BOT = MARGIN + 5 * CELL;
const FOG_RADIUS = 22;
const HIT_HALF = 24; // half-width of the per-intersection click target

type Perspective = XiangqiColor | 'god';
export type CannonTargetMarker = 'corners' | 'ring' | 'badge' | 'line';

function intersection(
  file: number,
  rank: number,
  perspective: XiangqiColor,
): { x: number; y: number } {
  const rDisplay = perspective === 'red' ? RANKS - rank : rank - 1;
  return {
    x: MARGIN + file * CELL,
    y: MARGIN + rDisplay * CELL,
  };
}

// ── Static board layers ────────────────────────────────────────────────────

function gridLines(): string {
  const parts: string[] = [];
  for (let r = 0; r < RANKS; r++) {
    const y = MARGIN + r * CELL;
    parts.push(`<line x1="${MARGIN}" y1="${y}" x2="${MARGIN + (FILES - 1) * CELL}" y2="${y}"/>`);
  }
  for (const f of [0, FILES - 1]) {
    const x = MARGIN + f * CELL;
    parts.push(`<line x1="${x}" y1="${MARGIN}" x2="${x}" y2="${MARGIN + (RANKS - 1) * CELL}"/>`);
  }
  for (let f = 1; f < FILES - 1; f++) {
    const x = MARGIN + f * CELL;
    parts.push(`<line x1="${x}" y1="${MARGIN}" x2="${x}" y2="${RIVER_TOP}"/>`);
    parts.push(`<line x1="${x}" y1="${RIVER_BOT}" x2="${x}" y2="${MARGIN + (RANKS - 1) * CELL}"/>`);
  }
  return parts.join('');
}

function palaceCrosses(perspective: XiangqiColor): string {
  const parts: string[] = [];
  for (const palace of [
    { fileMin: 3, fileMax: 5, rankBack: 1 },
    { fileMin: 3, fileMax: 5, rankBack: 8 },
  ]) {
    const top = palace.rankBack === 1 ? 3 : 10;
    const bot = palace.rankBack;
    const a = intersection(palace.fileMin, top, perspective);
    const b = intersection(palace.fileMax, bot, perspective);
    const c = intersection(palace.fileMax, top, perspective);
    const d = intersection(palace.fileMin, bot, perspective);
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    parts.push(`<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}"/>`);
  }
  return parts.join('');
}

function positionMarks(perspective: XiangqiColor): string {
  const marks: Array<{ file: number; rank: number }> = [];
  for (const r of [3, 8]) for (const f of [1, 7]) marks.push({ file: f, rank: r });
  for (const r of [4, 7]) for (const f of [0, 2, 4, 6, 8]) marks.push({ file: f, rank: r });
  return marks
    .map(({ file, rank }) => {
      const { x, y } = intersection(file, rank, perspective);
      const off = 9;
      const len = 5;
      const bits: string[] = [];
      const corners = [
        { dx: -1, dy: -1 },
        { dx: 1, dy: -1 },
        { dx: -1, dy: 1 },
        { dx: 1, dy: 1 },
      ];
      for (const c of corners) {
        if (file === 0 && c.dx === -1) continue;
        if (file === FILES - 1 && c.dx === 1) continue;
        const px = x + c.dx * off;
        const py = y + c.dy * off;
        bits.push(`<line x1="${px}" y1="${py}" x2="${px - c.dx * len}" y2="${py}"/>`);
        bits.push(`<line x1="${px}" y1="${py}" x2="${px}" y2="${py - c.dy * len}"/>`);
      }
      return bits.join('');
    })
    .join('');
}

function riverLabel(perspective: XiangqiColor): string {
  const midY = (RIVER_TOP + RIVER_BOT) / 2;
  const leftX = MARGIN + 2 * CELL;
  const rightX = MARGIN + 6 * CELL;
  const left = perspective === 'red' ? '楚 河' : '漢 界';
  const right = perspective === 'red' ? '漢 界' : '楚 河';
  return [
    `<text x="${leftX}" y="${midY}" class="xq-river-label">${left}</text>`,
    `<text x="${rightX}" y="${midY}" class="xq-river-label">${right}</text>`,
  ].join('');
}

// ── Dynamic layers (depend on game state / view) ───────────────────────────

function fogLayer(view: XiangqiPlayerView, perspective: XiangqiColor): string {
  const visible = new Set(view.visibleSquares);
  const parts: string[] = [];
  for (let f = 0; f < FILES; f++) {
    for (let r = 1; r <= RANKS; r++) {
      const sq = squareOf(f, r);
      if (visible.has(sq)) continue;
      const { x, y } = intersection(f, r, perspective);
      parts.push(`<circle class="xq-fog" cx="${x}" cy="${y}" r="${FOG_RADIUS}"/>`);
    }
  }
  return parts.join('');
}

// Inverse fog: cover the whole board with a continuous fog overlay, then cut
// portholes of clarity at every visible intersection via SVG mask. Reads as
// "flashlight beams through mist" — visually heavier than the dot-per-cell
// approach and closer to how chess tile fog feels.
//
// Cutout shape: square (CELL × CELL) centered on each intersection. Adjacent
// visible intersections tile into continuous rectangular reveals, which reads
// as connected vision rather than isolated portholes.
function fogLayerMask(view: XiangqiPlayerView, perspective: XiangqiColor, maskKey: string): string {
  const half = CELL / 2;
  const cutouts: string[] = [];
  for (const sq of view.visibleSquares) {
    const file = 'abcdefghi'.indexOf(sq[0]);
    const rank = Number(sq.slice(1));
    const { x, y } = intersection(file, rank, perspective);
    const rDisplay = perspective === 'red' ? RANKS - rank : rank - 1;
    const x0 = file === 0 ? 0 : x - half;
    const x1 = file === FILES - 1 ? WIDTH : x + half;
    const y0 = rDisplay === 0 ? 0 : y - half;
    const y1 = rDisplay === RANKS - 1 ? HEIGHT : y + half;
    cutouts.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="black"/>`);
  }
  return xiangqiFogRegion(
    { width: WIDTH, height: HEIGHT, cell: CELL, margin: MARGIN, rx: 8 },
    `xq-fog-mask-${maskKey}`,
    'xq-fog-mask',
    cutouts.join(''),
  );
}

function selectionRing(selection: XiangqiSquare | null, perspective: XiangqiColor): string {
  if (!selection) return '';
  const { file, rank } = coordOf(selection);
  const { x, y } = intersection(file, rank, perspective);
  return `<circle class="xq-selection-ring" cx="${x}" cy="${y}" r="29"/>`;
}

function lastMoveMarkers(view: XiangqiPlayerView, perspective: XiangqiColor): string {
  const move = view.lastMove;
  if (!move) return '';
  const parts: string[] = [];
  for (const sq of [move.from, move.to]) {
    // Only highlight squares the perspective player can actually see; under
    // FoW it's possible only the destination is visible (or neither).
    if (!view.visibleSquares.includes(sq)) continue;
    const { file, rank } = coordOf(sq);
    const { x, y } = intersection(file, rank, perspective);
    parts.push(`<circle class="xq-lastmove" cx="${x}" cy="${y}" r="26"/>`);
  }
  return parts.join('');
}

function moveHints(
  selection: XiangqiSquare | null,
  state: XiangqiGameState,
  perspective: XiangqiColor,
): string {
  if (!selection || state.status.type !== 'playing') return '';
  const moves = getLegalMovesFrom(state, selection);
  return moves
    .map((m) => {
      const c = coordOf(m.to);
      const { x, y } = intersection(c.file, c.rank, perspective);
      const occupied = state.board[m.to] !== undefined;
      return occupied
        ? `<circle class="xq-hint-capture" cx="${x}" cy="${y}" r="27"/>`
        : `<circle class="xq-hint-dot" cx="${x}" cy="${y}" r="7"/>`;
    })
    .join('');
}

function cannonTargetSquares(view: XiangqiPlayerView, state: XiangqiGameState): XiangqiSquare[] {
  if (view.perspective !== 'red' && view.perspective !== 'black') return [];
  const visible = new Set(view.visibleSquares);
  return [...computeVision(state, view.perspective).cannonTargets]
    .filter((sq) => visible.has(sq))
    .sort();
}

function cannonSourceForTarget(
  state: XiangqiGameState,
  color: XiangqiColor,
  target: XiangqiSquare,
): XiangqiSquare | null {
  const targetCoord = coordOf(target);
  for (const [sq, piece] of Object.entries(state.board)) {
    if (!piece || piece.color !== color || piece.role !== 'cannon') continue;
    const sourceCoord = coordOf(sq as XiangqiSquare);
    const sameFile = sourceCoord.file === targetCoord.file;
    const sameRank = sourceCoord.rank === targetCoord.rank;
    if (!sameFile && !sameRank) continue;

    const df = Math.sign(targetCoord.file - sourceCoord.file);
    const dr = Math.sign(targetCoord.rank - sourceCoord.rank);
    let blockers = 0;
    let file = sourceCoord.file + df;
    let rank = sourceCoord.rank + dr;
    while (file !== targetCoord.file || rank !== targetCoord.rank) {
      if (state.board[squareOf(file, rank)]) blockers += 1;
      file += df;
      rank += dr;
    }
    if (blockers === 1) return sq as XiangqiSquare;
  }
  return null;
}

function cannonTargetMarkers(
  view: XiangqiPlayerView,
  state: XiangqiGameState,
  perspective: XiangqiColor,
  marker: CannonTargetMarker,
): string {
  return cannonTargetSquares(view, state)
    .map((sq) => {
      const { file, rank } = coordOf(sq);
      const { x, y } = intersection(file, rank, perspective);
      const outer = 30;
      const inner = 20;
      if (marker === 'ring') {
        return `<circle class="xq-cannon-target-ring" cx="${x}" cy="${y}" r="28"/>`;
      }
      if (marker === 'badge') {
        return `
          <circle class="xq-cannon-target-badge" cx="${x + 22}" cy="${y - 22}" r="10"/>
          <text class="xq-cannon-target-badge-text" x="${x + 22}" y="${y - 21.5}">炮</text>
        `;
      }
      if (marker === 'line') {
        const source = cannonSourceForTarget(state, view.perspective, sq);
        const line = source
          ? (() => {
              const from = coordOf(source);
              const start = intersection(from.file, from.rank, perspective);
              return `<line class="xq-cannon-target-line" x1="${start.x}" y1="${start.y}" x2="${x}" y2="${y}"/>`;
            })()
          : '';
        return `${line}<circle class="xq-cannon-target-ring" cx="${x}" cy="${y}" r="28"/>`;
      }
      return `
        <path class="xq-cannon-target-mark" d="M ${x - outer} ${y - inner} L ${x - outer} ${y - outer} L ${x - inner} ${y - outer}"/>
        <path class="xq-cannon-target-mark" d="M ${x + inner} ${y - outer} L ${x + outer} ${y - outer} L ${x + outer} ${y - inner}"/>
        <path class="xq-cannon-target-mark" d="M ${x - outer} ${y + inner} L ${x - outer} ${y + outer} L ${x - inner} ${y + outer}"/>
        <path class="xq-cannon-target-mark" d="M ${x + inner} ${y + outer} L ${x + outer} ${y + outer} L ${x + outer} ${y + inner}"/>
      `;
    })
    .join('');
}

function piecesLayer(view: XiangqiPlayerView, perspective: XiangqiColor): string {
  const parts: string[] = [];
  for (const sq in view.board) {
    const entry = view.board[sq as XiangqiSquare];
    if (!entry) continue;
    const file = 'abcdefghi'.indexOf(sq[0]);
    const rank = Number(sq.slice(1));
    const { x, y } = intersection(file, rank, perspective);
    parts.push(
      renderXiangqiPiece(entry.piece, {
        x: x - PIECE_SIZE / 2,
        y: y - PIECE_SIZE / 2,
        size: PIECE_SIZE,
        shrouded: entry.shrouded,
        className: 'xq-piece',
      }),
    );
  }
  return parts.join('');
}

function clickLayer(perspective: XiangqiColor): string {
  const parts: string[] = [];
  for (let f = 0; f < FILES; f++) {
    for (let r = 1; r <= RANKS; r++) {
      const sq = squareOf(f, r);
      const { x, y } = intersection(f, r, perspective);
      parts.push(
        `<rect class="xq-hit" data-square="${sq}" x="${x - HIT_HALF}" y="${y - HIT_HALF}" width="${HIT_HALF * 2}" height="${HIT_HALF * 2}"/>`,
      );
    }
  }
  return parts.join('');
}

export type FogStyle = 'dots' | 'mask';
type BoardStyle = 'intersection' | 'grid';

function fogLayerFor(
  style: FogStyle,
  view: XiangqiPlayerView,
  perspective: XiangqiColor,
  maskKey: string,
): string {
  return style === 'mask' ? fogLayerMask(view, perspective, maskKey) : fogLayer(view, perspective);
}

// ── Grid-mode geometry (chess-like cells, pieces in cell centers) ──────────

const CELL_W = (WIDTH - 2 * MARGIN) / FILES;
const CELL_H = (HEIGHT - 2 * MARGIN) / RANKS;
const GRID_PIECE_SIZE = Math.min(CELL_W, CELL_H) * 0.85;

function cellCenter(
  file: number,
  rank: number,
  perspective: XiangqiColor,
): { x: number; y: number } {
  const rDisplay = perspective === 'red' ? RANKS - rank : rank - 1;
  return {
    x: MARGIN + file * CELL_W + CELL_W / 2,
    y: MARGIN + rDisplay * CELL_H + CELL_H / 2,
  };
}

function cellRect(
  file: number,
  rank: number,
  perspective: XiangqiColor,
): { x: number; y: number; w: number; h: number } {
  const rDisplay = perspective === 'red' ? RANKS - rank : rank - 1;
  return {
    x: MARGIN + file * CELL_W,
    y: MARGIN + rDisplay * CELL_H,
    w: CELL_W,
    h: CELL_H,
  };
}

function gridCellGrid(perspective: XiangqiColor): string {
  const parts: string[] = [];
  // Cell borders
  for (let f = 0; f < FILES; f++) {
    for (let r = 1; r <= RANKS; r++) {
      const { x, y, w, h } = cellRect(f, r, perspective);
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" class="xq-grid-cell"/>`);
    }
  }
  return parts.join('');
}

function gridPalaceShading(perspective: XiangqiColor): string {
  // Both palaces: files 3-5 (d-f), ranks 1-3 (red) and 8-10 (black)
  const palaces = [
    { fileMin: 3, fileMax: 5, rankMin: 1, rankMax: 3 },
    { fileMin: 3, fileMax: 5, rankMin: 8, rankMax: 10 },
  ];
  const parts: string[] = [];
  for (const p of palaces) {
    const tl = cellRect(p.fileMin, p.rankMax, perspective);
    const br = cellRect(p.fileMax, p.rankMin, perspective);
    const x = Math.min(tl.x, br.x);
    const y = Math.min(tl.y, br.y);
    const w = Math.max(tl.x + tl.w, br.x + br.w) - x;
    const h = Math.max(tl.y + tl.h, br.y + br.h) - y;
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" class="xq-grid-palace"/>`);
    // Palace diagonals (just two crossed lines across the 3x3 area)
    parts.push(
      `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y + h}" class="xq-grid-palace-line"/>`,
    );
    parts.push(
      `<line x1="${x + w}" y1="${y}" x2="${x}" y2="${y + h}" class="xq-grid-palace-line"/>`,
    );
  }
  return parts.join('');
}

function gridRiverLabel(perspective: XiangqiColor): string {
  // River is the boundary between rank 5 and rank 6 cells. Labels sit on
  // the middle two rows of cells (ranks 5 and 6).
  const r5 = cellCenter(4, 5, perspective);
  const r6 = cellCenter(4, 6, perspective);
  const midY = (r5.y + r6.y) / 2;
  const leftX = cellCenter(2, perspective === 'red' ? 5 : 6, perspective).x;
  const rightX = cellCenter(6, perspective === 'red' ? 5 : 6, perspective).x;
  const left = perspective === 'red' ? '楚 河' : '漢 界';
  const right = perspective === 'red' ? '漢 界' : '楚 河';
  return [
    `<text x="${leftX}" y="${midY}" class="xq-river-label">${left}</text>`,
    `<text x="${rightX}" y="${midY}" class="xq-river-label">${right}</text>`,
  ].join('');
}

function gridFogMask(view: XiangqiPlayerView, perspective: XiangqiColor, maskKey: string): string {
  const cutouts: string[] = [];
  for (const sq of view.visibleSquares) {
    const file = 'abcdefghi'.indexOf(sq[0]);
    const rank = Number(sq.slice(1));
    const { x, y, w, h } = cellRect(file, rank, perspective);
    cutouts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="black"/>`);
  }
  return xiangqiFogRegion(
    { width: WIDTH, height: HEIGHT, cell: CELL, margin: MARGIN, rx: 8 },
    `xq-grid-fog-${maskKey}`,
    'xq-fog-mask',
    cutouts.join(''),
  );
}

function gridPiecesLayer(view: XiangqiPlayerView, perspective: XiangqiColor): string {
  const parts: string[] = [];
  for (const sq in view.board) {
    const entry = view.board[sq as XiangqiSquare];
    if (!entry) continue;
    const file = 'abcdefghi'.indexOf(sq[0]);
    const rank = Number(sq.slice(1));
    const { x, y } = cellCenter(file, rank, perspective);
    parts.push(
      renderXiangqiPiece(entry.piece, {
        x: x - GRID_PIECE_SIZE / 2,
        y: y - GRID_PIECE_SIZE / 2,
        size: GRID_PIECE_SIZE,
        shrouded: entry.shrouded,
        className: 'xq-piece',
      }),
    );
  }
  return parts.join('');
}

function gridLastMoveMarkers(view: XiangqiPlayerView, perspective: XiangqiColor): string {
  const move = view.lastMove;
  if (!move) return '';
  const parts: string[] = [];
  for (const sq of [move.from, move.to]) {
    if (!view.visibleSquares.includes(sq)) continue;
    const { file, rank } = coordOf(sq);
    const { x, y, w, h } = cellRect(file, rank, perspective);
    parts.push(`<rect class="xq-grid-lastmove" x="${x}" y="${y}" width="${w}" height="${h}"/>`);
  }
  return parts.join('');
}

function gridSelectionRing(selection: XiangqiSquare | null, perspective: XiangqiColor): string {
  if (!selection) return '';
  const { file, rank } = coordOf(selection);
  const { x, y, w, h } = cellRect(file, rank, perspective);
  return `<rect class="xq-grid-selection" x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}"/>`;
}

function gridMoveHints(
  selection: XiangqiSquare | null,
  state: XiangqiGameState,
  perspective: XiangqiColor,
): string {
  if (!selection || state.status.type !== 'playing') return '';
  const moves = getLegalMovesFrom(state, selection);
  return moves
    .map((m) => {
      const c = coordOf(m.to);
      const { x, y } = cellCenter(c.file, c.rank, perspective);
      const { w, h } = cellRect(c.file, c.rank, perspective);
      const occupied = state.board[m.to] !== undefined;
      return occupied
        ? `<rect class="xq-grid-hint-capture" x="${x - w / 2 + 3}" y="${y - h / 2 + 3}" width="${w - 6}" height="${h - 6}"/>`
        : `<circle class="xq-hint-dot" cx="${x}" cy="${y}" r="7"/>`;
    })
    .join('');
}

function gridCannonTargetMarkers(
  view: XiangqiPlayerView,
  state: XiangqiGameState,
  perspective: XiangqiColor,
  marker: CannonTargetMarker,
): string {
  return cannonTargetSquares(view, state)
    .map((sq) => {
      const { file, rank } = coordOf(sq);
      const { x, y, w, h } = cellRect(file, rank, perspective);
      const cx = x + w / 2;
      const cy = y + h / 2;
      if (marker === 'ring') {
        return `<rect class="xq-cannon-target-ring" x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="8"/>`;
      }
      if (marker === 'badge') {
        return `
          <circle class="xq-cannon-target-badge" cx="${x + w - 12}" cy="${y + 12}" r="10"/>
          <text class="xq-cannon-target-badge-text" x="${x + w - 12}" y="${y + 12.5}">炮</text>
        `;
      }
      if (marker === 'line') {
        const source = cannonSourceForTarget(state, view.perspective, sq);
        const line = source
          ? (() => {
              const from = coordOf(source);
              const start = cellCenter(from.file, from.rank, perspective);
              return `<line class="xq-cannon-target-line" x1="${start.x}" y1="${start.y}" x2="${cx}" y2="${cy}"/>`;
            })()
          : '';
        return `${line}<rect class="xq-cannon-target-ring" x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="8"/>`;
      }
      return `
        <path class="xq-cannon-target-mark" d="M ${x + 6} ${y + 18} L ${x + 6} ${y + 6} L ${x + 18} ${y + 6}"/>
        <path class="xq-cannon-target-mark" d="M ${x + w - 18} ${y + 6} L ${x + w - 6} ${y + 6} L ${x + w - 6} ${y + 18}"/>
        <path class="xq-cannon-target-mark" d="M ${x + 6} ${y + h - 18} L ${x + 6} ${y + h - 6} L ${x + 18} ${y + h - 6}"/>
        <path class="xq-cannon-target-mark" d="M ${x + w - 18} ${y + h - 6} L ${x + w - 6} ${y + h - 6} L ${x + w - 6} ${y + h - 18}"/>
      `;
    })
    .join('');
}

function gridClickLayer(perspective: XiangqiColor): string {
  const parts: string[] = [];
  for (let f = 0; f < FILES; f++) {
    for (let r = 1; r <= RANKS; r++) {
      const sq = squareOf(f, r);
      const { x, y, w, h } = cellRect(f, r, perspective);
      parts.push(
        `<rect class="xq-hit" data-square="${sq}" x="${x}" y="${y}" width="${w}" height="${h}"/>`,
      );
    }
  }
  return parts.join('');
}

function renderBoardSvgGrid(
  view: XiangqiPlayerView,
  perspective: XiangqiColor,
  state: XiangqiGameState,
  selection: XiangqiSquare | null,
  maskKey: string,
  cannonMarker: CannonTargetMarker,
): string {
  return [
    `<svg class="xq-board-svg xq-board-grid" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">`,
    `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" class="xq-board-bg"/>`,
    `<g class="xq-grid-cells">${gridCellGrid(perspective)}</g>`,
    `<g class="xq-grid-palace-g">${gridPalaceShading(perspective)}</g>`,
    `<g class="xq-river-text">${gridRiverLabel(perspective)}</g>`,
    `<g class="xq-fog-layer">${gridFogMask(view, perspective, maskKey)}</g>`,
    `<g class="xq-lastmove-layer">${gridLastMoveMarkers(view, perspective)}</g>`,
    `<g class="xq-selection">${gridSelectionRing(selection, perspective)}</g>`,
    `<g class="xq-hints">${gridMoveHints(selection, state, perspective)}</g>`,
    `<g class="xq-cannon-targets">${gridCannonTargetMarkers(view, state, perspective, cannonMarker)}</g>`,
    `<g class="xq-pieces">${gridPiecesLayer(view, perspective)}</g>`,
    `<g class="xq-clicks">${gridClickLayer(perspective)}</g>`,
    `</svg>`,
  ].join('');
}

function renderBoardSvgGridReadOnly(
  view: XiangqiPlayerView,
  perspective: XiangqiColor,
  state: XiangqiGameState,
  maskKey: string,
  cannonMarker: CannonTargetMarker,
): string {
  return [
    `<svg class="xq-board-svg xq-board-grid xq-board-readonly" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">`,
    `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" class="xq-board-bg"/>`,
    `<g class="xq-grid-cells">${gridCellGrid(perspective)}</g>`,
    `<g class="xq-grid-palace-g">${gridPalaceShading(perspective)}</g>`,
    `<g class="xq-river-text">${gridRiverLabel(perspective)}</g>`,
    `<g class="xq-fog-layer">${gridFogMask(view, perspective, maskKey)}</g>`,
    `<g class="xq-lastmove-layer">${gridLastMoveMarkers(view, perspective)}</g>`,
    `<g class="xq-cannon-targets">${gridCannonTargetMarkers(view, state, perspective, cannonMarker)}</g>`,
    `<g class="xq-pieces">${gridPiecesLayer(view, perspective)}</g>`,
    `</svg>`,
  ].join('');
}

export function renderBoardSvg(
  view: XiangqiPlayerView,
  perspective: XiangqiColor,
  state: XiangqiGameState,
  selection: XiangqiSquare | null,
  fogStyle: FogStyle,
  maskKey: string,
  cannonMarker: CannonTargetMarker = 'corners',
): string {
  return [
    `<svg class="xq-board-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">`,
    `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" class="xq-board-bg"/>`,
    `<g class="xq-grid">${gridLines()}</g>`,
    `<g class="xq-palace">${palaceCrosses(perspective)}</g>`,
    `<g class="xq-marks">${positionMarks(perspective)}</g>`,
    `<g class="xq-river-text">${riverLabel(perspective)}</g>`,
    `<g class="xq-fog-layer">${fogLayerFor(fogStyle, view, perspective, maskKey)}</g>`,
    `<g class="xq-lastmove-layer">${lastMoveMarkers(view, perspective)}</g>`,
    `<g class="xq-selection">${selectionRing(selection, perspective)}</g>`,
    `<g class="xq-hints">${moveHints(selection, state, perspective)}</g>`,
    `<g class="xq-cannon-targets">${cannonTargetMarkers(view, state, perspective, cannonMarker)}</g>`,
    `<g class="xq-pieces">${piecesLayer(view, perspective)}</g>`,
    `<g class="xq-clicks">${clickLayer(perspective)}</g>`,
    `</svg>`,
  ].join('');
}

// Read-only renderer for the triptych dev view. Drops selection, hints, and
// the click layer — these boards are observers, not playable surfaces.
export function renderBoardSvgReadOnly(
  view: XiangqiPlayerView,
  perspective: XiangqiColor,
  state: XiangqiGameState,
  fogStyle: FogStyle,
  maskKey: string,
  cannonMarker: CannonTargetMarker,
): string {
  return [
    `<svg class="xq-board-svg xq-board-readonly" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">`,
    `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" class="xq-board-bg"/>`,
    `<g class="xq-grid">${gridLines()}</g>`,
    `<g class="xq-palace">${palaceCrosses(perspective)}</g>`,
    `<g class="xq-marks">${positionMarks(perspective)}</g>`,
    `<g class="xq-river-text">${riverLabel(perspective)}</g>`,
    `<g class="xq-fog-layer">${fogLayerFor(fogStyle, view, perspective, maskKey)}</g>`,
    `<g class="xq-lastmove-layer">${lastMoveMarkers(view, perspective)}</g>`,
    `<g class="xq-cannon-targets">${cannonTargetMarkers(view, state, perspective, cannonMarker)}</g>`,
    `<g class="xq-pieces">${piecesLayer(view, perspective)}</g>`,
    `</svg>`,
  ].join('');
}

function triptychHtml(s: SpikeState): string {
  const redView = getPlayerView(s.game, 'red', s.mode);
  const godView = buildGodView(s.game, s.mode);
  const blackView = getPlayerView(s.game, 'black', s.mode);
  const render = (view: XiangqiPlayerView, perspective: XiangqiColor, key: string) =>
    s.boardStyle === 'grid'
      ? renderBoardSvgGridReadOnly(view, perspective, s.game, key, s.cannonMarker)
      : renderBoardSvgReadOnly(view, perspective, s.game, s.fogStyle, key, s.cannonMarker);
  return `
    <div class="xq-triptych">
      <div class="xq-triptych-cell">
        <div class="xq-triptych-label">Red view</div>
        ${render(redView, 'red', 'tri-red')}
      </div>
      <div class="xq-triptych-cell">
        <div class="xq-triptych-label">Server truth</div>
        ${render(godView, 'red', 'tri-god')}
      </div>
      <div class="xq-triptych-cell">
        <div class="xq-triptych-label">Black view</div>
        ${render(blackView, 'black', 'tri-black')}
      </div>
    </div>
  `;
}

// ── God view: bypass FoW filter ────────────────────────────────────────────

export function buildGodView(
  state: XiangqiGameState,
  mode: XiangqiCannonVisionMode,
): XiangqiPlayerView {
  const board: Record<string, { piece: XiangqiPiece; shrouded: boolean }> = {};
  const visibleSquares: XiangqiSquare[] = [];
  for (let f = 0; f < FILES; f++) {
    for (let r = 1; r <= RANKS; r++) {
      visibleSquares.push(squareOf(f, r));
    }
  }
  for (const [sq, piece] of Object.entries(state.board)) {
    if (piece) board[sq] = { piece, shrouded: false };
  }
  const legalMoves =
    state.status.type === 'playing' ? getPlayerView(state, state.status.turn, mode).legalMoves : [];
  return {
    id: state.id,
    perspective: state.status.type === 'playing' ? state.status.turn : 'red',
    board: board as XiangqiPlayerView['board'],
    visibleSquares: visibleSquares.sort(),
    legalMoves,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

// ── Mount + handlers ───────────────────────────────────────────────────────

interface SpikeState {
  game: XiangqiGameState;
  perspective: Perspective;
  mode: XiangqiCannonVisionMode;
  selection: XiangqiSquare | null;
  // Move history is recorded for every move (player or bot). Cursor points at
  // a ply 0..history.length; `game` is always the state at `cursor`.
  history: XiangqiMove[];
  cursor: number;
  fogStyle: FogStyle;
  boardStyle: BoardStyle;
  cannonMarker: CannonTargetMarker;
  serverRoomStatus: 'idle' | 'creating' | 'failed';
  // Flip rotates the board (and its fog) to the opposite orientation while the
  // POV's fog stays the same, so you can inspect a player's view from the far side.
  flipped: boolean;
}

function freshState(): SpikeState {
  return {
    game: createInitialXiangqiState('xq-spike'),
    perspective: 'red',
    mode: 'E',
    selection: null,
    history: [],
    cursor: 0,
    fogStyle: 'mask',
    boardStyle: 'intersection',
    cannonMarker: 'corners',
    serverRoomStatus: 'idle',
    flipped: false,
  };
}

function flipColor(c: XiangqiColor): XiangqiColor {
  return c === 'red' ? 'black' : 'red';
}

function gameAtCursor(history: XiangqiMove[], cursor: number): XiangqiGameState {
  let g = createInitialXiangqiState('xq-spike');
  for (let i = 0; i < cursor; i++) g = applyMove(g, history[i]);
  return g;
}

// Self-play. Capped to keep pathological loops bounded; the progress-clock
// and 3-fold repetition end conditions in applyMove will usually terminate
// well before the cap (especially for hand-tuned, which trades pieces).
const SELFPLAY_PLY_CAP = 600;

type BotKind = 'random' | 'hand-tuned';

function pickMove(state: XiangqiGameState, kind: BotKind): XiangqiMove | null {
  if (state.status.type !== 'playing') return null;
  if (kind === 'hand-tuned') return chooseHandTunedMove(state, state.status.turn);
  const legal = getLegalMoves(state);
  if (legal.length === 0) return null;
  return legal[Math.floor(Math.random() * legal.length)];
}

function runBotGame(redBot: BotKind, blackBot: BotKind): XiangqiMove[] {
  let g = createInitialXiangqiState('xq-spike');
  const moves: XiangqiMove[] = [];
  for (let i = 0; i < SELFPLAY_PLY_CAP; i++) {
    if (g.status.type !== 'playing') break;
    const bot = g.status.turn === 'red' ? redBot : blackBot;
    const pick = pickMove(g, bot);
    if (!pick) break;
    g = applyMove(g, pick);
    moves.push(pick);
  }
  return moves;
}

function isReplay(s: SpikeState): boolean {
  return s.cursor < s.history.length;
}

function viewForState(s: SpikeState): { view: XiangqiPlayerView; orient: XiangqiColor } {
  if (s.perspective === 'god') {
    return { view: buildGodView(s.game, s.mode), orient: 'red' };
  }
  return { view: getPlayerView(s.game, s.perspective, s.mode), orient: s.perspective };
}

function canSelect(s: SpikeState, square: XiangqiSquare): boolean {
  if (s.game.status.type !== 'playing') return false;
  const piece = s.game.board[square];
  if (!piece || piece.color !== s.game.status.turn) return false;
  // Under a color POV, only your own pieces are clickable (and they must
  // already be visible — your own pieces always are).
  if (s.perspective === 'red' || s.perspective === 'black') {
    if (piece.color !== s.perspective) return false;
  }
  return true;
}

function handleSquareClick(s: SpikeState, square: XiangqiSquare): SpikeState {
  // Replay mode: board is read-only — user must scrub to live before moving.
  if (isReplay(s)) return s;
  if (s.game.status.type !== 'playing') return s;
  const piece = s.game.board[square];

  if (s.selection === null) {
    if (canSelect(s, square)) return { ...s, selection: square };
    return s;
  }

  if (s.selection === square) {
    return { ...s, selection: null };
  }

  const legal = getLegalMovesFrom(s.game, s.selection);
  const move = legal.find((m: XiangqiMove) => m.to === square);
  if (move) {
    const next = applyMove(s.game, move);
    return {
      ...s,
      game: next,
      selection: null,
      history: [...s.history, move],
      cursor: s.cursor + 1,
    };
  }

  // Click on a non-destination square: reselect if it's another own piece,
  // else clear selection.
  if (piece && canSelect(s, square)) return { ...s, selection: square };
  return { ...s, selection: null };
}

function controlsHtml(s: SpikeState): string {
  const povBtn = (pov: Perspective, label: string) =>
    `<button data-pov="${pov}" class="xq-btn${s.perspective === pov ? ' on' : ''}">${label}</button>`;
  const modeBtn = (mode: XiangqiCannonVisionMode, label: string) =>
    `<button data-mode="${mode}" class="xq-btn${s.mode === mode ? ' on' : ''}">${label}</button>`;
  const markerBtn = (marker: CannonTargetMarker, label: string) =>
    `<button data-cannon-marker="${marker}" class="xq-btn${s.cannonMarker === marker ? ' on' : ''}">${label}</button>`;
  const serverRoomLabel =
    s.serverRoomStatus === 'creating'
      ? 'Creating'
      : s.serverRoomStatus === 'failed'
        ? 'Try again'
        : 'Create server room';
  const serverRoomStatus =
    s.serverRoomStatus === 'failed'
      ? '<span class="xq-inline-status">Room creation failed</span>'
      : '';
  return `
    <div class="xq-controls">
      <div class="xq-control-row">
        <span class="xq-control-label">Server room</span>
        <button data-action="create-server-room" class="xq-btn"${s.serverRoomStatus === 'creating' ? ' disabled' : ''}>${serverRoomLabel}</button>
        ${serverRoomStatus}
      </div>
      <div class="xq-control-row">
        <span class="xq-control-label">POV</span>
        ${povBtn('red', 'Red')}
        ${povBtn('black', 'Black')}
        ${povBtn('god', 'God')}
        <button data-action="flip" class="xq-btn${s.flipped ? ' on' : ''}">Flip board</button>
      </div>
      <div class="xq-control-row">
        <span class="xq-control-label">Cannon vision</span>
        ${modeBtn('A', 'A · full reveal')}
        ${modeBtn('D', 'D · screen shrouded, target full')}
        ${modeBtn('E', 'E · screen fogged, target full')}
      </div>
      <div class="xq-control-row">
        <span class="xq-control-label">Fog style</span>
        <button data-fog="dots" class="xq-btn${s.fogStyle === 'dots' ? ' on' : ''}">Dots (current)</button>
        <button data-fog="mask" class="xq-btn${s.fogStyle === 'mask' ? ' on' : ''}">Mask (inverse)</button>
      </div>
      <div class="xq-control-row">
        <span class="xq-control-label">Board style</span>
        <button data-board="intersection" class="xq-btn${s.boardStyle === 'intersection' ? ' on' : ''}">Intersection (traditional)</button>
        <button data-board="grid" class="xq-btn${s.boardStyle === 'grid' ? ' on' : ''}">Grid (chess-style)</button>
      </div>
      <div class="xq-control-row">
        <span class="xq-control-label">Target marker</span>
        ${markerBtn('corners', 'Corners')}
        ${markerBtn('ring', 'Ring')}
        ${markerBtn('badge', 'Badge')}
        ${markerBtn('line', 'Line')}
      </div>
      <div class="xq-control-row">
        <span class="xq-control-label">Bot game</span>
        <button data-bots="random,random" class="xq-btn">Random vs Random</button>
        <button data-bots="hand-tuned,hand-tuned" class="xq-btn">Tuned vs Tuned</button>
        <button data-bots="hand-tuned,random" class="xq-btn">Tuned (red) vs Random</button>
      </div>
      <div class="xq-control-row">
        <button data-action="reset" class="xq-btn">Reset</button>
      </div>
      ${replayHtml(s)}
    </div>
  `;
}

function replayHtml(s: SpikeState): string {
  if (s.history.length === 0) return '';
  const max = s.history.length;
  const disabledStart = s.cursor === 0 ? ' disabled' : '';
  const disabledEnd = s.cursor === max ? ' disabled' : '';
  return `
    <div class="xq-control-row">
      <span class="xq-control-label">Replay</span>
      <button data-action="ply-start" class="xq-btn"${disabledStart}>⏮</button>
      <button data-action="ply-prev" class="xq-btn"${disabledStart}>◀</button>
      <input type="range" min="0" max="${max}" value="${s.cursor}" data-action="ply-slider" class="xq-slider"/>
      <button data-action="ply-next" class="xq-btn"${disabledEnd}>▶</button>
      <button data-action="ply-end" class="xq-btn"${disabledEnd}>⏭</button>
      <span class="xq-ply-readout">${s.cursor} / ${max}</span>
    </div>
  `;
}

function statusHtml(s: SpikeState): string {
  const game = s.game;
  let line: string;
  if (game.status.type === 'finished') {
    const winner = game.status.winner ? `${game.status.winner} wins` : 'draw';
    line = `Game over — ${winner} (${game.status.reason}) · move ${game.moveNumber}`;
  } else if (game.status.type === 'aborted') {
    line = `Game aborted · move ${game.moveNumber}`;
  } else {
    line = `Move ${game.moveNumber} · ${game.status.turn} to move`;
  }
  const tag = isReplay(s) ? ` <span class="xq-replay-tag">replay</span>` : '';
  return `<div class="xq-status">${line}${tag}</div>`;
}

let active: { root: HTMLElement; state: SpikeState } | null = null;
let xqSpikeAppearanceBound = false;

function rerender(): void {
  if (!active) return;
  const { root, state } = active;
  const { view, orient } = viewForState(state);
  const drawOrient = state.flipped ? flipColor(orient) : orient;

  root.replaceChildren();
  const container = document.createElement('div');
  container.className = 'xq-spike-root';
  container.innerHTML = `
    <style>${STYLE}</style>
    <h1>FoW Xiangqi spike</h1>
    <p class="xq-spike-sub">Phase A · interactive · ${state.perspective} POV · cannon-vision mode ${state.mode}</p>
    ${controlsHtml(state)}
    ${statusHtml(state)}
    <div class="xq-board-wrap">${
      state.boardStyle === 'grid'
        ? renderBoardSvgGrid(
            view,
            drawOrient,
            state.game,
            state.selection,
            'main',
            state.cannonMarker,
          )
        : renderBoardSvg(
            view,
            drawOrient,
            state.game,
            state.selection,
            state.fogStyle,
            'main',
            state.cannonMarker,
          )
    }</div>
    <div class="xq-triptych-section">
      <div class="xq-triptych-heading">All POVs</div>
      ${triptychHtml(state)}
    </div>
  `;
  root.append(container);
  attachHandlers(container);
}

function setCursor(s: SpikeState, cursor: number): SpikeState {
  const clamped = Math.max(0, Math.min(s.history.length, cursor));
  return {
    ...s,
    cursor: clamped,
    game: gameAtCursor(s.history, clamped),
    selection: null,
  };
}

function attachHandlers(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('[data-action="create-server-room"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void createServerRoom();
    });
  });
  container.querySelectorAll<HTMLElement>('[data-pov]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!active) return;
      const pov = btn.dataset.pov as Perspective;
      active.state = { ...active.state, perspective: pov, selection: null };
      rerender();
    });
  });
  container.querySelector<HTMLElement>('[data-action="flip"]')?.addEventListener('click', () => {
    if (!active) return;
    active.state = { ...active.state, flipped: !active.state.flipped };
    rerender();
  });
  container.querySelectorAll<HTMLElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!active) return;
      const mode = btn.dataset.mode as XiangqiCannonVisionMode;
      active.state = { ...active.state, mode };
      rerender();
    });
  });
  container.querySelectorAll<HTMLElement>('[data-fog]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!active) return;
      const fogStyle = btn.dataset.fog as FogStyle;
      active.state = { ...active.state, fogStyle };
      rerender();
    });
  });
  container.querySelectorAll<HTMLElement>('[data-board]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!active) return;
      const boardStyle = btn.dataset.board as BoardStyle;
      active.state = { ...active.state, boardStyle };
      rerender();
    });
  });
  container.querySelectorAll<HTMLElement>('[data-cannon-marker]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!active) return;
      const cannonMarker = btn.dataset.cannonMarker as CannonTargetMarker;
      active.state = { ...active.state, cannonMarker };
      rerender();
    });
  });
  container.querySelectorAll<HTMLElement>('[data-action="reset"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!active) return;
      active.state = {
        ...active.state,
        game: createInitialXiangqiState('xq-spike'),
        selection: null,
        history: [],
        cursor: 0,
      };
      rerender();
    });
  });
  container.querySelectorAll<HTMLElement>('[data-bots]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!active) return;
      const [red, black] = (btn.dataset.bots ?? 'random,random').split(',') as [BotKind, BotKind];
      const history = runBotGame(red, black);
      active.state = {
        ...active.state,
        history,
        cursor: history.length,
        game: gameAtCursor(history, history.length),
        selection: null,
      };
      rerender();
    });
  });
  for (const [action, delta] of [
    ['ply-start', -Infinity],
    ['ply-prev', -1],
    ['ply-next', 1],
    ['ply-end', Infinity],
  ] as const) {
    container.querySelectorAll<HTMLElement>(`[data-action="${action}"]`).forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!active) return;
        const target =
          delta === -Infinity
            ? 0
            : delta === Infinity
              ? active.state.history.length
              : active.state.cursor + delta;
        active.state = setCursor(active.state, target);
        rerender();
      });
    });
  }
  container.querySelectorAll<HTMLInputElement>('[data-action="ply-slider"]').forEach((el) => {
    el.addEventListener('input', () => {
      if (!active) return;
      const target = Number(el.value);
      if (!Number.isFinite(target)) return;
      active.state = setCursor(active.state, target);
      rerender();
    });
  });
  container.querySelectorAll<HTMLElement>('[data-square]').forEach((el) => {
    el.addEventListener('click', () => {
      if (!active) return;
      const sq = el.dataset.square as XiangqiSquare;
      active.state = handleSquareClick(active.state, sq);
      rerender();
    });
  });
}

async function createServerRoom(): Promise<void> {
  if (!active || active.state.serverRoomStatus === 'creating') return;
  active.state = { ...active.state, serverRoomStatus: 'creating' };
  rerender();
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'pvp', gameSpecId: 'dark-xiangqi' }),
    });
    if (!response.ok) throw new Error(`Fog Xiangqi room creation failed: ${response.status}`);
    const data = (await response.json()) as { url?: string };
    if (!data.url) throw new Error('Fog Xiangqi room creation response missing url');
    window.location.assign(data.url);
  } catch (err) {
    console.warn(err);
    if (!active) return;
    active.state = { ...active.state, serverRoomStatus: 'failed' };
    rerender();
  }
}

const STYLE = `
  .xq-spike-root {
    max-width: 800px;
    margin: 2rem auto;
    padding: 0 1rem;
    color: var(--text-primary, #1f2521);
    font-family: system-ui, -apple-system, sans-serif;
  }
  .xq-spike-root h1 { font-size: 1.4rem; margin: 0 0 0.25rem; }
  .xq-spike-sub { color: #6b6b6b; margin: 0 0 1rem; font-size: 0.95rem; }
  .xq-controls { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; }
  .xq-control-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .xq-control-label { font-size: 0.85rem; color: #6b6b6b; min-width: 110px; }
  .xq-btn {
    appearance: none;
    border: 1px solid #d1d1d1;
    background: #fafafa;
    color: #1f2521;
    padding: 0.35rem 0.7rem;
    font-size: 0.9rem;
    border-radius: 5px;
    cursor: pointer;
  }
  .xq-btn:hover { background: #efefef; }
  .xq-btn.on { background: #1f2521; color: #f7e8c5; border-color: #1f2521; }
  .xq-btn[disabled] { opacity: 0.4; cursor: default; }
  .xq-inline-status { font-size: 0.85rem; color: #9f1239; }
  .xq-slider { flex: 1; min-width: 160px; accent-color: #1f2521; }
  .xq-ply-readout {
    font-size: 0.85rem;
    color: #6b6b6b;
    font-variant-numeric: tabular-nums;
    min-width: 64px;
    text-align: right;
  }
  .xq-status {
    margin-bottom: 0.75rem;
    font-size: 0.95rem;
    color: #444;
  }
  .xq-replay-tag {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.05rem 0.45rem;
    font-size: 0.75rem;
    background: #1f2521;
    color: #f7e8c5;
    border-radius: 3px;
    vertical-align: 1px;
  }
  .xq-board-wrap { display: flex; justify-content: center; }
  .xq-board-svg {
    width: 100%;
    max-width: ${WIDTH}px;
    height: auto;
    background: transparent;
  }
  .xq-triptych-section {
    margin-top: 2rem;
    padding-top: 1.25rem;
    border-top: 1px solid #d1d1d1;
  }
  .xq-triptych-heading {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6b6b6b;
    margin-bottom: 0.75rem;
  }
  .xq-triptych {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    align-items: start;
  }
  .xq-triptych-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }
  .xq-triptych-label {
    font-size: 0.8rem;
    color: #6b6b6b;
    font-weight: 500;
  }
  .xq-triptych .xq-board-readonly {
    width: 100%;
    height: auto;
  }
  @media (max-width: 720px) {
    .xq-triptych { grid-template-columns: 1fr; gap: 1rem; }
    .xq-triptych-cell { max-width: 360px; margin: 0 auto; }
  }
  .xq-board-bg { fill: #f5dca8; }
  .xq-grid line, .xq-palace line, .xq-marks line { stroke: #5a3a14; }
  .xq-grid line, .xq-palace line { stroke-width: 1.2; }
  .xq-marks line { stroke-width: 1.0; }
  .xq-river-label {
    font-family: serif;
    font-size: 22px;
    fill: #5a3a14;
    text-anchor: middle;
    dominant-baseline: central;
    letter-spacing: 4px;
  }
  .xq-fog { fill: #2a2218; opacity: 0.55; }
  .xq-fog-mask { fill: var(--xq-fog-fill, rgba(42, 34, 24, 0.7)); }
  .xq-grid-cell { fill: #f5dca8; stroke: #5a3a14; stroke-width: 0.8; }
  .xq-grid-palace { fill: #ecc888; opacity: 0.55; }
  .xq-grid-palace-line { stroke: #5a3a14; stroke-width: 0.8; opacity: 0.7; }
  .xq-grid-lastmove { fill: #f59e0b; opacity: 0.28; }
  .xq-grid-selection { fill: none; stroke: #f59e0b; stroke-width: 3; }
  .xq-grid-hint-capture { fill: none; stroke: #b91c1c; stroke-width: 3; opacity: 0.85; stroke-dasharray: 5 4; }
  .xq-lastmove { fill: #f59e0b; opacity: 0.22; }
  .xq-selection-ring { fill: none; stroke: #f59e0b; stroke-width: 3; }
  .xq-hint-dot { fill: #15803d; opacity: 0.85; }
  .xq-hint-capture { fill: none; stroke: #b91c1c; stroke-width: 3; opacity: 0.85; stroke-dasharray: 5 4; }
  .xq-cannon-target-mark {
    fill: none;
    stroke: #2563eb;
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.88;
  }
  .xq-cannon-target-ring {
    fill: none;
    stroke: #2563eb;
    stroke-width: 3;
    opacity: 0.9;
  }
  .xq-cannon-target-line {
    stroke: #2563eb;
    stroke-width: 7;
    stroke-linecap: round;
    opacity: 0.26;
  }
  .xq-cannon-target-badge { fill: #2563eb; stroke: #f5dca8; stroke-width: 1.5; }
  .xq-cannon-target-badge-text {
    fill: #fff;
    font-family: serif;
    font-size: 11px;
    font-weight: 700;
    text-anchor: middle;
    dominant-baseline: central;
    pointer-events: none;
  }
  .xq-hit { fill: transparent; cursor: pointer; }
`;

export function mountXiangqiSpike(root: HTMLElement): void {
  // Site nav so the fog skin (and other appearance) settings are reachable while
  // on this page. rerender() only replaces `root`, so the nav lives as a sibling
  // before it and survives re-renders; the theme observer injects Settings.
  if (root.parentElement && !document.querySelector('.site-nav')) {
    root.before(buildNav());
  }
  setBoardFamily('xiangqi');
  // Xiangqi pieces are baked into the SVG at render time, so a piece-set change
  // in Settings needs an explicit re-render (the fog/board-color skins hot-swap
  // via CSS, but the piece glyphs do not).
  if (!xqSpikeAppearanceBound) {
    xqSpikeAppearanceBound = true;
    window.addEventListener(xiangqiAppearanceChangedEvent, () => rerender());
  }

  // Auto-load a tuned-vs-tuned game so the triptych lands on real positions
  // immediately. Cursor at 0 = initial position; step forward to walk through.
  const history = runBotGame('hand-tuned', 'hand-tuned');
  active = { root, state: { ...freshState(), history, cursor: 0 } };
  rerender();
}
