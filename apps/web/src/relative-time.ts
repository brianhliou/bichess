// Dates and "10 days ago", in the reader's chosen locale.
//
// Two bugs live in the naive versions of these, and both were shipping on the
// forum:
//
//   `${days} day${days === 1 ? '' : 's'} ago` is English pluralisation written
//   out by hand. It cannot be translated by a catalog key either, because the
//   plural rules differ per language; Intl.RelativeTimeFormat is what knows them.
//
//   `toLocaleString(undefined, …)` follows the BROWSER's locale, not the site's.
//   A reader who picked Chinese on an English-language browser kept getting
//   "Sep 6, 2026, 10:25 AM" in the tooltip under text they had just translated.
//   The site locale is a decision the reader made here and it outranks the
//   browser's.
//
// study-index.ts, following.ts, inbox.ts and landing-announcements.ts each carry
// a correct narrow-style copy of `timeAgo`. They are not migrated here only
// because folding them in would change how those surfaces read, which is a
// visual decision and not this module's to make.

import { currentLocale, LOCALE_META } from './i18n/locale.js';

function dateLocale(): string {
  return LOCALE_META[currentLocale()].dateLocale;
}

/**
 * How long ago, as a phrase.
 *
 * `numeric: 'auto'` is what turns "1 day ago" into "yesterday" (and 昨天) where
 * the language prefers it; `style` picks the compact form ("15d ago") or the
 * long one ("15 days ago").
 */
export function timeAgo(iso: string, style: 'long' | 'narrow' = 'long'): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return formatDate(iso);
  const rtf = new Intl.RelativeTimeFormat(dateLocale(), { numeric: 'auto', style });
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return rtf.format(0, 'second');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(-days, 'day');
  if (days < 365) return rtf.format(-Math.round(days / 30), 'month');
  return rtf.format(-Math.round(days / 365), 'year');
}

/** A calendar date: "Sep 6, 2026" / "2026年9月6日". */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleDateString(dateLocale(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** A date and a clock time, for the exact timestamp behind a relative one. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}
