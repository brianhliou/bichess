// /thanks: a thank-you page (lichess's /thanks equivalent), stubbed for now.
// Credits the players/contributors and the open-source projects Mistboard builds
// on, and points at the source code page for the full library list.

import { t } from './i18n/catalog.js';
import { currentLocale, type Locale } from './i18n/locale.js';
import { buildNav } from './site-shell.js';
import {
  proseHeading,
  proseLink,
  proseParagraph,
  proseSection,
  proseSubheading,
} from './static-page-dom.js';
import { buildStaticPageLayout } from './static-page-shell.js';

export function mountThanks(root: HTMLElement): void {
  const locale = currentLocale();
  root.replaceChildren();
  root.classList.add('landing-page', 'thanks-route');
  root.append(buildNav(locale), buildStaticPageLayout('thanks', buildThanks(locale), locale));
}

function buildThanks(locale: Locale = currentLocale()): HTMLElement {
  const section = proseSection('thanks-section');
  section.append(
    proseHeading(t('thanks.heading', {}, locale)),
    proseParagraph([t('thanks.intro', {}, locale)]),

    proseSubheading(t('thanks.playersHeading', {}, locale)),
    proseParagraph([t('thanks.playersBody', {}, locale)]),

    proseSubheading(t('thanks.openSourceHeading', {}, locale)),
    proseParagraph([
      t('thanks.openSourcePrefix', {}, locale),
      proseLink(t('thanks.openSourceLink', {}, locale), '/source'),
      t('thanks.openSourceSuffix', {}, locale),
    ]),

    proseParagraph([t('thanks.stubNote', {}, locale)]),
  );
  return section;
}
