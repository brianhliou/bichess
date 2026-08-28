import assert from 'node:assert/strict';
import test from 'node:test';
import { viewerCountryCookie, viewerCountryFromRequest } from './viewer-country.js';

test('reads a two-letter country from CF-IPCountry and rejects the non-countries', () => {
  assert.equal(viewerCountryFromRequest({ headers: { 'cf-ipcountry': 'CN' } }), 'CN');
  assert.equal(viewerCountryFromRequest({ headers: { 'cf-ipcountry': ' us ' } }), 'US');
  assert.equal(viewerCountryFromRequest({ headers: { 'cf-ipcountry': ['SG', 'US'] } }), 'SG');
  assert.equal(viewerCountryFromRequest({ headers: {} }), null, 'no header (local dev)');
  assert.equal(viewerCountryFromRequest({ headers: { 'cf-ipcountry': 'XX' } }), null, 'unknown');
  assert.equal(viewerCountryFromRequest({ headers: { 'cf-ipcountry': 'T1' } }), null, 'Tor');
  assert.equal(viewerCountryFromRequest({ headers: { 'cf-ipcountry': 'USA' } }), null);
  assert.equal(viewerCountryFromRequest({ headers: { 'cf-ipcountry': 'C;' } }), null);
});

test('the cookie is readable by the client, a day long, and Secure only in production', () => {
  assert.equal(viewerCountryCookie('CN', {}), 'mb_cc=CN; Path=/; Max-Age=86400; SameSite=Lax');
  const prod = viewerCountryCookie('CN', { NODE_ENV: 'production' });
  assert.ok(prod.endsWith('; Secure'), prod);
  assert.ok(!prod.includes('HttpOnly'), 'the client is the reader');
});
