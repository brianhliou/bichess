// Discovery sources: a broadcast source that is a query rather than a list.
//
// A manifest names the boards to poll, so relaying a multi-board live event
// means regenerating and republishing that manifest every round. A discovery
// source instead works out which boards are live at poll time and builds the
// manifest in memory, so one source URL runs a whole tournament untouched.
//
// The discovery URL itself is never fetched, so it bypasses the host allowlist
// by construction. That is safe because every URL a provider returns is fed
// through the normal manifest path, where resolveLeafSource re-runs
// validateXiangqiBroadcastSourceUrl per entry and records source_disallowed for
// anything off the allowlist. The fail-closed property lives at the leaves.

import type { XiangqiBroadcastSourceFetch } from './xiangqi-broadcast-fetch.js';

export const XIANGQI_BROADCAST_DISCOVERY_SCHEME = 'mistboard-discover:';

export type DiscoveredBoard = {
  /** Absolute URL of the board, re-gated by the source policy downstream. */
  url: string;
  event?: string;
  red?: string;
  black?: string;
  plies: number;
};

export type DiscoveryProviderInput = {
  config: URLSearchParams;
  fetchImpl: XiangqiBroadcastSourceFetch;
  timeoutMs: number;
};

export type DiscoveryProvider = {
  readonly name: string;
  discover(
    input: DiscoveryProviderInput,
  ): Promise<{ ok: true; boards: DiscoveredBoard[] } | { ok: false; message: string }>;
};

export type DiscoverySource = {
  provider: DiscoveryProvider;
  config: URLSearchParams;
  /** Pinned tour identity. Required: see parseXiangqiBroadcastDiscoverySource. */
  tourSlug: string;
  tourName?: string;
  minViewers: number;
  maxBoards: number;
  /** Substring match against a board's event tag; unset keeps every board. */
  event?: string;
};

export type DiscoverySourceParse =
  | { ok: true; source: DiscoverySource }
  | { ok: false; message: string };

const providers = new Map<string, DiscoveryProvider>();

export function registerXiangqiBroadcastDiscoveryProvider(provider: DiscoveryProvider): void {
  providers.set(provider.name, provider);
}

export function isXiangqiBroadcastDiscoveryUrl(sourceUrl: string): boolean {
  return sourceUrl.trimStart().toLowerCase().startsWith(XIANGQI_BROADCAST_DISCOVERY_SCHEME);
}

function positiveInteger(raw: string | null, fallback: number, max: number): number | null {
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) return null;
  return parsed;
}

/**
 * `mistboard-discover://<provider>?tourSlug=...&event=...&minViewers=3&maxBoards=32`
 *
 * Unknown providers are rejected rather than falling back to treating the
 * string as an http URL, matching the fail-closed variant-dispatch rule: an
 * unrecognised member throws instead of being mapped onto a neighbour.
 */
export function parseXiangqiBroadcastDiscoverySource(
  sourceUrl: string,
  maxBoardsCeiling: number,
): DiscoverySourceParse {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return { ok: false, message: 'discovery source is not a URL' };
  }
  if (parsed.protocol.toLowerCase() !== XIANGQI_BROADCAST_DISCOVERY_SCHEME) {
    return { ok: false, message: 'not a discovery source' };
  }

  // A custom-scheme URL puts the authority in `host`, but an empty authority
  // (mistboard-discover:/dpxq-live) leaves it on the path, so accept both
  // rather than silently reading an empty provider name.
  const providerName = (parsed.host || parsed.pathname.replace(/^\/+/, '')).toLowerCase();
  if (providerName.length === 0) {
    return { ok: false, message: 'discovery source names no provider' };
  }
  const provider = providers.get(providerName);
  if (!provider) {
    return {
      ok: false,
      message: `unknown discovery provider "${providerName}" (known: ${[...providers.keys()].sort().join(', ') || 'none'})`,
    };
  }

  const config = parsed.searchParams;
  const tourSlug = config.get('tourSlug')?.trim();
  if (!tourSlug) {
    // Without a pinned slug the adapter would fall back to deriving the tour
    // from the source's own tags, which is the derivation discovery exists to
    // replace, and a wrong slug scatters one event across several tours.
    return { ok: false, message: 'discovery source requires a tourSlug' };
  }

  const minViewers = positiveInteger(config.get('minViewers'), 1, 10_000);
  if (minViewers === null) {
    return { ok: false, message: 'discovery source minViewers must be a positive integer' };
  }
  const maxBoards = positiveInteger(config.get('maxBoards'), maxBoardsCeiling, maxBoardsCeiling);
  if (maxBoards === null) {
    return {
      ok: false,
      message: `discovery source maxBoards must be an integer between 1 and ${maxBoardsCeiling}`,
    };
  }

  const tourName = config.get('tourName')?.trim();
  const event = config.get('event')?.trim();
  return {
    ok: true,
    source: {
      provider,
      config,
      tourSlug,
      minViewers,
      maxBoards,
      ...(tourName ? { tourName } : {}),
      ...(event ? { event } : {}),
    },
  };
}

