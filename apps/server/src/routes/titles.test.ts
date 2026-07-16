import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import type {
  PlayerTitle,
  TitleVerificationRequest,
  TitleVerificationRequestWithUser,
} from '../persistence-titles.js';
import {
  adminDecideTitleRequestForApi,
  adminListTitleRequestsForApi,
  myTitleRequestForApi,
  submitTitleVerificationForApi,
  TITLE_EVIDENCE_MAX,
  type TitlesApiPersistence,
  tryHandle,
} from './titles.js';

// In-memory stand-in for persistence-titles.ts with the same contract: one
// pending request per user, approval stamps the user's title. Lets the whole
// request lifecycle run without Postgres (same pattern as the broadcast route
// tests).
function makeFake(): {
  deps: TitlesApiPersistence;
  userTitles: Map<string, PlayerTitle>;
  requests: TitleVerificationRequest[];
} {
  const requests: TitleVerificationRequest[] = [];
  const userTitles = new Map<string, PlayerTitle>();
  const deps: TitlesApiPersistence = {
    createTitleVerificationRequest: async (input) => {
      if (requests.some((r) => r.userId === input.userId && r.status === 'pending')) {
        return { ok: false, error: 'request_pending' };
      }
      const request: TitleVerificationRequest = {
        id: input.id,
        userId: input.userId,
        title: input.title,
        evidence: input.evidence,
        status: 'pending',
        decidedBy: null,
        decidedAt: null,
        createdAt: input.now,
      };
      requests.push(request);
      return { ok: true, request };
    },
    latestTitleVerificationRequestForUser: async (userId) => {
      const mine = requests.filter((r) => r.userId === userId);
      return mine[mine.length - 1] ?? null;
    },
    listTitleVerificationRequests: async (view) =>
      requests
        .filter((r) => (view === 'pending' ? r.status === 'pending' : r.status !== 'pending'))
        .map(
          (r): TitleVerificationRequestWithUser => ({
            ...r,
            handle: `handle-${r.userId}`,
            displayName: `Player ${r.userId}`,
            currentTitle: userTitles.get(r.userId) ?? null,
          }),
        ),
    decideTitleVerificationRequest: async (input) => {
      const request = requests.find((r) => r.id === input.id && r.status === 'pending');
      if (!request) return null;
      request.status = input.decision;
      request.decidedBy = input.decidedBy;
      request.decidedAt = input.now;
      if (input.decision === 'approved') userTitles.set(request.userId, request.title);
      return { ...request };
    },
  };
  return { deps, userTitles, requests };
}

const untitled = { id: 'user-1', title: null };

test('submit creates a pending request', async () => {
  const { deps } = makeFake();
  const result = await submitTitleVerificationForApi(
    untitled,
    { title: 'xgm', evidence: 'WXF profile: example.org/players/1, real name Wei Chen' },
    deps,
  );
  assert.equal(result.status, 200);
  const request = result.payload.request as Record<string, unknown>;
  assert.equal(request.title, 'xgm');
  assert.equal(request.status, 'pending');
});

test('submit rejects unknown and non-requestable titles fail-closed', async () => {
  const { deps, requests } = makeFake();
  // 'gm'/'wcm' are valid PlayerTitles but chess titles are not requestable while
  // the pipeline is scoped to xiangqi, so they reject like unknown values.
  for (const bad of ['XGM', 'ngm', 'grandmaster', 'gm', 'wcm', 42, null, undefined]) {
    const result = await submitTitleVerificationForApi(
      untitled,
      { title: bad, evidence: 'evidence' },
      deps,
    );
    assert.equal(result.status, 400);
    assert.deepEqual(result.payload, { error: 'invalid_title' });
  }
  assert.equal(requests.length, 0);
});

test('submit requires evidence and bounds its length', async () => {
  const { deps } = makeFake();
  const missing = await submitTitleVerificationForApi(untitled, { title: 'xgm' }, deps);
  assert.deepEqual([missing.status, missing.payload.error], [400, 'evidence_required']);
  const blank = await submitTitleVerificationForApi(
    untitled,
    { title: 'xgm', evidence: '   ' },
    deps,
  );
  assert.deepEqual([blank.status, blank.payload.error], [400, 'evidence_required']);
  const tooLong = await submitTitleVerificationForApi(
    untitled,
    { title: 'xgm', evidence: 'x'.repeat(TITLE_EVIDENCE_MAX + 1) },
    deps,
  );
  assert.deepEqual([tooLong.status, tooLong.payload.error], [400, 'evidence_too_long']);
});

test('a second submit while one is pending is rejected', async () => {
  const { deps } = makeFake();
  const first = await submitTitleVerificationForApi(
    untitled,
    { title: 'xim', evidence: 'first' },
    deps,
  );
  assert.equal(first.status, 200);
  const second = await submitTitleVerificationForApi(
    untitled,
    { title: 'xgm', evidence: 'second' },
    deps,
  );
  assert.deepEqual([second.status, second.payload.error], [409, 'request_pending']);
});

