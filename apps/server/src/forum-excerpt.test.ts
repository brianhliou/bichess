import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forumExcerpt } from './forum-excerpt.js';

test('forumExcerpt collapses whitespace and keeps short posts whole', () => {
  assert.equal(
    forumExcerpt('Developing knights first\n\nkeeps  more fog pressure.'),
    'Developing knights first keeps more fog pressure.',
  );
  assert.equal(forumExcerpt('   '), '');
});

test('forumExcerpt drops quoted lines unless the post is only a quote', () => {
  assert.equal(
    forumExcerpt(
      '> I like opening with central pawns.\n> What else works?\nKnights first, then cannons.',
    ),
    'Knights first, then cannons.',
  );
  assert.equal(forumExcerpt('> Only a quote here.\n>And more.'), 'Only a quote here. And more.');
});

test('forumExcerpt cuts long posts on a word boundary with an ellipsis', () => {
  const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
  const excerpt = forumExcerpt(words, 80);
  assert.ok(excerpt.length <= 80, excerpt);
  assert.ok(excerpt.endsWith('...'));
  assert.ok(!excerpt.slice(0, -3).endsWith(' '));
  assert.match(excerpt, /^word0 word1 .* word\d+\.\.\.$/);
  // No word boundary near the cut: hard cut instead of an empty excerpt.
  assert.equal(forumExcerpt('a'.repeat(200), 20), `${'a'.repeat(17)}...`);
});
