import {
  BANQI_SPEC_ID,
  CROSSROADS_CHESS_SPEC_ID,
  canonicalVariantOrderIndex,
  DARK_CHESS_SPEC_ID,
  DARK_CRAZYHOUSE_SPEC_ID,
  DARK_CROSSROADS_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DARK_MINI_XIANGQI_SPEC_ID,
  DARK_SHOGI_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  DROP_MINI_XIANGQI_SPEC_ID,
  DUAL_CHESS_SPEC_ID,
  gameSpecForId,
  JIEQI_SPEC_ID,
  KRIEGSPIEL_SPEC_ID,
  MINI_XIANGQI_SPEC_ID,
  REVEAL_CHESS_SPEC_ID,
  TIME_CONTROLS,
  type TimeControlId,
} from '@mistboard/game';
import {
  classifyTimeControl,
  gameSpecAnalyticsProps,
  gameSpecAnalyticsPropsForId,
  track,
} from './analytics.js';
import { correspondenceEnabled, crossroadsChessEnabled } from './feature-flags.js';
import { isRatedModeEnabled } from './rated-flag.js';
import { isLikelySignedIn } from './signed-in-state.js';
import { renderVariantMiniBoard } from './variant-mini-boards.js';
import { webVariantTenantForSpecId, webVariantTenants } from './variant-tenant/registry.js';
import { isVariantEnabled, variantMiniIdForGameSpec } from './variants.js';
import { ENGINE_OFFER_AFTER_MS, shouldOfferEngine } from './web-utils.js';

export type PlayableEngine = {
  id: string;
  name: string;
  familyName: string;
  kind: string;
};

type LandingPlayChoice = {
  engineId?: string;
  engines?: PlayableEngine[];
  initialGameSpecId?: LandingGameSpecId;
  mode: LandingPlayMode;
  ratedDisabled?: boolean;
  title: string;
};
type LandingPlayMode = 'lobby' | 'pvp' | 'pve';
type LandingGameSpecId =
  | typeof DARK_CHESS_SPEC_ID
  | typeof MINI_XIANGQI_SPEC_ID
  | typeof DARK_MINI_XIANGQI_SPEC_ID
  | typeof DROP_MINI_XIANGQI_SPEC_ID
  | typeof DARK_XIANGQI_SPEC_ID
  | typeof CROSSROADS_CHESS_SPEC_ID
  | typeof DARK_CROSSROADS_CHESS_SPEC_ID
  | typeof DARK_SHOGI_SPEC_ID
  | typeof DARK_CRAZYHOUSE_SPEC_ID
  | typeof KRIEGSPIEL_SPEC_ID
  | typeof JIEQI_SPEC_ID
  | typeof BANQI_SPEC_ID
  | typeof REVEAL_CHESS_SPEC_ID;
type LandingStartFormat = 'standard' | 'draft960';
type LandingTimePresetId = TimeControlId;
type LandingTimePreset = {
  id: LandingTimePresetId;
  label: string;
  initialMs: number;
  incrementMs: number;
};
type LandingGameGroupId = 'chess' | 'xiangqi' | 'shogi';
type LandingColorPreference = 'white' | 'red' | 'black' | 'random';
type LandingPlayerColor = Exclude<LandingColorPreference, 'random'>;
type LandingGameSpecCapabilities = {
  firstColor: LandingPlayerColor;
  firstGlyph: string;
  firstLabel: string;
  glyphClass?: string;
  neutralGlyphColor?: boolean;
  pickerLabel?: string;
  secondColor: LandingPlayerColor;
  secondGlyph: string;
  secondLabel: string;
  supportsRated: boolean;
  supportsStartFormat: boolean;
  supportsTimeControl: boolean;
};
export type LandingRoomSetup = {
  gameSpecId: LandingGameSpecId;
  startFormat: LandingStartFormat;
  rated: boolean;
  timeControl: {
    initialMs: number;
    incrementMs: number;
  };
  preferredColor: LandingColorPreference;
};
type LandingSetupPreference = {
  // Legacy single-slot engine pick (pre per-variant). Still read/written for
  // back-compat; `engineIdByGameSpec` is the source of truth going forward.
  engineId?: string;
  // Last-played engine per variant, so picking a banqi engine never clobbers the
  // remembered jieqi engine (and vice versa).
  engineIdByGameSpec?: Partial<Record<LandingGameSpecId, string>>;
  gameSpecId?: LandingGameSpecId;
  preferredColor?: LandingColorPreference;
  rated?: boolean;
  startFormat?: LandingStartFormat;
  timePresetId?: LandingTimePresetId;
};
type LobbyTicketResponse = {
  pollAfterMs?: number;
  status?: 'waiting' | 'matched';
  ticketId?: string;
  url?: string;
};
type OpenLobbyRequest = {
  gameSpecId?: string;
  hiddenDraft960: boolean;
  rated?: boolean;
  timeControl: {
    initialMs: number;
    incrementMs: number;
  };
  waitingMs: number;
};
type RoomCreationFailure = {
  error?: string;
};

const ENGINE_SEAT_RETRY_MS = 3_000;
const LANDING_TIME_PRESETS: LandingTimePreset[] = TIME_CONTROLS.map((tc) => ({
  id: tc.id,
  label: tc.label,
  initialMs: tc.initialMs,
  incrementMs: tc.incrementMs,
}));
const LANDING_GAME_GROUPS: {
  glyph: string;
  id: LandingGameGroupId;
  label: string;
}[] = [
  { id: 'chess', label: 'Chess', glyph: '♔' },
  { id: 'xiangqi', label: 'Xiangqi', glyph: '象' },
  { id: 'shogi', label: 'Shogi', glyph: '☗' },
];

// Which time-control presets the picker offers, per variant. Dark chess and DMX
// are scoped to bullet + blitz: 5+5 is hidden because dark/fog games are
// low-calc and decisive, and fewer TCs merge players into fewer pools.
// Crossroads gets 5+5 because it is perfect-information. Full
// Dark Xiangqi keeps its prior single option until it has a live runtime. Used
// for PvE AND PvP/lobby alike.
function allowedTimePresetIds(
  gameSpecId: LandingGameSpecId,
  rated: boolean,
): ReadonlySet<LandingTimePresetId> {
  if (rated) return new Set<LandingTimePresetId>(['3m2']);
  const tenantLanding = webVariantTenantForSpecId(gameSpecId)?.landing;
  if (tenantLanding) return new Set<LandingTimePresetId>(tenantLanding.timePresetIds);
  return new Set<LandingTimePresetId>(['1m1', '3m2']);
}
// Dark chess is always offered. Integrated tenant variants join the normal play
// entry points through their registry landing config.
function enabledLandingVariantGameSpecs(
  _mode: LandingPlayMode,
): { gameSpecId: LandingGameSpecId; label: string }[] {
  const specs: { gameSpecId: LandingGameSpecId; label: string }[] = [
    { gameSpecId: DARK_CHESS_SPEC_ID, label: gameSpecForId(DARK_CHESS_SPEC_ID).publicName },
  ];
  // Each tenant's registry entry decides whether it appears in normal play-menu
  // entry points (Dark Xiangqi never does: it has no live room/lobby runtime).
  for (const tenant of webVariantTenants()) {
    if (!tenant.landing?.offerInMenu()) continue;
    specs.push({
      gameSpecId: tenant.gameSpecId as LandingGameSpecId,
      label: gameSpecForId(tenant.gameSpecId).publicName,
    });
  }
  // The tenant registry iterates in import order, not the rail's order; present
  // the picker in the one canonical variant order shared with every surface.
  specs.sort(
    (a, b) => canonicalVariantOrderIndex(a.gameSpecId) - canonicalVariantOrderIndex(b.gameSpecId),
  );
  return specs;
}

function gameGroupForSpec(gameSpecId: LandingGameSpecId): LandingGameGroupId {
  const family = gameSpecForId(gameSpecId).family;
  if (family === 'xiangqi') return 'xiangqi';
  if (family === 'shogi') return 'shogi';
  return 'chess';
}

function gameGroupMeta(groupId: LandingGameGroupId): {
  glyph: string;
  id: LandingGameGroupId;
  label: string;
} {
  return LANDING_GAME_GROUPS.find((group) => group.id === groupId) ?? LANDING_GAME_GROUPS[0];
}

function gameGroupsForVariantOptions(
  options: readonly { gameSpecId: LandingGameSpecId }[],
): LandingGameGroupId[] {
  const present = new Set(options.map((option) => gameGroupForSpec(option.gameSpecId)));
  return LANDING_GAME_GROUPS.map((group) => group.id).filter((groupId) => present.has(groupId));
}

function parseLandingGameSpecId(value: string): LandingGameSpecId {
  const tenant = webVariantTenantForSpecId(value);
  return tenant ? (tenant.gameSpecId as LandingGameSpecId) : DARK_CHESS_SPEC_ID;
}

function deepLinkInitialVariant(
  variant: string | null,
  _mode: LandingPlayMode,
): LandingGameSpecId | undefined {
  // Each tenant's registry entry decides deep-link reachability (Dark Xiangqi
  // never is: it has no playable runtime).
  const tenant = variant ? webVariantTenantForSpecId(variant) : null;
  if (tenant?.landing?.acceptsDeepLink()) return tenant.gameSpecId as LandingGameSpecId;
  return undefined;
}
const DARK_CHESS_LANDING_CAPABILITIES: LandingGameSpecCapabilities = {
  firstColor: 'white',
  firstGlyph: '♚',
  firstLabel: 'White',
  secondColor: 'black',
  secondGlyph: '♚',
  secondLabel: 'Black',
  supportsRated: true,
  supportsStartFormat: true,
  supportsTimeControl: true,
};

// UI-only placeholder shown in the engine picker before /api/engines/playable
// resolves (or if every retry fails). It is NOT a real, submittable engine: the
// id is a sentinel the server rejects with 400 invalid_engine, so it can never
// produce a game. We label it "Misty" (the brand) instead of the old built-in
// "Random Legal v1" so a slow or failed load never shows a wrong opponent name.
// landing.ts retries the fetch and refetches on refocus to shrink this window to
// near-zero; the real roster ("Misty 1.0") swaps in the moment the API lands.
export const PENDING_ENGINE_ID = 'pending-engine';
export function fallbackPlayableEngines(): PlayableEngine[] {
  return [{ id: PENDING_ENGINE_ID, name: 'Misty', familyName: 'Misty', kind: 'builtin' }];
}

// How the play panel hands off to a freshly created/matched room. Defaults to a
// full document navigation; mountLanding swaps in an in-place SPA transition so
// the starting click's user activation carries into the room (lets the engine's
// opening move sound without a fresh in-room gesture — see live-sound.ts).
type RoomNavigator = (url: string) => void;
const fullReloadNavigator: RoomNavigator = (url) => {
  window.location.href = url;
};
let roomNavigator: RoomNavigator = fullReloadNavigator;
export function setRoomNavigator(nav: RoomNavigator | null): void {
  roomNavigator = nav ?? fullReloadNavigator;
}

