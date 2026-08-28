// /feed: the full announcement history as a dated feed, the landing rail's
// News box "More" target. Mirrors lichess's updates-feed page shape: one
// entry per update with date, headline, and the short body line.
import './news-page.css';
import { localizeAnnouncement } from './announcement-i18n.js';
import { type Announcement, announcements } from './announcements.js';
import { t } from './i18n/catalog.js';
import { currentLocale, type Locale, localizedHref } from './i18n/locale.js';
import { formatAnnouncementDate } from './landing-announcements.js';
import { buildNav } from './site-shell.js';
import { buildStaticPageLayout } from './static-page-shell.js';
import { rulesHrefPublicSurfaceEnabled } from './variant-public-surfaces.js';

export function buildNewsPage(locale: Locale = currentLocale()): HTMLElement {
  const section = document.createElement('section');
  section.className = 'site-section news-page';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = t('news.feedHeading', {}, locale);
  section.append(heading);

  const intro = document.createElement('p');
  intro.className = 'news-page-intro';
  intro.append(`${t('news.intro', {}, locale)} `);
  // The archive is the only page that names the RSS document; the <link
  // rel="alternate"> in the shell is for readers, not for people.
  const subscribe = document.createElement('a');
  subscribe.className = 'news-page-subscribe';
  subscribe.href = '/feed.xml';
  subscribe.textContent = t('news.subscribe', {}, locale);
  intro.append(subscribe);
  section.append(intro);

  // Pure reverse-chronological: pinning is a rail concern, not a history one.
  const entries = [...announcements()]
    .filter((entry) => rulesHrefPublicSurfaceEnabled(entry.href))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'news-page-empty';
    empty.textContent = t('news.empty', {}, locale);
    section.append(empty);
    return section;
  }

  const list = document.createElement('ol');
  list.className = 'news-page-list';
  for (const source of entries) {
    const entry = localizeAnnouncement(source, locale);
    const item = document.createElement('li');
    item.className = 'news-page-entry';

    const date = document.createElement('time');
    date.className = 'news-page-date';
    date.dateTime = entry.date;
    date.textContent = formatAnnouncementDate(entry.date, true, locale);

    const body = document.createElement('div');
    body.className = 'news-page-body';

    const headline = document.createElement('p');
    headline.className = 'news-page-headline';
    headline.textContent = entry.headline;
    body.append(headline);

    if (entry.body || entry.href) {
      const text = document.createElement('p');
      text.className = 'news-page-text';
      if (entry.body) text.append(`${entry.body} `);
      if (entry.href) {
        const isExternal = /^https?:/.test(entry.href);
        const link = document.createElement('a');
        link.className = 'news-page-link';
        link.href = isExternal ? entry.href : localizedHref(entry.href, locale);
        link.textContent = announcementCtaLabel(entry, locale);
        if (isExternal) {
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
        text.append(link);
      }
      body.append(text);
    }

    item.append(date, body);
    list.append(item);
  }
  section.append(list);

  return section;
}

function announcementCtaLabel(entry: Announcement, locale: Locale): string {
  return entry.cta ?? t('news.readMore', {}, locale);
}

/** Build-time shell for /feed (prerender-articles.mjs). The archive is a static
 *  list of authored copy with no per-account or live data in it, so the baked
 *  DOM is the same page a reader gets; the SPA still takes over on boot. Without
 *  this the route served a bare shell, which is not worth the sitemap entry it
 *  now has. */
export function renderNewsShellForPrerender(): string {
  return `${buildNav().outerHTML}${buildStaticPageLayout('news', buildNewsPage()).outerHTML}`;
}
