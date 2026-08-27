import { afterEach, describe, expect, it, vi } from 'vitest';
import { REQUESTABLE_PLAYER_TITLES } from './player-titles.js';
import { mountVerifyTitle } from './verify-title.js';

describe('verify-title page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    document.body.className = '';
  });

  it('prompts signed-out visitors to sign in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'not_signed_in' }, 401)),
    );
    const root = mountRoot();
    await mountVerifyTitle(root);

    expect(root.textContent).toContain('Sign in to verify your title');
    expect(root.querySelector('form.verify-title-form')).toBeNull();
  });

  it('renders the full title select and evidence guidance for a fresh visitor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ title: null, request: null })),
    );
    const root = mountRoot();
    await mountVerifyTitle(root);

    const select = root.querySelector<HTMLSelectElement>('select[name="title"]');
    expect(select).not.toBeNull();
    // Placeholder + the full requestable vocabulary, nothing else.
    expect(select?.options.length).toBe(REQUESTABLE_PLAYER_TITLES.length + 1);
    expect([...(select?.options ?? [])].map((o) => o.value)).toEqual([
      '',
      ...REQUESTABLE_PLAYER_TITLES,
    ]);
    expect(select?.textContent).toContain('XGM (Xiangqi Grandmaster)');
    // Both families are offered: xiangqi leads, chess follows.
    expect(select?.textContent).toContain('GM (Grandmaster)');
    expect([...(select?.options ?? [])].map((o) => o.value)).toContain('gm');

    // Families are separated so a bare GM never reads as a xiangqi title.
    const groups = [...root.querySelectorAll('select[name="title"] optgroup')];
    expect(groups.map((g) => g.getAttribute('label'))).toEqual(['Xiangqi', 'Chess']);
    expect(groups.map((g) => g.childElementCount)).toEqual([5, 8]);

    expect(root.querySelector('textarea[name="evidence"]')).not.toBeNull();
    expect(root.querySelector('.verify-title-help')?.textContent).toContain('federation profile');
  });

  it('submits a request and flips to the pending status view', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/titles/my-request') return jsonResponse({ title: null, request: null });
      if (url === '/api/titles/verify' && init?.method === 'POST') {
        return jsonResponse({
          request: {
            id: 'titlereq_1',
            title: 'xgm',
            evidence: 'WXF profile',
            status: 'pending',
            decidedAt: null,
            createdAt: '2026-07-10T00:00:00.000Z',
          },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const root = mountRoot();
    await mountVerifyTitle(root);

    const select = root.querySelector<HTMLSelectElement>('select[name="title"]');
    const evidence = root.querySelector<HTMLTextAreaElement>('textarea[name="evidence"]');
    if (!select || !evidence) throw new Error('missing form fields');
    select.value = 'xgm';
    evidence.value = 'WXF profile';
    submitForm(root);
    await flushDom();

    const post = fetchMock.mock.calls.find(([url]) => url === '/api/titles/verify');
    expect(post).toBeDefined();
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      title: 'xgm',
      evidence: 'WXF profile',
    });
    expect(root.textContent).toContain(
      'Your XGM (Xiangqi Grandmaster) request is waiting for review.',
    );
    expect(root.querySelector('form.verify-title-form')).toBeNull();
  });

  it('shows a pending request without a form, and a rejected one with resubmit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          title: null,
          request: {
            id: 'titlereq_2',
            title: 'gm',
            evidence: 'FIDE profile',
            status: 'pending',
            decidedAt: null,
            createdAt: '2026-07-10T00:00:00.000Z',
          },
        }),
      ),
    );
    const pendingRoot = mountRoot();
    await mountVerifyTitle(pendingRoot);
    expect(pendingRoot.textContent).toContain('waiting for review');
    expect(pendingRoot.querySelector('form.verify-title-form')).toBeNull();

    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          title: null,
          request: {
            id: 'titlereq_3',
            title: 'gm',
            evidence: 'FIDE profile',
            status: 'rejected',
            decidedAt: '2026-07-11T00:00:00.000Z',
            createdAt: '2026-07-10T00:00:00.000Z',
          },
        }),
      ),
    );
    const rejectedRoot = mountRoot();
    await mountVerifyTitle(rejectedRoot);
    expect(rejectedRoot.textContent).toContain('was declined');
    const submit = rejectedRoot.querySelector('form.verify-title-form button[type="submit"]');
    expect(submit?.textContent).toBe('Submit a new request');
  });

  it('surfaces server rejections as localized copy', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/titles/my-request') return jsonResponse({ title: null, request: null });
      if (url === '/api/titles/verify' && init?.method === 'POST') {
        return jsonResponse({ error: 'request_pending' }, 409);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const root = mountRoot();
    await mountVerifyTitle(root);

    const select = root.querySelector<HTMLSelectElement>('select[name="title"]');
    const evidence = root.querySelector<HTMLTextAreaElement>('textarea[name="evidence"]');
    if (!select || !evidence) throw new Error('missing form fields');
    select.value = 'xim';
    evidence.value = 'evidence';
    submitForm(root);
    await flushDom();

    expect(root.querySelector('.verify-title-form-status')?.textContent).toBe(
      'You already have a request waiting for review.',
    );
  });
});

function mountRoot(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

function submitForm(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('form.verify-title-form');
  if (!form) throw new Error('missing verify-title form');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

async function flushDom(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
