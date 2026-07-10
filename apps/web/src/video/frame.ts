// Compose one shot into a full-canvas SVG string: dark stage, centered board
// (the product renderer, so videos and the site are pixel-siblings), plus the
// video-only overlay layers (glow/dim, rays, region, red flash, moving piece).
// Pure string work; rasterization lives in raster.ts.

import type {
  StandardXiangqiPlayerView,
  XiangqiGameState,
  XiangqiMove,
  XiangqiSquare,
} from '@mistboard/game';
import { getLegalMovesFrom } from '@mistboard/game';
import { xiangqiBoardSvg } from '../xiangqi-board.js';
import { renderXiangqiPiece } from '../xiangqi-pieces.js';
import {
  BOARD_FILES,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CELL,
  lerpPoint,
  MARGIN,
  PIECE_SIZE,
  RIVER_BOTTOM,
  RIVER_TOP,
  squareCenter,
} from './geometry.js';
import type { ScenePlan, VideoRegion } from './manifest.js';
import { VIDEO_BOARD_STYLE } from './theme.js';
import type { Shot } from './timeline.js';

export function renderShotSvg(plan: ScenePlan, shot: Shot): string {
  const perspective = plan.perspective ?? 'red';
  const raysMoves = shot.overlays.raysFrom ? raysFor(shot, shot.overlays.raysFrom) : [];

  const view: StandardXiangqiPlayerView = {
    id: 'video',
    perspective,
    board: shot.board,
    legalMoves: raysMoves,
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    ...(shot.lastMove ? { lastMove: shot.lastMove } : {}),
  };

  let boardSvg = xiangqiBoardSvg(view, perspective, {
    interactive: false,
    selectedSquare: shot.overlays.raysFrom,
    draggingFrom: null,
    arrows: shot.overlays.arrows.map((arrow) => ({
      from: arrow.from,
      to: arrow.to,
      ...(arrow.dashed !== undefined ? { dashed: arrow.dashed } : {}),
    })),
  });

  // Inner <svg> needs explicit dimensions so the outer transform scales it.
  boardSvg = boardSvg.replace(
    '<svg class="xq-live-svg"',
    `<svg class="xq-live-svg" width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}"`,
  );
  boardSvg = injectBeforeClose(boardSvg, overlayMarkup(shot, perspective));

  const scale = (plan.height * 0.92) / BOARD_HEIGHT;
  const tx = (plan.width - BOARD_WIDTH * scale) / 2;
  const ty = (plan.height - BOARD_HEIGHT * scale) / 2;

  return [
    `<svg width="${plan.width}" height="${plan.height}" viewBox="0 0 ${plan.width} ${plan.height}" xmlns="http://www.w3.org/2000/svg">`,
    `<style>${VIDEO_BOARD_STYLE}</style>`,
    `<rect x="0" y="0" width="${plan.width}" height="${plan.height}" fill="${plan.background}"/>`,
    `<g transform="translate(${round2(tx)} ${round2(ty)}) scale(${round2(scale)})">`,
    boardSvg,
    `</g>`,
    `</svg>`,
  ].join('');
}

/** Video overlays live in board viewBox coordinates, injected inside the board
 *  SVG so one transform moves everything together. */