// The currently open setup dialog's close handler, if any. An in-place room
// transition must dismiss the dialog (it lives on document.body, outside #app,
// so the DOM swap would otherwise strand it and its document-level keydown
// listener).
let activeDialogClose: (() => void) | null = null;
export function closeActiveLandingDialog(): void {
  activeDialogClose?.();
}

export function buildLandingPlayPanel(
  engines: PlayableEngine[],
  options: { showLobbyRequests?: boolean } = {},
): HTMLElement {
  const panel = document.createElement('aside');
  panel.className = 'landing-play-panel';
  panel.setAttribute('aria-label', 'Start playing');

  const availableEngines = engines.length > 0 ? engines : fallbackPlayableEngines();
  const defaultEngineId = availableEngines[0]?.id;
  const lobbyButton = landingPlayAction('Find opponent', 'lobby');
  const challengeButton = landingPlayAction('Challenge a friend', 'friend');
  const engineButton = landingPlayAction('Play the engine', 'computer');

  lobbyButton.addEventListener('click', () => {
    openLandingSetupDialog({
      engineId: defaultEngineId,
      mode: 'lobby',
      title: 'Find opponent',
      ratedDisabled: !isRatedModeEnabled() || !isLikelySignedIn(),
    });
  });
  challengeButton.addEventListener('click', () => {
    openLandingSetupDialog({
      mode: 'pvp',
      title: 'Challenge a friend',
      ratedDisabled: true,
    });
  });
  engineButton.addEventListener('click', () => {
    openLandingSetupDialog({
      engineId: defaultEngineId,
      engines: availableEngines,
      mode: 'pve',
      title: 'Play the engine',
    });
  });

  // Engine-led order: "Play the engine" leads because it's the always-available,
  // differentiated action with no human-liquidity dependency. Crossroads lives
  // in the friend-room variant picker instead of a separate homepage route.
  panel.append(engineButton);
  panel.append(challengeButton, lobbyButton);

  // Correspondence is no longer a standalone action: it's the long end of the
  // time-control axis inside Challenge a friend (see openLandingSetupDialog).

  // The always-available engine permanently carries the primary (green) CTA. We
  // deliberately do NOT swap emphasis on live presence: the old signal counted
  // the viewer's own open game tabs and in-progress engine games as "presence",
  // so a lone tab (usually yours) flipped the green to "Find opponent" and it
  // flickered on the 5s poll. The live-stats text below still surfaces real
  // presence, but it no longer steers which action is primary.
  engineButton.classList.add('landing-play-action-primary');

  const anonNote = document.createElement('p');
  anonNote.className = 'landing-play-anon-note';
  anonNote.textContent = 'No account needed.';
  panel.append(anonNote);

  const stats = document.createElement('p');
  stats.className = 'landing-play-stats';
  stats.hidden = true;
  panel.append(stats);
  startLiveStatsPolling(stats);

  if (options.showLobbyRequests) {
    panel.append(buildLobbyRequestsWindow());
  }
  return panel;
}

function startLiveStatsPolling(stats: HTMLElement): void {
  const render = (data: { playing: number; online: number } | null) => {
    // Display only — this no longer steers the primary (green) CTA. The engine
    // is pinned as primary (see buildLandingPlayPanel); the old swap counted the
    // viewer's own open game tabs and engine games as "presence", so it flipped
    // and flickered. We still surface real presence here as informational text.
    if (!data || (data.playing === 0 && data.online === 0)) {
      stats.hidden = true;
      stats.textContent = '';
      return;
    }
    const parts: string[] = [];
    if (data.playing > 0) parts.push(`${data.playing} playing now`);
    if (data.online > 0) parts.push(`${data.online} online`);
    stats.textContent = parts.join(' · ');
    stats.hidden = false;
  };

  const refresh = async () => {
    try {
      const resp = await fetch('/api/live-stats');
      if (!resp.ok) return;
      const data = (await resp.json()) as { playing: number; online: number };
      render(data);
    } catch (err) {
      console.warn(err);
    }
  };

  void refresh();
  const timer = window.setInterval(() => {
    if (!document.body.contains(stats)) {
      window.clearInterval(timer);
      return;
    }
    void refresh();
  }, 5_000);
}

// Lucide icons (ISC), inlined and unified to a single spec: 24-grid, 2px round
// stroke, outline-only. Consistency is what makes the row read as a designed set
// rather than ad-hoc glyphs. swords = matchmaking/versus, link =
// link-based challenge, bot = engine.
type LandingPlayIcon = 'computer' | 'correspondence' | 'friend' | 'lobby';
const LANDING_PLAY_ICON_SVG: Record<LandingPlayIcon, string> = {
  correspondence: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>`,
  lobby: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/></svg>`,
  friend: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  computer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`,
};

function landingPlayAction(label: string, icon: LandingPlayIcon): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `landing-play-action landing-play-action-${icon}`;
  appendLandingActionContent(button, label, icon);
  return button;
}

function appendLandingActionContent(
  element: HTMLAnchorElement | HTMLButtonElement,
  label: string,
  icon: LandingPlayIcon,
): void {
  const iconEl = document.createElement('span');
  iconEl.className = 'landing-play-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.innerHTML = LANDING_PLAY_ICON_SVG[icon];
  const labelEl = document.createElement('span');
  labelEl.className = 'landing-play-action-label';
  labelEl.textContent = label;
  element.append(iconEl, labelEl);
}

export function buildLobbyRequestsWindow(): HTMLElement {
  const shell = document.createElement('section');
  shell.className = 'landing-lobby-requests';
  shell.setAttribute('aria-label', 'Open pairing requests');

  const header = document.createElement('div');
  header.className = 'landing-lobby-requests-header';
  const title = document.createElement('strong');
  title.textContent = 'Open requests';
  const count = document.createElement('span');
  count.textContent = 'Checking';
  header.append(title, count);

  const list = document.createElement('div');
  list.className = 'landing-lobby-requests-list';

  shell.append(header, list);

  const render = (requests: OpenLobbyRequest[]) => {
    count.textContent = requests.length === 1 ? '1 waiting' : `${requests.length} waiting`;
    list.replaceChildren();
    if (requests.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'landing-lobby-requests-empty';
      empty.textContent = 'No open requests right now.';
      list.append(empty);
      return;
    }
    for (const request of requests) {
      list.append(lobbyRequestRow(request));
    }
  };

  const refresh = async () => {
    try {
      const requests = await fetchOpenLobbyRequests();
      render(requests);
    } catch (err) {
      console.warn(err);
      count.textContent = 'Unavailable';
      list.replaceChildren();
      const empty = document.createElement('p');
      empty.className = 'landing-lobby-requests-empty';
      empty.textContent = 'Open requests could not load.';
      list.append(empty);
    }
  };

  void refresh();
  const refreshTimer = window.setInterval(() => {
    if (!document.body.contains(shell)) {
      window.clearInterval(refreshTimer);
      return;
    }
    void refresh();
  }, 3_000);

  return shell;
}

function lobbyRequestRow(request: OpenLobbyRequest): HTMLElement {
  const row = document.createElement('div');
  row.className = 'landing-lobby-request-row';

  const details = document.createElement('div');
  details.className = 'landing-lobby-request-details';

  const requestSpecId = parseLandingGameSpecId(request.gameSpecId ?? DARK_CHESS_SPEC_ID);
  const primary = document.createElement('span');
  const ratedLabel = request.rated === false ? 'Casual' : 'Rated';
  // Chess shows its start format; other variants show the game name (a DMX open
  // request isn't "Standard/Draft960").
  const formatLabel =
    requestSpecId === DARK_CHESS_SPEC_ID
      ? request.hiddenDraft960
        ? 'Dark Draft960'
        : 'Standard'
      : gameSpecForId(requestSpecId).publicName;
  // Time control + game on the bold line; the casual/rated tag drops to the
  // meta line with the wait age so a long variant name (Dark Mini Xiangqi)
  // doesn't orphan "· Casual" onto its own wrapped line.
  primary.textContent = `${formatTimeControl(request.timeControl)} ${formatLabel}`;
  const secondary = document.createElement('small');
  secondary.textContent = `${ratedLabel} · ${formatWaitAge(request.waitingMs)} waiting`;
  details.append(primary, secondary);

  const join = document.createElement('button');
  join.type = 'button';
  join.textContent = 'Join';
  join.addEventListener('click', () => {
    join.disabled = true;
    join.textContent = 'Joining';
    const status = document.createElement('span');
    const setup: LandingRoomSetup = {
      gameSpecId: requestSpecId,
      startFormat: request.hiddenDraft960 ? 'draft960' : 'standard',
      rated: request.rated ?? true,
      timeControl: request.timeControl,
      preferredColor: 'random',
    };
    // Joining an open request matches instantly, so no engine offer is involved
    // (unchanged from chess) — the offer only arms while waiting.
    joinLobbyFromPlay(join, setup, status);
  });

  row.append(details, join);
  return row;
}

async function fetchOpenLobbyRequests(): Promise<OpenLobbyRequest[]> {
  const response = await fetch('/api/lobby');
  if (!response.ok) throw new Error(`lobby requests failed: ${response.status}`);
  const data = (await response.json()) as { requests?: OpenLobbyRequest[] };
  return Array.isArray(data.requests) ? data.requests : [];
}

function formatTimeControl(timeControl: OpenLobbyRequest['timeControl']): string {
  const minutes = timeControl.initialMs / 60_000;
  const increment = timeControl.incrementMs / 1000;
  const minuteLabel = Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
  return `${minuteLabel} + ${increment}`;
}

function formatWaitAge(waitingMs: number): string {
  const seconds = Math.max(0, Math.floor(waitingMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m`;
}

// Deep link: `/?play=lobby` (also `friend` / `computer`) auto-opens the
// matching play-setup modal on landing load, so article CTAs can drop a
// visitor straight into "Find opponent". Consumed params are cleared from the
// URL so a refresh doesn't reopen the modal or trigger the dev live shortcut.
export function maybeOpenPlayDeepLink(engines: PlayableEngine[]): void {
  const params = new URLSearchParams(window.location.search);
  const play = params.get('play');
  if (!play) return;

  const availableEngines = engines.length > 0 ? engines : fallbackPlayableEngines();
  const defaultEngineId = availableEngines[0]?.id;

  switch (play) {
    case 'lobby':
      openLandingSetupDialog({
        engineId: defaultEngineId,
        initialGameSpecId: deepLinkInitialVariant(
          params.get('gameSpecId') ?? params.get('variant'),
          'lobby',
        ),
        mode: 'lobby',
        title: 'Find opponent',
        ratedDisabled: !isRatedModeEnabled() || !isLikelySignedIn(),
      });
      break;
    case 'friend':
      openLandingSetupDialog({
        initialGameSpecId: deepLinkInitialVariant(
          params.get('gameSpecId') ?? params.get('variant'),
          'pvp',
        ),
        mode: 'pvp',
        title: 'Challenge a friend',
        ratedDisabled: true,
      });
      break;
    case 'engine':
    case 'computer':
      openLandingSetupDialog({
        engineId: defaultEngineId,
        engines: availableEngines,
        initialGameSpecId: deepLinkInitialVariant(
          params.get('gameSpecId') ?? params.get('variant'),
          'pve',
        ),
        mode: 'pve',
        title: 'Play the engine',
      });
      break;
    default:
      return;
  }

  params.delete('play');
  params.delete('gameSpecId');
  params.delete('variant');
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', url);
}

