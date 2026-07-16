import { loginHrefForCurrentPage } from './auth-redirect.js';
import { t } from './i18n/catalog.js';

type FavoriteResponse = {
  authenticated?: boolean;
  favorited?: boolean;
};

export function createGameFavoriteButton(
  roomId: string,
  options: { compact?: boolean } = {},
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = options.compact
    ? 'game-favorite-action game-favorite-action--compact'
    : 'review-action-link game-favorite-action';
  button.hidden = true;

  let authenticated = false;
  let favorited = false;
  let busy = false;
  let failed = false;

  const sync = (): void => {
    button.setAttribute('aria-pressed', String(favorited));
    button.classList.toggle('game-favorite-action--saved', favorited);
    const icon = favorited ? '★' : '☆';
    const label = favorited ? t('game.savedGame') : t('game.saveGame');
    button.textContent = options.compact ? icon : `${icon} ${label}`;
    button.setAttribute('aria-label', label);
    button.title = failed ? t('game.saveFailed') : authenticated ? label : t('game.signInToSave');
    button.disabled = busy;
  };

  const endpoint = `/api/games/${encodeURIComponent(roomId)}/favorite`;
  void fetch(endpoint)
    .then(async (response) => {
      if (!response.ok) throw new Error(`favorite state failed: ${response.status}`);
      const data = (await response.json()) as FavoriteResponse;
      authenticated = data.authenticated === true;
      favorited = data.favorited === true;
      sync();
      button.hidden = false;
    })
    .catch(() => {
      // Persistence or access can be unavailable while the review itself still
      // works (notably in memory-only dev). Hide a dead action instead of showing
      // a button that can never complete.
      button.remove();
    });

  button.addEventListener('click', async () => {
    if (busy) return;
    if (!authenticated) {
      window.location.assign(loginHrefForCurrentPage());
      return;
    }
    busy = true;
    failed = false;
    sync();
    const next = !favorited;
    try {
      const response = await fetch(endpoint, { method: next ? 'PUT' : 'DELETE' });
      if (!response.ok) throw new Error(`favorite update failed: ${response.status}`);
      const data = (await response.json()) as FavoriteResponse;
      favorited = data.favorited === true;
    } catch {
      failed = true;
    } finally {
      busy = false;
      sync();
    }
  });

  return button;
}
