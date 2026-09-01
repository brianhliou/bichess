// Diagrams for the puzzle-mining explainer.
//
// The featured position is a REAL published puzzle, copied verbatim from the
// production corpus rather than hand-built: xq-mined-hxq_4128172ffd3416562994b5d0-84,
// ply 84 of an ElephantChess game played 2026-04-22. Its solution is
// b3-h3, a4-c3, h3-h9, and h3 is empty at the start, which is what makes it an
// honest illustration of the article's claim that two thirds of these tactics
// open with a move that captures nothing.
//
// The state is constructed directly instead of replayed from the opening: a
// mined puzzle starts from an arbitrary mid-game position, and the board map is
// the puzzle record's own `initial.board`.
import type { XiangqiGameState, XiangqiSquare } from '@mistboard/game';
import { XQ_BOARD_H, XQ_BOARD_W, xqBoardSvg, xqSvg } from './diagrams.js';

const FEATURED: XiangqiGameState = {
  id: 'pm-featured',
  board: {
    a4: { role: 'horse', color: 'black' },
    b3: { role: 'chariot', color: 'red' },
    c1: { role: 'cannon', color: 'black' },
    d5: { role: 'horse', color: 'black' },
    e1: { role: 'general', color: 'red' },
    e2: { role: 'advisor', color: 'red' },
    e9: { role: 'advisor', color: 'black' },
    f9: { role: 'general', color: 'black' },
    g8: { role: 'horse', color: 'red' },
    i7: { role: 'soldier', color: 'black' },
    c10: { role: 'elephant', color: 'black' },
    d10: { role: 'advisor', color: 'black' },
    g10: { role: 'horse', color: 'red' },
  },
  status: { type: 'playing', turn: 'red' },
  moveNumber: 43,
  progressClock: 0,
  positionCounts: {},
} as XiangqiGameState;

const BOARD_BLOCK_H = XQ_BOARD_H + 52;

// The key move alone. No dots on h3: the point of the diagram is that the
// square the chariot is heading for is empty.
export const PM_QUIET_KEY_MOVE = () =>
  xqSvg(
    XQ_BOARD_W,
    BOARD_BLOCK_H,
    xqBoardSvg({
      state: FEATURED,
      x: 0,
      y: 0,
      label: 'RED TO MOVE',
      perspective: 'red',
      arrows: [{ from: 'b3' as XiangqiSquare, to: 'h3' as XiangqiSquare }],
    }),
  );

// After the chariot has crossed and Black has interposed the horse on c3, the
// mate lands on h9. The dot marks the mating square.
const AFTER: XiangqiGameState = {
  ...FEATURED,
  id: 'pm-featured-mate',
  board: (() => {
    const board = { ...FEATURED.board } as Record<string, unknown>;
    delete board.b3;
    delete board.a4;
    board.h3 = { role: 'chariot', color: 'red' };
    board.c3 = { role: 'horse', color: 'black' };
    return board;
  })() as XiangqiGameState['board'],
} as XiangqiGameState;

export const PM_MATE_LANDS = () =>
  xqSvg(
    XQ_BOARD_W,
    BOARD_BLOCK_H,
    xqBoardSvg({
      state: AFTER,
      x: 0,
      y: 0,
      label: 'AND MATE ON h9',
      perspective: 'red',
      arrows: [{ from: 'h3' as XiangqiSquare, to: 'h9' as XiangqiSquare }],
      dots: [{ square: 'h9' as XiangqiSquare, capture: false }],
    }),
  );

// ── Code excerpts for the article ────────────────────────────────────────────
//
// Condensed from the real source: types dropped, option names inlined, comments
// rewritten for a reader who has not seen the file. The control flow and every
// threshold are as they run. Same treatment as the fog article's kernel excerpt.