// Whether a variant has a computer opponent in the play menu. Dark chess uses
// the always-on empty-lobby/fallback engine, and Xiangqi fog variants default
// their engines server-side (so neither carries tenant engineOptions); other
// variants need a tenant PvE engine option. PvP-first variants with no bot yet
// return false, so the engine flow greys them out instead of offering a dead
// "Play the engine" that silently falls back to a PvP room.
function landingVariantSupportsPve(gameSpecId: LandingGameSpecId): boolean {
  if (
    gameSpecId === DARK_CHESS_SPEC_ID ||
    gameSpecId === DARK_XIANGQI_SPEC_ID ||
    gameSpecId === DARK_MINI_XIANGQI_SPEC_ID
  )
    return true;
  return Boolean(webVariantTenantForSpecId(gameSpecId)?.landing?.engineOptions);
}

function openLandingSetupDialog(choice: LandingPlayChoice): void {
  const existing = document.querySelector('.landing-setup-overlay');
  existing?.remove();

  const storedPreference = loadSetupPreference(choice.mode);
  let startFormat: LandingStartFormat = storedPreference.startFormat ?? 'standard';
  let rated =
    choice.mode === 'pve' || choice.ratedDisabled ? false : (storedPreference.rated ?? true);
  let selectedGameSpecId: LandingGameSpecId =
    choice.initialGameSpecId ?? storedPreference.gameSpecId ?? DARK_CHESS_SPEC_ID;
  const publicVariantOptions = enabledLandingVariantGameSpecs(choice.mode);
  const softLinkedHiddenVariant =
    choice.initialGameSpecId &&
    !publicVariantOptions.some((option) => option.gameSpecId === choice.initialGameSpecId)
      ? choice.initialGameSpecId
      : undefined;
  const variantOptions = softLinkedHiddenVariant
    ? [
        {
          gameSpecId: softLinkedHiddenVariant,
          label: gameSpecForId(softLinkedHiddenVariant).publicName,
        },
      ]
    : publicVariantOptions;
  if (!variantOptions.some((option) => option.gameSpecId === selectedGameSpecId)) {
    selectedGameSpecId = DARK_CHESS_SPEC_ID;
  }
  // In the engine flow, never default-select a variant with no bot (it shows
  // greyed-out below); fall back to dark chess, which always has an engine.
  if (choice.mode === 'pve' && !landingVariantSupportsPve(selectedGameSpecId)) {
    selectedGameSpecId = DARK_CHESS_SPEC_ID;
  }
  let selectedPreset: LandingTimePresetId = storedPreference.timePresetId ?? '3m2';
  // Non-null when a correspondence (days-per-move) option is chosen — it takes
  // over from the real-time preset above. Only offered for Challenge-a-friend
  // and Find opponent on casual dark chess.
  let selectedCorrespondenceDays: number | null = null;
  // Which side of the time-control segmented toggle is active. Drives whether the
  // real-time presets or the correspondence day-chips show; only ever flips to
  // 'correspondence' when that segment is actually offered (correspondenceAvailable).
  let selectedTimeMode: 'realtime' | 'correspondence' = 'realtime';
  // Engine choice is remembered per variant rather than sharing one slot across
  // all PvE variants. Seed from the stored per-variant map; migrate the legacy
  // single engineId onto the variant the dialog opens on (the last one played) so
  // existing players keep their pick.
  const engineByGameSpec = new Map<LandingGameSpecId, string>();
  for (const [spec, id] of Object.entries(storedPreference.engineIdByGameSpec ?? {})) {
    if (id) engineByGameSpec.set(spec as LandingGameSpecId, id);
  }
  if (storedPreference.engineId && !engineByGameSpec.has(selectedGameSpecId)) {
    engineByGameSpec.set(selectedGameSpecId, storedPreference.engineId);
  }
  let selectedEngineId =
    engineByGameSpec.get(selectedGameSpecId) ?? storedPreference.engineId ?? choice.engineId;
  let preferredColor: LandingColorPreference =
    storedPreference.preferredColor ?? loadStoredColorPreference();
  let syncGameSpecificSections = () => {};
  let syncVariantControls = () => {};
  let syncColorPreferenceControls = () => {};
  let syncSetupAccordion = () => {};
  let openSetupSection = (_id: string) => {};
  let openNextSetupSection = (_id: string) => {};
  let selectedGameGroupId = gameGroupForSpec(selectedGameSpecId);

  const overlay = document.createElement('div');
  overlay.className = 'landing-setup-overlay';
  overlay.setAttribute('role', 'presentation');

  const dialog = document.createElement('section');
  dialog.className = 'landing-setup-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'landing-setup-title');

  const heading = document.createElement('strong');
  heading.className = 'landing-setup-title';
  heading.id = 'landing-setup-title';
  heading.textContent = choice.title;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'landing-setup-close';
  closeButton.setAttribute('aria-label', 'Close setup');
  closeButton.textContent = 'x';

  const header = document.createElement('div');
  header.className = 'landing-setup-header';
  header.append(heading, closeButton);

  const groupHasPlayableVariant = (groupId: LandingGameGroupId) =>
    variantOptions.some(
      (option) =>
        gameGroupForSpec(option.gameSpecId) === groupId &&
        (choice.mode !== 'pve' || landingVariantSupportsPve(option.gameSpecId)),
    );
  const gameGroupOptions =
    gameGroupsForVariantOptions(variantOptions).filter(groupHasPlayableVariant);
  const gameGroupSelectable = gameGroupOptions.length > 1;
  if (!gameGroupOptions.includes(selectedGameGroupId)) {
    selectedGameGroupId = gameGroupOptions[0] ?? selectedGameGroupId;
  }
  const gameGroupSection = document.createElement('div');
  gameGroupSection.className = 'landing-setup-section';
  let syncGameGroupControls = () => {};
  const firstPlayableVariantForGameGroup = (
    groupId: LandingGameGroupId,
  ): LandingGameSpecId | undefined =>
    (
      variantOptions.find(
        (option) =>
          gameGroupForSpec(option.gameSpecId) === groupId &&
          (choice.mode !== 'pve' || landingVariantSupportsPve(option.gameSpecId)),
      ) ?? variantOptions.find((option) => gameGroupForSpec(option.gameSpecId) === groupId)
    )?.gameSpecId;

  if (gameGroupSelectable) {
    const groupGrid = document.createElement('div');
    groupGrid.className = 'landing-game-group-grid';
    groupGrid.setAttribute('role', 'radiogroup');
    groupGrid.setAttribute('aria-label', 'Game group');
    const groupButtons = new Map<LandingGameGroupId, HTMLButtonElement>();
    for (const groupId of gameGroupOptions) {
      const group = gameGroupMeta(groupId);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'landing-game-group-card';
      button.setAttribute('role', 'radio');
      button.dataset.gameGroup = group.id;

      const glyph = document.createElement('span');
      glyph.className = 'landing-game-group-glyph';
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = group.glyph;

      const name = document.createElement('span');
      name.className = 'landing-game-group-name';
      name.textContent = group.label;

      button.append(glyph, name);
      button.addEventListener('click', () => {
        selectedGameGroupId = group.id;
        if (gameGroupForSpec(selectedGameSpecId) !== selectedGameGroupId) {
          selectedGameSpecId =
            firstPlayableVariantForGameGroup(selectedGameGroupId) ?? selectedGameSpecId;
        }
        syncGameGroupControls();
        syncGameSpecificSections();
        openSetupSection('variant');
      });
      groupButtons.set(group.id, button);
      groupGrid.append(button);
    }
    syncGameGroupControls = () => {
      for (const [groupId, button] of groupButtons) {
        const selected = groupId === selectedGameGroupId;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-checked', selected ? 'true' : 'false');
      }
    };
    syncGameGroupControls();
    gameGroupSection.append(groupGrid);
  }

  const variantSection = document.createElement('div');
  variantSection.className = 'landing-setup-section';
  variantSection.append(setupSectionLabel('Variant'));

  // The picker appears only when a second variant exists beyond chess. The
  // option set is mode-aware because PvE can show non-engine variants as
  // disabled cards instead of hiding them entirely.
  const variantSelectable = variantOptions.length > 1;
  if (variantSelectable) {
    // A visual radiogroup of variant cards (mini-board + name) replaces the old
    // native <select>, so the picker doubles as a showcase of what's playable.
    const grid = document.createElement('div');
    grid.className = 'landing-variant-grid';
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', 'Variant');
    const cards = new Map<LandingGameSpecId, HTMLButtonElement>();
    for (const { gameSpecId, label } of variantOptions) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'landing-variant-card';
      card.setAttribute('role', 'radio');
      card.dataset.gameSpec = gameSpecId;
      // No computer opponent yet (Dark Xiangqi, Reveal Chess): grey the card out
      // of the engine flow rather than letting it be picked and silently create
      // a PvP room.
      const pveDisabled = choice.mode === 'pve' && !landingVariantSupportsPve(gameSpecId);
      if (pveDisabled) {
        card.disabled = true;
        card.classList.add('landing-variant-card-disabled');
        card.setAttribute('aria-disabled', 'true');
        card.title = `${label} has no computer opponent yet`;
      }
      const miniId = variantMiniIdForGameSpec(gameSpecId);
      if (miniId) {
        const thumb = document.createElement('span');
        thumb.className = 'landing-variant-card-thumb';
        thumb.innerHTML = renderVariantMiniBoard(miniId, { size: 100, label: `${label} board` });
        card.append(thumb);
      }
      const name = document.createElement('span');
      name.className = 'landing-variant-card-name';
      name.textContent = label;
      card.append(name);
      if (pveDisabled) {
        const badge = document.createElement('span');
        badge.className = 'landing-variant-card-badge';
        badge.textContent = 'Soon';
        card.append(badge);
      } else {
        card.addEventListener('click', () => {
          selectedGameSpecId = gameSpecId;
          selectedGameGroupId = gameGroupForSpec(gameSpecId);
          syncGameGroupControls();
          syncVariantControls();
          syncGameSpecificSections();
          openNextSetupSection('variant');
        });
      }
      cards.set(gameSpecId, card);
      grid.append(card);
    }
    syncVariantControls = () => {
      for (const [specId, card] of cards) {
        const on = specId === selectedGameSpecId;
        card.hidden = gameGroupSelectable && gameGroupForSpec(specId) !== selectedGameGroupId;
        card.classList.toggle('selected', on);
        card.setAttribute('aria-checked', on ? 'true' : 'false');
      }
    };
    syncVariantControls();
    variantSection.append(grid);
  } else {
    const variantControl = document.createElement('div');
    variantControl.className = 'landing-variant-control';
    const label = gameSpecForId(selectedGameSpecId).publicName;
    const miniId = variantMiniIdForGameSpec(selectedGameSpecId);
    if (miniId) {
      const thumb = document.createElement('span');
      thumb.className = 'landing-variant-control-thumb';
      thumb.innerHTML = renderVariantMiniBoard(miniId, { size: 100, label: `${label} board` });
      variantControl.append(thumb);
    }
    const name = document.createElement('span');
    name.className = 'landing-variant-control-name';
    name.textContent = label;
    variantControl.append(name);
    variantSection.append(variantControl);
  }

  const engineSection =
    choice.mode === 'pve'
      ? buildEngineSetupSection(
          choice.engines ?? fallbackPlayableEngines(),
          selectedEngineId,
          (engineId, gameSpecId) => {
            selectedEngineId = engineId;
            engineByGameSpec.set(gameSpecId, engineId);
            syncSetupAccordion();
            openNextSetupSection('engine');
          },
        )
      : null;

  const draft960Enabled = isVariantEnabled('fog_draft960');
  const draft960Selectable = draft960Enabled && choice.mode !== 'lobby';
  let startGroup: HTMLDivElement | null = null;
  const standardButton = startOptionButton('Standard', true);
  const draftButton = startOptionButton(
    draft960Selectable ? 'Dark Draft960' : 'Dark Draft960 (coming soon)',
    false,
  );
  if (draft960Enabled) {
    startGroup = document.createElement('div');
    startGroup.className = 'landing-start-options';
    startGroup.setAttribute('role', 'radiogroup');
    startGroup.setAttribute('aria-label', 'Fog start format');
    if (!draft960Selectable) {
      draftButton.disabled = true;
      draftButton.classList.add('disabled');
      draftButton.title = 'Coming soon';
    }
    const syncOptions = () => {
      standardButton.classList.toggle('selected', startFormat === 'standard');
      standardButton.setAttribute('aria-checked', startFormat === 'standard' ? 'true' : 'false');
      draftButton.classList.toggle('selected', startFormat === 'draft960');
      draftButton.setAttribute('aria-checked', startFormat === 'draft960' ? 'true' : 'false');
    };
    standardButton.addEventListener('click', () => {
      startFormat = 'standard';
      syncOptions();
      syncSetupAccordion();
    });
    if (draft960Selectable) {
      draftButton.addEventListener('click', () => {
        startFormat = 'draft960';
        syncOptions();
        syncSetupAccordion();
      });
    }
    startGroup.append(standardButton, draftButton);
    variantSection.append(startGroup);
  }

  const timeSection = document.createElement('div');
  timeSection.className = 'landing-setup-section';
  timeSection.append(setupSectionLabel('Time control'));

  // Lichess-style segmented toggle: Real time vs Correspondence. It only appears
  // when correspondence is actually offered for the current selection (casual
  // dark chess in Challenge-a-friend / Find opponent); otherwise the section is
  // real-time-only and the toggle stays hidden. Correspondence is the long end of
  // the time axis, not a separate mode — Challenge-a-friend creates a private
  // room, Find opponent posts an open seek.
  const timeModeToggle = document.createElement('div');
  timeModeToggle.className = 'landing-start-options landing-time-mode';
  timeModeToggle.setAttribute('role', 'radiogroup');
  timeModeToggle.setAttribute('aria-label', 'Time control type');
  const realtimeModeButton = startOptionButton('Real time', true);
  const correspondenceModeButton = startOptionButton('Correspondence', false);
  realtimeModeButton.addEventListener('click', () => {
    selectedTimeMode = 'realtime';
    selectedCorrespondenceDays = null;
    syncTimeControls();
  });
  correspondenceModeButton.addEventListener('click', () => {
    selectedTimeMode = 'correspondence';
    if (selectedCorrespondenceDays === null) {
      selectedCorrespondenceDays = DEFAULT_CORRESPONDENCE_DAYS;
    }
    syncTimeControls();
  });
  timeModeToggle.append(realtimeModeButton, correspondenceModeButton);

  const presetGroup = document.createElement('div');
  presetGroup.className = 'landing-time-presets';
  presetGroup.setAttribute('role', 'radiogroup');
  presetGroup.setAttribute('aria-label', 'Time control');

  const presetButtons = LANDING_TIME_PRESETS.map((preset) => {
    const button = startOptionButton(preset.label, preset.id === selectedPreset);
    button.addEventListener('click', () => {
      if (button.hidden) return;
      selectedPreset = preset.id;
      selectedTimeMode = 'realtime';
      selectedCorrespondenceDays = null;
      syncTimeControls();
      openNextSetupSection('time');
    });
    presetGroup.append(button);
    return { button, preset };
  });

  const correspondenceGroup = document.createElement('div');
  correspondenceGroup.className = 'landing-time-presets landing-correspondence-presets';
  correspondenceGroup.setAttribute('role', 'radiogroup');
  correspondenceGroup.setAttribute('aria-label', 'Days per move');
  const correspondenceButtons = CORRESPONDENCE_DAY_OPTIONS.map((option) => {
    const button = startOptionButton(option.label, false);
    button.addEventListener('click', () => {
      if (button.hidden) return;
      selectedTimeMode = 'correspondence';
      selectedCorrespondenceDays = option.days;
      syncTimeControls();
      openNextSetupSection('time');
    });
    correspondenceGroup.append(button);
    return { button, option };
  });

  const correspondenceAvailable = () =>
    (choice.mode === 'pvp' || choice.mode === 'lobby') &&
    selectedGameSpecId === DARK_CHESS_SPEC_ID &&
    !rated &&
    correspondenceEnabled();

  // Re-scope the picker to the current variant/rated/mode. Hides the segmented
  // toggle (and forces real time) when correspondence isn't offered; shows exactly
  // one chip group for the active segment; keeps the allowed real-time presets in
  // sync (5+5 is hidden for Crossroads casual, rated collapses to 3+2, and a pick
  // that is no longer offered falls back to 3+2).
  const syncTimeControls = () => {
    const corrAvailable = correspondenceAvailable();
    if (!corrAvailable) {
      selectedTimeMode = 'realtime';
      selectedCorrespondenceDays = null;
    }
    const corrActive = selectedTimeMode === 'correspondence';

    timeModeToggle.hidden = !corrAvailable;
    realtimeModeButton.classList.toggle('selected', !corrActive);
    realtimeModeButton.setAttribute('aria-checked', !corrActive ? 'true' : 'false');
    correspondenceModeButton.classList.toggle('selected', corrActive);
    correspondenceModeButton.setAttribute('aria-checked', corrActive ? 'true' : 'false');

    presetGroup.hidden = corrActive;
    correspondenceGroup.hidden = !corrActive;

    const allowed = allowedTimePresetIds(selectedGameSpecId, rated);
    if (!allowed.has(selectedPreset)) selectedPreset = '3m2';
    for (const { button, preset } of presetButtons) {
      const show = allowed.has(preset.id);
      button.hidden = !show;
      const selected = show && !corrActive && selectedPreset === preset.id;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
    }
    for (const { button, option } of correspondenceButtons) {
      const selected = corrActive && selectedCorrespondenceDays === option.days;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
    }
    syncSetupAccordion();
  };
  syncTimeControls();
  timeSection.append(timeModeToggle, presetGroup, correspondenceGroup);

  const actions = document.createElement('div');
  actions.className = 'landing-setup-actions';

  const status = document.createElement('p');
  status.className = 'landing-setup-status';
  status.setAttribute('aria-live', 'polite');

  let cancelLobbyWait: (() => void) | null = null;
  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.className = 'landing-setup-start';
  startButton.textContent =
    choice.mode === 'lobby'
      ? 'Find opponent'
      : choice.mode === 'pvp'
        ? 'Create room'
        : 'Start game';
  startButton.addEventListener('click', () => {
    if (selectedCorrespondenceDays !== null) {
      // Challenge a friend creates a private invite room; Find opponent posts an
      // open seek to the board (color server-assigned there, like the live pool).
      if (choice.mode === 'lobby') {
        void postCorrespondenceSeekFromPlay(startButton, status, selectedCorrespondenceDays);
      } else {
        void createCorrespondenceFromPlay(
          startButton,
          status,
          selectedCorrespondenceDays,
          preferredColor,
        );
      }
      return;
    }
    const setup = selectedRoomSetup(
      selectedGameSpecId,
      startFormat,
      rated,
      selectedPreset,
      preferredColor,
    );
    storeSetupPreference(choice.mode, setup, selectedPreset, selectedEngineId);
    if (choice.mode === 'lobby') {
      cancelLobbyWait?.();
      // The empty-lobby "play the engine" offer is chess-only (no engine plays
      // the xiangqi family yet), so DMX seekers wait without it.
      const lobbyEngineId = setup.gameSpecId === DARK_CHESS_SPEC_ID ? selectedEngineId : undefined;
      cancelLobbyWait = joinLobbyFromPlay(startButton, setup, status, lobbyEngineId);
      return;
    }
    void createRoomFromPlay(startButton, choice.mode, selectedEngineId, setup, status);
  });

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'landing-setup-back';
  backButton.textContent = 'Cancel';

  const close = () => {
    cancelLobbyWait?.();
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    if (activeDialogClose === close) activeDialogClose = null;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };
  closeButton.addEventListener('click', close);
  backButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKeyDown);

  const ratingSection =
    choice.mode === 'pvp' || choice.mode === 'lobby'
      ? buildRatedToggleSection(
          () => rated,
          (v) => {
            rated = v;
          },
          choice.ratedDisabled,
          () => {
            syncTimeControls();
            openNextSetupSection('gameType');
          },
        )
      : null;

  // Color picker shows for PvE and Challenge-a-friend. Hidden for casual/rated
  // lobby matchmaking — color is server-assigned there so the pool stays unified.
  const colorSection =
    choice.mode === 'pve' || choice.mode === 'pvp'
      ? buildColorPreferenceSection(
          () => preferredColor,
          (value) => {
            preferredColor = value;
            syncSetupAccordion();
          },
          () => selectedGameSpecId,
          (sync) => {
            syncColorPreferenceControls = sync;
          },
        )
      : null;

  syncGameSpecificSections = () => {
    const capabilities = landingGameSpecCapabilities(selectedGameSpecId);
    if (!capabilities.supportsStartFormat || !draft960Selectable) {
      startFormat = 'standard';
    }
    if (!capabilities.supportsRated) {
      rated = false;
    }
    preferredColor = coerceColorPreferenceForCapabilities(preferredColor, capabilities);
    // Some variants (Banqi) have no choosable side — the ink is bound by the
    // first mover's opening flip — so suppress the color picker and randomize.
    const hideColorPicker =
      webVariantTenantForSpecId(selectedGameSpecId)?.landing?.hideColorPicker ?? false;
    if (hideColorPicker) preferredColor = 'random';
    if (colorSection) {
      // `.hidden` alone won't hide it: `.landing-setup-section` sets
      // `display: grid`, which overrides the `[hidden]` attribute's
      // `display: none`. Toggle the inline display so it actually disappears.
      colorSection.hidden = hideColorPicker;
      colorSection.style.display = hideColorPicker ? 'none' : '';
    }
    if (startGroup) startGroup.hidden = !capabilities.supportsStartFormat;
    if (ratingSection) ratingSection.hidden = !capabilities.supportsRated;
    if (engineSection) {
      engineSection.sync(
        selectedGameSpecId,
        engineByGameSpec.get(selectedGameSpecId) ?? selectedEngineId,
      );
      engineSection.section.hidden =
        selectedGameSpecId !== DARK_CHESS_SPEC_ID &&
        !webVariantTenantForSpecId(selectedGameSpecId)?.landing?.engineOptions;
    }
    timeSection.hidden = !capabilities.supportsTimeControl;
    syncTimeControls(); // re-scope the preset picker to the selected variant
    syncGameGroupControls();
    syncVariantControls();
    syncColorPreferenceControls();
    syncSetupAccordion();
  };
  syncGameSpecificSections();

  const timeSummary = () => {
    if (selectedCorrespondenceDays !== null) {
      return `${selectedCorrespondenceDays} day${selectedCorrespondenceDays === 1 ? '' : 's'}`;
    }
    return (
      LANDING_TIME_PRESETS.find((candidate) => candidate.id === selectedPreset)?.label ?? '3 + 2'
    );
  };
  const gameTypeSummary = () => (rated && !choice.ratedDisabled ? 'Rated' : 'Casual');
  const variantSummary = () =>
    selectedGameSpecId === DARK_CHESS_SPEC_ID && startFormat === 'draft960'
      ? 'Dark Draft960'
      : gameSpecForId(selectedGameSpecId).publicName;
  const engineSummary = () => {
    const availableEngines =
      webVariantTenantForSpecId(selectedGameSpecId)?.landing?.engineOptions ??
      (choice.engines && choice.engines.length > 0 ? choice.engines : fallbackPlayableEngines());
    const engineId = engineByGameSpec.get(selectedGameSpecId) ?? selectedEngineId;
    return (
      availableEngines.find((engine) => engine.id === engineId)?.name ??
      availableEngines[0]?.name ??
      'Misty'
    );
  };
  const colorSummary = () => {
    if (preferredColor === 'random') return 'Random';
    const capabilities = landingGameSpecCapabilities(selectedGameSpecId);
    if (preferredColor === capabilities.firstColor) return capabilities.firstLabel;
    if (preferredColor === capabilities.secondColor) return capabilities.secondLabel;
    return 'Random';
  };
  const setupSections = [
    ...(gameGroupSelectable
      ? [
          buildSetupAccordionSection(
            'gameGroup',
            'Game group',
            gameGroupSection,
            () => gameGroupMeta(selectedGameGroupId).label,
          ),
        ]
      : []),
    buildSetupAccordionSection('variant', 'Variant', variantSection, variantSummary),
    buildSetupAccordionSection('time', 'Time control', timeSection, timeSummary),
    ...(ratingSection
      ? [buildSetupAccordionSection('gameType', 'Game type', ratingSection, gameTypeSummary)]
      : []),
    ...(engineSection
      ? [buildSetupAccordionSection('engine', 'Engine', engineSection.section, engineSummary)]
      : []),
    ...(colorSection
      ? [buildSetupAccordionSection('side', 'Side', colorSection, colorSummary)]
      : []),
  ];
  let openSetupSectionId = gameGroupSelectable
    ? 'gameGroup'
    : variantSelectable
      ? 'variant'
      : 'time';
  syncSetupAccordion = () => {
    const isSectionHidden = (content: HTMLElement) =>
      content.hidden || content.style.display === 'none';
    if (
      !setupSections.some(
        (section) => section.id === openSetupSectionId && !isSectionHidden(section.content),
      )
    ) {
      openSetupSectionId =
        setupSections.find((section) => !isSectionHidden(section.content))?.id ??
        openSetupSectionId;
    }
    for (const section of setupSections) {
      const hidden = isSectionHidden(section.content);
      const active = section.id === openSetupSectionId && !hidden;
      section.wrapper.hidden = hidden;
      section.wrapper.classList.toggle('active', active);
      section.button.setAttribute('aria-expanded', active ? 'true' : 'false');
      section.panel.hidden = !active;
      section.value.textContent = section.valueText();
    }
  };
  openSetupSection = (id: string) => {
    openSetupSectionId = id;
    syncSetupAccordion();
  };
  openNextSetupSection = (id: string) => {
    const isSectionHidden = (content: HTMLElement) =>
      content.hidden || content.style.display === 'none';
    const currentIndex = setupSections.findIndex((section) => section.id === id);
    const next = setupSections
      .slice(currentIndex + 1)
      .find((section) => !isSectionHidden(section.content));
    if (next) {
      openSetupSection(next.id);
    } else {
      syncSetupAccordion();
    }
  };
  for (const section of setupSections) {
    section.button.addEventListener('click', () => openSetupSection(section.id));
  }
  syncSetupAccordion();

  // Section order mirrors PlayStrategy's compact setup: group → variant → time
  // control → game type → engine strength → side/color → actions.
  actions.append(startButton, backButton);
  dialog.append(header, ...setupSections.map((section) => section.wrapper));
  dialog.append(status, actions);
  overlay.append(dialog);
  document.body.append(overlay);
  activeDialogClose = close;
  (draft960Enabled && selectedGameSpecId === DARK_CHESS_SPEC_ID
    ? standardButton
    : startButton
  ).focus();
}

