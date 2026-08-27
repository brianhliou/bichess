// Verified player titles (flair), the client half of the title-verification
// pipeline. HAND-MAINTAINED MIRROR of the server vocabulary in
// apps/server/src/persistence-titles.ts (the web workspace cannot import
// server code) and of the CHECK constraints in
// apps/server/migrations/088_user_titles.sql: when a title is added or removed
// there, update this list too. Unknown values are dropped fail-closed here (no
// badge is rendered for a title the client does not know).
//
// Display is the uppercase abbreviation (XGM, GM, ...) in gold, lichess-style;
// the localized full name rides the tooltip / accessible label.

import './title-badge.css';
import { type I18nKey, t } from './i18n/catalog.js';
import { currentLocale, type Locale } from './i18n/locale.js';

export const PLAYER_TITLES = [
  // Xiangqi (WXF/CXA style)
  'xgm',
  'xim',
  'xnm',
  'xwgm',
  'xwim',
  // Chess (FIDE)
  'gm',
  'im',
  'fm',
  'cm',
  'wgm',
  'wim',
  'wfm',
  'wcm',
] as const;

export type PlayerTitle = (typeof PLAYER_TITLES)[number];

export function isPlayerTitle(value: unknown): value is PlayerTitle {
  return typeof value === 'string' && (PLAYER_TITLES as readonly string[]).includes(value);
}

// Titles a player can currently REQUEST at /verify-title. Both families are
// open: xiangqi titles verify against WXF/CXA records, chess titles against a
// FIDE ID. Mirror of REQUESTABLE_PLAYER_TITLES in
// apps/server/src/persistence-titles.ts.
export const REQUESTABLE_PLAYER_TITLES: readonly PlayerTitle[] = PLAYER_TITLES;

const TITLE_NAME_KEYS: Record<PlayerTitle, I18nKey> = {
  xgm: 'title.xgm',
  xim: 'title.xim',
  xnm: 'title.xnm',
  xwgm: 'title.xwgm',
  xwim: 'title.xwim',
  gm: 'title.gm',
  im: 'title.im',
  fm: 'title.fm',
  cm: 'title.cm',
  wgm: 'title.wgm',
  wim: 'title.wim',
  wfm: 'title.wfm',
  wcm: 'title.wcm',
};

export function titleAbbr(title: PlayerTitle): string {
  return title.toUpperCase();
}

export function titleFullName(title: PlayerTitle, locale: Locale = currentLocale()): string {
  return t(TITLE_NAME_KEYS[title], {}, locale);
}

// Put the badge in front of a name, the one way every list of people on the
// site renders a title. Callers that hold a name element append the badge
// themselves; this exists so a new surface does not become another inline copy
// of the same three lines.
//
// The badge goes INSIDE the name link, lichess-style, so a titled player reads
// as "XGM Alice" rather than a badge floating beside the row. Give the name its
// own span when a test or a style needs the handle without the abbreviation
// glued to it.
export function prependTitleBadge(
  parent: HTMLElement,
  title: unknown,
  locale: Locale = currentLocale(),
): void {
  const badge = buildTitleBadge(title, locale);
  if (badge) parent.append(badge);
}

// The compact gold abbreviation badge (h1 lead on the profile, name lead on the
// user card). Returns null for unknown values so callers can pass wire data
// straight through without re-validating.
export function buildTitleBadge(
  title: unknown,
  locale: Locale = currentLocale(),
): HTMLElement | null {
  if (!isPlayerTitle(title)) return null;
  const badge = document.createElement('span');
  badge.className = 'title-badge';
  badge.textContent = titleAbbr(title);
  badge.title = titleFullName(title, locale);
  badge.setAttribute('aria-label', titleFullName(title, locale));
  return badge;
}
