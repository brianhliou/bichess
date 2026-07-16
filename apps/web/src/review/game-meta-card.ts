// Shared game meta card (lichess/playstrategy-style), used by the live room's
// left rail AND the review pages' left rail so both surfaces read identically:
//
//   [glyph]  5+0 • Casual • Xiangqi
//            3 days ago
//   ● red player (2203)
//   ○ black player (2166)
//   ─────────────────────────────
//   Black resigned • Red is victorious
//
// The card is stateful for the room: setStatus swaps the bottom line between
// pregame / live / finished copy, and setPlayers re-renders the player rows as
// seats fill. Every field is plain data — no variant coupling.

import './game-meta-card.css';
import { renderVariantMarker } from '../variant-markers.js';
import type { VariantMiniId } from '../variant-mini-boards.js';

export type GameMetaPlayer = {
  /** Seat color id (e.g. 'red' | 'black' | 'white'). Drives the disc tint. */
  color: string;
  name: string;
  rating?: number | null;
  /** Engine/bot seats get a small BOT tag (playstrategy-style). */
  isEngine?: boolean;
};

export type GameMetaCardConfig = {
  /** Finalized variant marker for the icon box (the site-wide icon language:
   *  picker, watch rail, puzzles, profile). Wins over `glyph` when set. */
  markerId?: VariantMiniId;
  /** Variant glyph for the icon box (e.g. '象', '♔', '☗', '虎'). Fallback for
   *  variants without a finalized marker. */
  glyph?: string;
  /** "5+0 • Casual" style segments; falsy segments are skipped. */
  headline: Array<string | null | undefined>;
  /** Accented trailing headline segment (the variant name). */
  variantName?: string;
  /** Subline under the headline (e.g. "3 days ago", "Waiting for opponent"). */
  subline?: string | null;
  players?: GameMetaPlayer[];
  /** Bottom line under the divider (result / status). Hidden when absent. */
  status?: string | null;
};

export type GameMetaCard = {
  el: HTMLElement;
  setSubline(text: string | null): void;
  setPlayers(players: GameMetaPlayer[]): void;
  setStatus(text: string | null): void;
};

// Colors whose player disc renders dark; everything else renders light. Chess
// white/black and xiangqi red/black both map correctly.
const DARK_COLORS = new Set(['black', 'blue']);

// Seat-disc tint. 'red' gets a filled RED disc (so red-vs-black variants — xiangqi,
// jungle, fortress, banqi, jieqi, … — read as red/black, not hollow/black); dark
// inks fill dark; everything else (white) is the hollow light disc.
function discToneClass(color: string): string {
  if (color === 'red') return 'game-meta-card__disc--red';
  return DARK_COLORS.has(color) ? 'game-meta-card__disc--dark' : 'game-meta-card__disc--light';
}

export function createGameMetaCard(config: GameMetaCardConfig): GameMetaCard {
  const el = document.createElement('section');
  el.className = 'game-meta-card';

  const head = document.createElement('div');
  head.className = 'game-meta-card__head';
  if (config.markerId) {
    const icon = document.createElement('span');
    icon.className = 'game-meta-card__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = renderVariantMarker(config.markerId, { size: 40 });
    head.append(icon);
  } else if (config.glyph) {
    const icon = document.createElement('span');
    icon.className = 'game-meta-card__icon';
    icon.textContent = config.glyph;
    icon.setAttribute('aria-hidden', 'true');
    head.append(icon);
  }
  const headText = document.createElement('div');
  headText.className = 'game-meta-card__head-text';
  const headline = document.createElement('p');
  headline.className = 'game-meta-card__headline';
  const segments = config.headline.filter((segment): segment is string => Boolean(segment));
  headline.append(document.createTextNode(segments.join(' • ')));
  if (config.variantName) {
    if (segments.length > 0) headline.append(document.createTextNode(' • '));
    const variant = document.createElement('span');
    variant.className = 'game-meta-card__variant';
    variant.textContent = config.variantName;
    headline.append(variant);
  }
  const subline = document.createElement('p');
  subline.className = 'game-meta-card__subline';
  headText.append(headline, subline);
  head.append(headText);

  const playersEl = document.createElement('div');
  playersEl.className = 'game-meta-card__players';

  const statusEl = document.createElement('p');
  statusEl.className = 'game-meta-card__status';

  el.append(head, playersEl, statusEl);

  function setSubline(text: string | null): void {
    subline.textContent = text ?? '';
    subline.hidden = !text;
  }

  function setPlayers(players: GameMetaPlayer[]): void {
    playersEl.replaceChildren();
    playersEl.hidden = players.length === 0;
    for (const player of players) {
      const row = document.createElement('div');
      row.className = 'game-meta-card__player';
      const disc = document.createElement('span');
      disc.className = `game-meta-card__disc ${discToneClass(player.color)}`;
      disc.setAttribute('aria-hidden', 'true');
      row.append(disc);
      if (player.isEngine) {
        const bot = document.createElement('span');
        bot.className = 'game-meta-card__bot';
        bot.textContent = 'BOT';
        row.append(bot);
      }
      const name = document.createElement('span');
      name.className = 'game-meta-card__name';
      name.textContent = player.name;
      name.title = player.name;
      row.append(name);
      if (player.rating !== null && player.rating !== undefined) {
        const rating = document.createElement('span');
        rating.className = 'game-meta-card__rating';
        rating.textContent = `(${player.rating})`;
        row.append(rating);
      }
      playersEl.append(row);
    }
  }

  function setStatus(text: string | null): void {
    statusEl.textContent = text ?? '';
    statusEl.hidden = !text;
  }

  setSubline(config.subline ?? null);
  setPlayers(config.players ?? []);
  setStatus(config.status ?? null);

  return { el, setSubline, setPlayers, setStatus };
}

/** "3 days ago" style relative label for a past timestamp; empty on bad input. */
export function timeAgoLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
