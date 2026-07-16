import assert from 'node:assert/strict';
import test from 'node:test';
import { buildI18nReport, formatI18nReport } from './i18n-check-lib.mjs';

function domain(overrides = {}) {
  return {
    name: 'shell',
    prefixes: ['nav'],
    english: { 'nav.play': 'Play', 'nav.optional': 'Optional' },
    locales: {
      'zh-Hans': { 'nav.play': '对弈' },
      'zh-Hant': { 'nav.play': '對弈' },
    },
    critical: ['nav.play'],
    ...overrides,
  };
}

test('noncritical gaps are reported without failing the gate', () => {
  const report = buildI18nReport([domain()], ['en', 'zh-Hans', 'zh-Hant']);

  assert.equal(report.ok, true);
  assert.equal(report.totals.locales['zh-Hans'].missing, 1);
  assert.deepEqual(report.domains[0].locales['zh-Hans'].missingKeys, ['nav.optional']);
  assert.match(formatI18nReport(report), /noncritical gaps are informational/);
});

test('missing critical translations fail the gate', () => {
  const report = buildI18nReport(
    [
      domain({
        locales: { 'zh-Hans': {}, 'zh-Hant': { 'nav.play': '對弈' } },
      }),
    ],
    ['en', 'zh-Hans', 'zh-Hant'],
  );

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.errors.filter((item) => item.code === 'missing-critical-translation'),
    [
      {
        code: 'missing-critical-translation',
        message: 'shell:zh-Hans:nav.play is critical and untranslated.',
        domain: 'shell',
        locale: 'zh-Hans',
        key: 'nav.play',
      },
    ],
  );
});

test('stale keys, unknown critical keys, and duplicate ownership fail the gate', () => {
  const report = buildI18nReport(
    [
      domain({
        locales: {
          'zh-Hans': { 'nav.play': '对弈', 'nav.retired': '旧' },
          'zh-Hant': { 'nav.play': '對弈' },
        },
        critical: ['nav.play', 'nav.unknown'],
      }),
      domain({ name: 'other', critical: ['nav.play'] }),
    ],
    ['en', 'zh-Hans', 'zh-Hant'],
  );

  assert.equal(report.ok, false);
  assert.ok(report.errors.some((item) => item.code === 'stale-locale-key'));
  assert.ok(report.errors.some((item) => item.code === 'unknown-critical-key'));
  assert.ok(report.errors.some((item) => item.code === 'duplicate-source-key'));
});

test('unsupported locale catalogs fail instead of silently restoring a retired locale', () => {
  const report = buildI18nReport(
    [
      domain({
        locales: {
          'zh-Hans': { 'nav.play': '对弈' },
          'zh-Hant': { 'nav.play': '對弈' },
          ja: { 'nav.play': 'プレイ' },
        },
      }),
    ],
    ['en', 'zh-Hans', 'zh-Hant'],
  );

  assert.equal(report.ok, false);
  assert.ok(report.errors.some((item) => item.code === 'unsupported-locale-catalog'));
});
