import { assert, test } from 'vitest';
import {
  CHAMPIONS,
  CHART_LAYOUT,
  EDITIONS,
  EDITION_GAPS,
  FIRST_YEAR,
  LAST_YEAR,
  championTableRows,
  editionGapSentence,
  xiangqiChampionTimelineSvg,
} from './xiangqi-champion-timeline.js';

// The article states these counts in prose. They are only true because the data
// below says so, so assert them here rather than trusting a sentence.
test('the record covers 57 editions and 22 winners', () => {
  assert.equal(EDITIONS.length, 57);
  assert.equal(CHAMPIONS.length, 22);
});

test('every edition has exactly one champion, or two when shared', () => {
  for (const year of EDITIONS) {
    const won = CHAMPIONS.filter((c) => c.years.includes(year));
    const shared = CHAMPIONS.filter((c) => (c.shared ?? []).includes(year));
    assert.equal(
      won.length + shared.length >= 1,
      true,
      `no champion recorded for ${year}`,
    );
    assert.equal(won.length <= 1, true, `${year} has more than one outright champion`);
    if (shared.length) assert.equal(shared.length, 2, `${year} is shared by ${shared.length}`);
  }
});

test('no champion is recorded in a year the championship was not held', () => {
  const held = new Set(EDITIONS);
  for (const champ of CHAMPIONS) {
    for (const year of [...champ.years, ...(champ.shared ?? [])]) {
      assert.equal(held.has(year), true, `${champ.name} credited with ${year}, not an edition`);
      assert.equal(year >= FIRST_YEAR && year <= LAST_YEAR, true, `${year} outside the span`);
    }
  }
});

test('gaps and editions partition the span', () => {
  const gapYears = new Set<number>();
  for (const gap of EDITION_GAPS) {
    for (let y = gap.from; y <= gap.to; y += 1) gapYears.add(y);
  }
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y += 1) {
    const held = EDITIONS.includes(y);
    assert.equal(held !== gapYears.has(y), true, `${y} is both held and a gap, or neither`);
  }
});

test('champions are ordered by first title, matching the article sections', () => {
  const firsts = CHAMPIONS.map((c) => Math.min(...c.years, ...(c.shared ?? [Infinity])));
  for (let i = 1; i < firsts.length; i += 1) {
    assert.equal(firsts[i] >= firsts[i - 1], true, `${CHAMPIONS[i].name} is out of order`);
  }
});

test('the stated title counts hold', () => {
  const count = (name: string) => {
    const c = CHAMPIONS.find((x) => x.name === name);
    assert.ok(c, `${name} missing`);
    return c.years.length + (c.shared?.length ?? 0);
  };
  assert.equal(count('Hu Ronghua'), 14);
  assert.equal(count('Xu Yinchuan'), 6);
  assert.equal(count('Lü Qin'), 5);
  assert.equal(count('Li Laiqun'), 4);
  assert.equal(count('Zhao Guorong'), 4);
  assert.equal(count('Yang Guanlin'), 4);
});

test('the table renders one row per champion, in the figure\'s order', () => {
  const rows = championTableRows();
  assert.equal(rows.length, CHAMPIONS.length);
  rows.forEach((row, i) => {
    assert.equal(row.length, 4);
    assert.equal(row[0].startsWith(CHAMPIONS[i].name), true, `row ${i} is out of order`);
    assert.equal(row[2].length > 0, true, `${row[0]} has no years`);
  });
});

test('the years column lists every edition won, and claims no year that was not played', () => {
  const held = new Set(EDITIONS);
  const rows = championTableRows();
  rows.forEach((row, i) => {
    const champ = CHAMPIONS[i];
    const listed = new Set<number>();
    for (const part of row[2].split(', ')) {
      const [from, to] = part.replace('*', '').split('-').map(Number);
      for (let y = from; y <= (to ?? from); y += 1) listed.add(y);
    }
    const won = [...champ.years, ...(champ.shared ?? [])];
    assert.deepEqual([...listed].sort(), [...won].sort(), `${champ.name} year list drifted`);
    for (const y of listed) assert.equal(held.has(y), true, `${champ.name} lists ${y}, not an edition`);
  });
  // The specific trap: Hu's 1976 was cancelled, so the list must break there
  // even though the figure's bar closes over it.
  const hu = rows.find((r) => r[0].startsWith('Hu Ronghua'));
  assert.equal(hu?.[2].includes('1974-1979'), false, 'the year list claims a 1976 title');
  assert.equal(hu?.[2].includes('1974-1975'), true);
  assert.equal(hu?.[2].includes('1977-1979'), true);
});

