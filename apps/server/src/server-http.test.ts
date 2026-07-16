import assert from 'node:assert/strict';
import test from 'node:test';
import { isPageNavigationRequest } from './server-http.js';

const HTML_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

test('page navigation: extensionless GET asking for HTML → true', () => {
  assert.equal(
    isPageNavigationRequest({ method: 'GET', headers: { accept: HTML_ACCEPT } }, '/asdfasdf'),
    true,
  );
});

test('page navigation: direct hit with no Accept header → true', () => {
  assert.equal(isPageNavigationRequest({ method: 'GET', headers: {} }, '/nope'), true);
  assert.equal(isPageNavigationRequest({ method: 'HEAD', headers: {} }, '/nope/deeper'), true);
});

test('missing asset: extensioned path → false (falls through to real asset 404)', () => {
  assert.equal(
    isPageNavigationRequest({ method: 'GET', headers: { accept: HTML_ACCEPT } }, '/assets/app.js'),
    false,
  );
  assert.equal(
    isPageNavigationRequest({ method: 'GET', headers: { accept: '*/*' } }, '/img/missing.png'),
    false,
  );
});

test('data fetch to an unknown page path (no text/html) → false', () => {
  assert.equal(
    isPageNavigationRequest({ method: 'GET', headers: { accept: 'application/json' } }, '/data'),
    false,
  );
});

test('non-idempotent methods are never page navigations', () => {
  assert.equal(
    isPageNavigationRequest({ method: 'POST', headers: { accept: HTML_ACCEPT } }, '/asdfasdf'),
    false,
  );
});
