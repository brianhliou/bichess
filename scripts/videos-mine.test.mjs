// Unit tests for the video miner. Offline: what breaks silently here is the
// parsing and the judgement calls, not the fetching.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractSearchResults,
  isXiangqi,
  parseAgeDays,
  parseLength,
  parseViews,
  score,
} from './videos-mine.mjs';

test('parseLength handles both YouTube shapes and never rounds to zero', () => {
  assert.equal(parseLength('5:36'), 6);
  assert.equal(parseLength('1:02:33'), 63);
  assert.equal(parseLength('0:41'), 1);
  assert.equal(parseLength(undefined), null);
});

test('parseViews reads a count, and refuses a live-viewer gauge', () => {
  assert.equal(parseViews('178,996 views'), 178996);
  assert.equal(parseViews('1 view'), 1);
  // "12 watching" is concurrent viewers, not a view count. Treating it as one
  // would rank a livestream on a number that means something else entirely.
  assert.equal(parseViews('12 watching'), null);
  assert.equal(parseViews('No views'), null);
});

test('parseAgeDays reads relative timestamps', () => {
  assert.equal(parseAgeDays('5 years ago'), 5 * 365);
  assert.equal(parseAgeDays('3 weeks ago'), 21);
  assert.equal(Math.round(parseAgeDays('6 months ago')), 182);
  assert.equal(parseAgeDays('just now'), null);
});

// 国际象棋 (Western chess) contains 象棋. Half the English query set contains the
// word "chess". Both make search hand back things this library is not about, and
// a chess channel's reach dwarfs the whole xiangqi niche, so ranking promotes
// them rather than burying them.
test('isXiangqi rejects chess and keeps xiangqi', () => {
  assert.equal(
    isXiangqi({ title: 'Basic Chess Openings Explained', author: 'GothamChess' }),
    false,
  );
  assert.equal(
    isXiangqi({ title: 'Understanding the Accelerated Dragon!!', author: 'Daniel Naroditsky' }),
    false,
  );
  assert.equal(isXiangqi({ title: '国际象棋入门第1集 | 如何走棋', author: 'VIPChess' }), false);

  assert.equal(isXiangqi({ title: 'Chess Player Tries Xianqi', author: 'iwantcheckmate' }), true);
  assert.equal(isXiangqi({ title: 'How to play Chinese Chess', author: 'Triple S Games' }), true);
  assert.equal(isXiangqi({ title: '象棋残局教学', author: '四郎讲棋' }), true);
  // Stripping the compound must not take the whole title with it.
  assert.equal(
    isXiangqi({ title: '中國象棋VS國際象棋：誰才是棋盤王者？', author: 'MrYang' }),
    true,
  );
});

test('score damps a fresh upload instead of crowning it', () => {
  const fresh = { views: 1530, ageDays: 1, durationMinutes: 35 };
  const classic = { views: 246708, ageDays: 1460, durationMinutes: 14 };
  // Undamped this is 1530 vs 169, which is how the first sweep ranked them.
  assert.ok(score(fresh) < score(classic), 'a one-day-old upload must not outrank a classic');

  // Damping is not suppression: a genuinely hot video still leads.
  const hot = { views: 70386, ageDays: 25, durationMinutes: 28 };
  assert.ok(score(hot) > score(classic));
});

test('score halves a short clip, matching how the catalogue is ordered', () => {
  const clip = { views: 42136, ageDays: 1200, durationMinutes: 1 };
  const lesson = { views: 42136, ageDays: 1200, durationMinutes: 11 };
  assert.equal(score(clip) * 2, score(lesson));
});

test('score is zero when there is nothing to score on', () => {
  assert.equal(score({ views: null, ageDays: 100, durationMinutes: 10 }), 0);
  assert.equal(score({ views: 1000, ageDays: null, durationMinutes: 10 }), 0);
});

test('extractSearchResults reads a results page and drops incomplete rows', () => {
  const html =
    '{"videoRenderer":{"videoId":"aaaaaaaaaaa","title":{"runs":[{"text":"Xiangqi Endgames"}]},' +
    '"ownerText":{"runs":[{"text":"Some Channel"}]},"lengthText":{"simpleText":"12:30"},' +
    '"viewCountText":{"simpleText":"4,200 views"},"publishedTimeText":{"simpleText":"2 years ago"}}}' +
    // A promoted/placeholder row with no owner: real pages carry these.
    '{"videoRenderer":{"videoId":"bbbbbbbbbbb","title":{"runs":[{"text":"No owner"}]}}}';
  const rows = extractSearchResults(html);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    id: 'aaaaaaaaaaa',
    title: 'Xiangqi Endgames',
    author: 'Some Channel',
    durationMinutes: 13,
    views: 4200,
    ageDays: 730,
  });
});

test('extractSearchResults survives a page with no results at all', () => {
  assert.deepEqual(extractSearchResults('<html>consent wall</html>'), []);
});
