// Lichess analyse underboard: a tab strip (Computer analysis / Move times /
// Crosstable / Share & export) over a shared body. The "Computer analysis" body is
// supplied by the caller (the live advantage chart / request button); the other
// tab bodies are built here from plain data (per-ply times, player names, a live
// FEN/URL/move export). Tabs with no data are omitted.
//
// This module is variant-neutral: every body is a pure DOM builder over generic
// inputs (number[], { red, black }, input elements, strings), so the standard-
// xiangqi tree surface and the generalized tree controller share it unchanged.

import { type ReviewSeatColors, reviewColorForSeat } from './review-seat-colors.js';

export type UnderboardOptions = {
  /** Include the "Computer analysis" tab. False for surfaces with no whole-game
   *  analysis (e.g. the historical library), so they don't lead with an empty chart. */
  hasAnalysis?: boolean;
  /** Prebuilt provenance panel → a "Game info" tab. */
  provenance?: HTMLElement;
  /** Per-ply elapsed milliseconds (index 0 = ply 1). Present + non-empty → a
   *  "Move times" tab renders a per-move bar chart. */
  moveTimes?: number[];
  /** Visual ink for first/second-seat move bars in flip variants. */
  seatColors?: ReviewSeatColors;
  /** Present = show the Crosstable tab; the names label its stub. */
  players?: { red?: string; black?: string };
  /** Live-FEN share input, refreshed by the caller on every navigation. */
  shareFenInput: HTMLInputElement;
  /** Live move-export textarea, refreshed by the caller on every navigation. */
  shareMovesInput: HTMLTextAreaElement;
  gameUrl: string;
};

type UnderboardTab = { id: string; label: string; body: HTMLElement };

export function underboardPanel(analysisBody: HTMLElement, opts: UnderboardOptions): HTMLElement {
  const tabDefs: UnderboardTab[] = [];
  if (opts.hasAnalysis) {
    tabDefs.push({ id: 'analysis', label: 'Computer analysis', body: analysisBody });
  }
  if (opts.provenance) {
    tabDefs.push({ id: 'info', label: 'Game info', body: opts.provenance });
  }
  if (opts.moveTimes && opts.moveTimes.length > 0) {
    tabDefs.push({
      id: 'times',
      label: 'Move times',
      body: moveTimesBody(opts.moveTimes, opts.seatColors),
    });
  }
  if (opts.players) {
    tabDefs.push({ id: 'crosstable', label: 'Crosstable', body: crosstableBody(opts.players) });
  }
  tabDefs.push({
    id: 'share',
    label: 'Share & export',
    body: shareExportBody(opts.shareFenInput, opts.shareMovesInput, opts.gameUrl),
  });

  const panel = document.createElement('section');
  panel.className = 'review-underboard-panel';
  const tabs = document.createElement('div');
  tabs.className = 'review-underboard-tabs';
  const bodies = document.createElement('div');
  bodies.className = 'review-underboard-bodies';

  const buttons = new Map<string, HTMLButtonElement>();
  const show = (id: string): void => {
    for (const def of tabDefs) {
      const active = def.id === id;
      def.body.hidden = !active;
      buttons.get(def.id)?.classList.toggle('review-underboard-tab--active', active);
    }
  };
  for (const def of tabDefs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'review-underboard-tab';
    button.textContent = def.label;
    button.addEventListener('click', () => show(def.id));
    buttons.set(def.id, button);
    tabs.append(button);
    def.body.classList.add('review-underboard-panel__body');
    bodies.append(def.body);
  }
  panel.append(tabs, bodies);
  show(tabDefs[0]!.id);
  return panel;
}

// Per-move time bars (lichess "Move times"): odd plies belong to the first seat,
// even plies to the second. Heights scale to the slowest move.
function moveTimesBody(times: number[], seatColors?: ReviewSeatColors): HTMLElement {
  const body = document.createElement('div');
  const chart = document.createElement('div');
  chart.className = 'review-move-times';
  const max = Math.max(1, ...times);
  for (let i = 0; i < times.length; i += 1) {
    const seat = i % 2 === 0 ? 'red' : 'black'; // ply 1 belongs to the first-mover seat
    const color = reviewColorForSeat(seat, seatColors);
    const col = document.createElement('div');
    col.className = `review-move-times__bar review-move-times__bar--${color}`;
    col.style.height = `${Math.max(2, Math.round((times[i]! / max) * 100))}%`;
    col.title = `Move ${i + 1}: ${formatDuration(times[i]!)}`;
    chart.append(col);
  }
  const total = times.reduce((sum, t) => sum + t, 0);
  const caption = document.createElement('p');
  caption.className = 'review-move-times__caption';
  caption.textContent = `Total move time ${formatDuration(total)}`;
  body.append(chart, caption);
  return body;
}

function crosstableBody(players: { red?: string; black?: string }): HTMLElement {
  const body = document.createElement('div');
  const note = document.createElement('p');
  note.className = 'review-underboard-empty';
  const names = players.red && players.black ? `${players.red} vs ${players.black}` : '';
  note.textContent = names
    ? `Head-to-head record for ${names} is coming soon.`
    : 'Head-to-head record is coming soon.';
  body.append(note);
  return body;
}

function shareExportBody(
  fenInput: HTMLInputElement,
  movesInput: HTMLTextAreaElement,
  gameUrl: string,
): HTMLElement {
  const body = document.createElement('div');
  const grid = document.createElement('div');
  grid.className = 'review-share';

  fenInput.className = 'review-share__field';
  fenInput.readOnly = true;
  grid.append(shareRow('FEN', fenInput));

  const urlInput = document.createElement('input');
  urlInput.className = 'review-share__field';
  urlInput.readOnly = true;
  urlInput.value = gameUrl;
  grid.append(shareRow('Share', urlInput));

  movesInput.className = 'review-share__field review-share__field--moves';
  movesInput.readOnly = true;
  movesInput.rows = 2;
  grid.append(shareRow('Moves', movesInput));

  body.append(grid);
  return body;
}

function shareRow(label: string, field: HTMLInputElement | HTMLTextAreaElement): HTMLElement {
  const row = document.createElement('div');
  row.className = 'review-share__row';
  const name = document.createElement('span');
  name.className = 'review-share__label';
  name.textContent = label;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'review-share__copy';
  copy.textContent = 'Copy';
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(field.value).then(
      () => {
        copy.textContent = 'Copied';
        setTimeout(() => (copy.textContent = 'Copy'), 1200);
      },
      () => {},
    );
  });
  row.append(name, field, copy);
  return row;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
