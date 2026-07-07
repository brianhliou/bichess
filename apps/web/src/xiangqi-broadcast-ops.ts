import './xiangqi-broadcast-ops.css';
import { buildNav } from './site-shell.js';

type SyncLog = {
  id: number;
  tourSlug: string | null;
  roundId: string | null;
  boardId: string | null;
  sourceBoardId: string | null;
  severity: 'info' | 'warning' | 'error';
  kind: string;
  message: string;
  createdAt: string;
};

type OpsTour = {
  tour: {
    slug: string;
    name: string;
    location?: string;
    startsAt?: string;
    endsAt?: string;
  };
  sourceUrl: string | null;
  roundCount: number;
  boardCount: number;
  liveBoardCount: number;
  completeBoardCount: number;
  scheduledBoardCount: number;
  totalPlies: number;
  updatedAt: string | null;
  syncLogs: SyncLog[];
};

type OpsResponse = {
  tours: OpsTour[];
};

type PollResponse = {
  result?: {
    ok: boolean;
    sourceUrl: string;
    tourSlug?: string;
    roundsImported?: number;
    boardsSeen?: number;
    boardsFailed?: number;
    kind?: string;
    message?: string;
  };
  error?: string;
};

class AdminRequiredError extends Error {}

export async function mountXiangqiBroadcastOps(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('xqb-ops-route');

  const shell = document.createElement('main');
  shell.className = 'site-section xqb-ops-shell';
  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Xiangqi broadcast ops';
  const sub = document.createElement('p');
  sub.className = 'xqb-ops-sub';
  sub.textContent =
    'Internal · admin only. Source health, latest sync results, and local/manual poll controls.';
  const body = document.createElement('section');
  body.className = 'xqb-ops-body';
  body.append(statusLine('Loading...'));

  shell.append(heading, sub, body);
  root.append(buildNav(), shell);

  await refresh(body);
}

async function refresh(body: HTMLElement): Promise<void> {
  body.replaceChildren(statusLine('Loading...'));
  try {
    const data = await fetchOps();
    if (data.tours.length === 0) {
      body.replaceChildren(statusLine('No xiangqi broadcasts have been imported yet.'));
      return;
    }
    body.replaceChildren(...data.tours.map((tour) => tourPanel(tour, body)));
  } catch (err) {
    body.replaceChildren(
      statusLine(err instanceof AdminRequiredError ? err.message : 'Could not load ops data.'),
    );
  }
}

async function fetchOps(): Promise<OpsResponse> {
  const response = await fetch('/api/admin/xiangqi/broadcasts', {
    headers: { accept: 'application/json' },
  });
  if (response.status === 403) {
    throw new AdminRequiredError('Admin access required. Sign in with an admin account.');
  }
  if (!response.ok) throw new Error(`broadcast_ops_failed_${response.status}`);
  return (await response.json()) as OpsResponse;
}

function tourPanel(entry: OpsTour, body: HTMLElement): HTMLElement {
  const section = document.createElement('article');
  section.className = 'xqb-ops-panel';

  const top = document.createElement('div');
  top.className = 'xqb-ops-panel-top';
  const copy = document.createElement('div');
  copy.className = 'xqb-ops-copy';
  const title = document.createElement('h2');
  title.textContent = entry.tour.name;
  const meta = document.createElement('p');
  meta.textContent = [
    entry.tour.location ?? null,
    entry.tour.startsAt ? formatDate(entry.tour.startsAt) : null,
    `Updated ${formatDateTime(entry.updatedAt)}`,
  ]
    .filter(Boolean)
    .join(' · ');
  copy.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'xqb-ops-actions';
  const view = document.createElement('a');
  view.href = `/broadcast/xiangqi/${encodeURIComponent(entry.tour.slug)}`;
  view.textContent = 'View';
  view.className = 'xqb-ops-link';
  const poll = document.createElement('button');
  poll.type = 'button';
  poll.textContent = 'Poll';
  poll.className = 'xqb-ops-button';
  poll.disabled = !entry.sourceUrl;
  const result = document.createElement('span');
  result.className = 'xqb-ops-poll-result';
  actions.append(view, poll, result);
  top.append(copy, actions);

  const stats = document.createElement('dl');
  stats.className = 'xqb-ops-stats';
  stats.append(
    stat('Rounds', entry.roundCount),
    stat('Boards', entry.boardCount),
    stat('Live', entry.liveBoardCount),
    stat('Complete', entry.completeBoardCount),
    stat('Scheduled', entry.scheduledBoardCount),
    stat('Plies', entry.totalPlies),
  );

  const source = document.createElement('p');
  source.className = entry.sourceUrl ? 'xqb-ops-source' : 'xqb-ops-source xqb-ops-source-missing';
  source.textContent = entry.sourceUrl ? `Source: ${entry.sourceUrl}` : 'Source: not configured';

  const logs = document.createElement('div');
  logs.className = 'xqb-ops-logs';
  const logsTitle = document.createElement('h3');
  logsTitle.textContent = 'Recent sync';
  logs.append(logsTitle);
  if (entry.syncLogs.length === 0) {
    logs.append(statusLine('No sync logs yet.'));
  } else {
    const list = document.createElement('ul');
    for (const log of entry.syncLogs) list.append(logRow(log));
    logs.append(list);
  }

  poll.onclick = () => {
    void runPoll(entry, poll, result, body);
  };

  section.append(top, stats, source, logs);
  return section;
}

async function runPoll(
  entry: OpsTour,
  button: HTMLButtonElement,
  result: HTMLElement,
  body: HTMLElement,
): Promise<void> {
  button.disabled = true;
  result.textContent = 'Polling...';
  try {
    const response = await fetch(
      `/api/admin/xiangqi/broadcasts/${encodeURIComponent(entry.tour.slug)}/poll`,
      {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ allowCorrection: false }),
      },
    );
    const payload = (await response.json()) as PollResponse;
    if (!response.ok || !payload.result?.ok) {
      result.textContent = payload.result?.message ?? payload.error ?? 'Poll failed';
      return;
    }
    result.textContent = `${payload.result.boardsSeen ?? 0} boards, ${
      payload.result.boardsFailed ?? 0
    } failed`;
    await refresh(body);
  } catch {
    result.textContent = 'Poll failed';
  } finally {
    button.disabled = !entry.sourceUrl;
  }
}

function stat(label: string, value: number): HTMLElement {
  const item = document.createElement('div');
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = String(value);
  item.append(dt, dd);
  return item;
}

function logRow(log: SyncLog): HTMLElement {
  const item = document.createElement('li');
  item.className = `xqb-ops-log xqb-ops-log-${log.severity}`;
  const top = document.createElement('div');
  const badge = document.createElement('span');
  badge.textContent = log.severity;
  const kind = document.createElement('strong');
  kind.textContent = log.kind;
  const time = document.createElement('time');
  time.dateTime = log.createdAt;
  time.textContent = formatDateTime(log.createdAt);
  top.append(badge, kind, time);
  const message = document.createElement('p');
  message.textContent = log.message;
  item.append(top, message);
  return item;
}

function statusLine(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'xqb-ops-status';
  p.textContent = text;
  return p;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