// The days-per-move options offered at the long end of the time-control picker
// (openLandingSetupDialog). Selecting one routes the submit to the correspondence
// path — a private room (Challenge a friend) or an open seek (Find opponent) —
// instead of the real-time create.
const CORRESPONDENCE_DAY_OPTIONS: { days: number; label: string }[] = [
  { days: 1, label: '1 day' },
  { days: 3, label: '3 days' },
  { days: 7, label: '7 days' },
];
// Pre-selected day-chip when the player first flips to the Correspondence segment,
// so the Start button is immediately valid (mirrors lichess defaulting its slider).
const DEFAULT_CORRESPONDENCE_DAYS = 3;

async function createCorrespondenceFromPlay(
  button: HTMLButtonElement,
  status: HTMLElement,
  daysPerMove: number,
  preferredColor: LandingColorPreference,
): Promise<void> {
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Creating';
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gameSpecId: DARK_CHESS_SPEC_ID,
        mode: 'correspondence',
        daysPerMove,
        // The picker offers white/black/random only (chess colors).
        preferredColor: preferredColor === 'red' ? 'random' : preferredColor,
      }),
    });
    if (response.ok) {
      const data = (await response.json()) as { url?: string };
      if (!data.url) throw new Error('room creation did not return a URL');
      if (!status.isConnected) return;
      roomNavigator(data.url);
      return;
    }
    const failure = await readRoomCreationFailure(response);
    if (!status.isConnected) return;
    status.replaceChildren();
    if (failure.error === 'correspondence_requires_account') {
      status.append('Correspondence games need an account. ', accountLink('Sign in'), ' first.');
    } else if (failure.error === 'invalid_days_per_move') {
      status.textContent = 'Pick 1, 3, or 7 days per move.';
    } else if (failure.error === 'server_draining') {
      status.textContent = 'The server is restarting. Try again in a minute.';
    } else {
      status.textContent = 'Correspondence is unavailable right now. Try again later.';
    }
    button.textContent = 'Try again';
    button.disabled = false;
    button.removeAttribute('aria-busy');
  } catch (err) {
    console.warn(err);
    if (status.isConnected) {
      status.textContent = 'Could not reach the server. Check your connection and try again.';
    }
    button.textContent = 'Try again';
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

// Find opponent + a correspondence allowance: post an open seek to the board
// rather than create a private room. Color is server-assigned (random), matching
// the live pool's unified-pool rule; players who want a specific color use the
// "Post a game" form on /correspondence. Lands on the board so the player sees
// their seek and can join someone else's while they wait.
async function postCorrespondenceSeekFromPlay(
  button: HTMLButtonElement,
  status: HTMLElement,
  daysPerMove: number,
): Promise<void> {
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Posting';
  try {
    const response = await fetch('/api/correspondence/seeks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ daysPerMove, preferredColor: 'random' }),
    });
    if (response.ok) {
      if (!status.isConnected) return;
      roomNavigator('/correspondence');
      return;
    }
    const failure = await readRoomCreationFailure(response);
    if (!status.isConnected) return;
    status.replaceChildren();
    if (failure.error === 'not_signed_in' || failure.error === 'correspondence_requires_account') {
      status.append('Correspondence games need an account. ', accountLink('Sign in'), ' first.');
    } else if (failure.error === 'invalid_days_per_move') {
      status.textContent = 'Pick 1, 3, or 7 days per move.';
    } else if (failure.error === 'seek_limit_reached') {
      status.textContent = 'You already have the most open games allowed. Cancel one first.';
    } else if (failure.error === 'server_draining') {
      status.textContent = 'The server is restarting. Try again in a minute.';
    } else {
      status.textContent = 'Correspondence is unavailable right now. Try again later.';
    }
    button.textContent = 'Try again';
    button.disabled = false;
    button.removeAttribute('aria-busy');
  } catch (err) {
    console.warn(err);
    if (status.isConnected) {
      status.textContent = 'Could not reach the server. Check your connection and try again.';
    }
    button.textContent = 'Try again';
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

function accountLink(label: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = '/account';
  link.textContent = label;
  return link;
}

function buildEngineSetupSection(
  engines: PlayableEngine[],
  selectedEngineId: string | undefined,
  onSelect: (engineId: string, gameSpecId: LandingGameSpecId) => void,
): {
  section: HTMLElement;
  sync(gameSpecId: LandingGameSpecId, selectedEngineId: string | undefined): void;
} {
  const section = document.createElement('div');
  section.className = 'landing-setup-section';
  section.append(setupSectionLabel('Engine'));
  const body = document.createElement('div');
  section.append(body);

  const sync = (gameSpecId: LandingGameSpecId, currentEngineId: string | undefined) => {
    body.replaceChildren();
    const tenantEngineOptions = webVariantTenantForSpecId(gameSpecId)?.landing?.engineOptions;
    const availableEngines = tenantEngineOptions
      ? [...tenantEngineOptions]
      : engines.length > 0
        ? engines
        : fallbackPlayableEngines();
    const selected =
      currentEngineId && availableEngines.some((engine) => engine.id === currentEngineId)
        ? currentEngineId
        : defaultEngineIdForGameSpec(gameSpecId, availableEngines);
    if (selected) onSelect(selected, gameSpecId);

    // Streamlined release: a single player-facing dark-chess engine (Misty).
    // Show it as a static label; Crossroads has three strengths, so it renders a
    // real select.
    if (availableEngines.length <= 1) {
      const label = document.createElement('div');
      label.className = 'landing-variant-control';
      label.textContent = availableEngines[0]?.name ?? 'Misty';
      body.append(label);
      return;
    }

    const select = document.createElement('select');
    select.className = 'landing-engine-select';
    select.setAttribute('aria-label', 'Engine');
    for (const engine of availableEngines) {
      const option = document.createElement('option');
      option.value = engine.id;
      option.textContent = engine.name;
      select.append(option);
    }
    select.value = selected;
    select.addEventListener('change', () => onSelect(select.value, gameSpecId));
    body.append(select);
  };

  sync(DARK_CHESS_SPEC_ID, selectedEngineId);
  return { section, sync };
}

function defaultEngineIdForGameSpec(
  gameSpecId: LandingGameSpecId,
  availableEngines: readonly PlayableEngine[],
): string {
  const tenantDefault = webVariantTenantForSpecId(gameSpecId)?.landing?.defaultEngineId;
  if (tenantDefault) return tenantDefault;
  return availableEngines[0]?.id ?? '';
}

function buildRatedToggleSection(
  get: () => boolean,
  set: (v: boolean) => void,
  ratedDisabled = false,
  onChange: () => void = () => undefined,
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'landing-setup-section';
  section.append(setupSectionLabel('Game type'));

  const group = document.createElement('div');
  group.className = 'landing-start-options';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Game type');

  const ratedButton = startOptionButton(ratedDisabled ? 'Rated (coming soon)' : 'Rated', true);
  const casualButton = startOptionButton('Casual', false);

  if (ratedDisabled) {
    ratedButton.disabled = true;
    ratedButton.classList.add('disabled');
  }

  const sync = () => {
    const isRated = get();
    ratedButton.classList.toggle('selected', isRated && !ratedDisabled);
    ratedButton.setAttribute('aria-checked', isRated && !ratedDisabled ? 'true' : 'false');
    casualButton.classList.toggle('selected', !isRated || ratedDisabled);
    casualButton.setAttribute('aria-checked', !isRated || ratedDisabled ? 'true' : 'false');
  };
  if (!ratedDisabled) {
    ratedButton.addEventListener('click', () => {
      set(true);
      sync();
      onChange();
    });
  }
  casualButton.addEventListener('click', () => {
    set(false);
    sync();
    onChange();
  });
  sync();
  group.append(ratedButton, casualButton);

  // The Rated segment's own "COMING SOON" badge already signals the beta state,
  // so the explanatory helper paragraph is dropped to keep the dialog compact.
  section.append(group);
  return section;
}

const COLOR_PREFERENCE_STORAGE_KEY = 'mistboard:setup:preferredColor';
const SETUP_PREFERENCE_STORAGE_PREFIX = 'mistboard:setup:';

function loadStoredColorPreference(): LandingColorPreference {
  try {
    const raw = window.localStorage.getItem(COLOR_PREFERENCE_STORAGE_KEY);
    if (raw === 'white' || raw === 'red' || raw === 'black' || raw === 'random') return raw;
  } catch {
    // ignore — storage may be disabled (private mode, quota); fall through to default
  }
  return 'random';
}

function setupPreferenceStorageKey(mode: LandingPlayMode): string {
  return `${SETUP_PREFERENCE_STORAGE_PREFIX}${mode}`;
}

function loadSetupPreference(mode: LandingPlayMode): LandingSetupPreference {
  try {
    const raw = window.localStorage.getItem(setupPreferenceStorageKey(mode));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      engineId: typeof parsed.engineId === 'string' ? parsed.engineId : undefined,
      engineIdByGameSpec: normalizeStoredEngineMap(parsed.engineIdByGameSpec),
      gameSpecId: normalizeStoredGameSpecId(parsed.gameSpecId),
      preferredColor: normalizeStoredColorPreference(parsed.preferredColor),
      rated: typeof parsed.rated === 'boolean' ? parsed.rated : undefined,
      startFormat: normalizeStoredStartFormat(parsed.startFormat),
      timePresetId: normalizeStoredTimePresetId(parsed.timePresetId),
    };
  } catch {
    return {};
  }
}

function storeSetupPreference(
  mode: LandingPlayMode,
  setup: LandingRoomSetup,
  timePresetId: LandingTimePresetId,
  engineId?: string,
): void {
  // Merge into the existing per-variant engine map so persisting one variant's
  // pick never drops another variant's remembered engine.
  const engineIdByGameSpec = { ...(loadSetupPreference(mode).engineIdByGameSpec ?? {}) };
  if (mode === 'pve' && engineId) engineIdByGameSpec[setup.gameSpecId] = engineId;
  const preference: LandingSetupPreference = {
    gameSpecId: setup.gameSpecId,
    rated: setup.rated,
    startFormat: setup.startFormat,
    timePresetId,
  };
  if (Object.keys(engineIdByGameSpec).length > 0) {
    preference.engineIdByGameSpec = engineIdByGameSpec;
  }
  if (mode !== 'lobby') preference.preferredColor = setup.preferredColor;
  if (mode === 'pve' && engineId) preference.engineId = engineId;
  try {
    window.localStorage.setItem(setupPreferenceStorageKey(mode), JSON.stringify(preference));
  } catch {
    // ignore
  }
}

function normalizeStoredGameSpecId(value: unknown): LandingGameSpecId | undefined {
  if (value === DARK_CHESS_SPEC_ID) return DARK_CHESS_SPEC_ID;
  if (typeof value === 'string') {
    const tenant = webVariantTenantForSpecId(value);
    if (tenant?.landing?.offerInMenu()) return tenant.gameSpecId as LandingGameSpecId;
  }
  if (
    (value === CROSSROADS_CHESS_SPEC_ID || value === DUAL_CHESS_SPEC_ID) &&
    crossroadsChessEnabled()
  )
    return CROSSROADS_CHESS_SPEC_ID;
  return undefined;
}

function normalizeStoredEngineMap(
  value: unknown,
): Partial<Record<LandingGameSpecId, string>> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [spec, id] of Object.entries(value as Record<string, unknown>)) {
    if (typeof id === 'string') out[spec] = id;
  }
  // Stale entries (engine ids no longer valid for a variant) are harmless: the
  // engine section re-validates against the variant's current option list and
  // falls back to that variant's default.
  return Object.keys(out).length > 0
    ? (out as Partial<Record<LandingGameSpecId, string>>)
    : undefined;
}

