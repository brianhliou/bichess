// The homepage News box marks each row with a xiangqi-style disc: the
// international piece set's cream disc and inked ring (xiangqi-piece-sets.ts,
// internationalDiscMark) carrying a filled ink mark instead of a character.
//
// The marks are a house set drawn for a 36px disc, in the same 100-unit box
// the piece art uses: filled silhouettes, no strokes thinner than 4 units, so
// they still read once the box halves them. Line icons at this size are what
// the box shipped with before, and they read as a ring with a smudge in it.
//
// One mark per kind, and the ink alternates so a run of releases does not
// read as one long red column: red for things to use (release, update),
// black for things to read (article, status).

import type { AnnouncementKind } from './announcements.js';

export type NewsDiscMark = 'horn' | 'scroll' | 'spark' | 'lantern';
export type NewsDiscInk = 'red' | 'black';

// Same hexes as the international set's disc and rings, so a marker beside a
// board on the homepage is visibly the same object.
const CREAM = '#fef0d7';
const INK: Record<NewsDiscInk, string> = { red: '#c30d0d', black: '#202427' };

export function newsDiscMarkForKind(kind: AnnouncementKind): NewsDiscMark {
  switch (kind) {
    case 'release':
      return 'horn';
    case 'article':
      return 'scroll';
    case 'update':
      return 'spark';
    case 'status':
      return 'lantern';
  }
}

export function newsDiscInkForKind(kind: AnnouncementKind): NewsDiscInk {
  switch (kind) {
    case 'release':
    case 'update':
      return 'red';
    case 'article':
    case 'status':
      return 'black';
  }
}

const MARKS: Record<NewsDiscMark, (ink: string) => string> = {
  // A horn: flared bell, mouthpiece, and two sound arcs.
  horn: (ink) =>
    `<path d="M30 42 L58 30 L58 70 L30 58 Z" fill="${ink}"/>` +
    `<rect x="22" y="43" width="9" height="14" rx="2.5" fill="${ink}"/>` +
    `<rect x="34" y="57" width="10" height="14" rx="2" fill="${ink}"/>` +
    `<path d="M64 38 A16 16 0 0 1 64 62" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M72 31 A26 26 0 0 1 72 69" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`,
  // A scroll: rolled edge on the left, three lines of text cut out.
  scroll: (ink) =>
    `<rect x="28" y="26" width="44" height="48" rx="5" fill="${ink}"/>` +
    `<rect x="24" y="26" width="10" height="48" rx="5" fill="${ink}"/>` +
    `<rect x="42" y="38" width="22" height="5" rx="2.5" fill="${CREAM}"/>` +
    `<rect x="42" y="49" width="22" height="5" rx="2.5" fill="${CREAM}"/>` +
    `<rect x="42" y="60" width="14" height="5" rx="2.5" fill="${CREAM}"/>`,
  // A spark: one four-point star and a smaller companion.
  spark: (ink) =>
    `<path d="M46 22 C48 40 52 44 70 46 C52 48 48 52 46 70 C44 52 40 48 22 46 C40 44 44 40 46 22 Z" fill="${ink}"/>` +
    `<path d="M70 60 C71 66 72 67 78 68 C72 69 71 70 70 76 C69 70 68 69 62 68 C68 67 69 66 70 60 Z" fill="${ink}"/>`,
  // A lantern: cap, round body with two ribs cut out, base and tassel. The
  // first draft also cut a horizontal band across the body, which at 36px
  // turned the body into a grid; the ribs alone say lantern.
  lantern: (ink) =>
    `<rect x="39" y="21" width="22" height="7" rx="2.5" fill="${ink}"/>` +
    `<ellipse cx="50" cy="48" rx="22" ry="20" fill="${ink}"/>` +
    `<rect x="41" y="67" width="18" height="6" rx="2" fill="${ink}"/>` +
    `<rect x="46.5" y="73" width="7" height="9" rx="2" fill="${ink}"/>` +
    `<path d="M41 33 V63 M59 33 V63" fill="none" stroke="${CREAM}" stroke-width="3.2" stroke-linecap="round"/>`,
};

export function newsDiscSvg(kind: AnnouncementKind): string {
  const mark = newsDiscMarkForKind(kind);
  const ink = INK[newsDiscInkForKind(kind)];
  return (
    `<svg class="landing-news-disc landing-news-disc-${mark}" viewBox="0 0 100 100" aria-hidden="true" focusable="false" data-mark="${mark}">` +
    `<circle cx="50" cy="50" r="46" fill="${CREAM}" stroke="${ink}" stroke-width="2.8"/>` +
    MARKS[mark](ink) +
    '</svg>'
  );
}

// The timeline's terminal disc: three dots in black ink, the row that leads
// to the full archive on /feed.
export function newsMoreDiscSvg(): string {
  const ink = INK.black;
  return (
    '<svg class="landing-news-disc landing-news-disc-more" viewBox="0 0 100 100" aria-hidden="true" focusable="false" data-mark="more">' +
    `<circle cx="50" cy="50" r="46" fill="${CREAM}" stroke="${ink}" stroke-width="2.8"/>` +
    `<circle cx="30" cy="50" r="6.5" fill="${ink}"/><circle cx="50" cy="50" r="6.5" fill="${ink}"/><circle cx="70" cy="50" r="6.5" fill="${ink}"/>` +
    '</svg>'
  );
}

function parseSvg(markup: string): SVGSVGElement {
  // Constant markup with no user input, so a template parse is safe here.
  const template = document.createElement('template');
  template.innerHTML = markup;
  const svg = template.content.firstElementChild;
  if (!(svg instanceof SVGSVGElement)) throw new Error('news disc did not parse as svg');
  return svg;
}

export function buildNewsDisc(kind: AnnouncementKind): SVGSVGElement {
  return parseSvg(newsDiscSvg(kind));
}

export function buildNewsMoreDisc(): SVGSVGElement {
  return parseSvg(newsMoreDiscSvg());
}
