// Entry page for the standalone /analysis/xiangqi route. Lichess-shaped: opens the
// interactive board at the START POSITION by default (empty tree — play moves and
// branch straight away). A shareable ?moves= link seeds the board from an imported
// game; the parser auto-detects coordinate, 0-indexed UCI/ICCS/UCCI, WXF, and
// Chinese notation.

import { importXiangqiGame } from './review/xiangqi-import.js';
import { mountXiangqiAnalysis } from './xiangqi-analysis.js';

export function mountXiangqiAnalysisPage(root: HTMLElement): void {
  root.classList.add('landing-page');
  const raw = new URLSearchParams(window.location.search).get('moves');
  // Seed from a shared link if present (a parse error degrades to the legal
  // prefix, or an empty start board); otherwise open the empty board.
  const moves = raw ? importXiangqiGame(raw).moves : [];
  mountXiangqiAnalysis(root, moves, { title: 'Xiangqi analysis' });
}