function normalizeStoredColorPreference(value: unknown): LandingColorPreference | undefined {
  if (value === 'white' || value === 'red' || value === 'black' || value === 'random') return value;
  return undefined;
}

function coerceColorPreferenceForCapabilities(
  preferredColor: LandingColorPreference,
  capabilities: LandingGameSpecCapabilities,
): LandingColorPreference {
  if (preferredColor === 'random') return preferredColor;
  if (preferredColor === capabilities.firstColor || preferredColor === capabilities.secondColor) {
    return preferredColor;
  }
  if (preferredColor === 'white') return capabilities.firstColor;
  if (preferredColor === 'black') return capabilities.secondColor;
  return capabilities.firstColor === 'red' ? capabilities.firstColor : capabilities.secondColor;
}

function normalizeStoredStartFormat(value: unknown): LandingStartFormat | undefined {
  if (value === 'standard' || value === 'draft960') return value;
  return undefined;
}

function normalizeStoredTimePresetId(value: unknown): LandingTimePresetId | undefined {
  return LANDING_TIME_PRESETS.some((preset) => preset.id === value)
    ? (value as LandingTimePresetId)
    : undefined;
}

function buildColorPreferenceSection(
  get: () => LandingColorPreference,
  set: (value: LandingColorPreference) => void,
  getGameSpecId: () => LandingGameSpecId = () => DARK_CHESS_SPEC_ID,
  onSync?: (sync: () => void) => void,
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'landing-setup-section';
  const sectionLabel = setupSectionLabel('Color');
  section.append(sectionLabel);

  const group = document.createElement('div');
  group.className = 'landing-start-options three';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Color');

  const initial = get();
  const firstButton = colorOptionButton('white', 'White', initial === 'white');
  const randomButton = colorOptionButton('random', 'Random', initial === 'random');
  const blackButton = colorOptionButton('black', 'Black', initial === 'black');

  const sync = () => {
    const gameSpecId = getGameSpecId();
    const capabilities = landingGameSpecCapabilities(gameSpecId);
    const firstValue: LandingColorPreference = capabilities.firstColor;
    const secondValue: LandingColorPreference = capabilities.secondColor;
    const current = get();
    const pickerLabel = capabilities.pickerLabel ?? 'Color';
    sectionLabel.textContent = pickerLabel;
    group.setAttribute('aria-label', pickerLabel);
    updateColorOptionButton(firstButton, firstValue, capabilities.firstLabel, gameSpecId);
    updateColorOptionButton(randomButton, 'random', 'Random', gameSpecId);
    updateColorOptionButton(blackButton, secondValue, capabilities.secondLabel, gameSpecId);
    for (const [button, value] of [
      [firstButton, firstValue],
      [randomButton, 'random'],
      [blackButton, secondValue],
    ] as const) {
      const selected = current === value;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
    }
  };

  firstButton.addEventListener('click', () => {
    set(landingGameSpecCapabilities(getGameSpecId()).firstColor);
    sync();
  });
  randomButton.addEventListener('click', () => {
    set('random');
    sync();
  });
  blackButton.addEventListener('click', () => {
    set(landingGameSpecCapabilities(getGameSpecId()).secondColor);
    sync();
  });

  onSync?.(sync);
  group.append(firstButton, randomButton, blackButton);
  section.append(group);
  return section;
}

