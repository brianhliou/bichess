import { renderXiangqiOgBoardSvg, type XiangqiOgPiece } from '@mistboard/board-render';
import type { XiangqiMove, XiangqiPuzzle } from '@mistboard/game';
import type { XiangqiEditorialReviewPacket } from './xiangqi-puzzle-editorial-ranking.js';

type EditorialCandidate = XiangqiEditorialReviewPacket['candidates'][number];

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function puzzleFor(candidate: EditorialCandidate): XiangqiPuzzle | null {
  const value = candidate.candidate.puzzleData;
  if (!isRecord(value) || !isRecord(value.initial) || !isRecord(value.initial.board)) return null;
  if (!Array.isArray(value.solution)) return null;
  return value as XiangqiPuzzle;
}

function squareParts(square: string): { file: number; rank: number } | null {
  const match = /^([a-i])(10|[1-9])$/.exec(square);
  if (!match) return null;
  return { file: match[1].charCodeAt(0) - 97, rank: Number(match[2]) };
}

function boardPieces(puzzle: XiangqiPuzzle): XiangqiOgPiece[] {
  return Object.entries(puzzle.initial.board).flatMap(([square, piece]) => {
    const point = squareParts(square);
    if (!point || !piece) return [];
    return [{ ...point, color: piece.color, role: piece.role }];
  });
}

function boardSvg(puzzle: XiangqiPuzzle): string {
  return renderXiangqiOgBoardSvg({
    files: 9,
    ranks: 10,
    pieces: boardPieces(puzzle),
    riverBetweenRanks: [5, 6],
    palaces: [
      { fileLo: 3, fileHi: 5, rankLo: 1, rankHi: 3 },
      { fileLo: 3, fileHi: 5, rankLo: 8, rankHi: 10 },
    ],
    centerX: 220,
    y: 0,
    height: 480,
  });
}

function moveLabel(move: XiangqiMove): string {
  return `${move.from}-${move.to}`;
}

function numberLabel(value: number | null | undefined, suffix = ''): string {
  return value === null || value === undefined ? 'n/a' : `${value}${suffix}`;
}

export function selectXiangqiEditorialMotifRepresentatives(
  packet: XiangqiEditorialReviewPacket,
): EditorialCandidate[] {
  const byId = new Map(packet.candidates.map((candidate) => [candidate.candidate.id, candidate]));
  const seen = new Set<string>();
  const selected: EditorialCandidate[] = [];
  for (const id of packet.rankings['material-concession']) {
    const candidate = byId.get(id);
    const key = candidate?.signals.materialConcessionMotifKey;
    if (!candidate || !key || seen.has(key)) continue;
    if ((candidate.signals.material?.maxLocalConcessionCp ?? 0) <= 0) continue;
    seen.add(key);
    selected.push(candidate);
  }
  return selected;
}

function candidateCard(candidate: EditorialCandidate, index: number): string {
  const puzzle = puzzleFor(candidate);
  if (!puzzle) return '';
  const { signals } = candidate;
  const material = signals.material;
  const events = material?.concessionEvents.filter((event) => event.localConcessionCp > 0) ?? [];
  const evidence = {
    selectionEvidence: candidate.selectionEvidence,
    scanEvidence: candidate.candidate.scanEvidence,
    verifyJudgment: candidate.verifyJudgment,
    auditJudgment: candidate.auditJudgment,
  };
  return `<article class="candidate" data-candidate-id="${escapeHtml(candidate.candidate.id)}">
    <header>
      <p class="eyebrow">Motif ${index + 1} of the review set · ${escapeHtml(signals.goal ?? 'unknown goal')}</p>
      <h2>${escapeHtml(candidate.candidate.id)}</h2>
      <p class="motif"><strong>Signature:</strong> ${escapeHtml(signals.materialConcessionMotifKey)}</p>
    </header>
    <div class="candidate-grid">
      <figure>
        ${boardSvg(puzzle)}
        <figcaption>Initial position, Red at bottom. Solver: ${escapeHtml(material?.solverColor ?? 'unknown')}.</figcaption>
      </figure>
      <section class="evidence-summary">
        <dl>
          <div><dt>Cohort</dt><dd>${escapeHtml(signals.cohort)}</dd></div>
          <div><dt>Motif occurrences</dt><dd>${signals.materialConcessionMotifCount}</dd></div>
          <div><dt>Solver decisions</dt><dd>${numberLabel(signals.solverPlies)}</dd></div>
          <div><dt>Worst local concession</dt><dd>${numberLabel(material?.maxLocalConcessionCp, ' cp')}</dd></div>
          <div><dt>Stored-line net</dt><dd>${numberLabel(material?.netMaterialCp, ' cp')}</dd></div>
          <div><dt>Source swing</dt><dd>${numberLabel(signals.swingCp, ' cp')}${signals.mateScaleSwing ? ' (mate-scale)' : ''}</dd></div>
          <div><dt>Audit minimum gap</dt><dd>${numberLabel(signals.auditMinGapCp, ' cp')}</dd></div>
          <div><dt>Material rank</dt><dd>${candidate.ranks['material-concession']}</dd></div>
        </dl>
        <h3>Verified line</h3>
        <ol class="line">${puzzle.solution.map((move) => `<li>${escapeHtml(moveLabel(move))}</li>`).join('')}</ol>
        <h3>Local concession events</h3>
        <ul>${events
          .map(
            (event) =>
              `<li>Ply ${event.solutionPly + 1}: ${escapeHtml(event.precedingCapturedRole ?? 'quiet')} → ` +
              `${escapeHtml(event.capturedRole)}, ${event.localConcessionCp} cp; ` +
              `${event.capturedJustMovedPiece ? 'offered piece recaptured' : 'another piece captured'}</li>`,
          )
          .join('')}</ul>
        <p><strong>Audit gates:</strong> ${escapeHtml(signals.auditUniquenessReasons.join(', ') || 'none recorded')}</p>
        <details><summary>Raw selection, scan, verify, and audit evidence</summary><pre>${escapeHtml(
          JSON.stringify(evidence, null, 2),
        )}</pre></details>
      </section>
    </div>
  </article>`;
}

