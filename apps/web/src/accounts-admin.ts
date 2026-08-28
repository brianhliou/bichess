// Unlisted admin account roster (/accounts): every registered account, closed
// and private ones included, with signup date, last seen, and completed-game
// count. Admin-gated by /api/admin/accounts (open in local dev). Reached from
// the account menu's admin group beside /database and /engines; the page
// itself is English-only like the other admin tools.
import './accounts-admin.css';
import { buildNav } from './site-shell.js';

type AccountRow = {
  id: string;
  email: string;
  emailVerified: boolean;
  handle: string;
  displayName: string;
  accountRole: 'player' | 'admin';
  title: string | null;
  patron: boolean;
  profileVisibility: 'private' | 'unlisted' | 'public';
  createdAt: string;
  lastSeenAt: string | null;
  closedAt: string | null;
  gamesPlayed: number;
};

type RosterSort = 'newest' | 'seen' | 'games';

type RosterPage = {
  accounts: AccountRow[];
  total: number;
  summary: { accounts: number; last7d: number; last30d: number };
  offset: number;
};

const rosterSorts: Record<RosterSort, string> = {
  newest: 'Newest',
  seen: 'Last seen',
  games: 'Most games',
};

// One fetch covers the whole roster at today's scale; the Show more control
// exists so the page keeps working past it instead of silently truncating.
const pageSize = 200;

class AdminRequiredError extends Error {}

export async function mountAccountsAdmin(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('accounts-admin-page');

  const shell = document.createElement('main');
  shell.className = 'site-section accounts-admin-shell';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Accounts';

  const sub = document.createElement('p');
  sub.className = 'accounts-admin-sub';
  sub.textContent =
    'Internal · admin only. Every registered account, closed and private ones included, with completed games per account.';

  const state = stateFromUrl();

  const form = document.createElement('form');
  form.className = 'accounts-admin-controls';
  const search = document.createElement('input');
  search.type = 'search';
  search.name = 'q';
  search.className = 'accounts-admin-input';
  search.placeholder = 'Handle, name, or email';
  search.setAttribute('aria-label', 'Search accounts');
  search.value = state.search;
  const sort = document.createElement('select');
  sort.name = 'sort';
  sort.className = 'accounts-admin-select';
  sort.setAttribute('aria-label', 'Sort');
  for (const [value, label] of Object.entries(rosterSorts)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === state.sort;
    sort.append(option);
  }
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'accounts-admin-btn';
  submit.textContent = 'Search';
  form.append(search, sort, submit);

  const summary = document.createElement('p');
  summary.className = 'accounts-admin-summary';

  const body = document.createElement('section');
  body.className = 'accounts-admin-body';
  body.append(statusLine('Loading…'));

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'accounts-admin-btn accounts-admin-more';
  more.hidden = true;

  shell.append(heading, sub, form, summary, body, more);
  root.append(buildNav(), shell);

  let loaded: AccountRow[] = [];
  let total = 0;
  let loading = false;

  async function load(append: boolean): Promise<void> {
    if (loading) return;
    loading = true;
    more.disabled = true;
    if (!append) {
      loaded = [];
      body.replaceChildren(statusLine('Loading…'));
    }
    try {
      const page = await fetchRoster(state, append ? loaded.length : 0);
      loaded = append ? loaded.concat(page.accounts) : page.accounts;
      total = page.total;
      summary.textContent = summaryText(page.summary, total, state.search);
      body.replaceChildren(
        loaded.length === 0
          ? statusLine(state.search ? 'No accounts match.' : 'No accounts yet.')
          : buildTable(loaded),
      );
      more.hidden = loaded.length >= total;
      more.textContent = `Show more (${loaded.length} of ${total})`;
    } catch (err) {
      body.replaceChildren(
        statusLine(err instanceof AdminRequiredError ? err.message : 'Could not load accounts.'),
      );
      more.hidden = true;
    } finally {
      loading = false;
      more.disabled = false;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.search = search.value.trim();
    syncUrl(state);
    void load(false);
  });
  sort.addEventListener('change', () => {
    state.sort = isRosterSort(sort.value) ? sort.value : 'newest';
    syncUrl(state);
    void load(false);
  });
  more.addEventListener('click', () => void load(true));

  await load(false);
}

type RosterState = { sort: RosterSort; search: string };

function isRosterSort(value: string): value is RosterSort {
  return value in rosterSorts;
}

// The sort and search live in the URL so a filtered view can be reloaded or
// shared with another admin; defaults are dropped so the bare /accounts stays
// clean.
function stateFromUrl(): RosterState {
  const params = new URLSearchParams(window.location.search);
  const sort = params.get('sort') ?? '';
  return {
    sort: isRosterSort(sort) ? sort : 'newest',
    search: (params.get('q') ?? '').trim(),
  };
}

