import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { EngineTurnRequest } from '@mistboard/game';
import { requestEngineTurnAt } from '../internal-engine-client.js';
import {
  assertSafeExternalEndpoint,
  isPublicUnicastIp,
  UnsafeEndpointError,
} from './endpoint-guard.js';

// ---- SSRF guard ----

test('isPublicUnicastIp accepts public and rejects internal ranges', () => {
  for (const ip of ['93.184.216.34', '8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
    assert.equal(isPublicUnicastIp(ip), true, `${ip} should be public`);
  }
  for (const ip of [
    '127.0.0.1', // loopback
    '10.0.0.5', // private
    '172.16.0.1', // private
    '192.168.1.1', // private
    '169.254.169.254', // link-local / cloud metadata
    '100.64.0.1', // CGNAT
    '0.0.0.0', // this-network
    '224.0.0.1', // multicast
    '::1', // IPv6 loopback
    'fd00:ec2::254', // IPv6 ULA (AWS metadata)
    'fe80::1', // IPv6 link-local
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    'not-an-ip',
  ]) {
    assert.equal(isPublicUnicastIp(ip), false, `${ip} should be rejected`);
  }
});

test('assertSafeExternalEndpoint requires https', async () => {
  await assert.rejects(
    assertSafeExternalEndpoint('http://example.com', {
      resolveHost: async () => ['93.184.216.34'],
    }),
    UnsafeEndpointError,
  );
});

test('assertSafeExternalEndpoint accepts an https host resolving to a public IP', async () => {
  await assertSafeExternalEndpoint('https://bot.example.com', {
    resolveHost: async () => ['93.184.216.34'],
  });
});

test('assertSafeExternalEndpoint rejects internal-resolving hosts (SSRF)', async () => {
  for (const addr of ['169.254.169.254', '10.0.0.5', '127.0.0.1', '::1']) {
    await assert.rejects(
      assertSafeExternalEndpoint('https://evil.example.com', { resolveHost: async () => [addr] }),
      UnsafeEndpointError,
      `should reject host resolving to ${addr}`,
    );
  }
});

test('assertSafeExternalEndpoint rejects if ANY resolved address is internal', async () => {
  await assert.rejects(
    assertSafeExternalEndpoint('https://mixed.example.com', {
      resolveHost: async () => ['93.184.216.34', '10.0.0.1'],
    }),
    UnsafeEndpointError,
  );
});

test('assertSafeExternalEndpoint rejects literal internal IPs without resolving', async () => {
  for (const url of ['https://127.0.0.1/', 'https://[::1]/', 'https://169.254.169.254/']) {
    await assert.rejects(
      assertSafeExternalEndpoint(url, {
        resolveHost: async () => {
          throw new Error('should not resolve a literal IP');
        },
      }),
      UnsafeEndpointError,
      `should reject ${url}`,
    );
  }
});

// ---- transport hardening (body cap + external diagnostics drop) ----

type ServerMode = 'valid-with-diagnostics' | 'oversized';

async function startFakeEngine(
  mode: ServerMode,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const parsed = JSON.parse(body) as { gameId: string; sessionId: string };
      if (mode === 'oversized') {
        const huge = 'x'.repeat(2 * 1024 * 1024); // 2 MiB > 1 MiB cap
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            protocolVersion: '1',
            ...parsed,
            move: { from: 'e2', to: 'e4' },
            pad: huge,
          }),
        );
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          protocolVersion: '1',
          gameId: parsed.gameId,
          sessionId: parsed.sessionId,
          move: { from: 'e2', to: 'e4' },
          diagnostics: { secret: 'do-not-trust', huge: 'x'.repeat(100) },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const REQUEST = { gameId: 'g1', sessionId: 's1' } as unknown as EngineTurnRequest;

test('transport rejects an oversized response body', async () => {
  const engine = await startFakeEngine('oversized');
  try {
    await assert.rejects(
      requestEngineTurnAt({ baseUrl: engine.url, token: 't' }, REQUEST, 5_000),
      /too large|exceeded/,
    );
  } finally {
    await engine.close();
  }
});

test('transport keeps diagnostics by default but drops them for untrusted endpoints', async () => {
  const engine = await startFakeEngine('valid-with-diagnostics');
  try {
    const trusted = await requestEngineTurnAt({ baseUrl: engine.url, token: 't' }, REQUEST, 5_000);
    assert.ok(trusted.diagnostics, 'trusted call keeps diagnostics');

    const untrusted = await requestEngineTurnAt(
      { baseUrl: engine.url, token: 't' },
      REQUEST,
      5_000,
      {
        trustDiagnostics: false,
      },
    );
    assert.equal(untrusted.diagnostics, undefined, 'untrusted call drops diagnostics');
    assert.deepEqual(untrusted.move, { from: 'e2', to: 'e4' }, 'move still parsed');
  } finally {
    await engine.close();
  }
});
