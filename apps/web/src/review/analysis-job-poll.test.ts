import { afterEach, describe, expect, it, vi } from 'vitest';
import { postAnalysisJob } from './analysis-job-poll.js';

// The async-queue client contract (#208): 200 = cached result (fast path
// unchanged), 202 = job accepted -> poll /jobs/:id until done/failed.

type FakeResponse = { status: number; ok: boolean; json(): Promise<unknown> };

function response(status: number, body: unknown): FakeResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

function stubFetch(script: Array<{ url?: string; method?: string; reply: FakeResponse }>) {
  const calls: Array<{ url: string; method: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string }) => {
      const call = { url, method: init?.method ?? 'GET' };
      calls.push(call);
      const step = script.shift();
      if (!step) throw new Error(`unexpected fetch: ${call.method} ${url}`);
      if (step.url) expect(url).toBe(step.url);
      if (step.method) expect(call.method).toBe(step.method);
      return step.reply;
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('postAnalysisJob', () => {
  it('returns the body immediately on 200 (cached fast path, no polling)', async () => {
    const calls = stubFetch([
      { method: 'POST', reply: response(200, { engineId: 'e@1', plies: [1] }) },
    ]);
    const result = await postAnalysisJob<{ engineId: string }>('/api/x/games/r/analysis');
    expect(result.engineId).toBe('e@1');
    expect(calls).toHaveLength(1);
  });

  it('polls the job endpoint on 202 until done and returns the result envelope', async () => {
    const calls = stubFetch([
      { method: 'POST', reply: response(202, { jobId: 'j1', status: 'pending' }) },
      {
        method: 'GET',
        url: '/api/x/games/r/analysis/jobs/j1',
        reply: response(200, { status: 'pending' }),
      },
      {
        method: 'GET',
        url: '/api/x/games/r/analysis/jobs/j1',
        reply: response(200, { status: 'done', result: { engineId: 'e@1', plies: [7] } }),
      },
    ]);
    const result = await postAnalysisJob<{ plies: number[] }>('/api/x/games/r/analysis', {
      pollIntervalMs: 1,
    });
    expect(result.plies).toEqual([7]);
    expect(calls).toHaveLength(3);
  });

  it('rejects with the mapped code when the job fails', async () => {
    stubFetch([
      { method: 'POST', reply: response(202, { jobId: 'j2', status: 'pending' }) },
      {
        method: 'GET',
        reply: response(200, { status: 'failed', error: 'analysis_engine_unavailable' }),
      },
    ]);
    await expect(postAnalysisJob('/api/x/games/r/analysis', { pollIntervalMs: 1 })).rejects.toThrow(
      'analysis_request_failed_analysis_engine_unavailable',
    );
  });

  it('rejects on a non-200/202 POST with the status-coded error (prefix configurable)', async () => {
    stubFetch([{ method: 'POST', reply: response(429, { error: 'rate_limited' }) }]);
    await expect(
      postAnalysisJob('/api/x/games/r/decisions', { errorPrefix: 'decisions_request_failed' }),
    ).rejects.toThrow('decisions_request_failed_429');
  });

  it('rejects when the poll endpoint errors', async () => {
    stubFetch([
      { method: 'POST', reply: response(202, { jobId: 'j3', status: 'pending' }) },
      { method: 'GET', reply: response(404, { error: 'not_found' }) },
    ]);
    await expect(postAnalysisJob('/api/x/games/r/analysis', { pollIntervalMs: 1 })).rejects.toThrow(
      'analysis_request_failed_404',
    );
  });

  it('gives up after the overall deadline', async () => {
    stubFetch([
      { method: 'POST', reply: response(202, { jobId: 'j4', status: 'pending' }) },
      { method: 'GET', reply: response(200, { status: 'pending' }) },
      { method: 'GET', reply: response(200, { status: 'pending' }) },
    ]);
    await expect(
      postAnalysisJob('/api/x/games/r/analysis', { pollIntervalMs: 5, timeoutMs: 8 }),
    ).rejects.toThrow('analysis_request_failed_timeout');
  });
});