function syncUrl(state: RosterState): void {
  const params = new URLSearchParams();
  if (state.search) params.set('q', state.search);
  if (state.sort !== 'newest') params.set('sort', state.sort);
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

async function fetchRoster(state: RosterState, offset: number): Promise<RosterPage> {
  const params = new URLSearchParams({
    sort: state.sort,
    limit: String(pageSize),
    offset: String(offset),
  });
  if (state.search) params.set('q', state.search);
  const resp = await fetch(`/api/admin/accounts?${params.toString()}`, {
    headers: { accept: 'application/json' },
  });
  if (resp.status === 403) {
    throw new AdminRequiredError('Admin access required. Sign in with an admin account.');
  }
  if (!resp.ok) throw new Error(`accounts_query_failed_${resp.status}`);
  return (await resp.json()) as RosterPage;
}

function summaryText(summary: RosterPage['summary'], total: number, search: string): string {
  const parts = [
    `${summary.accounts} ${summary.accounts === 1 ? 'account' : 'accounts'}`,
    `+${summary.last7d} this week`,
    `+${summary.last30d} this month`,
  ];
  if (search) parts.push(`${total} matching "${search}"`);
  return parts.join(' · ');
}

function buildTable(accounts: AccountRow[]): HTMLElement {
  const table = document.createElement('table');
  table.className = 'accounts-admin-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['#', 'Account', 'Joined', 'Last seen', 'Games', 'Notes']) {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.append(th);
  }
  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  accounts.forEach((account, index) => {
    const tr = document.createElement('tr');
    if (account.closedAt) tr.classList.add('is-closed');

    const rank = cell(String(index + 1));
    rank.classList.add('accounts-admin-rank');

    const joined = cell(formatDate(account.createdAt));
    joined.title = formatDateTime(account.createdAt);

    const seen = cell(account.lastSeenAt ? formatTimeAgo(account.lastSeenAt) : '-');
    if (account.lastSeenAt) seen.title = formatDateTime(account.lastSeenAt);
    else seen.classList.add('accounts-admin-empty');

    const games = cell(String(account.gamesPlayed));
    games.classList.add('accounts-admin-games');

    tr.append(rank, accountCell(account), joined, seen, games, notesCell(account));
    tbody.append(tr);
  });
  table.append(tbody);

  // Six columns do not fit a phone; the table scrolls inside its own box so
  // the page never scrolls sideways (same as /engines).
  const scroller = document.createElement('div');
  scroller.className = 'accounts-admin-table-scroll';
  scroller.append(table);
  return scroller;
}

function accountCell(account: AccountRow): HTMLTableCellElement {
  const td = document.createElement('td');
  td.className = 'accounts-admin-account';
  // A closed account has no profile to open; its name stays plain text.
  if (account.closedAt) {
    td.append(span('accounts-admin-name', account.displayName));
  } else {
    const link = document.createElement('a');
    link.className = 'accounts-admin-name accounts-admin-name-link';
    link.href = `/@/${encodeURIComponent(account.handle)}`;
    link.textContent = account.displayName;
    td.append(link);
  }
  td.append(span('accounts-admin-handle', `@${account.handle}`));
  td.append(span('accounts-admin-email', account.email));
  return td;
}

// What the public profile hides: role, title, patronage, verification,
// visibility, closure. Nothing shown when the account is a plain verified
// public account.
function notesCell(account: AccountRow): HTMLTableCellElement {
  const td = document.createElement('td');
  td.className = 'accounts-admin-notes';
  const badges: Array<{ label: string; tone?: 'warn' }> = [];
  if (account.accountRole === 'admin') badges.push({ label: 'Admin' });
  if (account.title) badges.push({ label: account.title });
  if (account.patron) badges.push({ label: 'Patron' });
  if (!account.emailVerified) badges.push({ label: 'Unverified', tone: 'warn' });
  if (account.profileVisibility !== 'public') {
    badges.push({ label: account.profileVisibility === 'private' ? 'Private' : 'Unlisted' });
  }
  if (account.closedAt)
    badges.push({ label: `Closed ${formatDate(account.closedAt)}`, tone: 'warn' });
  for (const badge of badges) {
    const el = span('accounts-admin-badge', badge.label);
    if (badge.tone === 'warn') el.classList.add('accounts-admin-badge--warn');
    td.append(el);
  }
  return td;
}

function cell(text: string): HTMLTableCellElement {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

function span(className: string, text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

function statusLine(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'accounts-admin-status';
  p.textContent = text;
  return p;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '-';
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}
