// Global friends-online widget (lichess parity): a bottom-corner pill that
// expands into a list of the followed players who are online right now. Mounted
// once per page load from main.ts behind the friendsOnline build flag; it
// self-gates on a signed-in viewer (anonymous → no-op) and polls while the tab
// is visible.
//
// Each row hovers into the shared user-card (user-card.ts) — the same card any
// surface reuses — so the widget is also the first consumer proving that reuse.

import './friends-online.css';
import { t } from './i18n/catalog.js';
import { currentLocale, type Locale } from './i18n/locale.js';
import { prependTitleBadge } from './player-titles.js';
import { fetchCurrentUser } from './site-shell.js';
import { attachUserCard } from './user-card.js';
import { ratingVariantLabel } from './variants.js';

type OnlineFriend = {
  handle: string;
  displayName: string;
  title?: string | null;
  rating: { variant: string; eloRating: number; provisional: boolean } | null;
  playing: boolean;
};

const POLL_MS = 60_000;
const STORAGE_KEY = 'mistboard.friendsOnline.expanded';

let mounted = false;

export async function mountFriendsOnline(): Promise<void> {
  // Guard against a double mount (defensive: main.ts calls this once, but a
  // future soft-nav caller shouldn't stack widgets).
  if (mounted) return;
  const user = await fetchCurrentUser().catch(() => null);
  if (!user) return;
  mounted = true;

  const locale = currentLocale();
  const root = document.createElement('aside');
  root.className = 'friends-online';
  root.hidden = true; // revealed on the first successful poll

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'friends-online-toggle';
  toggle.setAttribute('aria-label', t('friends.online.aria', {}, locale));

  const chevron = document.createElement('span');
  chevron.className = 'friends-online-chevron';
  chevron.setAttribute('aria-hidden', 'true');

  const toggleLabel = document.createElement('span');
  toggleLabel.className = 'friends-online-toggle-label';

  toggle.append(chevron, toggleLabel);

  const list = document.createElement('ul');
  list.className = 'friends-online-list';

  root.append(toggle, list);
  document.body.append(root);

  let expanded = readExpanded();
  let latest: OnlineFriend[] = [];

  const applyExpanded = () => {
    root.classList.toggle('friends-online-expanded', expanded);
    list.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    chevron.textContent = expanded ? '▼' : '▲';
    renderToggleLabel(toggleLabel, latest.length, expanded, locale);
  };

  toggle.addEventListener('click', () => {
    expanded = !expanded;
    writeExpanded(expanded);
    applyExpanded();
  });

  applyExpanded();

  const refresh = async () => {
    const friends = await fetchOnlineFriends();
    if (friends === null) return; // transient failure: keep the last render
    latest = friends;
    // Always-visible (lichess parity): the pill stays put even with nobody
    // online, so the corner is a stable anchor rather than a box that blinks in
    // and out. The empty case renders "None of your friends are online."
    root.hidden = false;
    renderList(list, friends, locale);
    renderToggleLabel(toggleLabel, friends.length, expanded, locale);
  };

  await refresh();
  window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    void refresh();
  }, POLL_MS);
}

function renderToggleLabel(
  labelEl: HTMLElement,
  count: number,
  expanded: boolean,
  locale: Locale,
): void {
  // Expanded header names the count ("5 friends online"); the collapsed pill
  // keeps the short lichess label ("friends online").
  if (expanded) {
    labelEl.textContent = t(
      count === 1 ? 'friends.online.countOne' : 'friends.online.countMany',
      { count },
      locale,
    );
  } else {
    labelEl.textContent = t('friends.online.label', {}, locale);
  }
}

function renderList(list: HTMLElement, friends: OnlineFriend[], locale: Locale): void {
  list.replaceChildren();
  if (friends.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'friends-online-empty';
    empty.textContent = t('friends.online.empty', {}, locale);
    list.append(empty);
    return;
  }
  for (const friend of friends) {
    list.append(buildRow(friend, locale));
  }
}

function buildRow(friend: OnlineFriend, locale: Locale): HTMLElement {
  const item = document.createElement('li');
  item.className = 'friends-online-row';

  const link = document.createElement('a');
  link.className = 'friends-online-link';
  link.href = `/@/${encodeURIComponent(friend.handle)}`;

  const dot = document.createElement('span');
  dot.className = 'friends-online-dot';
  dot.setAttribute('aria-hidden', 'true');

  const name = document.createElement('span');
  name.className = 'friends-online-name';
  name.textContent = friend.displayName;

  link.append(dot);
  prependTitleBadge(link, friend.title, locale);
  link.append(name);

  if (friend.playing) {
    const mark = document.createElement('span');
    mark.className = 'friends-online-playing';
    // Text-presentation crossed swords, so platforms don't swap in emoji.
    mark.textContent = '⚔︎';
    mark.title = t('profile.playingNow', {}, locale);
    mark.setAttribute('aria-label', t('profile.playingNow', {}, locale));
    link.append(mark);
  }

  if (friend.rating) {
    const rating = document.createElement('span');
    rating.className = 'friends-online-rating';
    rating.textContent = `${friend.rating.eloRating}${friend.rating.provisional ? '?' : ''}`;
    const label = ratingVariantLabel(friend.rating.variant);
    if (label) rating.title = label;
    link.append(rating);
  }

  attachUserCard(link, friend.handle, { online: true, playing: friend.playing });

  item.append(link);
  return item;
}

async function fetchOnlineFriends(): Promise<OnlineFriend[] | null> {
  const resp = await fetch('/api/relations/online-following').catch(() => null);
  if (!resp?.ok) return null;
  try {
    const data = (await resp.json()) as { players: OnlineFriend[] };
    return data.players;
  } catch {
    return null;
  }
}

function readExpanded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeExpanded(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Storage unavailable (private mode): the widget just forgets state.
  }
}
