import './historical-xiangqi-search.css';
import { t } from './i18n/catalog.js';
import { buildNav } from './site-shell.js';

export type HistoricalXiangqiResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export type HistoricalXiangqiGameListItem = {
  id: string;
  kind: 'mistboard' | 'historical' | 'broadcast';
  reviewUrl: string;
  sourceSlug: string;
  sourceName: string;
  sourceGameId: string | null;
  sourceUrl: string | null;
  eventName: string | null;
  eventNameEn?: string | null;
  site: string | null;
  round: string | null;
  roundNameEn?: string | null;
  board: string | null;
  playedOn: string | null;
  redNameRaw: string | null;
  redNameEn?: string | null;
  blackNameRaw: string | null;
  blackNameEn?: string | null;
  result: HistoricalXiangqiResult;
  plyCount: number;
  sortAt: string | null;
  moveFormat: string;
};

export type HistoricalXiangqiSearchResponse = {
  games: HistoricalXiangqiGameListItem[];
  total: number;
  offset: number;
  limit: number;
};

export type GamesSort = 'recent' | 'oldest' | 'longest' | 'shortest';

type Filters = {
  sort: GamesSort;
  player: string;
  event: string;
  source: string;
  result: string;
  from: string;
  to: string;
  plyMin: string;
  plyMax: string;
  offset: number;
  limit: number;
};

const DEFAULT_LIMIT = 50;
const SORTS: readonly GamesSort[] = ['recent', 'oldest', 'longest', 'shortest'];

function isGamesSort(value: string): value is GamesSort {
  return (SORTS as readonly string[]).includes(value);
}

const STRING_FILTER_KEYS = [
  'player',
  'event',
  'source',
  'result',
  'from',
  'to',
  'plyMin',
  'plyMax',
] as const;

export async function mountHistoricalXiangqiSearch(root: HTMLElement): Promise<void> {
  root.classList.add('landing-page', 'historical-xiangqi-page');
  root.replaceChildren(buildNav());

  const shell = document.createElement('main');
  shell.className = 'site-section historical-xiangqi-shell';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = t('historical.heading');

  const filtersHost = document.createElement('section');
  const summaryHost = document.createElement('section');
  const resultsHost = document.createElement('section');
  shell.append(heading, filtersHost, summaryHost, resultsHost);
  root.append(shell);

  let filters = readFilters();

  const run = async (): Promise<void> => {
    writeFilters(filters);
    filtersHost.replaceChildren(buildFilterForm(filters, applyFilters));
    summaryHost.replaceChildren(statusLine(t('historical.loading')));
    resultsHost.replaceChildren();
    let data: HistoricalXiangqiSearchResponse;
    try {
      data = await fetchHistoricalXiangqiGames(filters);
    } catch {
      summaryHost.replaceChildren(statusLine(t('historical.searchFailed')));
      return;
    }
    summaryHost.replaceChildren(totalLine(data.total));
    resultsHost.replaceChildren(buildResults(data, applyFilters));
  };

  function applyFilters(next: Filters): void {
    filters = next;
    void run();
  }

  filtersHost.replaceChildren(buildFilterForm(filters, applyFilters));
  await run();
}

export function historicalXiangqiReviewUrl(id: string): string {
  return `/historical-xiangqi/game/${encodeURIComponent(id)}`;
}

export function historicalXiangqiSearchApiUrl(filters: Filters): string {
  const params = new URLSearchParams();
  for (const key of STRING_FILTER_KEYS) {
    const value = filters[key].trim();
    if (value) params.set(key, value);
  }
  if (filters.sort !== 'recent') params.set('sort', filters.sort);
  if (filters.offset > 0) params.set('offset', String(filters.offset));
  params.set('limit', String(filters.limit));
  return `/api/historical-xiangqi/games?${params.toString()}`;
}

