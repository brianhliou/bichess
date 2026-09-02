// /embed/analysis/xiangqi — the free xiangqi analysis board in someone else's
// page: play moves, branch, read the tree, open from a ?fen= position or a
// ?moves= line. `?color=black` seats Black at the bottom.
//
// What the embed does NOT have is the engine. The site's local evaluation runs
// Fairy-Stockfish on WASM threads, which need cross-origin isolation, and a
// frame is isolated only when the page framing it is too, which a third-party
// page never is. The engine panel therefore reports itself unavailable here
// rather than half-working; /developers says so in as many words.

import '../app-base.css';
import { parseStandardXiangqiFen } from '@mistboard/game';
import { importXiangqiGame } from '../review/xiangqi-import.js';
import { parseXiangqiCoordinateMoves } from '../review/xiangqi-review-model.js';
import { mountXiangqiAnalysis } from '../xiangqi-analysis.js';
import './embed.css';

export type EmbedAnalysisOptions = { color: 'red' | 'black' };

export function mountEmbedAnalysis(root: HTMLElement, options: EmbedAnalysisOptions): void {
  document.body.classList.add('embed-body');
  document.documentElement.dataset.embed = 'analysis';
  root.className = 'embed-root embed-analysis';

  const params = new URLSearchParams(window.location.search);
  // The review reads its orientation from ?flip=1; translate the embed's
  // lichess-shaped ?color= into that before mounting, without a navigation.
  if (options.color === 'black' && params.get('flip') !== '1') {
    const url = new URL(window.location.href);
    url.searchParams.set('flip', '1');
    window.history.replaceState(window.history.state, '', url.toString());
  }

  // Same seeding rules as /analysis/xiangqi: a bad FEN degrades to the start
  // position, moves after a custom position are plain coordinates, and a bad
  // move list truncates to its legal prefix.
  const fenRaw = params.get('fen');
  const fenParsed = fenRaw ? parseStandardXiangqiFen(fenRaw.replace(/_/g, ' ')) : null;
  const startState = fenParsed?.ok ? fenParsed.state : undefined;
  const raw = params.get('moves');
  const moves = raw
    ? startState
      ? parseXiangqiCoordinateMoves(raw).moves
      : importXiangqiGame(raw).moves
    : [];

  mountXiangqiAnalysis(root, moves, { title: 'Analysis board', startState, nav: false });

  const credit = document.createElement('a');
  credit.className = 'embed-credit';
  credit.href = '/analysis/xiangqi';
  credit.target = '_blank';
  credit.rel = 'noopener';
  credit.textContent = 'Analysis board · mistboard.com';
  root.append(credit);
  document.title = 'Xiangqi analysis · Mistboard';
}
