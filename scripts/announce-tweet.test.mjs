import assert from 'node:assert/strict';
import test from 'node:test';
import { composeTweet } from './announce-tweet.mjs';

const LINK = 'https://mistboard.com/rules/fog-chess';
// X counts every link as 23 characters however long it is, so the real budget
// is measured with the link swapped for its t.co length.
const billedLength = (text) => text.replace(LINK, 'x'.repeat(23)).length;

test('keeps the body when it fits, and always ends on the link', () => {
  const text = composeTweet({
    title: 'Fog Chess is open for alpha play.',
    description: 'Private vision, no check warnings, and king capture wins.',
    link: LINK,
  });

  assert.equal(
    text,
    'Fog Chess is open for alpha play. Private vision, no check warnings, and king capture wins. https://mistboard.com/rules/fog-chess',
  );
});

test('drops the whole body rather than truncating it mid-sentence', () => {
  const text = composeTweet({
    title: 'Set up any position, then share it.',
    description: 'A board editor for eight variants: '.repeat(10),
    link: LINK,
  });

  assert.equal(text, `Set up any position, then share it. ${LINK}`);
  assert.ok(billedLength(text) <= 280);
});

test('truncates a headline that cannot fit beside a link', () => {
  const text = composeTweet({ title: 'A very long headline. '.repeat(40), link: LINK });

  assert.ok(text.endsWith(`… ${LINK}`), text.slice(-60));
  assert.ok(billedLength(text) <= 280);
});

test('handles an entry with no body at all', () => {
  const text = composeTweet({ title: 'Mistboard is in alpha.', description: null, link: LINK });

  assert.equal(text, `Mistboard is in alpha. ${LINK}`);
});
