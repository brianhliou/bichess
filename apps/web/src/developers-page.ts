// /developers: how to put a Mistboard board in someone else's page.
//
// The page documents one thing, because one thing exists: a study chapter is
// frameable at /embed/study/:studyId/:chapterId, and we are an oEmbed provider
// for it. Everything here is imported from @mistboard/game rather than retyped,
// so the snippet a developer copies and the limits the prose states cannot drift
// from what the server actually does.
//
// The live example at the top is the same widget the champions article uses. It
// is here so the page proves the claim instead of describing it, and so a broken
// embed is visible on the page whose whole job is to say the embed works.

import {
  EMBED_DEFAULT_HEIGHT,
  EMBED_DEFAULT_WIDTH,
  EMBED_MAX_WIDTH,
  EMBED_MIN_WIDTH,
  embedHeightForWidth,
  embedStudyPath,
  OEMBED_ENDPOINT,
} from '@mistboard/game';
import { currentLocale, type Locale } from './i18n/locale.js';
import { buildNav } from './site-shell.js';
import {
  proseExternalLink,
  proseHeading,
  proseLink,
  proseParagraph,
  proseSection,
  proseSubheading,
} from './static-page-dom.js';
import { buildStaticPageLayout } from './static-page-shell.js';

// The chapter shown in the live example and in every snippet on the page. A
// real, public chapter on purpose: a reader can paste the snippet unchanged and
// watch it work before adapting it.
const EXAMPLE_STUDY = 'ytSzepET';
const EXAMPLE_CHAPTER = 'Ue0EgpS7';

export function siteOrigin(): string {
  return typeof window === 'undefined' ? 'https://mistboard.com' : window.location.origin;
}

export function exampleEmbedUrl(origin = siteOrigin()): string {
  return `${origin}${embedStudyPath(EXAMPLE_STUDY, EXAMPLE_CHAPTER)}`;
}

export function exampleStudyUrl(origin = siteOrigin()): string {
  return `${origin}/study/${EXAMPLE_STUDY}/${EXAMPLE_CHAPTER}`;
}

/** The snippet the page tells people to copy. Exported so a test can parse it. */
export function embedSnippet(origin = siteOrigin()): string {
  return [
    `<iframe src="${exampleEmbedUrl(origin)}"`,
    `        width="${EMBED_DEFAULT_WIDTH}" height="${EMBED_DEFAULT_HEIGHT}"`,
    '        frameborder="0" loading="lazy"',
    '        style="max-width:100%;border:0"',
    '        title="Every Xiangqi Champion"></iframe>',
  ].join('\n');
}

export function oembedRequestUrl(origin = siteOrigin()): string {
  return `${origin}${OEMBED_ENDPOINT}?url=${encodeURIComponent(exampleStudyUrl(origin))}`;
}

function codeBlock(text: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'developers-code';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = text;
  pre.append(code);

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'developers-copy';
  copy.textContent = 'Copy';
  copy.addEventListener('click', () => {
    // Clipboard access can be denied, and a button that silently does nothing is
    // worse than one that says so.
    navigator.clipboard?.writeText(text).then(
      () => {
        copy.textContent = 'Copied';
        window.setTimeout(() => {
          copy.textContent = 'Copy';
        }, 1600);
      },
      () => {
        copy.textContent = 'Press ctrl+C';
      },
    );
  });

  wrap.append(pre, copy);
  return wrap;
}

function liveExample(): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'developers-example';

  const frame = document.createElement('iframe');
  frame.src = embedStudyPath(EXAMPLE_STUDY, EXAMPLE_CHAPTER);
  frame.width = String(EMBED_DEFAULT_WIDTH);
  frame.height = String(EMBED_DEFAULT_HEIGHT);
  frame.loading = 'lazy';
  frame.title = 'Every Xiangqi Champion, chapter one';
  frame.setAttribute('frameborder', '0');
  figure.append(frame);

  const caption = document.createElement('figcaption');
  caption.textContent = 'This is an iframe, running the snippet below.';
  figure.append(caption);

  return figure;
}