test('re-claiming the title you already hold is rejected; a different title is allowed', async () => {
  const { deps } = makeFake();
  const titled = { id: 'user-1', title: 'xim' as PlayerTitle };
  const same = await submitTitleVerificationForApi(
    titled,
    { title: 'xim', evidence: 'still me' },
    deps,
  );
  assert.deepEqual([same.status, same.payload.error], [409, 'already_titled']);
  const higher = await submitTitleVerificationForApi(
    titled,
    { title: 'xgm', evidence: 'promoted this year' },
    deps,
  );
  assert.equal(higher.status, 200);
});

test('approve marks the request decided and stamps the user title', async () => {
  const { deps, userTitles } = makeFake();
  const submitted = await submitTitleVerificationForApi(
    untitled,
    { title: 'xgm', evidence: 'WXF profile link' },
    deps,
  );
  const id = (submitted.payload.request as { id: string }).id;

  const decided = await adminDecideTitleRequestForApi(id, 'approved', 'admin-1', deps);
  assert.equal(decided.status, 200);
  assert.equal((decided.payload.request as { status: string }).status, 'approved');
  assert.equal(userTitles.get('user-1'), 'xgm');

  const mine = await myTitleRequestForApi({ id: 'user-1', title: 'xgm' }, deps);
  assert.equal((mine.payload.request as { status: string }).status, 'approved');
  assert.equal(mine.payload.title, 'xgm');
});

test('reject leaves the user untitled and allows a resubmit', async () => {
  const { deps, userTitles } = makeFake();
  const submitted = await submitTitleVerificationForApi(
    untitled,
    { title: 'xgm', evidence: 'weak evidence' },
    deps,
  );
  const id = (submitted.payload.request as { id: string }).id;

  const decided = await adminDecideTitleRequestForApi(id, 'rejected', 'admin-1', deps);
  assert.equal(decided.status, 200);
  assert.equal(userTitles.has('user-1'), false);

  const again = await submitTitleVerificationForApi(
    untitled,
    { title: 'xgm', evidence: 'stronger evidence: WXF profile link' },
    deps,
  );
  assert.equal(again.status, 200);
});

test('deciding an unknown or already-decided request is a 404', async () => {
  const { deps } = makeFake();
  const missing = await adminDecideTitleRequestForApi('nope', 'approved', 'admin-1', deps);
  assert.deepEqual([missing.status, missing.payload.error], [404, 'request_not_pending']);

  const submitted = await submitTitleVerificationForApi(
    untitled,
    { title: 'xgm', evidence: 'e' },
    deps,
  );
  const id = (submitted.payload.request as { id: string }).id;
  await adminDecideTitleRequestForApi(id, 'rejected', 'admin-1', deps);
  const twice = await adminDecideTitleRequestForApi(id, 'approved', 'admin-1', deps);
  assert.deepEqual([twice.status, twice.payload.error], [404, 'request_not_pending']);
});

test('admin list defaults to pending, supports decided, rejects unknown filters', async () => {
  const { deps } = makeFake();
  await submitTitleVerificationForApi(untitled, { title: 'xnm', evidence: 'e' }, deps);
  await submitTitleVerificationForApi(
    { id: 'user-2', title: null },
    { title: 'xwgm', evidence: 'e2' },
    deps,
  );
  const pendingDefault = await adminListTitleRequestsForApi(null, deps);
  assert.equal((pendingDefault.payload.requests as unknown[]).length, 2);

  const listed = pendingDefault.payload.requests as { id: string; handle: string }[];
  assert.equal(listed[0]?.handle, 'handle-user-1');
  await adminDecideTitleRequestForApi(listed[0]!.id, 'approved', 'admin-1', deps);

  const pending = await adminListTitleRequestsForApi('pending', deps);
  assert.equal((pending.payload.requests as unknown[]).length, 1);
  const decided = await adminListTitleRequestsForApi('decided', deps);
  assert.equal((decided.payload.requests as unknown[]).length, 1);

  const bogus = await adminListTitleRequestsForApi('everything', deps);
  assert.deepEqual([bogus.status, bogus.payload.error], [400, 'invalid_status']);
});

test('admin titles routes require an admin session in production', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    for (const [method, pathname] of [
      ['GET', '/api/admin/titles/requests'],
      ['POST', '/api/admin/titles/requests/some-id/approve'],
      ['POST', '/api/admin/titles/requests/some-id/reject'],
    ] as const) {
      const response = captureResponse();
      const handled = await tryHandle(
        {},
        { method, headers: {} } as IncomingMessage,
        response,
        pathname,
        new URL(`http://test.local${pathname}`),
      );
      assert.equal(handled, true);
      assert.equal(response.statusCode, 403);
      assert.deepEqual(JSON.parse(response.body), { error: 'admin_required' });
    }
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

type ResponseCapture = {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
};

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    statusCode: 200,
    headers: {} as Record<string, string | string[]>,
    body: '',
    writeHead(statusCode: number, headers: Record<string, string | string[]> = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
      return this;
    },
    end(chunk?: string) {
      if (chunk) this.body += chunk;
      return this;
    },
    write(chunk: string) {
      this.body += chunk;
      return true;
    },
  };
  return capture as unknown as ServerResponse & ResponseCapture;
}