/** Test seam: drop every registered provider. */
export function resetXiangqiBroadcastDiscoveryProviders(): void {
  providers.clear();
}

export type ScheduledRound = { id: string; name?: string; startsAt: Date };

export type RoundResolution =
  | { ok: true; roundId: string; roundName?: string }
  | { ok: false; message: string };

/** Default span after a round's start during which its boards are still live. */
export const XIANGQI_BROADCAST_ROUND_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * Pick the round a poll belongs to from the seeded schedule.
 *
 * Pinning a round in the source config would move the per-round human step
 * rather than remove it, so the schedule decides. Rounds are seeded once with
 * their dates (scripts/seed-broadcast-rounds.mjs) and the whole event then runs
 * without an operator.
 *
 * Outside any round's window this fails rather than guessing. Falling back to
 * the most recent round would quietly file round 8's games under round 7 during
 * the gap between them, which is worse than importing nothing.
 */
export function resolveScheduledRound(
  rounds: readonly ScheduledRound[],
  now: Date,
  windowMs: number = XIANGQI_BROADCAST_ROUND_WINDOW_MS,
): RoundResolution {
  const nowMs = now.getTime();
  let best: ScheduledRound | undefined;
  for (const round of rounds) {
    const startedAt = round.startsAt.getTime();
    if (startedAt > nowMs) continue;
    if (nowMs - startedAt > windowMs) continue;
    if (!best || startedAt > best.startsAt.getTime()) best = round;
  }
  if (!best) {
    return { ok: false, message: 'no scheduled round is active' };
  }
  return { ok: true, roundId: best.id, ...(best.name ? { roundName: best.name } : {}) };
}

export type DiscoveryManifestSource = {
  url: string;
  tourSlug: string;
  tourName?: string;
  roundId: string;
  roundName?: string;
  boardNumber: number;
};

export type DiscoveryManifestBuild =
  | { ok: true; sources: DiscoveryManifestSource[]; droppedForCap: number }
  | { ok: false; message: string };

/**
 * Turn discovered boards into manifest entries.
 *
 * Every entry pins the tour, the round and the board number rather than letting
 * the converter derive them. dpxq's tag hygiene varies by whoever created the
 * record (sampled boards carried event="2020", round="2020-10" and an empty
 * table), and it serves one game per page, so a derived round would collapse a
 * whole league onto one round and a derived board number would make every board
 * "Board 1".
 */
export function buildDiscoveryManifestSources(input: {
  source: DiscoverySource;
  boards: readonly DiscoveredBoard[];
  round: { roundId: string; roundName?: string };
}): DiscoveryManifestBuild {
  const matching = input.source.event
    ? input.boards.filter((board) => (board.event ?? '').includes(input.source.event as string))
    : [...input.boards];

  if (matching.length === 0) {
    return {
      ok: false,
      message: input.source.event
        ? `no live boards matched event "${input.source.event}"`
        : 'no live boards discovered',
    };
  }

  const kept = matching.slice(0, input.source.maxBoards);
  return {
    ok: true,
    // A silent cap reads as full coverage, so the count travels with the result
    // and the caller logs it.
    droppedForCap: matching.length - kept.length,
    sources: kept.map((board, index) => ({
      url: board.url,
      tourSlug: input.source.tourSlug,
      roundId: input.round.roundId,
      boardNumber: index + 1,
      ...(input.source.tourName ? { tourName: input.source.tourName } : {}),
      ...(input.round.roundName ? { roundName: input.round.roundName } : {}),
    })),
  };
}
