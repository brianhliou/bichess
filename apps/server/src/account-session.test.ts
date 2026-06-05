import assert from 'node:assert/strict';
import test from 'node:test';
import { maxHandleLength, normalizeProfileHandle } from './account-identity.js';
import {
  accountSessionCookie,
  expiredAccountSessionCookie,
  handleCollisionAttempt,
} from './account-session.js';

function withCookieDomain<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.MISTBOARD_COOKIE_DOMAIN;
  if (value === undefined) delete process.env.MISTBOARD_COOKIE_DOMAIN;
  else process.env.MISTBOARD_COOKIE_DOMAIN = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.MISTBOARD_COOKIE_DOMAIN;
    else process.env.MISTBOARD_COOKIE_DOMAIN = prev;
  }
}

test('handleCollisionAttempt keeps signup retry handles within the public handle cap', () => {
  const baseHandle = 'a'.repeat(maxHandleLength);

  for (let i = 0; i < 20; i += 1) {
    const handle = handleCollisionAttempt(baseHandle);
    assert.equal(handle.length, maxHandleLength);
    assert.equal(normalizeProfileHandle(handle), handle);
    assert.match(handle, /^a+-\d{5}$/);
  }
});

test('handleCollisionAttempt separates the suffix from a short base with a hyphen', () => {
  for (let i = 0; i < 20; i += 1) {
    assert.match(handleCollisionAttempt('brian'), /^brian-\d{5}$/);
  }
});

test('session cookie scopes to Domain when MISTBOARD_COOKIE_DOMAIN is set (cross-subdomain WS auth)', () => {
  const cookie = withCookieDomain('mistboard.com', () =>
    accountSessionCookie('sid', 'tok', new Date(Date.now() + 60_000)),
  );
  assert.match(cookie, /(^|; )Domain=mistboard\.com(;|$)/);
  // Existing hardening attributes must survive the Domain addition.
  assert.match(cookie, /(^|; )HttpOnly(;|$)/);
  assert.match(cookie, /(^|; )SameSite=Lax(;|$)/);
  assert.match(cookie, /(^|; )Path=\/(;|$)/);
});

test('session cookie stays host-only (no Domain) when MISTBOARD_COOKIE_DOMAIN is unset', () => {
  const cookie = withCookieDomain(undefined, () =>
    accountSessionCookie('sid', 'tok', new Date(Date.now() + 60_000)),
  );
  assert.doesNotMatch(cookie, /Domain=/);
});

test('blank MISTBOARD_COOKIE_DOMAIN is treated as unset (no Domain attribute)', () => {
  const cookie = withCookieDomain('   ', () =>
    accountSessionCookie('sid', 'tok', new Date(Date.now() + 60_000)),
  );
  assert.doesNotMatch(cookie, /Domain=/);
});

test('logout cookie clears across the same Domain scope so the subdomain session is cleared too', () => {
  const cookie = withCookieDomain('mistboard.com', () => expiredAccountSessionCookie());
  assert.match(cookie, /(^|; )Domain=mistboard\.com(;|$)/);
  assert.match(cookie, /(^|; )Max-Age=0(;|$)/);
});
