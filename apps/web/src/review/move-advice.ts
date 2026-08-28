// Lichess-style "best move" advice line under the move list: when the move that
// led to the current ply was flagged, it reads e.g. "Mistake. h3-e3 was best."
// The best alternative is the engine's top move in the position BEFORE the played
// move (evals[ply-1].best), already in our own square notation from the server.
import './move-advice.css';
import { fsfUciToXiangqiSquares, type MoveJudgment } from '@mistboard/game';
import type { GameAnalysis, MovePraise } from './game-analysis.js';

export const ADVICE_LABEL: Record<Exclude<MoveJudgment, null>, string> = {
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

/** Inline note under a praised move (the positive counterpart of ADVICE_LABEL). */
export const PRAISE_COMMENT: Record<MovePraise, string> = {
  brilliant: 'Brilliant. A piece given up, and the engine agrees it does not come back.',
  great: 'Great move. The only good move in the position.',
};

export interface MoveAdvice {
  el: HTMLElement;
  /** Show the advice for the move at `ply`; hidden when that move wasn't flagged
   *  or analysis hasn't loaded. Call on every ply change. */
  update(ply: number, analysis: GameAnalysis | null): void;
}

// Default best-move formatter: FSF/xiangqi coordinate pair. Correct for xiangqi, fortress,
// and jungle (their board coords match the engine dialect and they have no flips). Variants
// whose engine UCI diverges from the board coords (banqi/jungle-flip) pass their own via the
// presentation's `formatBestMove`.
export function defaultFormatBestMove(uci: string): string {
  const squares = fsfUciToXiangqiSquares(uci);
  return squares ? `${squares.from}-${squares.to}` : uci;
}

// Best-move formatter for the flip variants (banqi, jungle-flip). Their analysis engine emits
// 0-indexed ranks and encodes a flip as from === to, while the board displays 1-indexed ranks
// and labels a flip "<sq> flip" (matching the move list). Convert each square (rank + 1) and
// label flips; e.g. engine "b2b2" -> "b3 flip", "c3e3" -> "c4-e4".
export function formatFlipVariantBestMove(uci: string): string {
  if (uci.length < 4) return uci;
  const toDisplay = (sq: string): string => {
    const rank = Number(sq[1]);
    return Number.isNaN(rank) ? sq : `${sq[0]}${rank + 1}`;
  };
  const from = toDisplay(uci.slice(0, 2));
  const to = toDisplay(uci.slice(2, 4));
  return from === to ? `${from} flip` : `${from}-${to}`;
}

// Best-move formatter for Jieqi. PikaJieQi emits Pikafish UCI with 0-indexed
// ranks (rank 0..9) on the 9×10 xiangqi board, while the board displays 1-indexed ranks (1..10).
// Convert each square (rank + 1); jieqi has NO from===to flip (a reveal rides a normal move), so
// it is always a coordinate pair. e.g. engine "e7a7" -> "e8-a8". Single-digit ranks only here
// (0..9 -> 1..10), so a 4-char UCI is expected.
export function formatJieqiBestMove(uci: string): string {
  if (uci.length < 4) return uci;
  const toDisplay = (sq: string): string => {
    const rank = Number(sq[1]);
    return Number.isNaN(rank) ? sq : `${sq[0]}${rank + 1}`;
  };
  return `${toDisplay(uci.slice(0, 2))}-${toDisplay(uci.slice(2, 4))}`;
}

export function createMoveAdvice(
  formatBest: (uci: string) => string = defaultFormatBestMove,
): MoveAdvice {
  const el = document.createElement('div');
  el.className = 'review-advice';
  el.hidden = true;

  function update(ply: number, analysis: GameAnalysis | null): void {
    const move = analysis?.moves.find((m) => m.ply === ply);
    const judgment = move?.judgment;
    if (!analysis || !move || !judgment) {
      el.hidden = true;
      el.replaceChildren();
      return;
    }
    const best = analysis.evals.find((e) => e.ply === ply - 1)?.best ?? null;
    el.hidden = false;
    el.className = `review-advice review-advice--${judgment}`;
    const label = document.createElement('span');
    label.className = 'review-advice__label';
    label.textContent = `${ADVICE_LABEL[judgment]}.`;
    el.replaceChildren(label);
    if (best) el.append(document.createTextNode(` ${formatBest(best)} was best.`));
  }

  return { el, update };
}
