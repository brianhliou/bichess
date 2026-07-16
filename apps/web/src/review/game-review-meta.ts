// Shared LEFT-COLUMN builder for every /game review page. The left rail is a pure
// function of the normalized postgame `game` envelope + the room id, so one helper
// produces the identical lichess-style stack across all variants:
//
//   [marker]  5+0 • Casual • Xiangqi
//             3 days ago
//   ● red player (2203)
//   ○ black player (2166)
//   ────────────────────────────────
//   Black resigned • Red is victorious      ← the caller-supplied `status`
//   ────────────────────────────────
//   Spectator room (buildSpectatorChat)
//
// The board-top/meta-card-top and board-bottom/spectator-bottom alignment is owned
// by the shared review scaffold (review-layout.ts); this module only fills the rail.
//
// `status` (the outcome line) stays caller-supplied because some variants phrase it
// with variant-specific knowledge the envelope doesn't carry — Flip Jungle and Half
// Xiangqi translate the recorded SEAT result into the bound ink via `firstColor`.
// Everything else (time control, casual/rated, time-ago, players, marker, spectator
// room) is plain envelope data and lives here so it can't drift between variants.

import type { VariantMiniId } from '../variant-mini-boards.js';
import { createGameMetaCard, type GameMetaPlayer, timeAgoLabel } from './game-meta-card.js';
import { type ReviewSeatColors, reviewColorForSeat } from './review-seat-colors.js';
import { buildSpectatorChat } from './spectator-chat.js';

/** A persisted postgame participant as the shared `postgameGameSummary` server
 *  builder emits it (see apps/server/src/routes/lib.ts). */
export type ReviewMetaPlayer = {
  color: string;
  name: string;
  rating?: number | null;
  kind?: 'account' | 'guest' | 'engine';
};

/** The subset of the postgame `game` envelope the meta card reads. Every variant
 *  that flows through `postgameGameSummary` supplies all of these. */
export type ReviewMetaGame = {
  roomId: string;
  rated?: boolean;
  initialMs?: number | null;
  incrementMs?: number | null;
  /** Some variant envelopes carry the clock nested (`game.timeControl`) instead of
   *  flat `initialMs`/`incrementMs`; the label reads either shape. Kept loose
   *  (`Record`) so callers can pass their whole `game` object without a cast. */
  timeControl?: Record<string, unknown> | null;
  endedAt?: string | null;
  players?: ReviewMetaPlayer[];
};

export type ReviewMetaConfig = {
  /** Finalized variant marker id (usually === GameSpecId; the crossroads pair maps
   *  spec → VariantMiniId, so translate before calling). */
  markerId?: VariantMiniId;
  /** Glyph fallback for variants without a finalized marker. */
  glyph?: string;
  /** Accented trailing headline segment, e.g. 'Xiangqi', 'Flip Jungle'. */
  variantName: string;
  game: ReviewMetaGame;
  /** Outcome line under the divider, e.g. 'Red wins by Checkmate'. Caller-computed
   *  so variant-specific result phrasing (seat→ink) stays with the variant. */
  status: string;
  /** Optional seat→ink binding for flip variants. Player order remains seat
   *  order, but each row's disc uses the color established by the opening flip. */
  seatColors?: ReviewSeatColors;
};

export type ReviewMeta = {
  /** Pass as `metaCard` to mountReviewLayout / createReviewScaffold. */
  metaCard: HTMLElement;
  /** Pass as `details` — the spectator-room panel below the meta card. */
  details: HTMLElement;
};

/** Build the standardized review left column (meta card + spectator room). */
export function buildReviewMeta(config: ReviewMetaConfig): ReviewMeta {
  const { game } = config;
  const card = createGameMetaCard({
    markerId: config.markerId,
    glyph: config.glyph,
    headline: [reviewTimeControlLabel(game), game.rated ? 'Rated' : 'Casual'],
    variantName: config.variantName,
    subline: timeAgoLabel(game.endedAt),
    players: reviewMetaPlayers(game.players, config.seatColors),
    status: config.status,
  });
  return { metaCard: card.el, details: buildSpectatorChat(game.roomId) };
}

/** Map persisted participants into meta-card player rows (engine → BOT tag). */
export function reviewMetaPlayers(
  players: ReviewMetaPlayer[] | undefined,
  seatColors?: ReviewSeatColors,
): GameMetaPlayer[] {
  return (players ?? []).map((player) => ({
    color:
      player.color === 'red' || player.color === 'black'
        ? reviewColorForSeat(player.color, seatColors)
        : player.color,
    name: player.name,
    rating: player.rating ?? null,
    isEngine: player.kind === 'engine',
  }));
}

/** "5:00+0" / "Untimed" from the envelope's millisecond time control. Reads the
 *  flat `initialMs`/`incrementMs` first, falling back to a nested `timeControl`
 *  object (the shape a few variant envelopes use). */
export function reviewTimeControlLabel(game: {
  initialMs?: number | null;
  incrementMs?: number | null;
  timeControl?: Record<string, unknown> | null;
}): string {
  const nested = (game.timeControl ?? null) as {
    initialMs?: number | null;
    incrementMs?: number | null;
  } | null;
  const initialMs = game.initialMs ?? nested?.initialMs ?? null;
  const incrementMs = game.incrementMs ?? nested?.incrementMs ?? null;
  if (initialMs === null && incrementMs === null) return 'Untimed';
  return `${clockLabel(initialMs ?? 0)}+${Math.round((incrementMs ?? 0) / 1000)}`;
}

/** Generic outcome word for the fixed-color variants (red/black/white + draw).
 *  Variants with seat-relative results (Flip Jungle, Flip Xiangqi) compute their
 *  own label from `firstColor` instead. */
export function reviewResultLabel(result: string): string {
  if (result === 'red-wins') return 'Red wins';
  if (result === 'black-wins') return 'Black wins';
  if (result === 'white-wins') return 'White wins';
  if (result === 'draw') return 'Draw';
  return labelize(result);
}

/** kebab/space token → Title Case, e.g. 'king-captured' → 'King Captured'. */
export function labelize(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function clockLabel(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
