import type { XiangqiMove } from '@mistboard/game';
import './game-shell.css';
import './live-xiangqi.css';
import './dark-xiangqi-postgame.css';
import './xiangqi-postgame.css';
import {
  type HistoricalXiangqiResult,
  historicalXiangqiOutcomeLabel,
} from './historical-xiangqi-search.js';
import { createGameMetaCard } from './review/game-meta-card.js';
import { buildSpectatorChat } from './review/spectator-chat.js';
import { buildXiangqiClientAnalysisSource } from './review/xiangqi-client-analysis.js';
import { mountXiangqiReview } from './review/xiangqi-review.js';
import { buildXiangqiReplayFromMoves, type XiangqiReplay } from './review/xiangqi-review-model.js';
import { buildNav } from './site-shell.js';

export type HistoricalXiangqiGameDetail = {
  id: string;
  sourceId: string;
  sourceGameId: string | null;
  sourceUrl: string | null;
  eventName: string | null;
  site: string | null;
  round: string | null;
  board: string | null;
  playedOn: string | null;
  redNameRaw: string | null;
  blackNameRaw: string | null;
  result: HistoricalXiangqiResult;
  termination: string | null;
  plyCount: number;
  moveFormat: string;
  moves: XiangqiMove[];
  tags: Record<string, unknown>;
  qualityFlags: string[];
  visibility: string;
};

type LoadResult =
  | { ok: true; game: HistoricalXiangqiGameDetail }
  | { ok: false; status: number; error: string };

export function mountHistoricalXiangqiPostgame(root: HTMLElement, gameId: string): void {
  root.classList.add('landing-page', 'xiangqi-postgame-route');
  root.replaceChildren(buildNav(), loadingView());
  void loadHistoricalXiangqiGame(gameId)
    .then((result) => {
      if (result.ok) {
        renderHistoricalXiangqiGame(root, result.game);
        return;
      }
      renderError(root, errorTitle(result.status), errorBody(result));
    })
    .catch(() => {
      renderError(root, 'Game unavailable', 'The historical game could not be loaded.');
    });
}

