// /streamer: the public streamers directory (lichess.org/streamer equivalent).
// A basic scaffold for now: an empty-state directory sharing the site shell
// chrome. There is no streamer backend yet, so this renders a static heading +
// empty state until live listings are wired in.

import './streamer.css';
import { t } from './i18n/catalog.js';
import { currentLocale } from './i18n/locale.js';
import { buildNav } from './site-shell.js';

export function mountStreamer(root: HTMLElement): void {
  const locale = currentLocale();
  root.replaceChildren();
  root.classList.add('landing-page', 'streamer-route');

  const shell = document.createElement('main');
  shell.className = 'site-section streamer-shell';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = t('streamer.heading', {}, locale);

  const intro = document.createElement('p');
  intro.className = 'streamer-intro';
  intro.textContent = t('streamer.intro', {}, locale);

  const empty = document.createElement('p');
  empty.className = 'streamer-empty';
  empty.textContent = t('streamer.empty', {}, locale);

  shell.append(heading, intro, empty);
  root.append(buildNav(locale), shell);
}
