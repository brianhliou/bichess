// GET /api/practice — the curated practice catalogue, with each card's study
// resolved.
//
// The catalogue itself (which studies, which section, what order) is a hardcoded
// list in @mistboard/game; this route's only job is to turn its slugs into live
// studies and say how many exercises each holds. Read-only and public: the index
// is a front door, so it must render for a signed-out visitor.
//
// A card whose slug resolves to nothing is OMITTED rather than rendered empty. A
// curated page that shows "Chariot endgames — 0 exercises" because a seed has not
// run yet is worse than a page that shows four cards: the first looks broken to a
// visitor and fine to us, the second looks incomplete to both. `missing` is
// reported alongside so an operator can see WHY a section is short without the
// visitor having to.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { PRACTICE_SECTIONS, practiceCatalogSlugs } from '@mistboard/game';
import * as persistence from './../persistence.js';
import { writeJson } from './lib.js';

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== '/api/practice') return false;
  if (request.method !== 'GET') {
    writeJson(response, 405, { error: 'method_not_allowed' });
    return true;
  }

  const resolved = await persistence.getPracticeStudiesBySlug(practiceCatalogSlugs());
  const bySlug = new Map(resolved.map((study) => [study.slug, study]));

  const sections = PRACTICE_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    cards: section.cards.flatMap((card) => {
      const study = bySlug.get(card.slug);
      if (!study) return [];
      return [
        {
          slug: card.slug,
          title: card.title,
          blurb: card.blurb,
          studyId: study.id,
          exerciseCount: study.exerciseCount,
        },
      ];
    }),
  })).filter((section) => section.cards.length > 0);

  const missing = practiceCatalogSlugs().filter((slug) => !bySlug.has(slug));
  writeJson(response, 200, { sections, missing });
  return true;
}
