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
import { currentAccountUser } from './../account-session.js';
import * as persistence from './../persistence.js';
import { readJsonBody, requireMethod, requirePersistence, writeJson } from './lib.js';

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  // Record a solve. Signed-in only: there is nowhere to keep an anonymous
  // learner's progress, and lila's in-memory `anon` record loses it on reload
  // anyway. A signed-out solve is silently not recorded rather than an error --
  // the exercise still worked, and interrupting it to demand an account would be
  // the wrong moment to ask.
  if (pathname === '/api/practice/complete') {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 200, { recorded: false });
      return true;
    }
    const body = await readJsonBody(request);
    const chapterId = typeof body.chapterId === 'string' ? body.chapterId : '';
    const moves = typeof body.moves === 'number' ? body.moves : Number.NaN;
    if (!chapterId || !Number.isFinite(moves) || moves < 0) {
      writeJson(response, 400, { error: 'invalid_completion' });
      return true;
    }
    await persistence.recordPracticeSolved(user.id, chapterId, moves);
    writeJson(response, 200, { recorded: true });
    return true;
  }

  if (pathname !== '/api/practice') return false;
  if (request.method !== 'GET') {
    writeJson(response, 405, { error: 'method_not_allowed' });
    return true;
  }

  const resolved = await persistence.getPracticeStudiesBySlug(practiceCatalogSlugs());
  const bySlug = new Map(resolved.map((study) => [study.slug, study]));

  // Progress for the signed-in reader, in one query for the whole shelf rather
  // than one per card.
  const viewer = await currentAccountUser(request);
  const solvedByStudy = viewer
    ? await persistence.solvedCountsByStudy(
        viewer.id,
        resolved.map((study) => study.id),
      )
    : new Map<string, number>();

  const sections = PRACTICE_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    cards: section.cards.flatMap((card) => {
      const study = bySlug.get(card.slug);
      if (!study) return [];
      return [
        {
          slug: card.slug,
          // The catalogue's English, kept as the fallback a card renders when a
          // study has no text of its own for the reader's locale.
          title: card.title,
          blurb: card.blurb,
          // The study's OWN name and description, plus its locale overlay. The
          // card names a study, so it should say what that study is called: this
          // response already loaded the overlay and then dropped it, which left
          // the shelf in English while every study behind it was translated.
          name: study.name,
          description: study.description,
          i18n: study.i18n,
          studyId: study.id,
          exerciseCount: study.exerciseCount,
          solvedCount: solvedByStudy.get(study.id) ?? 0,
        },
      ];
    }),
  })).filter((section) => section.cards.length > 0);

  const missing = practiceCatalogSlugs().filter((slug) => !bySlug.has(slug));
  writeJson(response, 200, { sections, missing });
  return true;
}