function colorOptionButton(
  value: LandingColorPreference,
  label: string,
  selected: boolean,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `landing-start-option landing-color-option${selected ? ' selected' : ''}`;
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', selected ? 'true' : 'false');

  const glyph = document.createElement('span');
  glyph.className = `landing-color-glyph ${value}`;
  glyph.setAttribute('aria-hidden', 'true');
  glyph.append(...colorGlyphNodes(value));

  const text = document.createElement('span');
  text.className = 'landing-color-label';
  text.textContent = label;

  button.append(glyph, text);
  return button;
}

function updateColorOptionButton(
  button: HTMLButtonElement,
  value: LandingColorPreference,
  label: string,
  gameSpecId: LandingGameSpecId,
): void {
  const glyph = button.querySelector<HTMLSpanElement>('.landing-color-glyph');
  const text = button.querySelector<HTMLSpanElement>('.landing-color-label');
  if (glyph) {
    const capabilities = landingGameSpecCapabilities(gameSpecId);
    glyph.className = capabilities.neutralGlyphColor
      ? `landing-color-glyph${value === 'random' ? ' random' : ''}`
      : `landing-color-glyph ${value}`;
    if (capabilities.glyphClass) glyph.classList.add(capabilities.glyphClass);
    glyph.replaceChildren(...colorGlyphNodes(value, gameSpecId));
  }
  if (text) text.textContent = label;
}

function colorGlyphNodes(
  value: LandingColorPreference,
  gameSpecId: LandingGameSpecId = DARK_CHESS_SPEC_ID,
): Node[] {
  const capabilities = landingGameSpecCapabilities(gameSpecId);
  if (value === 'random') {
    const first = document.createElement('span');
    first.className = capabilities.neutralGlyphColor ? '' : capabilities.firstColor;
    first.textContent = capabilities.firstGlyph;
    const second = document.createElement('span');
    second.className = capabilities.neutralGlyphColor ? '' : capabilities.secondColor;
    second.textContent = capabilities.secondGlyph;
    return [first, second];
  }
  return [
    document.createTextNode(
      value === capabilities.secondColor ? capabilities.secondGlyph : capabilities.firstGlyph,
    ),
  ];
}