export const PM_SCAN_LOOP = `// packages/game/src/puzzles-xiangqi-mining.ts (condensed)

// scans[i] is the engine's best score at the position BEFORE move i, from the
// point of view of whoever is to move there. That one array is enough to
// judge every move in the game: the value of the move played from
// position i is -scans[i + 1], because position i + 1 is the same position
// scored by the opponent. One search per position, not two.

for (let ply = minPly; ply < moveCount; ply += 1) {
  const pre = scans[ply];       // the best that was available
  const post = scans[ply + 1];  // what they left behind, opponent's view
  if (pre === null || post === null) continue;

  if (Math.abs(pre) >= decidedCp) continue;  // already decided: no tactic
  if (post < winCp) continue;                // solver must end up winning

  const playedCp = -post;                    // the move, in their own terms
  const swing = pre - playedCp;
  if (swing < swingCp) continue;             // a mistake, but a small one

  candidates.push({ ply, swingCp: swing, preBestCp: pre, postBestCp: post });
}`;

export const PM_UNIQUENESS_GATE = `// packages/game/src/puzzles-xiangqi-mining.ts (condensed)

const winRate = (cp) => 1 / (1 + 10 ** (-cp / 400));

// Is this solver move THE answer, or merely a good one? Every branch that
// returns unique:false is a reason a real blunder failed to become a puzzle.

function classifySolverMove(best, second) {
  if (!best) return { unique: false, reason: 'missing-best' };

  // Mate saturates both centipawns and win%, so mates get their own rule:
  // unique only when this is the strictly fastest forced mate.
  if (mates(best)) {
    if (!second || !mates(second))
      return { unique: true, reason: 'fastest-mate' };
    return best.mate < second.mate
      ? { unique: true, reason: 'fastest-mate' }
      : { unique: false, reason: 'mate-not-unique' };
  }

  if (winRate(best.scoreCp) < 0.8)
    return { unique: false, reason: 'best-not-winning' };
  if (!second) return { unique: true, reason: 'only-move' };
  if (mates(second)) return { unique: false, reason: 'runner-up-mates' };

  const gapCp = best.scoreCp - second.scoreCp;
  if (gapCp < 200) return { unique: false, reason: 'near-tie' };

  // The runner-up is wrong if it gives the win away outright...
  if (winRate(second.scoreCp) <= 0.6)
    return { unique: true, reason: 'runner-up-loses-win' };
  // ...or if it still wins, but wins a whole piece less.
  if (gapCp >= 250) return { unique: true, reason: 'material-gap' };

  return { unique: false, reason: 'alternative-still-good' };
}`;

export const PM_SELECTION = `// apps/web/src/puzzles/storage.ts (condensed)

const EXPLORE_WINDOWS = [300, 600, 1200];

while (remaining.length > 0) {
  // Every fifth pick ignores the ranking and draws at random from a band
  // around the viewer's rating, widening it rather than giving up.
  if (ordered.length % 5 === 4) {
    ordered.push(drawFromBand(remaining, target, EXPLORE_WINDOWS));
    continue;
  }

  // Otherwise: closest to the viewer's rating, penalised for repeating a
  // theme they just saw, plus noise so two visits differ.
  const recent = new Set(ordered.slice(-2).map((p) => p.themes[0]));
  let best = null;
  for (const candidate of remaining) {
    const penalty = recent.has(candidate.puzzle.themes[0]) ? 75 : 0;
    const score =
      Math.abs(candidate.puzzle.rating - target) + penalty + candidate.jitter;
    if (!best || score < best.score) best = { candidate, score };
  }
  ordered.push(best.candidate.puzzle);
}`;