function overlayMarkup(shot: Shot, perspective: 'red' | 'black'): string {
  const parts: string[] = [];
  const { overlays, moving } = shot;

  if (overlays.region) parts.push(regionRect(overlays.region, perspective));

  if (overlays.points.length > 0) {
    for (const square of overlays.points) {
      const center = squareCenter(square, perspective);
      parts.push(
        overlays.pointsCapture
          ? `<circle class="xq-live-hint-capture" cx="${center.x}" cy="${center.y}" r="28"/>`
          : `<circle class="xq-live-hint-dot" cx="${center.x}" cy="${center.y}" r="7"/>`,
      );
    }
  }

  if (overlays.glow.length > 0) {
    if (overlays.dimOthers) {
      parts.push(
        `<rect class="xqv-dim" x="0" y="0" width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}" rx="16"/>`,
      );
      // Re-draw the spotlit pieces above the wash.
      for (const square of overlays.glow) {
        const piece = shot.board[square];
        if (!piece) continue;
        const center = squareCenter(square, perspective);
        parts.push(
          renderXiangqiPiece(piece, {
            x: center.x - PIECE_SIZE / 2,
            y: center.y - PIECE_SIZE / 2,
            size: PIECE_SIZE,
            className: 'xq-piece',
          }),
        );
      }
    }
    for (const square of overlays.glow) {
      const center = squareCenter(square, perspective);
      parts.push(`<circle class="xqv-glow-ring" cx="${center.x}" cy="${center.y}" r="31"/>`);
    }
  }

  if (overlays.flash) {
    const from = squareCenter(overlays.flash.from, perspective);
    const to = squareCenter(overlays.flash.to, perspective);
    parts.push(`<circle class="xqv-flash-ring" cx="${from.x}" cy="${from.y}" r="31"/>`);
    parts.push(`<circle class="xqv-flash-ring" cx="${to.x}" cy="${to.y}" r="31"/>`);
    parts.push(flashArrow(from, to));
  }

  if (moving) {
    const from = squareCenter(moving.from, perspective);
    const to = squareCenter(moving.to, perspective);
    const at = lerpPoint(from, to, moving.t);
    parts.push(
      renderXiangqiPiece(moving.piece, {
        x: at.x - PIECE_SIZE / 2,
        y: at.y - PIECE_SIZE / 2,
        size: PIECE_SIZE,
        className: 'xq-piece',
      }),
    );
  }

  return parts.length > 0 ? `<g class="xqv-overlays">${parts.join('')}</g>` : '';
}

function regionRect(region: VideoRegion, perspective: 'red' | 'black'): string {
  if (region === 'river') {
    return `<rect class="xqv-region" x="${MARGIN - 18}" y="${RIVER_TOP}" width="${BOARD_WIDTH - (MARGIN - 18) * 2}" height="${RIVER_BOTTOM - RIVER_TOP}" rx="8"/>`;
  }
  if (region === 'palace-red' || region === 'palace-black') {
    const ranks: [number, number] = region === 'palace-red' ? [1, 3] : [8, 10];
    const a = squareCenter(`d${ranks[0]}` as XiangqiSquare, perspective);
    const b = squareCenter(`f${ranks[1]}` as XiangqiSquare, perspective);
    const pad = 14;
    return `<rect class="xqv-region" x="${Math.min(a.x, b.x) - pad}" y="${Math.min(a.y, b.y) - pad}" width="${Math.abs(b.x - a.x) + pad * 2}" height="${Math.abs(b.y - a.y) + pad * 2}" rx="8"/>`;
  }
  const fileIndex = Math.max(0, BOARD_FILES.indexOf(region.file));
  const x = MARGIN + fileIndex * CELL;
  return `<rect class="xqv-region" x="${x - 20}" y="${MARGIN - 20}" width="40" height="${BOARD_HEIGHT - (MARGIN - 20) * 2}" rx="8"/>`;
}

function flashArrow(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return '';
  const ux = dx / dist;
  const uy = dy / dist;
  const startX = a.x + ux * 34;
  const startY = a.y + uy * 34;
  const tipX = b.x - ux * 36;
  const tipY = b.y - uy * 36;
  const baseX = tipX - ux * 18;
  const baseY = tipY - uy * 18;
  const px = -uy;
  const py = ux;
  return (
    `<g class="xqv-flash-arrow" opacity="0.9">` +
    `<line x1="${round2(startX)}" y1="${round2(startY)}" x2="${round2(baseX)}" y2="${round2(baseY)}" stroke-width="8" stroke-linecap="round"/>` +
    `<polygon points="${round2(tipX)},${round2(tipY)} ${round2(baseX + px * 10)},${round2(baseY + py * 10)} ${round2(baseX - px * 10)},${round2(baseY - py * 10)}" stroke="none"/>` +
    `</g>`
  );
}

/** Pseudo-legal destinations from the FoW kernel: works on sparse demo boards
 *  (no general required), which is exactly what explainer scenes are. */
function raysFor(shot: Shot, square: XiangqiSquare): XiangqiMove[] {
  const piece = shot.board[square];
  if (!piece) return [];
  const state: XiangqiGameState = {
    id: 'video-rays',
    board: shot.board,
    status: { type: 'playing', turn: piece.color },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  return getLegalMovesFrom(state, square);
}

function injectBeforeClose(svg: string, markup: string): string {
  if (!markup) return svg;
  const at = svg.lastIndexOf('</svg>');
  if (at === -1) throw new Error('board svg had no closing tag');
  return `${svg.slice(0, at)}${markup}${svg.slice(at)}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