function landingGameSpecCapabilities(gameSpecId: LandingGameSpecId): LandingGameSpecCapabilities {
  // Tenant capabilities live on their registry entries; chess (the fallback)
  // keeps its row here until the P2 migration.
  return (
    webVariantTenantForSpecId(gameSpecId)?.landing?.capabilities ?? DARK_CHESS_LANDING_CAPABILITIES
  );
}

function setupSectionLabel(text: string): HTMLSpanElement {
  const label = document.createElement('span');
  label.className = 'landing-setup-label';
  label.textContent = text;
  return label;
}

function buildSetupAccordionSection(
  id: string,
  label: string,
  content: HTMLElement,
  valueText: () => string,
): {
  button: HTMLButtonElement;
  content: HTMLElement;
  id: string;
  panel: HTMLElement;
  value: HTMLElement;
  valueText: () => string;
  wrapper: HTMLElement;
} {
  const leadingLabel = content.firstElementChild;
  if (leadingLabel?.classList.contains('landing-setup-label')) leadingLabel.remove();

  const wrapper = document.createElement('section');
  wrapper.className = 'landing-setup-accordion-section';
  wrapper.dataset.setupSection = id;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'landing-setup-summary';
  button.setAttribute('aria-controls', `landing-setup-panel-${id}`);
  button.setAttribute('aria-expanded', 'false');

  const title = document.createElement('span');
  title.className = 'landing-setup-summary-title';
  title.textContent = label;

  const value = document.createElement('span');
  value.className = 'landing-setup-summary-value';

  const chevron = document.createElement('span');
  chevron.className = 'landing-setup-summary-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '⌄';

  button.append(title, value, chevron);

  const panel = document.createElement('div');
  panel.id = `landing-setup-panel-${id}`;
  panel.className = 'landing-setup-accordion-panel';
  panel.hidden = true;
  panel.append(content);

  wrapper.append(button, panel);
  return { button, content, id, panel, value, valueText, wrapper };
}

function selectedRoomSetup(
  gameSpecId: LandingGameSpecId,
  startFormat: LandingStartFormat,
  rated: boolean,
  presetId: LandingTimePresetId,
  preferredColor: LandingColorPreference,
): LandingRoomSetup {
  const preset =
    LANDING_TIME_PRESETS.find((candidate) => candidate.id === presetId) ?? LANDING_TIME_PRESETS[1];
  return {
    gameSpecId,
    startFormat,
    rated,
    timeControl: {
      initialMs: preset.initialMs,
      incrementMs: preset.incrementMs,
    },
    preferredColor,
  };
}

function startOptionButton(label: string, selected: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `landing-start-option${selected ? ' selected' : ''}`;
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', selected ? 'true' : 'false');
  // Split a trailing parenthetical ("3 + 2 (coming soon)") into a muted hint badge so
  // the live label stays prominent and the not-yet-available note de-emphasizes.
  const hintMatch = label.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (hintMatch) {
    const main = document.createElement('span');
    main.className = 'landing-start-option-text';
    main.textContent = hintMatch[1];
    const hint = document.createElement('span');
    hint.className = 'landing-start-option-hint';
    hint.textContent = hintMatch[2];
    button.append(main, hint);
  } else {
    button.textContent = label;
  }
  return button;
}

async function createRoomFromPlay(
  button: HTMLButtonElement,
  mode: 'pvp' | 'pve',
  engineId?: string,
  setup: LandingRoomSetup = {
    gameSpecId: DARK_CHESS_SPEC_ID,
    startFormat: 'standard',
    rated: true,
    timeControl: { initialMs: 30_000, incrementMs: 2_000 },
    preferredColor: 'random',
  },
  status?: HTMLElement,
): Promise<void> {
  const label = button.querySelector<HTMLElement>('.landing-play-action-label');
  const originalText = label?.textContent ?? button.textContent ?? '';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  setButtonLabel(button, 'Creating');
  if (status) {
    status.hidden = false;
    status.textContent = mode === 'pve' ? 'Checking engine seats.' : '';
  }
  try {
    while (true) {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(roomCreationRequestBody(mode, setup, engineId)),
      });
      if (status && !status.isConnected) return;
      if (response.ok) {
        const data = (await response.json()) as { url?: string };
        if (!data.url) throw new Error('room creation did not return a URL');
        if (status && !status.isConnected) return;
        roomNavigator(data.url);
        return;
      }
      const failure = await readRoomCreationFailure(response);
      if (mode === 'pve' && failure.error === 'engine_busy' && status?.isConnected) {
        status.textContent = 'All engine seats are active. Waiting for the next seat.';
        setButtonLabel(button, 'Waiting for seat');
        await sleep(ENGINE_SEAT_RETRY_MS);
        if (status.isConnected) continue;
        return;
      }
      throw roomCreationError(response.status, failure);
    }
  } catch (err) {
    console.warn(err);
    if (status?.isConnected) {
      status.textContent = roomCreationStatusText(err, mode);
    }
    setButtonLabel(button, 'Try again');
    button.disabled = false;
    button.removeAttribute('aria-busy');
    window.setTimeout(() => {
      if (button.disabled) return;
      setButtonLabel(button, originalText);
    }, 1800);
  }
}

export function roomCreationRequestBody(
  mode: 'pvp' | 'pve',
  setup: LandingRoomSetup,
  engineId?: string,
): Record<string, unknown> {
  const gameSpecId = roomCreationGameSpecId(setup);
  if (setup.gameSpecId === CROSSROADS_CHESS_SPEC_ID) {
    return {
      mode,
      gameSpecId,
      timeControl: setup.timeControl,
      rated: false,
      preferredColor: setup.preferredColor === 'red' ? 'black' : setup.preferredColor,
      ...(mode === 'pve' && engineId ? { engineId } : {}),
    };
  }
  if (setup.gameSpecId === JIEQI_SPEC_ID) {
    // Jieqi PvE sends the picked engine id (unlike DMX, which defaults it
    // server-side); colors are xiangqi red/black, never rated.
    return {
      mode,
      gameSpecId,
      timeControl: setup.timeControl,
      preferredColor:
        setup.preferredColor === 'white'
          ? 'red'
          : setup.preferredColor === 'red' || setup.preferredColor === 'black'
            ? setup.preferredColor
            : 'random',
      ...(mode === 'pve' && engineId ? { engineId } : {}),
    };
  }
  if (setup.gameSpecId === BANQI_SPEC_ID) {
    // Banqi PvE sends the picked MistyBanqi id; seats are red/black move-order
    // (ink binds on the first flip), never rated.
    return {
      mode,
      gameSpecId,
      timeControl: setup.timeControl,
      preferredColor:
        setup.preferredColor === 'white'
          ? 'red'
          : setup.preferredColor === 'red' || setup.preferredColor === 'black'
            ? setup.preferredColor
            : 'random',
      ...(mode === 'pve' && engineId ? { engineId } : {}),
    };
  }
  if (setup.gameSpecId === DROP_MINI_XIANGQI_SPEC_ID) {
    // Drop Mini Xiangqi is open-info red/black mini xiangqi with reserves.
    return {
      mode,
      gameSpecId,
      timeControl: setup.timeControl,
      ...(mode === 'pvp' ? { rated: setup.rated } : {}),
      preferredColor:
        setup.preferredColor === 'white'
          ? 'red'
          : setup.preferredColor === 'red' || setup.preferredColor === 'black'
            ? setup.preferredColor
            : 'random',
      ...(mode === 'pve' && engineId ? { engineId } : {}),
    };
  }
  if (setup.gameSpecId === MINI_XIANGQI_SPEC_ID) {
    // Mini Xiangqi is open-info red/black mini xiangqi without drops, casual-only
    // for now. PvE plays via Fairy-Stockfish's native minixiangqi variant.
    return {
      mode,
      gameSpecId,
      timeControl: setup.timeControl,
      rated: false,
      preferredColor:
        setup.preferredColor === 'white'
          ? 'red'
          : setup.preferredColor === 'red' || setup.preferredColor === 'black'
            ? setup.preferredColor
            : 'random',
      ...(mode === 'pve' && engineId ? { engineId } : {}),
    };
  }
  if (setup.gameSpecId === REVEAL_CHESS_SPEC_ID) {
    // Reveal Chess is PvP-only and casual-only (rated not launched); colors are
    // standard chess white/black, with no draft960 / start-format axis.
    return {
      mode,
      gameSpecId,
      timeControl: setup.timeControl,
      rated: false,
      preferredColor: setup.preferredColor,
    };
  }
  if (setup.gameSpecId === DARK_CROSSROADS_CHESS_SPEC_ID) {
    // Dark Crossroads is PvP-only and casual-only (no engine — Fairy-Stockfish is
    // perfect-info — and rated not launched); colors are the variant's own
    // white/red, passed straight through (the picker normalizes 'black' -> 'red').
    return {
      mode: 'pvp',
      gameSpecId,
      timeControl: setup.timeControl,
      rated: false,
      preferredColor: setup.preferredColor === 'black' ? 'red' : setup.preferredColor,
    };
  }
  if (setup.gameSpecId === DARK_SHOGI_SPEC_ID) {
    // Dark Shogi is PvP-only and casual-only (no bot yet, rated not launched).
    // Shogi colors are black (sente) / white (gote), passed straight through.
    return {
      mode: 'pvp',
      gameSpecId,
      timeControl: setup.timeControl,
      rated: false,
      preferredColor:
        setup.preferredColor === 'black' || setup.preferredColor === 'white'
          ? setup.preferredColor
          : 'random',
    };
  }
  if (setup.gameSpecId === DARK_CRAZYHOUSE_SPEC_ID) {
    // Dark Crazyhouse is PvP-only and casual-only (no bot yet, rated not
    // launched); standard chess white/black, passed straight through.
    return {
      mode: 'pvp',
      gameSpecId,
      timeControl: setup.timeControl,
      rated: false,
      preferredColor:
        setup.preferredColor === 'white' || setup.preferredColor === 'black'
          ? setup.preferredColor
          : 'random',
    };
  }
  if (setup.gameSpecId === KRIEGSPIEL_SPEC_ID) {
    // Kriegspiel is PvP-only from setup (no bot yet; rated rooms are not exposed
    // here); standard chess white/black, passed straight through.
    return {
      mode: 'pvp',
      gameSpecId,
      timeControl: setup.timeControl,
      rated: false,
      preferredColor:
        setup.preferredColor === 'white' || setup.preferredColor === 'black'
          ? setup.preferredColor
          : 'random',
    };
  }
  if (setup.gameSpecId === DARK_XIANGQI_SPEC_ID || setup.gameSpecId === DARK_MINI_XIANGQI_SPEC_ID) {
    return {
      // Xiangqi fog engines are defaulted server-side, so no engine id is sent.
      mode,
      gameSpecId,
      timeControl: setup.timeControl,
      ...(mode === 'pvp' ? { rated: setup.rated } : {}),
      preferredColor:
        setup.preferredColor === 'white'
          ? 'red'
          : setup.preferredColor === 'red' || setup.preferredColor === 'black'
            ? setup.preferredColor
            : 'random',
    };
  }
  return {
    mode,
    gameSpecId,
    hiddenDraft960: setup.startFormat === 'draft960',
    timeControl: setup.timeControl,
    rated: setup.rated,
    preferredColor: setup.preferredColor,
    ...(mode === 'pve' && engineId ? { engineId } : {}),
  };
}

