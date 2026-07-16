import './notification-nav.css';
import { readAccountPreferences } from './account-preferences.js';

// A reusable nav notification button: a bell + count badge that aggregates every
// registered source. Built to grow — correspondence "your move" is the first
// source; future kinds (game-over, deadline-soon, opponent-joined, system)
// register the same way and show up as additional panel rows. account-nav owns
// signed-in detection and the nav MutationObserver, so it mounts the bell (via
// mountNotificationBell) and tears it down on sign-out — this module owns only
// the registry, rendering, and refresh.

export type NotificationEntry = { label: string; href: string };
export type NotificationSnapshot = { count: number; entries: NotificationEntry[] };
// A source reports its pending count (summed into the badge) and the rows it
// contributes to the panel. Must resolve fast and never throw (errors are
// swallowed to a zero snapshot so one bad source can't blank the bell).
export type NotificationSource = () => Promise<NotificationSnapshot>;

const sources: NotificationSource[] = [];
let lastSnapshot: NotificationSnapshot = { count: 0, entries: [] };
let dismissBound = false;
let refreshTimer: number | null = null;
let visibilityBound = false;

export function registerNotificationSource(source: NotificationSource): void {
  sources.push(source);
}

// The correspondence source: badge counts games awaiting the player's move; the
// panel always offers a link to the dashboard so the bell is the entry point to
// /correspondence regardless of count. Registered from main.ts behind the flag.
export const correspondenceNotificationSource: NotificationSource = async () => {
  if (!readAccountPreferences().correspondenceBell) return { count: 0, entries: [] };
  const resp = await fetch('/api/correspondence/games').catch(() => null);
  if (!resp?.ok) return { count: 0, entries: [] };
  const data = (await resp.json()) as { yourMoveCount?: number };
  const count = typeof data.yourMoveCount === 'number' ? data.yourMoveCount : 0;
  const label =
    count > 0
      ? `${count} ${count === 1 ? 'game needs' : 'games need'} your move`
      : 'Correspondence games';
  return { count, entries: [{ label, href: '/correspondence' }] };
};

// The inbox source: badge counts unread DM threads; the panel always offers
// the inbox link so the bell doubles as the /inbox entry point. Anonymous
// visitors get a 401 → zero snapshot (and the bell never mounts signed-out).
export const inboxNotificationSource: NotificationSource = async () => {
  if (!readAccountPreferences().inboxBell) return { count: 0, entries: [] };
  const resp = await fetch('/api/inbox/unread-count').catch(() => null);
  if (!resp?.ok) return { count: 0, entries: [] };
  const data = (await resp.json()) as { count?: number };
  const count = typeof data.count === 'number' ? data.count : 0;
  const label = count > 0 ? `${count} unread ${count === 1 ? 'message' : 'messages'}` : 'Inbox';
  return { count, entries: [{ label, href: '/inbox' }] };
};

export function mountNotificationBell(nav: HTMLElement): void {
  if (sources.length === 0) return;
  const utilities = nav.querySelector<HTMLElement>('.site-nav-utilities');
  if (!utilities) return;
  if (utilities.querySelector('[data-notification-nav]')) return;

  const control = document.createElement('div');
  control.className = 'notif-nav';
  control.dataset.notificationNav = '';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'notif-nav-trigger';
  trigger.setAttribute('aria-label', 'Notifications');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.innerHTML = BELL_ICON;

  const badge = document.createElement('span');
  badge.className = 'notif-nav-badge';
  badge.hidden = true;
  trigger.append(badge);

  const panel = document.createElement('div');
  panel.className = 'notif-nav-panel';
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', 'Notifications');

  trigger.addEventListener('click', () => {
    const open = !control.classList.contains('notif-nav-open');
    for (const other of document.querySelectorAll<HTMLElement>('.notif-nav-open')) {
      if (other !== control) closeBell(other);
    }
    control.classList.toggle('notif-nav-open', open);
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  control.append(trigger, panel);

  // Sit just left of the account menu in the utilities row.
  const account = utilities.querySelector<HTMLElement>('[data-account-nav], [data-account-slot]');
  if (account) utilities.insertBefore(control, account);
  else utilities.append(control);

  ensureDismiss();
  ensureRefreshLoop();
  applySnapshot(control);
  void refreshNotifications();
}

export function clearNotificationBells(): void {
  for (const el of document.querySelectorAll('[data-notification-nav]')) el.remove();
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// Re-poll every source and repaint all mounted bells. Called on mount; callers
// (e.g. after a move) can re-invoke to refresh without a page load.
export async function refreshNotifications(): Promise<void> {
  if (sources.length === 0) return;
  const snapshots = await Promise.all(
    sources.map((source) =>
      source().catch(() => ({ count: 0, entries: [] }) as NotificationSnapshot),
    ),
  );
  lastSnapshot = {
    count: snapshots.reduce((total, snapshot) => total + snapshot.count, 0),
    entries: snapshots.flatMap((snapshot) => snapshot.entries),
  };
  for (const control of document.querySelectorAll<HTMLElement>('[data-notification-nav]')) {
    applySnapshot(control);
  }
}

function applySnapshot(control: HTMLElement): void {
  const badge = control.querySelector<HTMLElement>('.notif-nav-badge');
  if (badge) {
    badge.textContent = String(lastSnapshot.count);
    badge.hidden = lastSnapshot.count === 0;
  }
  const panel = control.querySelector<HTMLElement>('.notif-nav-panel');
  if (!panel) return;
  panel.replaceChildren();
  if (lastSnapshot.entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'notif-nav-empty';
    empty.textContent = "You're all caught up";
    panel.append(empty);
    return;
  }
  for (const entry of lastSnapshot.entries) {
    const link = document.createElement('a');
    link.className = 'notif-nav-item';
    link.href = entry.href;
    link.setAttribute('role', 'menuitem');
    link.textContent = entry.label;
    panel.append(link);
  }
}

function closeBell(control: HTMLElement): void {
  control.classList.remove('notif-nav-open');
  control.querySelector('.notif-nav-trigger')?.setAttribute('aria-expanded', 'false');
}

function ensureDismiss(): void {
  if (dismissBound) return;
  dismissBound = true;
  document.addEventListener('click', (event) => {
    const target = event.target as Node;
    for (const control of document.querySelectorAll<HTMLElement>('.notif-nav-open')) {
      if (!control.contains(target)) closeBell(control);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const control of document.querySelectorAll<HTMLElement>('.notif-nav-open'))
      closeBell(control);
  });
}

function ensureRefreshLoop(): void {
  if (refreshTimer === null) {
    refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshNotifications();
    }, 60_000);
  }
  if (visibilityBound) return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (
      document.visibilityState === 'visible' &&
      document.querySelector('[data-notification-nav]')
    ) {
      void refreshNotifications();
    }
  });
}

const BELL_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
