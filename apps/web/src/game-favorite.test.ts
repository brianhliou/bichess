import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameFavoriteButton } from './game-favorite.js';

describe('game favorite action', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/game/xiangqi/test-game');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('loads state and idempotently saves with PUT', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: true, favorited: false }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: true, favorited: true }), { status: 200 }),
      );
    const button = createGameFavoriteButton('game / one');
    document.body.append(button);

    await vi.waitFor(() => expect(button.hidden).toBe(false));
    expect(button.textContent).toBe('☆ Save game');
    expect(button.getAttribute('aria-pressed')).toBe('false');

    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe('★ Saved'));
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(fetchSpy).toHaveBeenNthCalledWith(1, '/api/games/game%20%2F%20one/favorite');
    expect(fetchSpy).toHaveBeenNthCalledWith(2, '/api/games/game%20%2F%20one/favorite', {
      method: 'PUT',
    });
  });

  it('shows a sign-in affordance for an anonymous viewer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ authenticated: false, favorited: false }), { status: 200 }),
    );
    const button = createGameFavoriteButton('test-game');
    document.body.append(button);

    await vi.waitFor(() => expect(button.hidden).toBe(false));
    expect(button.textContent).toBe('☆ Save game');
    expect(button.title).toBe('Sign in to save');
  });

  it('renders a compact star with an accessible save label', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true, favorited: false }), { status: 200 }),
    );
    const button = createGameFavoriteButton('test-game', { compact: true });
    document.body.append(button);

    await vi.waitFor(() => expect(button.hidden).toBe(false));
    expect(button.classList).toContain('game-favorite-action--compact');
    expect(button.textContent).toBe('☆');
    expect(button.getAttribute('aria-label')).toBe('Save game');
  });
});
