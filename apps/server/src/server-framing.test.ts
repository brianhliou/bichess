import assert from 'node:assert/strict';
import test from 'node:test';
import { isEmbedRoute } from './server-policy.js';

// The framing headers are set from isEmbedRoute, so what that function accepts
// IS the list of paths any site on the internet may put in a frame. It is worth
// pinning precisely.

test('exactly the study-chapter embed path is frameable', () => {
  assert.equal(isEmbedRoute('/embed/study/ytSzepET/Ue0EgpS7'), true);
  assert.equal(isEmbedRoute('/embed/study/ytSzepET/Ue0EgpS7/'), true);
});

test('nothing else on the site is', () => {
  for (const path of [
    '/',
    '/account/settings',
    '/study/ytSzepET',
    '/study/ytSzepET/Ue0EgpS7',
    '/blog/xiangqi-champions',
    '/room/abc',
    '/embed',
    '/embed/study',
    '/embed/study/only-one-id',
    '/embed/game/a/b',
  ]) {
    assert.equal(isEmbedRoute(path), false, path);
  }
});

test('a traversal or injected path is not frameable', () => {
  // This function decides who may frame us, so its input is hostile by default.
  for (const path of [
    '/embed/study/../../account/settings',
    '/embed/study/a/b/../../..',
    '/embed/study/a b/c',
    '/embed/study/a/c?x=1',
    '/embed/study/a/c#f',
    `/embed/study/${'a'.repeat(65)}/b`,
  ]) {
    assert.equal(isEmbedRoute(path), false, path);
  }
});