export function renderXiangqiEditorialMotifReviewHtml(
  packet: XiangqiEditorialReviewPacket,
  options: { runId: string; generatedAt?: string },
): string {
  const representatives = selectXiangqiEditorialMotifRepresentatives(packet);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const cards = representatives.map(candidateCard).filter(Boolean).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ElephantChess motif review · ${escapeHtml(options.runId)}</title>
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; background: #f3efe5; color: #241f18; }
    body { max-width: 1120px; margin: 0 auto; padding: 32px 20px 80px; }
    h1, h2, h3, p { margin-top: 0; }
    .intro { max-width: 820px; margin-bottom: 28px; }
    .candidate { background: #fffdf8; border: 1px solid #d7cdbb; border-radius: 14px; padding: 24px; margin: 0 0 28px; break-inside: avoid; }
    .eyebrow { color: #7d271e; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; font-size: .78rem; }
    .motif { overflow-wrap: anywhere; color: #5d5549; }
    .candidate-grid { display: grid; grid-template-columns: minmax(280px, 440px) 1fr; gap: 28px; align-items: start; }
    figure { margin: 0; } figure > svg { display: block; width: 100%; height: auto; } figcaption { color: #6c6254; font-size: .85rem; margin-top: 8px; }
    dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; margin: 0 0 20px; }
    dl div { border-bottom: 1px solid #e8e0d3; padding: 7px 0; } dt { color: #756b5e; font-size: .78rem; } dd { margin: 2px 0 0; font-weight: 650; }
    .line { display: flex; flex-wrap: wrap; gap: 4px 22px; padding-left: 22px; }
    details { margin-top: 18px; } summary { cursor: pointer; font-weight: 650; } pre { overflow: auto; max-height: 420px; padding: 12px; background: #211f1b; color: #f7f1e7; border-radius: 8px; font-size: .75rem; }
    code { overflow-wrap: anywhere; } footer { color: #6c6254; font-size: .85rem; }
    @media (max-width: 760px) { .candidate-grid { grid-template-columns: 1fr; } dl { grid-template-columns: 1fr; } }
    @media print { body { max-width: none; padding: 0; } .candidate { page-break-after: always; border: 0; } details { display: none; } }
  </style>
</head>
<body>
  <main>
    <header class="intro">
      <p class="eyebrow">Read-only editorial packet</p>
      <h1>ElephantChess local-concession motif review</h1>
      <p>One top-ranked representative from each transparent motif signature. These ${representatives.length} positions are mining hypotheses, not approved sacrifices or publishable puzzles.</p>
      <p><strong>Run:</strong> ${escapeHtml(options.runId)} · <strong>Ranking:</strong> ${escapeHtml(packet.rankingVersion)} · <strong>Generated:</strong> ${escapeHtml(generatedAt)}</p>
    </header>
    ${cards}
  </main>
  <footer>Generated from audited production evidence. No editorial verdicts were written.</footer>
</body>
</html>\n`;
}
