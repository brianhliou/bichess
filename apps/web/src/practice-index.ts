// /practice — the front door for engine-adjudicated exercises.
//
// A curated shelf, not a directory: the server resolves a hardcoded catalogue
// (@mistboard/game practice-catalog.ts) and returns sections of cards in
// teaching order. This page's job is to render that shelf and get out of the way.
//
// Copy on this page is English-only for now, like the /learn course it sits
// beside; it joins the catalog in the same pass rather than being half-wired.
//
// Progress (the per-card "N/M" ribbon and an overall bar) is the other half of
// what makes lichess's version legible, and it does not exist yet -- there is no
// practice progress table. The card markup leaves the ribbon slot empty rather
// than faking it; see the note on `card()`.

import { buildNav } from './site-shell.js';
import './practice-index.css';

interface PracticeCardDto {
  slug: string;
  title: string;
  blurb: string;
  studyId: string;
  exerciseCount: number;
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
  const main = document.createElement('main');
  main.className = 'practice-index';

  const header = document.createElement('header');
  header.className = 'practice-index__header';
  const h1 = document.createElement('h1');
  h1.className = 'practice-index__title';
  h1.textContent = 'Practice';
  const lede = document.createElement('p');
  lede.className = 'practice-index__lede';
  // Says what the surface actually does, because it is not a puzzle page and a
  // learner who expects one will read a failed conversion as a broken puzzle.
  lede.textContent =
    'Positions with a goal instead of an answer. The engine plays the defence and tells you when you have let the win slip.';
  header.append(h1, lede);
  main.append(header);

  if (sections.length === 0) {
    main.append(notice('No practice sets are published yet.'));
    root.replaceChildren(buildNav(), main);
    return;
  }

  for (const section of sections) {
    const block = document.createElement('section');
    block.className = 'practice-section';
    const heading = document.createElement('h2');
    heading.className = 'practice-section__title';
    heading.textContent = section.title;
    const grid = document.createElement('div');
    grid.className = 'practice-section__grid';
    for (const entry of section.cards) grid.append(card(entry));
    block.append(heading, grid);
    main.append(block);
  }

  root.replaceChildren(buildNav(), main);
}

function card(entry: PracticeCardDto): HTMLElement {
  const link = document.createElement('a');
  link.className = 'practice-card';
  link.href = `/study/${encodeURIComponent(entry.studyId)}`;

  const body = document.createElement('span');
  body.className = 'practice-card__body';
  const title = document.createElement('span');
  title.className = 'practice-card__title';
  title.textContent = entry.title;
  const blurb = document.createElement('span');
  blurb.className = 'practice-card__blurb';
  blurb.textContent = entry.blurb;
  body.append(title, blurb);

  // lichess puts an "N / M" completion ribbon here and colours the card by it.
  // We have no progress store yet, so the corner states the SIZE of the set --
  // true, useful, and not a completion claim we cannot back. It becomes the
  // ribbon once practice progress lands.
  const count = document.createElement('span');
  count.className = 'practice-card__count';
  count.textContent = String(entry.exerciseCount);
  const countLabel = document.createElement('span');
  countLabel.className = 'practice-card__count-label';
  countLabel.textContent = entry.exerciseCount === 1 ? 'exercise' : 'exercises';
  count.append(countLabel);

  link.append(body, count);
  return link;
}

function notice(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'practice-index__notice';
  p.textContent = text;
  return p;
}
