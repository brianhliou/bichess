import type {
  StandardXiangqiPlayerView,
  XiangqiBroadcastBoardStatus,
  XiangqiBroadcastPlayerTag,
  XiangqiBroadcastResult,
  XiangqiBroadcastRound,
  XiangqiBroadcastTour,
  XiangqiColor,
  XiangqiGameStatus,
  XiangqiMove,
} from '@mistboard/game';
import './live-xiangqi.css';
import './xiangqi-broadcast.css';
import { renderXiangqiBoardSvg } from './live-xiangqi.js';
import { buildLoadingState, buildNav, buildNotice } from './site-shell.js';

type BroadcastMoveTimelineEntry = {
  type: 'move-played';
  color: XiangqiColor;
  move: XiangqiMove;
  ply: number;
};

type BroadcastHistorySnapshot = {
  ply: number;
  view: StandardXiangqiPlayerView;
};

type BroadcastBoardSummary = {
  id: string;
  tourSlug: string;
  roundId: string;
  sourceBoardId: string;
  boardNumber: number;
  red: XiangqiBroadcastPlayerTag;
  black: XiangqiBroadcastPlayerTag;
  status: XiangqiBroadcastBoardStatus;
  result: XiangqiBroadcastResult;
  plyCount?: number;
  moves?: XiangqiMove[];
  sourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

type BroadcastBoardResponse = {
  board: BroadcastBoardSummary & {
    finalStatus?: XiangqiGameStatus;
  };
  state: {
    status: XiangqiGameStatus;
    moveNumber: number;
  };
  timeline: BroadcastMoveTimelineEntry[];
  view: StandardXiangqiPlayerView;
  views: { truth: StandardXiangqiPlayerView };
  history: { truth: BroadcastHistorySnapshot[] };
};

type BroadcastTourResponse = {
  tour: XiangqiBroadcastTour;
  rounds: XiangqiBroadcastRound[];
};

type BroadcastRoundResponse = {
  tour: XiangqiBroadcastTour;
  round: XiangqiBroadcastRound;
  boards: BroadcastBoardSummary[];
};

type BroadcastSyncLogSummary = {
  severity: 'info' | 'warning' | 'error';
  kind: string;
  createdAt: string;
};

type BroadcastIndexEntry = {
  tour: XiangqiBroadcastTour;
  roundCount: number;
  boardCount: number;
  liveBoardCount: number;
  completeBoardCount: number;
  scheduledBoardCount: number;
  totalPlies: number;
  updatedAt: string | null;
  lastSyncLog: BroadcastSyncLogSummary | null;
};

type BroadcastIndexResponse = {
  tours: BroadcastIndexEntry[];
};

type BroadcastStreamEnvelope<T> = {
  version: string;
  payload: T;
};

export async function mountXiangqiBroadcastIndex(root: HTMLElement): Promise<void> {
  setBroadcastRoot(root, 'Loading broadcasts');
  try {
    const data = await fetchJson<BroadcastIndexResponse>('/api/xiangqi/broadcasts');
    root.replaceChildren(buildNav(), renderIndex(data));
  } catch (err) {
    renderError(root, err);
  }
}

export async function mountXiangqiBroadcastTour(
  root: HTMLElement,
  tourSlug: string,
): Promise<void> {
  setBroadcastRoot(root, 'Loading broadcast');
  try {
    const data = await fetchJson<BroadcastTourResponse>(
      `/api/xiangqi/broadcasts/${encodeURIComponent(tourSlug)}`,
    );
    root.replaceChildren(buildNav(), renderTour(data));
  } catch (err) {
    renderError(root, err);
  }
}

export async function mountXiangqiBroadcastRound(
  root: HTMLElement,
  tourSlug: string,
  roundId: string,
): Promise<void> {
  setBroadcastRoot(root, 'Loading round');
  try {
    const data = await fetchJson<BroadcastRoundResponse>(
      `/api/xiangqi/broadcasts/${encodeURIComponent(tourSlug)}/rounds/${encodeURIComponent(
        roundId,
      )}`,
    );
    root.replaceChildren(buildNav(), renderRound(data));
    connectRoundStream(root, tourSlug, roundId, roundVersion(data));
  } catch (err) {
    renderError(root, err);
  }
}

export async function mountXiangqiBroadcastBoard(
  root: HTMLElement,
  boardId: string,
): Promise<void> {
  setBroadcastRoot(root, 'Loading board');
  try {
    const data = await fetchJson<BroadcastBoardResponse>(
      `/api/xiangqi/broadcasts/boards/${encodeURIComponent(boardId)}`,
    );
    root.replaceChildren(buildNav(), renderBoardReplay(data));
    connectBoardStream(root, boardId, boardVersion(data));
  } catch (err) {
    renderError(root, err);
  }
}

function setBroadcastRoot(root: HTMLElement, loadingLabel: string): void {
  root.classList.add('landing-page', 'xiangqi-broadcast-route');
  root.replaceChildren(buildNav(), buildLoadingState(loadingLabel));
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) throw new Error('Broadcast not found');
    throw new Error(`Broadcast API failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

function renderError(root: HTMLElement, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  root.replaceChildren(buildNav(), buildNotice('Broadcast unavailable', message));
}

function connectRoundStream(
  root: HTMLElement,
  tourSlug: string,
  roundId: string,
  initialVersion: string,
): void {
  if (!('EventSource' in window)) return;
  const source = new EventSource(
    `/api/xiangqi/broadcasts/${encodeURIComponent(tourSlug)}/rounds/${encodeURIComponent(
      roundId,
    )}/events`,
  );
  let lastVersion = initialVersion;
  source.addEventListener('round', (event) => {
    const envelope = parseStreamEnvelope<BroadcastRoundResponse>(event);
    if (!envelope || envelope.version === lastVersion) return;
    lastVersion = envelope.version;
    root.replaceChildren(buildNav(), renderRound(envelope.payload));
  });
  closeStreamOnPageExit(source);
}

function connectBoardStream(root: HTMLElement, boardId: string, initialVersion: string): void {
  if (!('EventSource' in window)) return;
  const source = new EventSource(
    `/api/xiangqi/broadcasts/boards/${encodeURIComponent(boardId)}/events`,
  );
  let lastVersion = initialVersion;
  source.addEventListener('board', (event) => {
    const envelope = parseStreamEnvelope<BroadcastBoardResponse>(event);
    if (!envelope || envelope.version === lastVersion) return;
    lastVersion = envelope.version;
    root.replaceChildren(buildNav(), renderBoardReplay(envelope.payload));
  });
  closeStreamOnPageExit(source);
}

function closeStreamOnPageExit(source: EventSource): void {
  window.addEventListener('pagehide', () => source.close(), { once: true });
}

function parseStreamEnvelope<T>(event: Event): BroadcastStreamEnvelope<T> | null {
  if (!(event instanceof MessageEvent)) return null;
  try {
    return JSON.parse(event.data) as BroadcastStreamEnvelope<T>;
  } catch {
    return null;
  }
}

function renderIndex(data: BroadcastIndexResponse): HTMLElement {
  const main = broadcastShell();
  main.append(
    heroSection({
      eyebrow: 'Xiangqi broadcast',
      title: 'Tournament broadcasts',
      meta: [`${data.tours.length} tournaments`],
    }),
  );

  const section = document.createElement('section');
  section.className = 'xqb-section';
  const heading = document.createElement('h2');
  heading.textContent = 'Broadcasts';
  const list = document.createElement('div');
  list.className = 'xqb-list';
  for (const entry of data.tours) list.append(tourRow(entry));
  if (data.tours.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'xqb-empty';
    empty.textContent = 'No broadcasts are available yet.';
    list.append(empty);
  }
  section.append(heading, list);
  main.append(section);
  return main;
}

function renderTour(data: BroadcastTourResponse): HTMLElement {
  const main = broadcastShell();
  main.append(
    heroSection({
      eyebrow: 'Xiangqi broadcast',
      title: data.tour.name,
      href: data.tour.sourceUrl,
      meta: [data.tour.location, dateRange(data.tour.startsAt, data.tour.endsAt)].filter(
        Boolean,
      ) as string[],
    }),
  );

  const section = document.createElement('section');
  section.className = 'xqb-section';
  const heading = document.createElement('h2');
  heading.textContent = 'Rounds';
  const list = document.createElement('div');
  list.className = 'xqb-list';
  for (const round of data.rounds) {
    const row = document.createElement('a');
    row.className = 'xqb-row xqb-round-row';
    row.href = `/broadcast/xiangqi/${encodeURIComponent(data.tour.slug)}/round/${encodeURIComponent(
      round.id,
    )}`;

    const copy = document.createElement('span');
    copy.className = 'xqb-row-copy';
    const name = document.createElement('strong');
    name.textContent = round.name;
    const meta = document.createElement('span');
    meta.textContent = [formatDate(round.startsAt), round.sourceUrl ? 'Source linked' : null]
      .filter(Boolean)
      .join(' / ');
    copy.append(name, meta);
    row.append(copy, chevron());
    list.append(row);
  }
  section.append(heading, list);
  main.append(section);
  return main;
}

function renderRound(data: BroadcastRoundResponse): HTMLElement {
  const main = broadcastShell();
  main.append(
    heroSection({
      eyebrow: data.tour.name,
      title: data.round.name,
      href: data.round.sourceUrl ?? data.tour.sourceUrl,
      meta: [formatDate(data.round.startsAt), `${data.boards.length} boards`].filter(
        Boolean,
      ) as string[],
      backHref: `/broadcast/xiangqi/${encodeURIComponent(data.tour.slug)}`,
      backLabel: 'Tournament',
    }),
  );

  const section = document.createElement('section');
  section.className = 'xqb-section';
  const heading = document.createElement('h2');
  heading.textContent = 'Boards';
  const list = document.createElement('div');
  list.className = 'xqb-board-list';
  for (const board of [...data.boards].sort((a, b) => a.boardNumber - b.boardNumber)) {
    list.append(boardRow(board));
  }
  section.append(heading, list);
  main.append(section);
  return main;
}

function renderBoardReplay(data: BroadcastBoardResponse): HTMLElement {
  const main = broadcastShell();
  const frames = data.history.truth.length > 0 ? data.history.truth : [{ ply: 0, view: data.view }];
  const maxPly = frames.length - 1;
  let cursor = clamp(initialPlyFromUrl(), 0, maxPly);

  const hero = heroSection({
    eyebrow: `Board ${data.board.boardNumber}`,
    title: `${playerName(data.board.red)} vs ${playerName(data.board.black)}`,
    href: data.board.sourceUrl,
    meta: [
      resultLabel(data.board),
      `${data.timeline.length} plies`,
      statusLabel(data.state.status),
    ],
    backHref: `/broadcast/xiangqi/${encodeURIComponent(
      data.board.tourSlug,
    )}/round/${encodeURIComponent(data.board.roundId)}`,
    backLabel: 'Round',
  });

  const layout = document.createElement('section');
  layout.className = 'xqb-board-layout';

  const boardPanel = document.createElement('div');
  boardPanel.className = 'xqb-board-panel';
  const boardFrame = document.createElement('div');
  boardFrame.className = 'xqb-board-frame xiangqi-live-board';
  boardFrame.setAttribute('aria-label', 'Xiangqi board');

  const controls = document.createElement('div');
  controls.className = 'xqb-controls';
  const first = controlButton('First', () => setCursor(0));
  const prev = controlButton('Prev', () => setCursor(cursor - 1));
  const next = controlButton('Next', () => setCursor(cursor + 1));
  const last = controlButton('Live', () => setCursor(maxPly));
  const plyLabel = document.createElement('span');
  plyLabel.className = 'xqb-ply-label';
  controls.append(first, prev, plyLabel, next, last);

  const boardMeta = document.createElement('div');
  boardMeta.className = 'xqb-board-meta';
  boardMeta.append(playerPanel('Red', data.board.red, data.board.result === '1-0'));
  boardMeta.append(playerPanel('Black', data.board.black, data.board.result === '0-1'));
  boardPanel.append(boardFrame, controls, boardMeta);

  const movesPanel = document.createElement('aside');
  movesPanel.className = 'xqb-moves-panel';
  const moveHeading = document.createElement('h2');
  moveHeading.textContent = 'Moves';
  const moveList = document.createElement('div');
  moveList.className = 'xqb-move-grid';
  movesPanel.append(moveHeading, moveList, exportLink(data.board.id));

  layout.append(boardPanel, movesPanel);
  main.append(hero, layout);

  const moveButtons = renderMoveButtons(moveList, data.timeline, setCursor);

  function setCursor(nextPly: number): void {
    cursor = clamp(nextPly, 0, maxPly);
    renderCursor();
  }

  function renderCursor(): void {
    const frame = frames[cursor] ?? frames[frames.length - 1]!;
    boardFrame.innerHTML = renderXiangqiBoardSvg(frame.view, 'red');
    plyLabel.textContent = `${cursor} / ${maxPly}`;
    first.disabled = cursor === 0;
    prev.disabled = cursor === 0;
    next.disabled = cursor === maxPly;
    last.disabled = cursor === maxPly;
    for (const button of moveButtons) {
      button.classList.toggle('active', Number(button.dataset.ply) === cursor);
      if (Number(button.dataset.ply) === cursor) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    }
    const url = new URL(window.location.href);
    if (cursor === maxPly) url.searchParams.delete('ply');
    else url.searchParams.set('ply', String(cursor));
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  renderCursor();
  return main;
}

function broadcastShell(): HTMLElement {
  const main = document.createElement('main');
  main.className = 'xqb-shell';
  return main;
}

function heroSection(input: {
  eyebrow: string;
  title: string;
  meta: string[];
  href?: string;
  backHref?: string;
  backLabel?: string;
}): HTMLElement {
  const section = document.createElement('section');
  section.className = 'xqb-hero';
  const copy = document.createElement('div');
  copy.className = 'xqb-hero-copy';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'xqb-eyebrow';
  eyebrow.textContent = input.eyebrow;
  const title = document.createElement('h1');
  title.textContent = input.title;
  copy.append(eyebrow, title);

  if (input.meta.length > 0) {
    const meta = document.createElement('p');
    meta.className = 'xqb-hero-meta';
    meta.textContent = input.meta.join(' / ');
    copy.append(meta);
  }

  const actions = document.createElement('div');
  actions.className = 'xqb-hero-actions';
  if (input.backHref && input.backLabel) {
    const back = document.createElement('a');
    back.className = 'xqb-link';
    back.href = input.backHref;
    back.textContent = input.backLabel;
    actions.append(back);
  }
  if (input.href) {
    const source = document.createElement('a');
    source.className = 'xqb-link xqb-link-primary';
    source.href = input.href;
    source.rel = 'noreferrer';
    source.textContent = 'Source';
    actions.append(source);
  }
  section.append(copy, actions);
  return section;
}

function tourRow(entry: BroadcastIndexEntry): HTMLElement {
  const row = document.createElement('a');
  row.className = 'xqb-row xqb-tour-row';
  row.href = `/broadcast/xiangqi/${encodeURIComponent(entry.tour.slug)}`;

  const copy = document.createElement('span');
  copy.className = 'xqb-row-copy';
  const name = document.createElement('strong');
  name.textContent = entry.tour.name;
  const meta = document.createElement('span');
  meta.textContent = [
    entry.tour.location,
    dateRange(entry.tour.startsAt, entry.tour.endsAt),
    `${entry.roundCount} rounds`,
  ]
    .filter(Boolean)
    .join(' / ');
  copy.append(name, meta);

  const status = document.createElement('span');
  status.className = 'xqb-status xqb-tour-status';
  status.textContent = [
    `${entry.boardCount} boards`,
    entry.liveBoardCount > 0 ? `${entry.liveBoardCount} live` : null,
    entry.completeBoardCount > 0 ? `${entry.completeBoardCount} complete` : null,
    `${entry.totalPlies} plies`,
    freshnessLabel(entry),
  ]
    .filter(Boolean)
    .join(' / ');

  row.append(copy, status, chevron());
  return row;
}

function boardRow(board: BroadcastBoardSummary): HTMLElement {
  const row = document.createElement('a');
  row.className = 'xqb-row xqb-board-row';
  row.href = `/broadcast/xiangqi/board/${encodeURIComponent(board.id)}`;

  const number = document.createElement('span');
  number.className = 'xqb-board-number';
  number.textContent = String(board.boardNumber);

  const pairing = document.createElement('span');
  pairing.className = 'xqb-pairing';
  const red = document.createElement('strong');
  red.textContent = playerName(board.red);
  const black = document.createElement('strong');
  black.textContent = playerName(board.black);
  const versus = document.createElement('span');
  versus.textContent = 'vs';
  pairing.append(red, versus, black);

  const status = document.createElement('span');
  status.className = `xqb-status xqb-status-${board.status}`;
  status.textContent = `${resultLabel(board)} / ${plyCount(board)} plies`;

  row.append(number, pairing, status, chevron());
  return row;
}

function playerPanel(
  labelText: string,
  player: XiangqiBroadcastPlayerTag,
  won: boolean,
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = won ? 'xqb-player xqb-player-winner' : 'xqb-player';
  const label = document.createElement('span');
  label.textContent = labelText;
  const name = document.createElement('strong');
  name.textContent = playerName(player);
  panel.append(label, name);
  return panel;
}

function renderMoveButtons(
  container: HTMLElement,
  timeline: BroadcastMoveTimelineEntry[],
  onSelect: (ply: number) => void,
): HTMLButtonElement[] {
  const byPly = new Map(timeline.map((entry) => [entry.ply, entry]));
  const buttons: HTMLButtonElement[] = [];
  const moveCount = Math.ceil(timeline.length / 2);
  for (let moveNumber = 1; moveNumber <= moveCount; moveNumber++) {
    const label = document.createElement('span');
    label.className = 'xqb-move-number';
    label.textContent = `${moveNumber}.`;
    container.append(label);
    for (const ply of [moveNumber * 2 - 1, moveNumber * 2]) {
      const entry = byPly.get(ply);
      if (!entry) {
        const spacer = document.createElement('span');
        spacer.className = 'xqb-move-empty';
        container.append(spacer);
        continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `xqb-move xqb-move-${entry.color}`;
      button.dataset.ply = String(entry.ply);
      button.textContent = moveLabel(entry.move);
      button.addEventListener('click', () => onSelect(entry.ply));
      buttons.push(button);
      container.append(button);
    }
  }
  return buttons;
}

function controlButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'xqb-control';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function exportLink(boardId: string): HTMLElement {
  const link = document.createElement('a');
  link.className = 'xqb-export-link';
  link.href = `/api/xiangqi/broadcasts/boards/${encodeURIComponent(boardId)}/export`;
  link.textContent = 'Export JSON';
  return link;
}

function chevron(): HTMLElement {
  const mark = document.createElement('span');
  mark.className = 'xqb-chevron';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = '>';
  return mark;
}

function playerName(player: XiangqiBroadcastPlayerTag): string {
  const prefix = player.title ? `${player.title} ` : '';
  const suffix = player.federation ? ` (${player.federation})` : '';
  return `${prefix}${player.name}${suffix}`;
}

function resultLabel(board: Pick<BroadcastBoardSummary, 'result' | 'status'>): string {
  if (board.result === '1-0') return 'Red wins';
  if (board.result === '0-1') return 'Black wins';
  if (board.result === '1/2-1/2') return 'Draw';
  if (board.status === 'live') return 'Live';
  if (board.status === 'scheduled') return 'Scheduled';
  return 'In progress';
}

function statusLabel(status: XiangqiGameStatus): string {
  if (status.type === 'playing') return `${capitalize(status.turn)} to move`;
  if (status.type === 'finished') {
    const result = status.winner ? `${capitalize(status.winner)} wins` : 'Draw';
    return `${result} by ${status.reason}`;
  }
  return `Aborted: ${status.reason}`;
}

function freshnessLabel(entry: BroadcastIndexEntry): string | null {
  if (entry.lastSyncLog) {
    const severity =
      entry.lastSyncLog.severity === 'error'
        ? 'Sync error'
        : entry.lastSyncLog.severity === 'warning'
          ? 'Sync warning'
          : 'Synced';
    return `${severity} ${formatDate(entry.lastSyncLog.createdAt) ?? entry.lastSyncLog.kind}`;
  }
  return entry.updatedAt ? `Updated ${formatDate(entry.updatedAt)}` : null;
}

function boardVersion(data: BroadcastBoardResponse): string {
  return streamVersion([
    data.board.id,
    data.board.updatedAt,
    data.board.plyCount,
    data.board.status,
    data.board.result,
    data.state.status.type,
  ]);
}

function roundVersion(data: BroadcastRoundResponse): string {
  return streamVersion([
    timestamp(data.tour),
    timestamp(data.round),
    ...data.boards.map((board) =>
      streamVersion([board.id, board.updatedAt, board.plyCount, board.status, board.result]),
    ),
  ]);
}

function timestamp(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const updatedAt = (value as { updatedAt?: unknown }).updatedAt;
  return typeof updatedAt === 'string' ? updatedAt : undefined;
}

function streamVersion(values: Array<string | number | null | undefined>): string {
  return values.map((value) => value ?? '').join('|');
}

function plyCount(board: BroadcastBoardSummary): number {
  return board.plyCount ?? board.moves?.length ?? 0;
}

function moveLabel(move: XiangqiMove): string {
  return `${move.from}-${move.to}`;
}

function dateRange(startsAt: string | undefined, endsAt: string | undefined): string | null {
  const start = formatDate(startsAt);
  const end = formatDate(endsAt);
  if (start && end && start !== end) return `${start} to ${end}`;
  return start ?? end;
}

function formatDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: value.includes('T') ? 'numeric' : undefined,
    minute: value.includes('T') ? '2-digit' : undefined,
  }).format(date);
}

function initialPlyFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get('ply');
  if (!raw) return Number.POSITIVE_INFINITY;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
