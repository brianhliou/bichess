import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyAuditOutput } from './audit-prod-deps.mjs';

const counts = (over = {}) => ({
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0, ...over },
  },
});

test('a clean audit is clean', () => {
  const verdict = classifyAuditOutput(JSON.stringify(counts()));
  assert.equal(verdict.kind, 'clean');
});

test('a real finding fails, and info alone does not', () => {
  assert.equal(classifyAuditOutput(JSON.stringify(counts({ low: 1 }))).kind, 'vulnerable');
  assert.equal(classifyAuditOutput(JSON.stringify(counts({ critical: 2 }))).total, 2);
  // npm's own default audit level is `low`, so an info-only report is a pass
  // there too. Failing on it here would make this script a stricter gate than
  // the command it replaced, which is its own kind of false alarm.
  assert.equal(classifyAuditOutput(JSON.stringify(counts({ info: 3 }))).kind, 'clean');
});

test('the registry error that red-mained 2026-09-04 is transient, not a finding', () => {
  // Shape of what npm printed that day: the quick endpoint answering 400 while
  // announcing its own retirement. Classifying this as `vulnerable` is the bug
  // this script exists to prevent.
  const verdict = classifyAuditOutput(
    JSON.stringify({
      error: {
        code: 'E400',
        summary: 'Bad Request - POST https://registry.npmjs.org/-/npm/v1/security/audits/quick',
        detail: 'Invalid package tree, run npm install to rebuild your package-lock.json',
      },
    }),
  );
  assert.equal(verdict.kind, 'unavailable');
  assert.match(verdict.detail, /E400/);
  assert.match(verdict.detail, /Invalid package tree/);
});

test('output that is not JSON at all is transient, not a finding', () => {
  // A proxy's HTML error page says nothing about this lockfile. Treating an
  // unparseable body as a vulnerability would fail the build on a bad gateway.
  const verdict = classifyAuditOutput('<html><body>502 Bad Gateway</body></html>');
  assert.equal(verdict.kind, 'unavailable');
  assert.equal(verdict.detail, '<html><body>502 Bad Gateway</body></html>');
});

test('empty output is transient', () => {
  assert.equal(classifyAuditOutput('').kind, 'unavailable');
  assert.equal(classifyAuditOutput('').detail, 'audit produced no JSON');
});

test('JSON with neither error nor metadata is transient', () => {
  const verdict = classifyAuditOutput(JSON.stringify({ auditReportVersion: 2 }));
  assert.equal(verdict.kind, 'unavailable');
  assert.match(verdict.detail, /neither error nor metadata/);
});