async function fetchHistoricalXiangqiGames(
  filters: Filters,
): Promise<HistoricalXiangqiSearchResponse> {
  const response = await fetch(historicalXiangqiSearchApiUrl(filters), {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`historical_xiangqi_search_failed_${response.status}`);
  return (await response.json()) as HistoricalXiangqiSearchResponse;
}

// The canonical route for this page (lichess: /games/search). It sat at /games
// until 2026-09-02, when /games became the current-games page; the server 301s
// `/historical-xiangqi`, `/historical-xiangqi/games`, and any `/games?<filter>`
// link here.
const SEARCH_PATH = '/games/search';

function readFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  const str = (key: string): string => params.get(key) ?? '';
  const offset = Number.parseInt(params.get('offset') ?? '', 10);
  const limit = Number.parseInt(params.get('limit') ?? '', 10);
  const sort = str('sort');
  return {
    sort: isGamesSort(sort) ? sort : 'recent',
    player: str('player'),
    event: str('event'),
    source: str('source'),
    result: str('result'),
    from: str('from'),
    to: str('to'),
    plyMin: str('plyMin'),
    plyMax: str('plyMax'),
    offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : DEFAULT_LIMIT,
  };
}

function writeFilters(filters: Filters): void {
  const params = new URLSearchParams();
  for (const key of STRING_FILTER_KEYS) {
    const value = filters[key].trim();
    if (value) params.set(key, value);
  }
  if (filters.sort !== 'recent') params.set('sort', filters.sort);
  if (filters.offset > 0) params.set('offset', String(filters.offset));
  if (filters.limit !== DEFAULT_LIMIT) params.set('limit', String(filters.limit));
  const query = params.toString();
  // Write the canonical path. `/historical-xiangqi/games` is retired: the server
  // 301s it back here and isClientRoute rejects it, so rewriting the bar to it
  // meant a filtered URL survived neither a copy-paste nor a reload.
  window.history.replaceState(null, '', query ? `${SEARCH_PATH}?${query}` : SEARCH_PATH);
}

function buildFilterForm(filters: Filters, onApply: (next: Filters) => void): HTMLElement {
  const form = document.createElement('form');
  form.className = 'historical-xiangqi-filters';

  const inputs = new Map<keyof Filters, HTMLInputElement>();
  const selects = new Map<keyof Filters, HTMLSelectElement>();

  const addText = (key: keyof Filters, label: string, placeholder: string): void => {
    const field = textInput(label, placeholder, String(filters[key]));
    inputs.set(key, field.input);
    form.append(field.field);
  };
  addText('player', t('historical.playerLabel'), t('historical.playerPlaceholder'));
  addText('event', t('historical.eventLabel'), t('historical.eventPlaceholder'));
  addText('source', t('historical.sourceLabel'), t('historical.sourcePlaceholder'));

  const result = selectInput(
    t('historical.resultLabel'),
    [
      { value: '', label: t('historical.anyResult') },
      { value: '1-0', label: t('historical.redWins') },
      { value: '0-1', label: t('historical.blackWins') },
      { value: '1/2-1/2', label: t('historical.draw') },
      { value: '*', label: t('historical.unfinished') },
    ],
    filters.result,
  );
  selects.set('result', result.select);
  form.append(result.field);

  const from = dateInput(t('historical.fromLabel'), filters.from);
  inputs.set('from', from.input);
  form.append(from.field);
  const to = dateInput(t('historical.toLabel'), filters.to);
  inputs.set('to', to.input);
  form.append(to.field);
  const plyMin = numberInput(t('historical.minPlies'), filters.plyMin);
  inputs.set('plyMin', plyMin.input);
  form.append(plyMin.field);
  const plyMax = numberInput(t('historical.maxPlies'), filters.plyMax);
  inputs.set('plyMax', plyMax.input);
  form.append(plyMax.field);

  const sortField = selectInput(
    t('historical.sortLabel'),
    [
      { value: 'recent', label: t('historical.sortRecent') },
      { value: 'oldest', label: t('historical.sortOldest') },
      { value: 'longest', label: t('historical.sortLongest') },
      { value: 'shortest', label: t('historical.sortShortest') },
    ],
    filters.sort,
  );
  selects.set('sort', sortField.select);
  form.append(sortField.field);

  const limit = selectInput(
    t('historical.rowsLabel'),
    [
      { value: '25', label: '25' },
      { value: '50', label: '50' },
      { value: '100', label: '100' },
      { value: '200', label: '200' },
    ],
    String(filters.limit),
  );
  selects.set('limit', limit.select);
  form.append(limit.field);

  const actions = document.createElement('div');
  actions.className = 'historical-xiangqi-actions';
  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.className = 'historical-xiangqi-btn historical-xiangqi-btn-primary';
  apply.textContent = t('historical.search');
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'historical-xiangqi-btn';
  reset.textContent = t('historical.reset');
  actions.append(apply, reset);
  form.append(actions);

  const collect = (offset: number): Filters => {
    const next: Filters = { ...filters, offset };
    for (const [key, input] of inputs) (next[key] as string) = input.value.trim();
    for (const [key, select] of selects) {
      if (key === 'limit') next.limit = Number.parseInt(select.value, 10);
      else if (key === 'sort') next.sort = isGamesSort(select.value) ? select.value : 'recent';
      else (next[key] as string) = select.value;
    }
    return next;
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onApply(collect(0));
  });
  reset.addEventListener('click', () => {
    onApply({
      sort: 'recent',
      player: '',
      event: '',
      source: '',
      result: '',
      from: '',
      to: '',
      plyMin: '',
      plyMax: '',
      offset: 0,
      limit: DEFAULT_LIMIT,
    });
  });
  return form;
}

