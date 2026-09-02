import assert from 'node:assert/strict';
import test from 'node:test';
import { routes } from './http-api.js';
import { buildOpenApiDocument } from './openapi.js';

// The document is hand-written, so the one thing that can rot is the list of
// paths. This walks every documented path, with its parameters filled in,
// through the real dispatch array and fails if no module claims it: a route
// that was renamed or removed cannot stay in the reference.

const EXAMPLES: Record<string, string> = {
  roomId: 'abc',
  variant: 'xiangqi',
  handle: 'someone',
  id: 'abc',
  tourSlug: 'tour',
  roundId: 'r1',
  boardId: 'b1',
};

function fill(path: string): string {
  return path.replace(/\{(\w+)\}/g, (_m, name: string) => EXAMPLES[name] ?? 'x');
}

async function claimed(pathname: string): Promise<boolean> {
  const url = new URL(pathname, 'https://mistboard.com');
  const response = {
    writeHead() {
      return response;
    },
    setHeader() {},
    end() {},
  };
  const request = { method: 'GET', headers: { host: 'mistboard.com' }, url: pathname };
  const ctx = {
    rooms: new Map(),
    inMemoryGameSummary: () => null,
    playableEngines: () => [],
  };
  for (const route of routes) {
    let handled = false;
    try {
      handled = await route.tryHandle(
        ctx as never,
        request as never,
        response as never,
        url.pathname,
        url,
      );
    } catch {
      // A handler that threw still claimed the path; what it does without a
      // database is not this test's question.
      handled = true;
    }
    if (handled) return true;
  }
  return false;
}

test('the document is OpenAPI 3.1 with a tag and a 200 on every operation', () => {
  const doc = buildOpenApiDocument('https://mistboard.com') as {
    openapi: string;
    tags: Array<{ name: string }>;
    paths: Record<
      string,
      Record<string, { tags?: string[]; summary?: string; responses: Record<string, unknown> }>
    >;
  };
  assert.equal(doc.openapi, '3.1.0');
  const tagNames = new Set(doc.tags.map((t) => t.name));
  for (const [path, methods] of Object.entries(doc.paths)) {
    assert.ok(path.startsWith('/api/'), path);
    for (const [method, op] of Object.entries(methods)) {
      assert.equal(method, 'get', `${path}: only anonymous reads are documented`);
      assert.ok(op.summary, `${path} has no summary`);
      assert.ok(op.tags?.[0] && tagNames.has(op.tags[0]), `${path} has an unknown tag`);
      assert.ok(op.responses['200'], `${path} has no 200`);
    }
  }
});

test('every documented path is claimed by a route module', async () => {
  const doc = buildOpenApiDocument('https://mistboard.com') as { paths: Record<string, unknown> };
  for (const path of Object.keys(doc.paths)) {
    assert.equal(await claimed(fill(path)), true, `${path} is documented but no route claims it`);
  }
});

test('the servers entry is the origin the caller used', () => {
  const doc = buildOpenApiDocument('http://localhost:3011') as { servers: Array<{ url: string }> };
  assert.equal(doc.servers[0]?.url, 'http://localhost:3011');
});
