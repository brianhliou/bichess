#!/usr/bin/env node
// Audit the LIVE /practice catalogue: every card resolves, and every chapter
// inside a catalogued study is actually a playable exercise.
//
// This exists because of a failure that was invisible for weeks. Chapter 1 of
// "Horse endgames" sat with `practice = false` and no goal, so the practice
// player never mounted for it and a learner got the plain study page instead.
// Nothing anywhere noticed:
//
//   - The suite was green. The defect was in prod DATA, not in code, and no
//     test can see prod data.
//   - The card's count was HONEST. `exercise_count` counts only chapters with
//     `practice`, so the card read "0 / 5" rather than an obviously wrong
//     "0 / 6". Nothing on the page looked broken, which is exactly why it
//     survived: an inflated count would have been noticed in a day.
//   - The chapter was still listed in the study's own rail, so it was reachable
//     and dead rather than absent.
//
// So the check has to compare two sources that only agree when the data is
// right: the catalogue's studies, and the chapters those studies actually hold.
// A study whose chapter count exceeds its exercise count is the whole signal.
//
// Public API only, deliberately: it runs against production with no credentials
// and no database access, so it is safe from a release script, from CI, or from
// a laptop.

const DEFAULT_BASE_URL = 'https://mistboard.com';

/**
 * Compare the catalogue against the chapters its studies hold.
 *
 * Pure, so the interesting part is testable without a network: `catalogue` is
 * the `/api/practice` body, `chaptersByStudy` maps a study id to that study's
 * chapters as `/api/studies/:id` returns them.
 *
 * Returns a findings array; empty means healthy.
 */
export function auditPracticeCatalogue(catalogue, chaptersByStudy) {
  const findings = [];

  // A catalogue slug that resolves to nothing. The route already omits these
  // from the page and reports them in `missing` for exactly this reason, so
  // this only surfaces what the server already knows.
  for (const slug of catalogue.missing ?? []) {
    findings.push({ kind: 'unresolved-card', slug, detail: 'catalogue slug resolves to no study' });
  }

  for (const section of catalogue.sections ?? []) {
    for (const card of section.cards ?? []) {
      const chapters = chaptersByStudy.get(card.studyId);
      if (!chapters) {
        findings.push({
          kind: 'unreadable-study',
          slug: card.slug,
          detail: `could not read chapters for study ${card.studyId}`,
        });
        continue;
      }

      // The load-bearing check. Every chapter of a catalogued practice study is
      // meant to be an exercise; one that is not renders as a plain study page
      // and is dead to a learner who clicks it in the rail.
      for (const chapter of chapters) {
        if (!chapter.practice) {
          findings.push({
            kind: 'not-an-exercise',
            slug: card.slug,
            chapterId: chapter.id,
            detail: `"${chapter.name}" is not flagged as practice`,
          });
        } else if (typeof chapter.practiceGoal !== 'string' || chapter.practiceGoal.trim() === '') {
          // Belt and braces: the server nulls the goal whenever practice is
          // turned off, so the pair should never come apart. If it ever does,
          // the exercise mounts with no way to succeed.
          findings.push({
            kind: 'goal-missing',
            slug: card.slug,
            chapterId: chapter.id,
            detail: `"${chapter.name}" is flagged practice but has no goal`,
          });
        }
      }

      // A card the page renders with nothing behind it. Distinct from an
      // unresolved slug: the study exists, it just holds no exercises.
      if (card.exerciseCount === 0) {
        findings.push({
          kind: 'empty-card',
          slug: card.slug,
          detail: 'study resolves but holds no exercises',
        });
      }
    }
  }

  return findings;
}

/** Render findings as one line each, grouped enough to read at a glance. */
export function formatFindings(findings) {
  return findings
    .map(
      (f) => `  ${f.kind.padEnd(16)} ${f.slug}${f.chapterId ? ` ${f.chapterId}` : ''}  ${f.detail}`,
    )
    .join('\n');
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
}

async function main() {
  // The repo's smoke scripts are split between `--base` and `--base-url`
  // (release-prod.mjs uses both, for different callees), so accept either
  // rather than make the caller remember which family this one belongs to.
  const args = process.argv.slice(2);
  const flag = args.findIndex((arg) => arg === '--base-url' || arg === '--base');
  const baseUrl = (flag === -1 ? DEFAULT_BASE_URL : args[flag + 1]).replace(/\/$/, '');

  const catalogue = await getJson(`${baseUrl}/api/practice`);
  const studyIds = (catalogue.sections ?? []).flatMap((section) =>
    (section.cards ?? []).map((card) => card.studyId),
  );

  const chaptersByStudy = new Map();
  for (const id of studyIds) {
    try {
      const study = await getJson(`${baseUrl}/api/studies/${id}`);
      chaptersByStudy.set(id, study.chapters ?? []);
    } catch {
      // Left absent on purpose; the audit reports it as `unreadable-study`
      // rather than throwing, so one bad study still yields a full report.
    }
  }

  const findings = auditPracticeCatalogue(catalogue, chaptersByStudy);
  const exercises = (catalogue.sections ?? [])
    .flatMap((section) => section.cards ?? [])
    .reduce((sum, card) => sum + (card.exerciseCount ?? 0), 0);
  const chapters = [...chaptersByStudy.values()].reduce((sum, list) => sum + list.length, 0);

  if (findings.length === 0) {
    console.log(JSON.stringify({ ok: true, baseUrl, cards: studyIds.length, exercises, chapters }));
    return;
  }

  console.error(
    JSON.stringify({ ok: false, baseUrl, cards: studyIds.length, exercises, chapters }),
  );
  console.error(`practice catalogue: ${findings.length} problem(s)`);
  console.error(formatFindings(findings));
  process.exitCode = 1;
}

// Only run when invoked directly, so the pure function above can be imported
// by the test without performing any network calls.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