function sizingTable(): HTMLElement {
  const rows: Array<[string, string]> = [
    ['Default', `${EMBED_DEFAULT_WIDTH} x ${EMBED_DEFAULT_HEIGHT}`],
    ['Narrowest', `${EMBED_MIN_WIDTH} x ${embedHeightForWidth(EMBED_MIN_WIDTH)}`],
    ['Widest', `${EMBED_MAX_WIDTH} x ${embedHeightForWidth(EMBED_MAX_WIDTH)}`],
  ];

  const table = document.createElement('table');
  table.className = 'developers-table';
  const body = document.createElement('tbody');
  for (const [label, value] of rows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = label;
    const td = document.createElement('td');
    td.textContent = value;
    tr.append(th, td);
    body.append(tr);
  }
  table.append(body);
  return table;
}

function buildDevelopers(_locale: Locale = currentLocale()): HTMLElement {
  const section = proseSection('developers-section');
  const origin = siteOrigin();

  section.append(
    proseHeading('Developers'),
    proseParagraph([
      'Any public study chapter on Mistboard can run inside your page: the board, the ' +
        'moves, the engine annotations, and the branches, with nothing to install and no ' +
        'API key. It is the same widget the articles on this site use.',
    ]),

    liveExample(),

    proseSubheading('Embed a chapter'),
    proseParagraph([
      'Copy this. Swap the two ids for the study and chapter you want, which are the ' +
        'last two segments of the study URL you are reading.',
    ]),
    codeBlock(embedSnippet(origin)),
    proseParagraph([
      'The page inside the frame carries no navigation, no footer, and no sign-in ' +
        'state. It renders the chapter and nothing else.',
    ]),

    proseSubheading('Sizing'),
    proseParagraph([
      `Give the frame whatever width suits your layout. ${EMBED_MIN_WIDTH}px is the ` +
        'narrowest the board and the move list can share, and anything wider than ' +
        `${EMBED_MAX_WIDTH}px stops being a board on a page and starts being the page. ` +
        'Keep the height proportional:',
    ]),
    sizingTable(),
    proseParagraph([
      'The style attribute in the snippet (max-width:100%) is what makes it behave on ' +
        'a phone, so keep it if your layout is fluid.',
    ]),

    proseSubheading('oEmbed'),
    proseParagraph([
      'If your platform speaks oEmbed, you do not need any of the above: paste a study ' +
        'link into WordPress, Ghost, Discourse or anything else that consumes the ' +
        'standard, and it will resolve the embed on its own. The provider endpoint is:',
    ]),
    codeBlock(`GET ${OEMBED_ENDPOINT}?url=<study or embed URL>&maxwidth=<optional>`),
    proseParagraph([
      'It accepts both the permalink a reader copies and the embed path itself, ' +
        'returns a rich type with an html field, and answers only for studies the ' +
        'public can already read. A maxwidth outside the range above is clamped rather ' +
        'than refused. Try it:',
    ]),
    codeBlock(oembedRequestUrl(origin)),

    proseSubheading('What you can embed'),
    proseParagraph([
      'Public studies only. The embed applies the same visibility rule as the rest of ' +
        'the site, so a private study is a 404 here exactly as it is everywhere else, ' +
        'and framing a chapter can never reveal one. Embed pages are the only ones ' +
        'another site may frame: everything else on Mistboard sends ' +
        'frame-ancestors self.',
    ]),
    proseParagraph([
      'Embeds are free and need no key. The frame does not run our analytics and ' +
        'never asks who the viewer is, so it issues no credentialed request from ' +
        'your page. It does keep board appearance (piece set, notation) in the ' +
        "viewer's own browser storage, which is why their preferences follow them " +
        'between embeds. If you are planning something at unusual scale, ',
      proseLink('get in touch', '/contact'),
      ' first.',
    ]),

    proseSubheading('Everything else'),
    proseParagraph([
      'Mistboard is AGPL-3.0 and the whole site is on ',
      proseExternalLink('GitHub', 'https://github.com/brianhliou/mistboard'),
      '. There is no general-purpose public API yet. If you want one, the ',
      proseLink('contact page', '/contact'),
      ' is the place to say what for, which is how this page came to exist.',
    ]),
  );

  return section;
}

export function mountDevelopers(root: HTMLElement): void {
  const locale = currentLocale();
  root.replaceChildren();
  root.classList.add('landing-page', 'developers-route');
  root.append(
    buildNav(locale),
    buildStaticPageLayout('developers', buildDevelopers(locale), locale),
  );
}
