import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditPracticeCatalogue } from './check-practice-catalog.mjs';

/** The catalogue shape `/api/practice` returns, trimmed to what the audit reads. */
const catalogue = (cards, missing = []) => ({
  missing,
  sections: [{ id: 'endgames', title: 'Basic endgames', cards }],
});

const card = (over = {}) => ({
  slug: 'endgames-horse',
  title: 'Horse endgames',
  studyId: 'PNqQaTM6',
  exerciseCount: 2,
  solvedCount: 0,
  ...over,
});

const chapter = (over = {}) => ({
  id: 'c1',
  name: 'A bare horse vs A bare advisor',
  practice: true,
  practiceGoal: 'mate',
  ...over,
});

test('a healthy catalogue produces no findings', () => {
  const findings = auditPracticeCatalogue(
    catalogue([card()]),
    new Map([['PNqQaTM6', [chapter(), chapter({ id: 'c2', practiceGoal: 'draw in 15' })]]]),
  );
  assert.deepEqual(findings, []);
});

test('the 2026-09-06 defect is caught: a chapter that is not an exercise', () => {
  // Exactly the prod state that survived unnoticed. Note the card's own count is
  // CONSISTENT with the bad data -- one exercise, one chapter that is not one --
  // which is why counting alone could never have found this. The audit has to
  // compare the catalogue against the chapters the study actually holds.
  const findings = auditPracticeCatalogue(
    catalogue([card({ exerciseCount: 1 })]),
    new Map([
      [
        'PNqQaTM6',
        [chapter({ id: 'dead', practice: false, practiceGoal: null }), chapter({ id: 'c2' })],
      ],
    ]),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'not-an-exercise');
  assert.equal(findings[0].chapterId, 'dead');
  assert.equal(findings[0].slug, 'endgames-horse');
});

test('a practice chapter with no goal is caught separately', () => {
  // The server nulls the goal whenever practice is turned off, so this pair
  // should never come apart. If it does, the exercise mounts unwinnable, which
  // is a different failure from not mounting at all -- hence its own kind.
  const findings = auditPracticeCatalogue(
    catalogue([card({ exerciseCount: 1 })]),
    new Map([['PNqQaTM6', [chapter({ practiceGoal: '   ' })]]]),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'goal-missing');
});

test('an unresolved slug is reported from the server own missing list', () => {
  const findings = auditPracticeCatalogue(catalogue([], ['endgames-cannon']), new Map());
  assert.deepEqual(
    findings.map((f) => [f.kind, f.slug]),
    [['unresolved-card', 'endgames-cannon']],
  );
});

test('a study the audit could not read is a finding, not a silent pass', () => {
  // The fetch loop leaves an unreadable study absent from the map rather than
  // throwing, so one bad study still yields a full report. Treating "absent"
  // as "fine" would make a total outage look healthy.
  const findings = auditPracticeCatalogue(catalogue([card()]), new Map());
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'unreadable-study');
});

test('a card that resolves but holds nothing is reported', () => {
  const findings = auditPracticeCatalogue(
    catalogue([card({ exerciseCount: 0 })]),
    new Map([['PNqQaTM6', []]]),
  );
  assert.deepEqual(
    findings.map((f) => f.kind),
    ['empty-card'],
  );
});