export function roomCreationGameSpecId(
  setup: LandingRoomSetup,
):
  | typeof DARK_CHESS_SPEC_ID
  | typeof DARK_DRAFT960_SPEC_ID
  | typeof MINI_XIANGQI_SPEC_ID
  | typeof DARK_MINI_XIANGQI_SPEC_ID
  | typeof DROP_MINI_XIANGQI_SPEC_ID
  | typeof DARK_XIANGQI_SPEC_ID
  | typeof CROSSROADS_CHESS_SPEC_ID
  | typeof DARK_CROSSROADS_CHESS_SPEC_ID
  | typeof DARK_SHOGI_SPEC_ID
  | typeof DARK_CRAZYHOUSE_SPEC_ID
  | typeof KRIEGSPIEL_SPEC_ID
  | typeof JIEQI_SPEC_ID
  | typeof BANQI_SPEC_ID
  | typeof REVEAL_CHESS_SPEC_ID {
  if (setup.gameSpecId === JIEQI_SPEC_ID) return JIEQI_SPEC_ID;
  if (setup.gameSpecId === BANQI_SPEC_ID) return BANQI_SPEC_ID;
  if (setup.gameSpecId === MINI_XIANGQI_SPEC_ID) return MINI_XIANGQI_SPEC_ID;
  if (setup.gameSpecId === DROP_MINI_XIANGQI_SPEC_ID) return DROP_MINI_XIANGQI_SPEC_ID;
  if (setup.gameSpecId === REVEAL_CHESS_SPEC_ID) return REVEAL_CHESS_SPEC_ID;
  if (setup.gameSpecId === CROSSROADS_CHESS_SPEC_ID) return CROSSROADS_CHESS_SPEC_ID;
  if (setup.gameSpecId === DARK_CROSSROADS_CHESS_SPEC_ID) return DARK_CROSSROADS_CHESS_SPEC_ID;
  if (setup.gameSpecId === DARK_SHOGI_SPEC_ID) return DARK_SHOGI_SPEC_ID;
  if (setup.gameSpecId === DARK_CRAZYHOUSE_SPEC_ID) return DARK_CRAZYHOUSE_SPEC_ID;
  if (setup.gameSpecId === KRIEGSPIEL_SPEC_ID) return KRIEGSPIEL_SPEC_ID;
  if (setup.gameSpecId === DARK_MINI_XIANGQI_SPEC_ID) return DARK_MINI_XIANGQI_SPEC_ID;
  if (setup.gameSpecId === DARK_XIANGQI_SPEC_ID) return DARK_XIANGQI_SPEC_ID;
  return setup.startFormat === 'draft960' ? DARK_DRAFT960_SPEC_ID : DARK_CHESS_SPEC_ID;
}

async function readRoomCreationFailure(response: Response): Promise<RoomCreationFailure> {
  try {
    return (await response.json()) as RoomCreationFailure;
  } catch {
    return {};
  }
}

function roomCreationError(status: number, failure: RoomCreationFailure): Error {
  const err = new Error(`room creation failed: ${status}`);
  err.name = failure.error ?? 'room_creation_failed';
  return err;
}

function roomCreationStatusText(err: unknown, mode: 'pvp' | 'pve'): string {
  if (err instanceof Error && err.name === 'crossroads_chess_disabled') {
    return 'Crossroads Chess live rooms are not enabled on this server.';
  }
  if (err instanceof Error && err.name === 'crossroads_chess_unsupported_surface') {
    return 'Crossroads Chess rooms are only available for casual friend games.';
  }
  if (err instanceof Error && err.name === 'drop_mini_xiangqi_unsupported_surface') {
    return 'Drop Mini Xiangqi engine games are casual only.';
  }
  if (err instanceof Error && err.name === 'invalid_time_control') {
    return 'That time control is not available. Try another one.';
  }
  if (err instanceof Error && err.name === 'persistence_disabled') {
    return 'Room storage is not available on this server.';
  }
  if (mode === 'pve' && err instanceof Error && err.name === 'engine_unavailable') {
    return 'The engine service is unavailable. Try again soon.';
  }
  if (mode === 'pve') return 'Could not start an engine game. Try again.';
  return 'Could not create the room. Try again.';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function joinLobbyFromPlay(
  button: HTMLButtonElement,
  setup: LandingRoomSetup,
  status: HTMLElement,
  engineId?: string,
): () => void {
  const controller = new AbortController();
  const originalText = button.textContent ?? '';
  const queueJoinedAt = Date.now();
  const bucketProps = {
    variant: setup.startFormat,
    // Chess keeps the legacy resolver (so draft960 stays tagged dark-draft960);
    // other variants resolve straight from their spec id.
    ...(setup.gameSpecId === DARK_CHESS_SPEC_ID
      ? gameSpecAnalyticsProps({
          variant: DARK_CHESS_SPEC_ID,
          hiddenDraft960: setup.startFormat === 'draft960',
        })
      : gameSpecAnalyticsPropsForId(setup.gameSpecId)),
    initialMs: setup.timeControl.initialMs,
    incrementMs: setup.timeControl.incrementMs,
    time_class: classifyTimeControl(setup.timeControl.initialMs, setup.timeControl.incrementMs),
    rated: setup.rated,
  };
  let active = true;
  let ticketId: string | null = null;
  let pollTimer: number | null = null;
  let offerTimer: number | null = null;
  let offerEl: HTMLElement | null = null;

  const clearOfferTimer = () => {
    if (offerTimer !== null) {
      window.clearTimeout(offerTimer);
      offerTimer = null;
    }
  };

  const removeOffer = () => {
    offerEl?.remove();
    offerEl = null;
    status.hidden = false;
  };

  const cancel = () => {
    active = false;
    controller.abort();
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    clearOfferTimer();
    if (ticketId) {
      void fetch(`/api/lobby/${encodeURIComponent(ticketId)}`, { method: 'DELETE' }).catch(
        () => {},
      );
    }
  };

  const acceptEngineOffer = (playButton: HTMLButtonElement) => {
    if (!engineId) return;
    track('lobby_engine_offer_accepted', { ...bucketProps, waitMs: Date.now() - queueJoinedAt });
    cancel();
    void createRoomFromPlay(playButton, 'pve', engineId, setup, status);
  };

  const dismissEngineOffer = () => {
    track('lobby_engine_offer_dismissed', { ...bucketProps, waitMs: Date.now() - queueJoinedAt });
    removeOffer();
    scheduleEngineOffer();
  };

  const showEngineOffer = () => {
    if (!engineId || offerEl !== null || !status.isConnected) return;
    status.hidden = true;
    track('lobby_engine_offer_shown', { ...bucketProps, waitMs: Date.now() - queueJoinedAt });

    const block = document.createElement('div');
    block.className = 'landing-engine-offer';

    const prompt = document.createElement('p');
    prompt.className = 'landing-engine-offer-prompt';
    prompt.textContent = 'No opponents right now. Play the engine instead?';

    const actions = document.createElement('div');
    actions.className = 'landing-engine-offer-actions';

    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'landing-setup-start';
    play.textContent = 'Play the engine';
    play.addEventListener('click', () => acceptEngineOffer(play));

    const keep = document.createElement('button');
    keep.type = 'button';
    keep.className = 'landing-setup-back';
    keep.textContent = 'Keep waiting';
    keep.addEventListener('click', dismissEngineOffer);

    actions.append(play, keep);
    block.append(prompt, actions);
    status.insertAdjacentElement('afterend', block);
    offerEl = block;
  };

  const scheduleEngineOffer = () => {
    if (!engineId) return;
    clearOfferTimer();
    offerTimer = window.setTimeout(() => {
      offerTimer = null;
      if (
        shouldOfferEngine({
          elapsedMs: Date.now() - queueJoinedAt,
          thresholdMs: ENGINE_OFFER_AFTER_MS,
          stillWaiting: active && offerEl === null,
          hasEngine: Boolean(engineId),
        })
      ) {
        showEngineOffer();
      }
    }, ENGINE_OFFER_AFTER_MS);
  };

  const redirectIfMatched = (ticket: LobbyTicketResponse): boolean => {
    if (ticket.status !== 'matched' || !ticket.url) return false;
    track('lobby_match_found', { ...bucketProps, waitMs: Date.now() - queueJoinedAt });
    window.location.href = ticket.url;
    return true;
  };

  const handleLobbyError = (err: unknown) => {
    if (!active) return;
    console.warn(err);
    clearOfferTimer();
    removeOffer();
    button.disabled = false;
    button.removeAttribute('aria-busy');
    setButtonLabel(button, 'Try again');
    status.textContent = 'Could not join the lobby. Try again.';
    window.setTimeout(() => {
      if (button.disabled) return;
      setButtonLabel(button, originalText);
    }, 1800);
  };

  const poll = async () => {
    if (!active || !ticketId) return;
    const response = await fetch(`/api/lobby/${encodeURIComponent(ticketId)}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`lobby poll failed: ${response.status}`);
    const ticket = (await response.json()) as LobbyTicketResponse;
    if (!active || redirectIfMatched(ticket)) return;
    pollTimer = window.setTimeout(() => {
      void poll().catch(handleLobbyError);
    }, ticket.pollAfterMs ?? 1_000);
  };

  const start = async () => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    setButtonLabel(button, 'Waiting');
    status.textContent = 'Waiting for a matching opponent. Keep this tab open.';
    const response = await fetch('/api/lobby', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        gameSpecId: setup.gameSpecId,
        hiddenDraft960: setup.startFormat === 'draft960',
        timeControl: setup.timeControl,
        rated: setup.rated,
      }),
    });
    if (!response.ok) throw new Error(`lobby join failed: ${response.status}`);
    const ticket = (await response.json()) as LobbyTicketResponse;
    track('lobby_queue_joined', bucketProps);
    if (!active || redirectIfMatched(ticket)) return;
    if (!ticket.ticketId) throw new Error('lobby did not return a ticket');
    ticketId = ticket.ticketId;
    pollTimer = window.setTimeout(() => {
      void poll().catch(handleLobbyError);
    }, ticket.pollAfterMs ?? 1_000);
    scheduleEngineOffer();
  };

  void start().catch(handleLobbyError);
  return cancel;
}

function setButtonLabel(button: HTMLButtonElement, text: string): void {
  const label = button.querySelector<HTMLElement>('.landing-play-action-label');
  if (label) {
    label.textContent = text;
  } else {
    button.textContent = text;
  }
}