function buildResults(
  data: HistoricalXiangqiSearchResponse,
  onApply: (next: Filters) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  if (data.games.length === 0) {
    wrap.append(statusLine(t('historical.noGamesMatch')));
    return wrap;
  }
  const list = document.createElement('div');
  list.className = 'historical-xiangqi-results';
  for (const game of data.games) list.append(gameRow(game));
  wrap.append(list);
  const pager = buildPager(data, onApply);
  if (pager) wrap.append(pager);
  return wrap;
}

function gameRow(game: HistoricalXiangqiGameListItem): HTMLElement {
  const link = document.createElement('a');
  link.className = 'historical-xiangqi-row';
  link.href = game.reviewUrl;

  const result = document.createElement('span');
  result.className = `historical-xiangqi-result historical-xiangqi-result-${resultTone(game.result)}`;
  result.textContent = historicalXiangqiResultLabel(game.result);
  link.append(result);

  const body = document.createElement('div');
  body.className = 'historical-xiangqi-row-main';
  const matchup = document.createElement('div');
  matchup.className = 'historical-xiangqi-matchup';
  // English primary; the original Chinese follows as a muted inline secondary
  // when a cached translation exists.
  const matchupEn = t('historical.matchup', {
    red: game.redNameEn ?? game.redNameRaw ?? t('setup.red'),
    black: game.blackNameEn ?? game.blackNameRaw ?? t('setup.black'),
  });
  const matchupRaw = t('historical.matchup', {
    red: game.redNameRaw ?? t('setup.red'),
    black: game.blackNameRaw ?? t('setup.black'),
  });
  matchup.textContent = matchupEn;
  if ((game.redNameEn || game.blackNameEn) && matchupRaw !== matchupEn) {
    const zh = document.createElement('span');
    zh.className = 'historical-xiangqi-zh';
    zh.textContent = matchupRaw;
    matchup.append(' ', zh);
  }
  body.append(matchup);
  const meta = document.createElement('div');
  meta.className = 'historical-xiangqi-meta';
  meta.append(
    pill(formatDate(game.playedOn)),
    pill(`${game.plyCount} plies`),
    pill(gameKindLabel(game.kind)),
    pill(game.sourceName || game.sourceSlug),
    pill(game.moveFormat),
  );
  body.append(meta);
  link.append(body);

  const event = document.createElement('div');
  event.className = 'historical-xiangqi-event';
  event.textContent = eventLine(game);
  const eventZh = eventLineZh(game);
  if (eventZh) {
    const zh = document.createElement('span');
    zh.className = 'historical-xiangqi-zh';
    zh.textContent = eventZh;
    event.append(' ', zh);
  }
  link.append(event);

  const review = document.createElement('span');
  review.className = 'historical-xiangqi-review-link';
  review.textContent = t('historical.review');
  link.append(review);
  return link;
}

function buildPager(
  data: HistoricalXiangqiSearchResponse,
  onApply: (next: Filters) => void,
): HTMLElement | null {
  const { offset, limit, total } = data;
  if (total <= limit && offset === 0) return null;
  const pager = document.createElement('div');
  pager.className = 'historical-xiangqi-pager';

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'historical-xiangqi-btn';
  prev.textContent = t('historical.prev');
  prev.disabled = offset <= 0;
  prev.addEventListener('click', () => {
    onApply({ ...readFilters(), offset: Math.max(0, offset - limit), limit });
  });

  const status = document.createElement('span');
  status.className = 'historical-xiangqi-pager-status';
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);
  status.textContent = `${start}-${end} of ${total.toLocaleString()}`;

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'historical-xiangqi-btn';
  next.textContent = t('historical.next');
  next.disabled = offset + limit >= total;
  next.addEventListener('click', () => {
    onApply({ ...readFilters(), offset: offset + limit, limit });
  });

  pager.append(prev, status, next);
  return pager;
}

