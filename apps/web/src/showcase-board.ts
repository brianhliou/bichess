// Mounts one game as a compact, single-board, autoplaying showcase board that
// hands off via onGameEnd at the end. Split from ./showcase-dispatch.ts because
// this pulls in replay.js (chessground); keeping it separate lets /watch import
// the resolver without the chessground weight.

import type { GameEvent } from '@mistboard/game';
import { type GameMeta, mountReplay, type ReplayHandle } from './replay.js';
import { showcaseRendererKindForSpec } from './showcase-dispatch.js';
import { webVariantTenantForSpecId } from './variant-tenant/registry.js';

// Hold on the final frame (clocks flipped to 1/0/½ result marks) before the
// board hands off via onGameEnd. Matches the tenant frameworks'
// SHOWCASE_END_HOLD_MS so every variant ends on the same beat.
const SHOWCASE_CHESS_HOLD_MS = 4000;

export type ShowcaseBoardOptions = {
  metadataByRoomId: Record<string, GameMeta>;
  // Player names for the tenant compact seats (first = red, second = black),
  // keyed by room id; the chess path reads names from metadataByRoomId instead.
  namesByRoomId: Record<string, { first: string; second: string }>;
  // Fired once when the mounted game reaches its final ply; the cycler advances.
  // Omitted by static callers (e.g. the dev variant sheet) that don't cycle.
  onGameEnd?: () => void;
  // Autoplay through the game (default). false = mount paused at the start
  // position, used by the dev sheet to show each variant's opening.
  autoplay?: boolean;
  // POV for the chess (chessground) path; tenants pick their own showcase side.
  pov: 'white' | 'black';
  // Completed-game grids can reveal the final chess position. The homepage keeps
  // the fogged POV throughout by default so its showcase still demonstrates fog.
  revealOnFinish?: boolean;
  // Chess event loader (static bundled samples vs the games API). Tenants load
  // their own postgame payloads internally and ignore this.
  loaderForId: (roomId: string) => Promise<GameEvent[]>;
};

export async function mountShowcaseBoard(
  root: HTMLElement,
  specId: string,
  roomId: string,
  options: ShowcaseBoardOptions,
): Promise<ReplayHandle> {
  const tenant =
    showcaseRendererKindForSpec(specId) === 'chess' ? null : webVariantTenantForSpecId(specId);
  if (tenant?.watch) {
    return tenant.watch.mountReplay(root, roomId, {
      autoplay: options.autoplay ?? true,
      metadataByRoomId: options.metadataByRoomId,
      compact: true,
      onGameEnd: options.onGameEnd,
      namesByRoomId: options.namesByRoomId,
    });
  }

  // Chess (chessground): a single fogged POV board, no controls, paced for the
  // homepage. To match the tenant showcase boards, it drops captured-piece rows
  // and puts the player name + clock in rows above/below the board (board-edges),
  // which CSS then styles into the shared `.showcase-seat` look.
  return mountReplay(root, roomId, {
    autoplay: options.autoplay ?? true,
    showControls: false,
    keyboardNav: false,
    revealOnFinish: options.revealOnFinish ?? false,
    clampPace: true,
    metadataMode: 'compact',
    metadataByRoomId: options.metadataByRoomId,
    hideGameIdPill: true,
    showCaptures: false,
    compactClockLayout: 'board-edges',
    endStatusMode: 'clock',
    betweenGameDelayMs: SHOWCASE_CHESS_HOLD_MS,
    onGameEnd: options.onGameEnd,
    orientation: options.pov,
    orientationForId: () => options.pov,
    panes: { resolver: () => options.pov },
    loaderForId: options.loaderForId,
  });
}
