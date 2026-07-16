import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLiveRoomChat } from './spectator-chat.js';

describe('live room chat', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('renders the persistent game room with quick chat controls', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) {
        return jsonResponse({
          lines: [],
          canPost: true,
          canReport: true,
          viewerHandle: 'misty',
        });
      }
      const body = JSON.parse(String(init.body)) as { text: string };
      return jsonResponse(
        {
          line: {
            id: 'chln_quick_1',
            handle: 'misty',
            text: body.text,
            createdAt: '2026-07-14T12:00:00.000Z',
          },
        },
        201,
      );
    });
    vi.stubGlobal('fetch', fetchSpy);

    const panel = buildLiveRoomChat('room with spaces');
    document.body.append(panel);
    await flushPromises();

    expect(panel.getAttribute('aria-label')).toBe('Game chat');
    expect(panel.textContent).toContain('Chat room');
    expect(fetchSpy).toHaveBeenCalledWith('/api/chat/game/room%20with%20spaces');
    expect(
      Array.from(panel.querySelectorAll<HTMLButtonElement>('.review-spectator-chat__quick-button'))
        .map((button) => button.textContent)
        .join(','),
    ).toBe('GG,WP,TY,GTG,BYE');

    panel.querySelector<HTMLButtonElement>('.review-spectator-chat__quick-button')?.click();
    await flushPromises();

    expect(fetchSpy).toHaveBeenLastCalledWith('/api/chat/game/room%20with%20spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'GG' }),
    });
    expect(panel.textContent).toContain('misty');
    expect(panel.textContent).toContain('GG');
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