function textInput(
  label: string,
  placeholder: string,
  value: string,
): { field: HTMLElement; input: HTMLInputElement } {
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'historical-xiangqi-input';
  input.placeholder = placeholder;
  input.value = value;
  return fieldFor(label, input);
}

function numberInput(
  label: string,
  value: string,
): { field: HTMLElement; input: HTMLInputElement } {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.className = 'historical-xiangqi-input';
  input.value = value;
  return fieldFor(label, input);
}

function dateInput(label: string, value: string): { field: HTMLElement; input: HTMLInputElement } {
  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'historical-xiangqi-input';
  input.value = value;
  return fieldFor(label, input);
}

function selectInput(
  label: string,
  options: { value: string; label: string }[],
  selected: string,
): { field: HTMLElement; select: HTMLSelectElement } {
  const select = document.createElement('select');
  select.className = 'historical-xiangqi-select';
  for (const option of options) {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    select.append(item);
  }
  // Assign through the select, not by setting `selected` on each option before
  // appending it. Appending an option re-runs the selectedness reset, which
  // discards a flag set while the option was still detached for anything past
  // the second position: `?result=0-1`, `1/2-1/2` and `*` all rendered as the
  // "Red wins" row while the results below them were correctly filtered.
  select.value = selected;
  const { field } = fieldFor(label, select);
  return { field, select };
}

function fieldFor<T extends HTMLInputElement | HTMLSelectElement>(
  label: string,
  control: T,
): { field: HTMLElement; input: T } {
  const field = document.createElement('label');
  field.className = 'historical-xiangqi-field';
  const text = document.createElement('span');
  text.className = 'historical-xiangqi-field-label';
  text.textContent = label;
  field.append(text, control);
  return { field, input: control };
}

function pill(text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'historical-xiangqi-pill';
  el.textContent = text;
  return el;
}

function statusLine(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'historical-xiangqi-status';
  p.textContent = text;
  return p;
}

function totalLine(total: number): HTMLElement {
  const p = document.createElement('p');
  p.className = 'historical-xiangqi-total';
  p.textContent =
    total === 1
      ? t('historical.oneGameFound')
      : t('historical.gamesFound', { count: total.toLocaleString() });
  return p;
}

export function historicalXiangqiResultLabel(result: HistoricalXiangqiResult): string {
  if (result === '1-0') return t('setup.red');
  if (result === '0-1') return t('setup.black');
  if (result === '1/2-1/2') return t('historical.draw');
  return '*';
}

export function historicalXiangqiOutcomeLabel(result: HistoricalXiangqiResult): string {
  if (result === '1-0') return t('historical.redWins');
  if (result === '0-1') return t('historical.blackWins');
  if (result === '1/2-1/2') return t('historical.draw');
  return t('historical.unfinished');
}

function resultTone(result: HistoricalXiangqiResult): 'red' | 'black' | 'draw' {
  if (result === '1-0') return 'red';
  if (result === '0-1') return 'black';
  return 'draw';
}

function gameKindLabel(kind: HistoricalXiangqiGameListItem['kind']): string {
  if (kind === 'mistboard') return t('historical.sourceMistboard');
  if (kind === 'broadcast') return t('historical.sourceBroadcast');
  return t('historical.sourceArchive');
}

function eventLine(game: HistoricalXiangqiGameListItem): string {
  const roundPart = game.roundNameEn ?? (game.round ? `Round ${game.round}` : null);
  const parts = [game.eventNameEn ?? game.eventName, roundPart, game.site].filter(Boolean);
  if (parts.length > 0) return parts.join(' · ');
  if (game.sourceGameId) return `Source game ${game.sourceGameId}`;
  return 'No event metadata';
}

// The original Chinese event/round line, shown as a secondary span whenever a
// cached translation replaced it in the primary line.
function eventLineZh(game: HistoricalXiangqiGameListItem): string | null {
  if (!game.eventNameEn && !game.roundNameEn) return null;
  const parts = [
    game.eventNameEn && game.eventNameEn !== game.eventName ? game.eventName : null,
    game.roundNameEn && game.roundNameEn !== game.round ? game.round : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatDate(value: string | null): string {
  if (!value) return 'Unknown date';
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
