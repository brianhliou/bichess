// Per-player accuracy summary for the review board's analysisSummary slot (P3.5),
// matching lichess's analyse ACC block anatomy: a centered player row, then two
// columns — judgment counts + ACPL on the left, Accuracy plus per-phase accuracy
// (Opening / Middlegame / Endgame) on the right, tone-coloured by value. Anonymous
// games have no names, so sides are labelled Red / Black.
import './analysis-summary.css';
import { t } from '../i18n/catalog.js';
import {
  type GameAnalysis,
  type GamePhases,
  type PhaseAccuracies,
  type PlayerAnalysis,
  playerPhaseAccuracies,
} from './game-analysis.js';
import { type ReviewSeatColors, reviewColorForSeat } from './review-seat-colors.js';

/** Optional real player names; fall back to the side colors for anonymous games. */
export type AnalysisSummaryLabels = { red?: string; black?: string };

export type AnalysisSummaryOptions = {
  /** Hide the ACPL row. Chance/hidden-info variants (jieqi) set this: centipawn loss can't be
   *  luck-stripped, so it reads as noise next to the luck-free accuracy + counts. */
  hideAcpl?: boolean;
  /** Visual ink for each analysis seat. Stats and labels remain seat-keyed. */
  seatColors?: ReviewSeatColors;
  /** Phase boundaries → per-phase accuracy rows in the right column (lichess
   *  "96% Opening"). Omitted = the right column shows only the headline accuracy. */
  phases?: GamePhases;
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
  const phasesFor = (mover: 'red' | 'black'): PhaseAccuracies =>
    options?.phases ? playerPhaseAccuracies(analysis, options.phases, mover) : {};
  el.append(
    playerBlock(
      labels?.red || colorLabel(firstColor),
      firstColor,
      analysis.red,
      hideAcpl,
      phasesFor('red'),
    ),
  );
  el.append(
    playerBlock(
      labels?.black || colorLabel(secondColor),
      secondColor,
      analysis.black,
      hideAcpl,
      phasesFor('black'),
    ),
  );
  return el;
}

function colorLabel(color: 'red' | 'black'): string {
  return color === 'red' ? t('summary.red') : t('summary.black');
}

function playerBlock(
  label: string,
  color: 'red' | 'black',
  player: PlayerAnalysis,
  hideAcpl: boolean,
  phases: PhaseAccuracies,
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

  // Left column: judgment counts + ACPL (lichess order).
  const stats = document.createElement('div');
  stats.className = 'analysis-summary__stats';
  stats.append(
    statRow(
      String(player.inaccuracies),
      plural(player.inaccuracies, t('summary.inaccuracyOne'), t('summary.inaccuracyMany')),
      player.inaccuracies > 0 ? 'inaccuracy' : null,
    ),
    statRow(
      String(player.mistakes),
      plural(player.mistakes, t('summary.mistakeOne'), t('summary.mistakeMany')),
      player.mistakes > 0 ? 'mistake' : null,
    ),
    statRow(
      String(player.blunders),
      plural(player.blunders, t('summary.blunderOne'), t('summary.blunderMany')),
      player.blunders > 0 ? 'blunder' : null,
    ),
  );
  if (!hideAcpl) {
    stats.append(statRow(String(player.acpl), t('summary.acpl'), null));
  }

  // Right column: headline accuracy over the per-phase accuracies.
  const acc = document.createElement('div');
  acc.className = 'analysis-summary__phases';
  acc.append(phaseRow(player.accuracy, t('summary.accuracy'), true));
  const phaseEntries: Array<[number | undefined, string]> = [
    [phases.opening, t('summary.opening')],
    [phases.middlegame, t('summary.middlegame')],
    [phases.endgame, t('summary.endgame')],
  ];
  for (const [value, phaseLabel] of phaseEntries) {
    if (value !== undefined) acc.append(phaseRow(value, phaseLabel, false));
  }

  const cols = document.createElement('div');
  cols.className = 'analysis-summary__cols';
  cols.append(stats, acc);
  block.append(head, cols);
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

function phaseRow(value: number, label: string, headline: boolean): HTMLElement {
  const row = document.createElement('div');
  row.className = 'analysis-summary__phase';
  if (headline) row.classList.add('analysis-summary__phase--headline');
  else row.classList.add(`analysis-summary__phase--${accuracyTone(value)}`);
  const num = document.createElement('strong');
  num.className = 'analysis-summary__phase-value';
  num.textContent = `${Math.round(value)}%`;
  const text = document.createElement('span');
  text.className = 'analysis-summary__phase-label';
  text.textContent = label;
  row.append(num, text);
  return row;
}

/** Tone bucket for a phase accuracy (lichess colours its phase rows by value). */
function accuracyTone(value: number): 'high' | 'mid' | 'low' | 'poor' {
  if (value >= 90) return 'high';
  if (value >= 75) return 'mid';
  if (value >= 50) return 'low';
  return 'poor';
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}
