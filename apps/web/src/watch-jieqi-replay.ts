// Mistboard TV renderer for Jieqi — a thin adapter over the shared tenant watch
// renderer (watch-tenant-replay.ts). TV deliberately shows one finished-game
// server-truth board with no captures or player-knowledge POVs. The dedicated
// /watch payload therefore avoids the richer review endpoint's Red + Black
// histories and historical legal-move generation.
import type { JieqiPlayerView } from '@mistboard/game';
import {
  type JieqiPostgameResponse,
  type JieqiPostgameViewKey,
  postgameReplayMaxPly,
  postgameViewAtPly,
} from './live-jieqi-postgame.js';
import {
  animateJieqiBoardMove,
  installJieqiBoardStyles,
  renderJieqiBoardSvg,
} from './live-jieqi-render.js';
import type { ReplayHandle } from './replay.js';
import { mountTenantWatchReplay, type TenantWatchReplayOptions } from './watch-tenant-replay.js';

export type JieqiWatchReplayOptions = TenantWatchReplayOptions;

type JieqiWatchLoadResult =
  | { ok: true; postgame: JieqiPostgameResponse }
  | { ok: false; status: number };

function paneKind(key: JieqiPostgameViewKey): 'white' | 'truth' | 'black' {
  if (key === 'red') return 'white';
  if (key === 'black') return 'black';
  return 'truth';
}

export function jieqiWatchPostgameApiUrl(roomId: string): string {
  return `/api/jieqi/games/${encodeURIComponent(roomId)}/watch`;
}

export async function loadJieqiWatchPostgame(roomId: string): Promise<JieqiWatchLoadResult> {
  const response = await fetch(jieqiWatchPostgameApiUrl(roomId));
  if (!response.ok) return { ok: false, status: response.status };
  return {
    ok: true,
    postgame: (await response.json()) as JieqiPostgameResponse,
  };
}

export function mountJieqiWatchReplay(
  root: HTMLElement,
  roomId: string,
  options: JieqiWatchReplayOptions,
): Promise<ReplayHandle> {
  return mountTenantWatchReplay<JieqiPostgameResponse, JieqiPlayerView, JieqiPostgameViewKey>(
    root,
    roomId,
    options,
    {
      installStyles: installJieqiBoardStyles,
      loadPostgame: loadJieqiWatchPostgame,
      maxPly: postgameReplayMaxPly,
      // The dedicated payload contains only this finished-game truth history.
      viewEntries: () => [{ key: 'truth', label: 'Truth' }],
      viewAtPly: postgameViewAtPly,
      paneKind,
      renderBoard: (view, orientation) => renderJieqiBoardSvg(view, orientation, {}),
      // One-ply steps glide (pieceAnimation pref): forward animates the newly
      // rendered view's lastMove; a back step reverse-animates the move the
      // previous ply carried. Moves come from the watch payload's views only.
      animateMove: (boardEl, view, prevView, direction, orientation) => {
        const move = direction === 'forward' ? view.lastMove : prevView?.lastMove;
        if (!move) return;
        animateJieqiBoardMove(boardEl, move, orientation, { reverse: direction === 'back' });
      },
      // Captures are intentionally absent from the compact TV product.
      fillCaptures: () => {},
    },
  );
}