export async function loadHistoricalXiangqiGame(gameId: string): Promise<LoadResult> {
  const response = await fetch(historicalXiangqiGameApiUrl(gameId), {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    const body = await safeJson(response);
    return {
      ok: false,
      status: response.status,
      error: typeof body?.error === 'string' ? body.error : 'request_failed',
    };
  }
  const body = (await response.json()) as { game: HistoricalXiangqiGameDetail };
  return { ok: true, game: body.game };
}

export function historicalXiangqiGameApiUrl(gameId: string): string {
  const url = new URL(
    `/api/historical-xiangqi/games/${encodeURIComponent(gameId)}`,
    window.location.href,
  );
  return url.pathname;
}

function renderHistoricalXiangqiGame(root: HTMLElement, game: HistoricalXiangqiGameDetail): void {
  const replay = buildXiangqiReplayFromMoves(game.moves);
  const metaCard = createGameMetaCard({
    markerId: 'xiangqi',
    glyph: '象',
    headline: ['Historical game'],
    variantName: 'Xiangqi',
    subline: [formatDate(game.playedOn), game.eventName].filter(Boolean).join(' · '),
    players: [
      { color: 'red', name: game.redNameRaw ?? 'Red' },
      { color: 'black', name: game.blackNameRaw ?? 'Black' },
    ],
    status: resultStatus(game),
  });

  root.replaceChildren(buildNav());
  mountXiangqiReview(root, {
    pageClassName: 'xiangqi-review',
    ariaLabel: 'Historical Xiangqi game review',
    title: 'Xiangqi game',
    summary: `${resultStatus(game)} · ${replay.maxPly} plies`,
    boardAriaLabel: 'Xiangqi board',
    metaCard: metaCard.el,
    // Persistent per-game comments (same panel/store as the room review, keyed by
    // the archive game id). Historical games are roomless, so this is HTTP-poll
    // chat, not a live socket — viewers can still discuss the game.
    details: buildSpectatorChat(game.id),
    provenance: historicalProvenance(game, replay),
    moves: replay.moves,
    players: {
      red: game.redNameRaw ?? undefined,
      black: game.blackNameRaw ?? undefined,
    },
    showCrosstable: true,
    // Roomless archive game: whole-game analysis is the shared client ceval sweep
    // (same as /analysis/xiangqi), computed on request. No server Pikafish cache.
    analysis: buildXiangqiClientAnalysisSource(replay),
  });
}

// Provenance panel for the "Game info" underboard tab. Surfaces the facts a viewer
// wants (event/date/ratings/time control) and hides rows that are absent for
// anonymized platform games (Site/Round). Deliberately omits the raw acquisition
// move-encoding (moveFormat, e.g. "uci-0indexed"), which is internal jargon.
function historicalProvenance(
  game: HistoricalXiangqiGameDetail,
  replay: XiangqiReplay,
): HTMLElement {
  const details = document.createElement('dl');
  details.className = 'review-provenance';
  const tags = (game.tags ?? {}) as Record<string, unknown>;
  const tagStr = (key: string): string | null =>
    typeof tags[key] === 'string' && (tags[key] as string).trim() ? (tags[key] as string) : null;
  const tagNum = (key: string): number | null =>
    typeof tags[key] === 'number' && Number.isFinite(tags[key]) ? (tags[key] as number) : null;

  addDetail(details, 'Date', formatDate(game.playedOn));
  if (game.eventName) addDetail(details, 'Event', game.eventName);
  if (game.site) addDetail(details, 'Site', game.site);
  if (game.round) addDetail(details, 'Round', game.round);

  const timeControl = humanizeTimeControl(tagStr('timeControlCategory'), tagStr('timeControl'));
  if (timeControl) addDetail(details, 'Time control', timeControl);
  const mode = tagStr('ratingMode');
  if (mode) addDetail(details, 'Mode', capitalizeWord(mode));

  const redRating = formatRating(tagNum('redEloBefore'), tagNum('redEloAfter'));
  if (redRating) addDetail(details, 'Red rating', redRating);
  const blackRating = formatRating(tagNum('blackEloBefore'), tagNum('blackEloAfter'));
  if (blackRating) addDetail(details, 'Black rating', blackRating);

  if (game.termination) addDetail(details, 'Termination', capitalizeWord(game.termination));
  if (game.sourceUrl) addDetailLink(details, 'Source', game.sourceUrl);
  if (replay.illegalAt) {
    addDetail(
      details,
      'Import',
      `Truncated at ply ${replay.illegalAt.ply}: ${replay.illegalAt.move.from}-${replay.illegalAt.move.to}`,
    );
  }
  if (game.qualityFlags.length > 0) addDetail(details, 'Flags', game.qualityFlags.join(', '));
  return details;
}

function humanizeTimeControl(category: string | null, raw: string | null): string | null {
  if (category) {
    return category.toLowerCase().split('_').map(capitalizeWord).join(' ');
  }
  return raw;
}

function capitalizeWord(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRating(before: number | null, after: number | null): string | null {
  if (before === null && after === null) return null;
  if (before !== null && after !== null && before !== after) return `${before} → ${after}`;
  return String(after ?? before);
}

function addDetailLink(details: HTMLElement, label: string, href: string): void {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  const link = document.createElement('a');
  link.href = href;
  link.rel = 'noreferrer';
  link.textContent = href;
  dd.append(link);
  details.append(dt, dd);
}

function addDetail(details: HTMLElement, label: string, value: string): void {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  details.append(dt, dd);
}

function loadingView(): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__notice';
  const heading = document.createElement('h1');
  heading.textContent = 'Loading game';
  shell.append(heading);
  return shell;
}

function renderError(root: HTMLElement, titleText: string, bodyText: string): void {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__error';
  const title = document.createElement('h1');
  title.textContent = titleText;
  const body = document.createElement('p');
  body.textContent = bodyText;
  shell.append(title, body);
  root.replaceChildren(buildNav(), shell);
}

function errorTitle(status: number): string {
  if (status === 404) return 'Game not found';
  if (status === 503) return 'Archive unavailable';
  return 'Archive unavailable';
}

function errorBody(result: Extract<LoadResult, { ok: false }>): string {
  if (result.status === 404) return 'This historical Xiangqi game is not available.';
  if (result.status === 503) return 'The historical game archive is not available.';
  return result.error;
}

async function safeJson(response: Response): Promise<{ error?: unknown } | null> {
  try {
    return (await response.json()) as { error?: unknown };
  } catch {
    return null;
  }
}

function resultStatus(game: HistoricalXiangqiGameDetail): string {
  const result = historicalXiangqiOutcomeLabel(game.result);
  return game.termination ? `${result} by ${labelize(game.termination)}` : result;
}

function formatDate(value: string | null): string {
  if (!value) return 'Unknown date';
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function labelize(value: string): string {
  return value.split('-').filter(Boolean).map(capitalize).join(' ');
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
