// The standalone /analysis/xiangqi surface (lichess.org/analysis): a fresh
// interactive board at the START POSITION, or seeded from an imported move list.
// Play moves that branch into a tree, run a local ceval sweep — no server room.
//
// The board + tree + engine + analysis machinery all live in the shared
// review/xiangqi-review.ts (also used by xiangqi-postgame.ts for the /game
// surface). This file only supplies the ingress: the client ceval sweep, the
// minimal meta card (no players), and the "Import game" affordance.

import type { XiangqiGameStatus, XiangqiMove } from '@mistboard/game';
import './game-shell.css';
import './live-xiangqi.css';
import './dark-xiangqi-postgame.css';
import './xiangqi-postgame.css';
import './xiangqi-analysis.css';
import { createGameMetaCard } from './review/game-meta-card.js';
import { buildXiangqiClientAnalysisSource } from './review/xiangqi-client-analysis.js';
import { importXiangqiGame } from './review/xiangqi-import.js';
import { mountXiangqiReview, type XiangqiReviewHandle } from './review/xiangqi-review.js';
import {
  buildXiangqiReplayFromMoves,
  xiangqiReplayViewAtPly,
} from './review/xiangqi-review-model.js';
import { buildNav } from './site-shell.js';

function statusSummary(status: XiangqiGameStatus, plyCount: number): string {
  if (plyCount === 0) return 'Play a move, or import a game';
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

  const reMount = (imported: XiangqiMove[]) => {
    const encoded = imported.map((move) => `${move.from}${move.to}`).join(',');
    window.history.pushState({}, '', `${window.location.pathname}?moves=${encoded}`);
    mountXiangqiAnalysis(root, imported, opts);
  };

  let handle: XiangqiReviewHandle | null = null;
  root.replaceChildren(buildNav());
  handle = mountXiangqiReview(root, {
    pageClassName: 'xiangqi-review',
    ariaLabel: 'Xiangqi analysis',
    eyebrow: 'Analysis',
    title: opts.title ?? 'Xiangqi analysis',
    summary: statusSummary(finalStatus, replay.maxPly),
    boardAriaLabel: 'Xiangqi board',
    actions: analysisActions(
      () => openImportDialog(reMount),
      (status) => saveAsStudy(handle, status),
    ),
    metaCard: metaCard.el,
    // Pass the raw moves so the review's tree truncates an illegal seed itself and
    // surfaces the notice (the legal prefix drives the client sweep above).
    moves,
    // Roomless import: whole-game analysis is a client ceval sweep (shared with the
    // historical library). Null when there is no game yet to analyse.
    analysis: buildXiangqiClientAnalysisSource(replay),
  });
}

function analysisActions(onImport: () => void, onSave: (status: HTMLElement) => void): HTMLElement {
  const actions = document.createElement('nav');
  actions.className = 'dxq-postgame__actions';
  actions.setAttribute('aria-label', 'Analysis links');
  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'dxq-postgame__link';
  importBtn.textContent = 'Import game';
  importBtn.addEventListener('click', onImport);
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'dxq-postgame__link';
  saveBtn.textContent = 'Save as study';
  const saveStatus = document.createElement('span');
  saveStatus.className = 'xqa-save-status';
  saveBtn.addEventListener('click', () => onSave(saveStatus));
  const home = document.createElement('a');
  home.className = 'dxq-postgame__link';
  home.href = '/';
  home.textContent = 'Back home';
  actions.append(importBtn, saveBtn, home, saveStatus);
  return actions;
}

// Snapshot the current tree into a new persisted study and open it. Requires the
// user to be signed in (401 → a hint, no redirect so the position is not lost).
async function saveAsStudy(handle: XiangqiReviewHandle | null, status: HTMLElement): Promise<void> {
  if (!handle) return;
  status.textContent = 'Saving…';
  try {
    const response = await fetch('/api/studies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Xiangqi study',
        chapter: { name: 'Chapter 1', variant: 'xiangqi', root: handle.serialize() },
      }),
    });
    if (response.status === 401) {
      status.textContent = 'Sign in to save studies';
      return;
    }
    if (!response.ok) {
      status.textContent = 'Save failed';
      return;
    }
    const body = (await response.json()) as { study: { id: string } };
    window.location.href = `/study/${body.study.id}`;
  } catch {
    status.textContent = 'Save failed';
  }
}

// A modal paste box: Chinese / WXF / coordinate notation → a parsed move list.
function openImportDialog(onMoves: (moves: XiangqiMove[]) => void): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'xqa-import-dialog';
  const heading = document.createElement('h2');
  heading.textContent = 'Import a game';
  const blurb = document.createElement('p');
  blurb.className = 'xqa-import-dialog__blurb';
  blurb.textContent =
    'Paste a game in Chinese (炮二平五), WXF (C2.5 H2+3), or coordinate/UCI (b3e3) notation.';
  const textarea = document.createElement('textarea');
  textarea.className = 'xqa-import-dialog__input';
  textarea.rows = 6;
  textarea.spellcheck = false;
  textarea.placeholder = '炮二平五 炮8平5 马二进三';
  const error = document.createElement('p');
  error.className = 'xqa-import-dialog__error';
  error.setAttribute('role', 'alert');
  const row = document.createElement('div');
  row.className = 'xqa-import-dialog__actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'dxq-postgame__link';
  cancel.textContent = 'Cancel';
  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'dxq-postgame__link dxq-postgame__link--primary';
  submit.textContent = 'Import';

  const doImport = () => {
    const { moves, error: parseError } = importXiangqiGame(textarea.value);
    if (parseError || moves.length === 0) {
      error.textContent = parseError ?? 'Enter at least one move.';
      return;
    }
    dialog.close();
    onMoves(moves);
  };
  submit.addEventListener('click', doImport);
  cancel.addEventListener('click', () => dialog.close());
  textarea.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      doImport();
    }
  });

  row.append(cancel, submit);
  dialog.append(heading, blurb, textarea, error, row);
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  textarea.focus();
}
