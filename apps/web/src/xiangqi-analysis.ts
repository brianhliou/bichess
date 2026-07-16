// The standalone /analysis/xiangqi surface (lichess.org/analysis): a fresh
// interactive board at the START POSITION, or seeded from an imported move list.
// Play moves that branch into a tree, run a local ceval sweep — no server room.
//
// The board + tree + engine + analysis machinery all live in the shared
// review/xiangqi-review.ts (also used by xiangqi-postgame.ts for the /game
// surface). This file only supplies the ingress, the client ceval sweep, and the
// minimal meta card (no players).

import type { XiangqiGameStatus, XiangqiMove } from '@mistboard/game';
import './game-shell.css';
import './live-xiangqi.css';
import './dark-xiangqi-postgame.css';
import './xiangqi-postgame.css';
import { createGameMetaCard } from './review/game-meta-card.js';
import { buildXiangqiClientAnalysisSource } from './review/xiangqi-client-analysis.js';
import { mountXiangqiReview } from './review/xiangqi-review.js';
import {
  buildXiangqiReplayFromMoves,
  xiangqiReplayViewAtPly,
} from './review/xiangqi-review-model.js';
import { buildNav } from './site-shell.js';

function statusSummary(status: XiangqiGameStatus, plyCount: number): string {
  if (plyCount === 0) return 'Play a move';
  const plies = `${plyCount} ${plyCount === 1 ? 'ply' : 'plies'}`;
  if (status.type === 'finished') {
    const outcome =
      status.winner === 'red' ? 'Red wins' : status.winner === 'black' ? 'Black wins' : 'Draw';
    return `${outcome} by ${status.reason} · ${plies}`;
  }
  return `Analysis · ${plies}`;
}

export interface XiangqiAnalysisOptions {
  /** Left-rail title (default "Xiangqi analysis"). */
  title?: string;
}

/** Mount the interactive analysis board for a standard-xiangqi move list. An empty
 *  list opens a fresh board at the start position; illegal moves truncate to the
 *  legal prefix. */
export function mountXiangqiAnalysis(
  root: HTMLElement,
  moves: XiangqiMove[],
  opts: XiangqiAnalysisOptions = {},
): void {
  const replay = buildXiangqiReplayFromMoves(moves);

  const finalStatus = xiangqiReplayViewAtPly(replay, replay.maxPly).status;
  const metaCard = createGameMetaCard({
    markerId: 'xiangqi',
    glyph: '象',
    headline: ['Analysis board'],
    variantName: 'Xiangqi',
    subline: replay.maxPly
      ? `${replay.maxPly} ${replay.maxPly === 1 ? 'ply' : 'plies'}`
      : 'Start position',
    status:
      finalStatus.type === 'finished'
        ? `${finalStatus.winner === 'red' ? 'Red wins' : finalStatus.winner === 'black' ? 'Black wins' : 'Draw'} by ${finalStatus.reason}`
        : null,
  });

  root.replaceChildren(buildNav());
  mountXiangqiReview(root, {
    pageClassName: 'xiangqi-review',
    ariaLabel: 'Xiangqi analysis',
    eyebrow: 'Analysis',
    title: opts.title ?? 'Xiangqi analysis',
    summary: statusSummary(finalStatus, replay.maxPly),
    boardAriaLabel: 'Xiangqi board',
    metaCard: metaCard.el,
    // Pass the raw moves so the review's tree truncates an illegal seed itself and
    // surfaces the notice (the legal prefix drives the client sweep above).
    moves,
    // Roomless import: whole-game analysis is a client ceval sweep (shared with the
    // historical library). Null when there is no game yet to analyse.
    analysis: buildXiangqiClientAnalysisSource(replay),
  });
}
