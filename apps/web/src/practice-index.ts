// /practice — the front door for engine-adjudicated exercises.
//
// A curated shelf, not a directory: the server resolves a hardcoded catalogue
// (@mistboard/game practice-catalog.ts) and returns sections of cards in
// teaching order. This page's job is to render that shelf and get out of the way.
//
// Uses the SAME tile-map shell as /learn/xiangqi (tile-map.css): sticky sidebar
// with an emblem and a progress bar, letterspaced section headings, a grid of
// wide tiles with a folded corner ribbon. The two pages are the same kind of
// thing -- a shelf of sets you work through -- and lichess draws its /learn and
// /practice indexes the same way for the same reason. Building a second card
// language here would make two surfaces that do one job look like two products.
//
// Copy is English-only for now, like the /learn course it sits beside; it joins
// the i18n catalog in the same pass rather than being half-wired.

import type { XiangqiPieceRole } from '@mistboard/game';
import { buildNav } from './site-shell.js';
import { renderXiangqiPiece } from './xiangqi-pieces.js';
import './tile-map.css';
import './practice-index.css';

interface PracticeCardDto {
  slug: string;
  title: string;
  blurb: string;
  studyId: string;
  exerciseCount: number;
  solvedCount: number;
}

interface PracticeSectionDto {
  id: string;
  title: string;
  cards: PracticeCardDto[];
}

export function mountPracticeIndex(root: HTMLElement): void {
  root.classList.add('landing-page');
  root.replaceChildren(buildNav(), notice('Loading practice…'));
  void load()
    .then((sections) => render(root, sections))
    .catch(() => {
      root.replaceChildren(buildNav(), notice('Practice could not be loaded.'));
    });
}

async function load(): Promise<PracticeSectionDto[]> {
  const response = await fetch('/api/practice', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`practice ${response.status}`);
  const body = (await response.json()) as { sections: PracticeSectionDto[] };
  return body.sections ?? [];
}

function render(root: HTMLElement, sections: PracticeSectionDto[]): void {
  const page = document.createElement('div');
  page.className = 'learn-xq learn-xq--map practice-index';

  page.append(sidebar(sections));

  const main = document.createElement('main');
  main.className = 'learn-xq-map-main';

  if (sections.length === 0) {
    main.append(notice('No practice sets are published yet.'));
  }
  for (const section of sections) {
    const block = document.createElement('section');
    block.className = 'learn-xq-categ';
    const heading = document.createElement('h2');
    heading.textContent = section.title;
    const grid = document.createElement('div');
    grid.className = 'learn-xq-tile-grid';
    for (const entry of section.cards) grid.append(tile(entry));
    block.append(heading, grid);
    main.append(block);
  }

  page.append(main);
  root.replaceChildren(buildNav(), page);
}

function sidebar(sections: PracticeSectionDto[]): HTMLElement {
  const side = document.createElement('aside');
  side.className = 'learn-xq-side-card';

  const illus = document.createElement('div');
  illus.className = 'learn-xq-mascot';
  illus.innerHTML = renderXiangqiPiece({ color: 'red', role: 'chariot' }, { size: 96 });

  const title = document.createElement('h1');
  title.textContent = 'Practice';
  const sub = document.createElement('p');
  // Says what the surface actually is, because it is not the puzzle page: a
  // learner who expects a puzzle will read a failed conversion as a broken one.
  sub.textContent = 'against the engine';
  side.append(illus, title, sub);

  // The same progress bar /learn uses, reading from practice progress.
  const total = sections.reduce(
    (sum, section) => sum + section.cards.reduce((n, card) => n + card.exerciseCount, 0),
    0,
  );
  const solved = sections.reduce(
    (sum, section) => sum + section.cards.reduce((n, card) => n + card.solvedCount, 0),
    0,
  );
  if (total > 0) {
    const pct = Math.round((solved / total) * 100);
    const bar = document.createElement('div');
    bar.className = 'learn-xq-progress-bar';
    const fill = document.createElement('div');
    fill.className = 'learn-xq-progress-fill';
    fill.style.width = `${pct}%`;
    const label = document.createElement('span');
    label.textContent = `Progress: ${pct}%`;
    bar.append(fill, label);
    side.append(bar);

    const count = document.createElement('p');
    count.className = 'practice-index__total';
    count.textContent = `${solved} of ${total} solved`;
    side.append(count);
  }
  return side;
}

function tile(entry: PracticeCardDto): HTMLElement {
  const link = document.createElement('a');
  // `--link` is the tint /learn uses for an actionable destination tile.
  link.className = 'learn-xq-tile learn-xq-tile--link';
  link.href = `/study/${encodeURIComponent(entry.studyId)}`;

  const illus = document.createElement('div');
  illus.className = 'learn-xq-tile-illus';
  illus.innerHTML = renderXiangqiPiece(
    { color: 'red', role: pieceForSlug(entry.slug) },
    { size: 56 },
  );

  const text = document.createElement('div');
  text.className = 'learn-xq-tile-text';
  const title = document.createElement('h3');
  title.textContent = entry.title;
  const blurb = document.createElement('p');
  blurb.textContent = entry.blurb;
  text.append(title, blurb);

  link.append(illus, text);

  // The folded corner ribbon carries state, as it does on /learn: "solved /
  // total", and the done tint once the set is finished.
  const done = entry.solvedCount >= entry.exerciseCount && entry.exerciseCount > 0;
  if (done) link.classList.add('learn-xq-tile--done');
  const wrap = document.createElement('div');
  wrap.className = 'learn-xq-ribbon-wrap';
  const ribbon = document.createElement('div');
  ribbon.className = `learn-xq-ribbon learn-xq-ribbon--${done ? 'done' : 'ongoing'}`;
  ribbon.textContent = `${entry.solvedCount} / ${entry.exerciseCount}`;
  wrap.append(ribbon);
  link.append(wrap);

  return link;
}

/**
 * The piece a card's illustration shows.
 *
 * Driven off the slug rather than stored in the catalogue: every endgame set is
 * named for the piece that defines it, so the mapping is already implied and a
 * second place to state it is a second place to get it wrong. An unrecognised
 * slug falls back to the general, which is the piece every xiangqi position has.
 */
function pieceForSlug(slug: string): XiangqiPieceRole {
  if (slug.includes('chariot')) return 'chariot';
  if (slug.includes('horse')) return 'horse';
  if (slug.includes('cannon')) return 'cannon';
  if (slug.includes('soldier')) return 'soldier';
  return 'general';
}

function notice(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'practice-index__notice';
  p.textContent = text;
  return p;
}
