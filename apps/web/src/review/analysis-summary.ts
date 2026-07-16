// Per-player accuracy summary for the review board's analysisSummary slot (P3.5),
// matching lichess's analyse ACC block: per player, a stacked count · label list
// (inaccuracies / mistakes / blunders / ACPL / accuracy) with the judgment counts
// coloured like the move-list glyphs. Anonymous games have no names, so sides are
// labelled Red / Black.
import './analysis-summary.css';
import type { GameAnalysis, PlayerAnalysis } from './game-analysis.js';
import { type ReviewSeatColors, reviewColorForSeat } from './review-seat-colors.js';

/** Optional real player names; fall back to the side colors for anonymous games. */
export type AnalysisSummaryLabels = { red?: string; black?: string };

export type AnalysisSummaryOptions = {
  /** Hide the ACPL row. Chance/hidden-info variants (jieqi) set this: centipawn loss can't be
   *  luck-stripped, so it reads as noise next to the luck-free accuracy + counts. */
  hideAcpl?: boolean;
  /** Visual ink for each analysis seat. Stats and labels remain seat-keyed. */
  seatColors?: ReviewSeatColors;
};

export function createAnalysisSummary(
  analysis: GameAnalysis,
  labels?: AnalysisSummaryLabels,
  options?: AnalysisSummaryOptions,
): HTMLElement {
  const el = document.createElement('section');
  el.className = 'analysis-summary';
  const hideAcpl = options?.hideAcpl ?? false;
  const firstColor = reviewColorForSeat('red', options?.seatColors);
  const secondColor = reviewColorForSeat('black', options?.seatColors);
  el.append(playerBlock(labels?.red || colorLabel(firstColor), firstColor, analysis.red, hideAcpl));
  el.append(
    playerBlock(labels?.black || colorLabel(secondColor), secondColor, analysis.black, hideAcpl),
  );
  return el;
}

function colorLabel(color: 'red' | 'black'): string {
  return color === 'red' ? 'Red' : 'Black';
}

function playerBlock(
  label: string,
  color: 'red' | 'black',
  player: PlayerAnalysis,
  hideAcpl: boolean,
): HTMLElement {
  const block = document.createElement('div');
  block.className = 'analysis-summary__player';

  const head = document.createElement('div');
  head.className = 'analysis-summary__head';
  const dot = document.createElement('span');
  dot.className = `analysis-summary__dot analysis-summary__dot--${color}`;
  const name = document.createElement('span');
  name.className = 'analysis-summary__name';
  name.textContent = label;
  head.append(dot, name);

  const stats = document.createElement('div');
  stats.className = 'analysis-summary__stats';
  stats.append(
    statRow(
      String(player.inaccuracies),
      plural(player.inaccuracies, 'Inaccuracy', 'Inaccuracies'),
      player.inaccuracies > 0 ? 'inaccuracy' : null,
    ),
    statRow(
      String(player.mistakes),
      plural(player.mistakes, 'Mistake', 'Mistakes'),
      player.mistakes > 0 ? 'mistake' : null,
    ),
    statRow(
      String(player.blunders),
      plural(player.blunders, 'Blunder', 'Blunders'),
      player.blunders > 0 ? 'blunder' : null,
    ),
    statRow(`${Math.round(player.accuracy)}%`, 'Accuracy', null),
  );
  if (!hideAcpl) {
    stats.append(statRow(String(player.acpl), 'Average centipawn loss', null));
  }

  block.append(head, stats);
  return block;
}

function statRow(value: string, label: string, judgment: string | null): HTMLElement {
  const row = document.createElement('div');
  row.className = 'analysis-summary__stat';
  if (judgment) row.classList.add(`analysis-summary__stat--${judgment}`);
  const num = document.createElement('strong');
  num.className = 'analysis-summary__stat-value';
  num.textContent = value;
  const text = document.createElement('span');
  text.className = 'analysis-summary__stat-label';
  text.textContent = label;
  row.append(num, text);
  return row;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}