// Pipeline overview. Stage boxes are uniform because this is a flow diagram,
// not a bar chart: the counts are the data, and scaling boxes to them would
// make the last four stages indistinguishable.
export const PM_PIPELINE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 656 526" width="656" height="526" role="img" aria-label="The puzzle pipeline: import, scan, verify, audit, publish, serve, with the rate carried forward and what each stage discards"><rect x="0" y="8" width="292" height="50" rx="9" fill="var(--site-panel-soft, #f4f2ee)" stroke="var(--site-border, #d8d5cf)"/><text x="16" y="29" font-family="Roboto, system-ui, sans-serif" font-size="14" font-weight="700" fill="var(--site-text, #4d4a47)">Import</text><text x="16" y="46" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">legality replay, content hash on the moves</text><path d="M146.0 58 L146.0 100" stroke="var(--site-border, #d8d5cf)" stroke-width="2" fill="none"/><text x="156" y="83" font-family="Roboto, system-ui, sans-serif" font-size="11.5" font-weight="700" fill="var(--site-accent, #2f7d62)">10,469 cleared games</text><path d="M294 79.0 L318 79.0" stroke="var(--site-border, #d8d5cf)" stroke-width="1.5" fill="none" stroke-dasharray="3 3"/><text x="326" y="75" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">discarded</text><text x="326" y="89" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">re-anonymised repeats and illegal games</text><rect x="0" y="100" width="292" height="50" rx="9" fill="var(--site-panel-soft, #f4f2ee)" stroke="var(--site-border, #d8d5cf)"/><text x="16" y="121" font-family="Roboto, system-ui, sans-serif" font-size="14" font-weight="700" fill="var(--site-text, #4d4a47)">Scan</text><text x="16" y="138" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">60,000 nodes, every position after ply 8</text><path d="M146.0 150 L146.0 192" stroke="var(--site-border, #d8d5cf)" stroke-width="2" fill="none"/><text x="156" y="175" font-family="Roboto, system-ui, sans-serif" font-size="11.5" font-weight="700" fill="var(--site-accent, #2f7d62)">3 candidates per game<tspan font-weight="400" fill="var(--site-muted, #79766f)">  10,503</tspan></text><path d="M345 171.0 L318 171.0" stroke="var(--site-border, #d8d5cf)" stroke-width="1.5" fill="none" stroke-dasharray="3 3"/><text x="326" y="167" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">discarded</text><text x="326" y="181" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">already-decided positions, over 3 per game</text><rect x="0" y="192" width="292" height="50" rx="9" fill="var(--site-panel-soft, #f4f2ee)" stroke="var(--site-border, #d8d5cf)"/><text x="16" y="213" font-family="Roboto, system-ui, sans-serif" font-size="14" font-weight="700" fill="var(--site-text, #4d4a47)">Verify</text><text x="16" y="230" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">depth 20, 600k nodes, per solver ply</text><path d="M146.0 242 L146.0 284" stroke="var(--site-border, #d8d5cf)" stroke-width="2" fill="none"/><text x="156" y="267" font-family="Roboto, system-ui, sans-serif" font-size="11.5" font-weight="700" fill="var(--site-accent, #2f7d62)">12% survive<tspan font-weight="400" fill="var(--site-muted, #79766f)">  1,294</tspan></text><path d="M276 263.0 L318 263.0" stroke="var(--site-border, #d8d5cf)" stroke-width="1.5" fill="none" stroke-dasharray="3 3"/><text x="326" y="259" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">discarded</text><text x="326" y="273" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">near-tie 35%, too short 32%, no mate 12%, not unique 9%</text><rect x="0" y="284" width="292" height="50" rx="9" fill="var(--site-panel-soft, #f4f2ee)" stroke="var(--site-border, #d8d5cf)"/><text x="16" y="305" font-family="Roboto, system-ui, sans-serif" font-size="14" font-weight="700" fill="var(--site-text, #4d4a47)">Audit</text><text x="16" y="322" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">depth 22, uncapped, separate process</text><path d="M146.0 334 L146.0 376" stroke="var(--site-border, #d8d5cf)" stroke-width="2" fill="none"/><text x="156" y="359" font-family="Roboto, system-ui, sans-serif" font-size="11.5" font-weight="700" fill="var(--site-accent, #2f7d62)">94% hold<tspan font-weight="400" fill="var(--site-muted, #79766f)">  1,214</tspan></text><path d="M258 355.0 L318 355.0" stroke="var(--site-border, #d8d5cf)" stroke-width="1.5" fill="none" stroke-dasharray="3 3"/><text x="326" y="351" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">discarded</text><text x="326" y="365" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">6% disagreement at greater depth</text><rect x="0" y="376" width="292" height="50" rx="9" fill="var(--site-panel-soft, #f4f2ee)" stroke="var(--site-border, #d8d5cf)"/><text x="16" y="397" font-family="Roboto, system-ui, sans-serif" font-size="14" font-weight="700" fill="var(--site-text, #4d4a47)">Publish</text><text x="16" y="414" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">cross-run dedup, hash-pinned write</text><path d="M146.0 426 L146.0 468" stroke="var(--site-border, #d8d5cf)" stroke-width="2" fill="none"/><text x="156" y="451" font-family="Roboto, system-ui, sans-serif" font-size="11.5" font-weight="700" fill="var(--site-accent, #2f7d62)">1,211 live</text><path d="M231 447.0 L318 447.0" stroke="var(--site-border, #d8d5cf)" stroke-width="1.5" fill="none" stroke-dasharray="3 3"/><text x="326" y="443" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">discarded</text><text x="326" y="457" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">positions already published</text><rect x="0" y="468" width="292" height="50" rx="9" fill="var(--site-panel-soft, #f4f2ee)" stroke="var(--site-border, #d8d5cf)"/><text x="16" y="489" font-family="Roboto, system-ui, sans-serif" font-size="14" font-weight="700" fill="var(--site-text, #4d4a47)">Serve</text><text x="16" y="506" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">rating-matched, Glicko-2, daily by hash</text></svg>`;

// The gate, drawn as the ordered list of tests it is. Green dots pass a move,
// grey ones reject it, and the label on the right is the reason string stored
// on the candidate, so this figure and the funnel table use one vocabulary.
export const PM_GATE_LADDER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 656 354" width="656" height="354" role="img" aria-label="The uniqueness gate as an ordered list of tests, each with the verdict it produces"><text x="0" y="16" font-family="Roboto, system-ui, sans-serif" font-size="11.5" font-weight="700" fill="var(--site-muted, #79766f)" letter-spacing="1.2">THE GATE, IN EVALUATION ORDER</text><circle cx="26" cy="48" r="6" fill="var(--site-accent, #2f7d62)"/><path d="M26 54 L26 82" stroke="var(--site-border, #d8d5cf)" stroke-width="2" fill="none"/><text x="44" y="52" font-family="Roboto, system-ui, sans-serif" font-size="12.5" fill="var(--site-text, #4d4a47)">best mates, second does not or is slower</text><text x="656" y="52" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="12" font-weight="700" fill="var(--site-accent, #2f7d62)">fastest-mate</text><text x="506" y="52" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">unique</text><circle cx="26" cy="88" r="6" fill="var(--site-muted, #79766f)"/><path d="M26 94 L26 122" stroke="var(--site-border, #d8d5cf)" stroke-width="2" fill="none"/><text x="44" y="92" font-family="Roboto, system-ui, sans-serif" font-size="12.5" fill="var(--site-text, #4d4a47)">win%(best) below 0.8</text><text x="656" y="92" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="12" font-weight="700" fill="var(--site-muted, #79766f)">best-not-winning</text><text x="506" y="92" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">rejected</text><circle cx="26" cy="128" r="6" fill="var(--site-accent, #2f7d62)"/><path d="M26 134 L26 162" stroke="var(--site-border, #d8d5cf)" stroke-width="2" fill="none"/><text x="44" y="132" font-family="Roboto, system-ui, sans-serif" font-size="12.5" fill="var(--site-text, #4d4a47)">no second move exists</text><text x="656" y="132" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="12" font-weight="700" fill="var(--site-accent, #2f7d62)">only-move</text><text x="506" y="132" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">unique</text><circle cx="26" cy="168" r="6" fill="var(--site-muted, #79766f)"/><path d="M26 174 L26 202" stroke="var(--site-border, #d8d5cf)" stroke-width="2" fill="none"/><text x="44" y="172" font-family="Roboto, system-ui, sans-serif" font-size="12.5" fill="var(--site-text, #4d4a47)">second move mates</text><text x="656" y="172" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="12" font-weight="700" fill="var(--site-muted, #79766f)">runner-up-mates</text><text x="506" y="172" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">rejected</text><circle cx="26" cy="208" r="6" fill="var(--site-muted, #79766f)"/><path d="M26 214 L26 242" stroke="var(--site-border, #d8d5cf)" stroke-width="2" fill="none"/><text x="44" y="212" font-family="Roboto, system-ui, sans-serif" font-size="12.5" fill="var(--site-text, #4d4a47)">gap below 200cp</text><text x="656" y="212" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="12" font-weight="700" fill="var(--site-muted, #79766f)">near-tie</text><text x="506" y="212" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">rejected</text><circle cx="26" cy="248" r="6" fill="var(--site-accent, #2f7d62)"/><path d="M26 254 L26 282" stroke="var(--site-border, #d8d5cf)" stroke-width="2" fill="none"/><text x="44" y="252" font-family="Roboto, system-ui, sans-serif" font-size="12.5" fill="var(--site-text, #4d4a47)">win%(second) at or below 0.6</text><text x="656" y="252" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="12" font-weight="700" fill="var(--site-accent, #2f7d62)">runner-up-loses-win</text><text x="506" y="252" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">unique</text><circle cx="26" cy="288" r="6" fill="var(--site-accent, #2f7d62)"/><path d="M26 294 L26 322" stroke="var(--site-border, #d8d5cf)" stroke-width="2" fill="none"/><text x="44" y="292" font-family="Roboto, system-ui, sans-serif" font-size="12.5" fill="var(--site-text, #4d4a47)">gap of 250cp or more</text><text x="656" y="292" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="12" font-weight="700" fill="var(--site-accent, #2f7d62)">material-gap</text><text x="506" y="292" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">unique</text><circle cx="26" cy="328" r="6" fill="var(--site-muted, #79766f)"/><text x="44" y="332" font-family="Roboto, system-ui, sans-serif" font-size="12.5" fill="var(--site-text, #4d4a47)">anything left over</text><text x="656" y="332" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="12" font-weight="700" fill="var(--site-muted, #79766f)">alternative-still-good</text><text x="506" y="332" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">rejected</text></svg>`;

// Why the explore draw is banded. Bands are to scale against the real corpus
// range; an unbanded draw is the whole axis.
export const PM_EXPLORE_BANDS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 656 172" width="656" height="172" role="img" aria-label="Nested rating bands of 300, 600 and 1200 points around the viewer rating, against the corpus range of 1255 to 2600"><text x="10" y="14" font-family="Roboto, system-ui, sans-serif" font-size="11.5" font-weight="700" fill="var(--site-muted, #79766f)" letter-spacing="1.1">EVERY FIFTH PICK, DRAWN FROM THE FIRST BAND THAT IS NOT EMPTY</text><rect x="10.0" y="32" width="634.0" height="18" rx="4" fill="var(--site-accent, #2f7d62)" opacity="0.10"/><text x="634.0" y="45" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="10.5" font-weight="700" fill="var(--site-text, #4d4a47)">±1200</text><rect x="10.0" y="58" width="393.5" height="18" rx="4" fill="var(--site-accent, #2f7d62)" opacity="0.19"/><text x="393.5" y="71" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="10.5" font-weight="700" fill="var(--site-text, #4d4a47)">±600</text><rect x="10.0" y="84" width="262.3" height="18" rx="4" fill="var(--site-accent, #2f7d62)" opacity="0.28"/><text x="262.3" y="97" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="10.5" font-weight="700" fill="var(--site-text, #4d4a47)">±300</text><path d="M10 126 L644 126" stroke="var(--site-border, #d8d5cf)" stroke-width="2"/><path d="M34.0 121 L34.0 131" stroke="var(--site-border, #d8d5cf)" stroke-width="2"/><text x="34.0" y="146" text-anchor="middle" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">1,255</text><path d="M141.2 121 L141.2 131" stroke="var(--site-border, #d8d5cf)" stroke-width="2"/><text x="141.2" y="146" text-anchor="middle" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">1,500</text><path d="M359.8 121 L359.8 131" stroke="var(--site-border, #d8d5cf)" stroke-width="2"/><text x="359.8" y="146" text-anchor="middle" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">2,000</text><path d="M622.1 121 L622.1 131" stroke="var(--site-border, #d8d5cf)" stroke-width="2"/><text x="622.1" y="146" text-anchor="middle" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">2,600</text><path d="M141.2 28 L141.2 126" stroke="var(--site-accent, #2f7d62)" stroke-width="2" stroke-dasharray="4 3"/><text x="141.2" y="164" text-anchor="middle" font-family="Roboto, system-ui, sans-serif" font-size="11" font-weight="700" fill="var(--site-accent, #2f7d62)">your rating</text><text x="34.0" y="164" text-anchor="start" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">corpus floor</text><text x="622.1" y="164" text-anchor="end" font-family="Roboto, system-ui, sans-serif" font-size="10.5" fill="var(--site-muted, #79766f)">ceiling</text></svg>`;