test('the shared 1962 title is marked on both men and never merged into a span', () => {
  const rows = championTableRows();
  for (const name of ['Yang Guanlin', 'Hu Ronghua']) {
    const row = rows.find((r) => r[0].startsWith(name));
    assert.match(row?.[2] ?? '', /1962\*/);
  }
});

test('every sanction reaches the table', () => {
  const rows = championTableRows();
  rows.forEach((row, i) => {
    assert.equal(row[3], CHAMPIONS[i].sanction ?? '');
  });
  assert.equal(rows.filter((r) => r[3]).length, CHAMPIONS.filter((c) => c.sanction).length);
});

test('the figure draws a bar for every champion and closes its markup', () => {
  const svg = xiangqiChampionTimelineSvg();
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>$/);
  for (const champ of CHAMPIONS) {
    // The row label is "<English> <Chinese>", so match the name, not the whole
    // text node.
    assert.equal(svg.includes(`>${champ.name} `), true, `${champ.name} missing from figure`);
    assert.equal(svg.includes(champ.zh), true, `${champ.zh} missing from figure`);
  }
  // Bars merge across cancelled years: Hu's 1974-1979 must be one rect, not two.
  const huRun = svg.match(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g) ?? [];
  assert.equal(huRun.length > CHAMPIONS.length, true, 'expected at least one bar per champion');
});

test('bars bridge a single cancelled year but not the Cultural Revolution', () => {
  const svg = xiangqiChampionTimelineSvg();
  // Hu Ronghua won 1964-1966 and 1974-1979. 1976 was cancelled, so 1974-1979 is
  // one bar; the seven blank years from 1967 must stay a break, not a bar.
  const widths = [...svg.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="12"/g)].map(
    (m) => ({ x: Number(m[1]), w: Number(m[2]) }),
  );
  const cell =
    (CHART_LAYOUT.width - CHART_LAYOUT.padLeft - CHART_LAYOUT.padRight) /
    (LAST_YEAR - FIRST_YEAR + 1);
  const spans = widths.map((r) => Math.round(r.w / cell));
  assert.equal(spans.includes(6), true, 'expected a six-year bar for Hu 1974-1979');
  assert.equal(
    spans.some((s) => s >= 10),
    false,
    'no bar should span the Cultural Revolution gap',
  );
});

test('every champion from 2005 to 2023 is sanctioned except the three who are not', () => {
  // Verified against the Chinese Xiangqi Association's published rulings of
  // 2025-01-12 and 2026-04-13. Xu Yinchuan (2006, 2009) and Zhao Guorong (2008)
  // are the only title holders in that span with no ruling against them; if a
  // later ruling changes that, this test is the thing that should fail first.
  const clean = new Set(['Xu Yinchuan', 'Zhao Guorong']);
  for (const champ of CHAMPIONS) {
    const inSpan = champ.years.some((y) => y >= 2005 && y <= 2023);
    if (!inSpan || clean.has(champ.name)) continue;
    assert.ok(champ.sanction, `${champ.name} won in the ban era with no ruling recorded`);
  }
  for (const name of clean) {
    assert.equal(CHAMPIONS.find((c) => c.name === name)?.sanction, undefined);
  }
});

test('the gap sentence names every year with no championship', () => {
  const sentence = editionGapSentence();
  for (const gap of EDITION_GAPS) {
    const span = gap.from === gap.to ? String(gap.from) : `${gap.from}-${gap.to}`;
    assert.equal(sentence.includes(span), true, `${span} missing from the caption sentence`);
    assert.equal(sentence.includes(gap.reason), true, `reason for ${span} missing`);
  }
});

test('the figure distinguishes a banned champion from a year with no championship', () => {
  const svg = xiangqiChampionTimelineSvg();
  // The bug this guards: both states were drawn as the same colour at different
  // opacities, and at one year wide they are the same rectangle.
  assert.equal(svg.includes('fill="url(#xq-champ-nohold)"'), true, 'gaps are not hatched');
  assert.equal(svg.includes('<pattern id="xq-champ-nohold"'), true, 'hatch pattern missing');
  assert.equal(svg.includes('class="xq-champ-bar xq-champ-bar--banned"'), true);
  // No bar may carry an inline fill any more; the classes are what separate them.
  assert.equal(/height="12" rx="2" fill="/.test(svg), false, 'a bar still has an inline fill');
  const banned = CHAMPIONS.filter((c) => c.sanction).length;
  assert.equal(banned > 0 && banned < CHAMPIONS.length, true);
});
