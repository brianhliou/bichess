// Lightweight client-side xiangqi game replay. One board, stepped through a
// move list by replaying through the rules kernel — no per-ply SVG is shipped,
// each position is rendered on demand. Reusable game viewer; first used by the
// Xiangqi Rules article to show a full historical game.

import {
  applyMove as applyXiangqiMove,
  createInitialXiangqiState,
  formatXiangqiMoves,
  type XiangqiBoard,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiPiece,
  type XiangqiSquare,
} from '@mistboard/game';
import { track } from './analytics.js';
import type { ArticleLang } from './article-i18n.js';
import { boardLastMoveMarkersSvg } from './board-lastmove.js';
import { tokenPieceSize } from './board-metrics.js';
import { replayStepperCopy } from './replay-stepper-copy.js';
import { readStoredXiangqiPieceSet, xiangqiAppearanceChangedEvent } from './theme.js';
import { currentXiangqiNotationStyle, xiangqiNotationChangedEvent } from './xiangqi-notation.js';
import { renderXiangqiPieceGlyphed } from './xiangqi-piece-sets.js';

// Geometry/colours mirror the static xiangqi diagrams in articles-data.ts so
// the replay board is visually identical to the rules diagrams.
const CELL = 31;
const MARGIN = 18;
const PIECE = tokenPieceSize(CELL);
const PAD = 4;
const BOARD_W = MARGIN * 2 + 8 * CELL;
const BOARD_H = MARGIN * 2 + 9 * CELL;
const RADIUS = 8;

/**
 * Engine annotation for one mainline ply (1-based). Produced by the postgame
 * analysis path and shaped by scripts/annotate-game.mjs, so an article never
 * hand-writes a judgment or a line.
 */
export type XiangqiReplayAnnotation = {
  /**
   * Judgment glyph. The negative classes come from analysis.ts; `!` and `!!`
   * come from the positive classifier (xiangqi-move-classification.ts) and only
   * appear on games run through it.
   */
  glyph?: '??' | '?' | '?!' | '!' | '!!';
  /** Eval AFTER the played move, Red POV, centipawns. */
  cp?: number | null;
  /** Mate distance after the played move, Red POV. */
  mate?: number | null;
  /**
   * What the engine wanted instead, from the position BEFORE this ply, as
   * space-separated ICCS tokens. Steppable: entering it replays the mainline
   * prefix and then this line.
   */
  line?: string;
  /** Optional human note, shown under the line. Prose is ours, never lifted. */
  note?: string;
};

export type XiangqiReplayAnnotations = {
  /** Keyed by 1-based mainline ply. */
  byPly: Record<number, XiangqiReplayAnnotation>;
};

export type XiangqiReplaySpec = {
  // Space-separated ICCS coordinate tokens (e.g. "h2e2 h9g7 ..."). ICCS ranks
  // are 0-9 with 0 = Red's back rank; engine ranks are 1-10, so rank + 1.
  iccs: string;
  red: string;
  black: string;
  event: string;
  // Optional standalone title, used when the record is a named study or manual
  // line rather than a game between two players. When set, the header reads
  // "<title> · <event>" instead of "<red> (Red) vs <black> (Black) · <event>".
  title?: string;
  perspective?: XiangqiColor;
  // Shown on the final ply (the records stop at the mating move, so the rules
  // kernel still reports "playing"; the result is supplied explicitly).
  resultText: string;
  /**
   * Optional engine annotations. Absent means this renders exactly as it always
   * has: a bare mainline stepper. Present adds a clickable move list with
   * judgment glyphs and steppable engine lines.
   */
  annotations?: XiangqiReplayAnnotations;
};

export type XiangqiReplayController = { destroy: () => void };

function pointXY(file: number, rank: number, perspective: XiangqiColor): { x: number; y: number } {
  const row = perspective === 'red' ? 10 - rank : rank - 1;
  return { x: MARGIN + file * CELL, y: MARGIN + row * CELL };
}

function coord(square: XiangqiSquare): { file: number; rank: number } {
  return { file: 'abcdefghi'.indexOf(square[0]!), rank: Number(square.slice(1)) };
}

function gridSvg(perspective: XiangqiColor): string {
  const parts: string[] = [
    `<rect x="0" y="0" width="${BOARD_W}" height="${BOARD_H}" rx="${RADIUS}" class="xq-diagram-bg"/>`,
  ];
  const left = MARGIN;
  const right = left + 8 * CELL;
  const top = MARGIN;
  const bottom = top + 9 * CELL;
  const riverTop = top + 4 * CELL;
  const riverBottom = top + 5 * CELL;
  for (let r = 0; r < 10; r += 1) {
    const y = top + r * CELL;
    parts.push(
      `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="xq-diagram-line" stroke-width="1"/>`,
    );
  }
  for (let f = 0; f < 9; f += 1) {
    const x = left + f * CELL;
    if (f === 0 || f === 8) {
      parts.push(
        `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" class="xq-diagram-line" stroke-width="1"/>`,
      );
    } else {
      parts.push(
        `<line x1="${x}" y1="${top}" x2="${x}" y2="${riverTop}" class="xq-diagram-line" stroke-width="1"/>`,
      );
      parts.push(
        `<line x1="${x}" y1="${riverBottom}" x2="${x}" y2="${bottom}" class="xq-diagram-line" stroke-width="1"/>`,
      );
    }
  }
  for (const palace of [
    { fileMin: 3, fileMax: 5, rankBack: 1 },
    { fileMin: 3, fileMax: 5, rankBack: 8 },
  ]) {
    const topRank = palace.rankBack === 1 ? 3 : 10;
    const bottomRank = palace.rankBack;
    const a = pointXY(palace.fileMin, topRank, perspective);
    const b = pointXY(palace.fileMax, bottomRank, perspective);
    const c = pointXY(palace.fileMax, topRank, perspective);
    const d = pointXY(palace.fileMin, bottomRank, perspective);
    parts.push(
      `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="xq-diagram-line" stroke-width="1"/>`,
    );
    parts.push(
      `<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}" class="xq-diagram-line" stroke-width="1"/>`,
    );
  }
  parts.push(
    `<text x="${left + 4 * CELL}" y="${(riverTop + riverBottom) / 2 + 1}" font-family="serif" font-size="16" class="xq-diagram-ink xq-diagram-river-label" text-anchor="middle" dominant-baseline="central">楚 河   漢 界</text>`,
  );
  return parts.join('');
}

function piecesSvg(board: XiangqiBoard, perspective: XiangqiColor): string {
  return Object.entries(board)
    .map(([sq, piece]) => {
      if (!piece) return '';
      const { file, rank } = coord(sq as XiangqiSquare);
      const { x, y } = pointXY(file, rank, perspective);
      return renderXiangqiPieceGlyphed(piece as XiangqiPiece, readStoredXiangqiPieceSet(), {
        x: x - PIECE / 2,
        y: y - PIECE / 2,
        size: PIECE,
      });
    })
    .join('');
}

function boardSvg(
  board: XiangqiBoard,
  lastMove: XiangqiMove | undefined,
  perspective: XiangqiColor,
  _key: number,
): string {
  const pw = BOARD_W + PAD * 2;
  const ph = BOARD_H + PAD * 2;
  // The site marks a last move with an origin wash and a destination ring
  // (board-lastmove.ts, shared by every live board). This widget used to draw
  // its own green arrow, which made an article embed look like a different
  // product from the game page. The markers sit under the pieces, so only the
  // halo outside the piece radius shows.
  const body = [
    gridSvg(perspective),
    lastMove ? lastMoveSvg(lastMove, perspective) : '',
    piecesSvg(board, perspective),
  ].join('');
  return `<svg class="xq-article-svg" data-xq-layout="single" style="--xq-svg-width: ${pw}px" viewBox="0 0 ${pw} ${ph}" role="img" xmlns="http://www.w3.org/2000/svg"><g transform="translate(${PAD} ${PAD})">${body}</g></svg>`;
}

function lastMoveSvg(move: XiangqiMove, perspective: XiangqiColor): string {
  const from = coord(move.from);
  const to = coord(move.to);
  return boardLastMoveMarkersSvg(
    {
      from: pointXY(from.file, from.rank, perspective),
      to: pointXY(to.file, to.rank, perspective),
    },
    PIECE,
  );
}

function iccsToMove(tok: string): XiangqiMove {
  const conv = (c: string) => `${c[0]}${Number(c[1]) + 1}` as XiangqiSquare;
  return { from: conv(tok.slice(0, 2)), to: conv(tok.slice(2, 4)) };
}

export function mountXiangqiReplay(
  host: HTMLElement,
  spec: XiangqiReplaySpec,
  options: { lang?: ArticleLang } = {},
): XiangqiReplayController {
  const copy = replayStepperCopy(options.lang, 'xiangqi');
  const perspective = spec.perspective ?? 'red';
  const moves = spec.iccs
    .trim()
    .split(/\s+/)
    .filter((t) => /^[a-i]\d[a-i]\d$/.test(t))
    .map(iccsToMove);

  // Replay once; cache every position so stepping is instant.
  const states: XiangqiGameState[] = [createInitialXiangqiState('xq-replay')];
  for (const move of moves) {
    states.push(applyXiangqiMove(states[states.length - 1]!, move));
  }
  const total = moves.length;

  host.classList.add('xq-replay', 'stepper');
  host.tabIndex = 0;

  const header = document.createElement('div');
  header.className = 'xq-replay-header';
  header.textContent = spec.title
    ? `${spec.title} · ${spec.event}`
    : `${spec.red}${copy.firstRole} vs ${spec.black}${copy.secondRole} · ${spec.event}`;

  const frame = document.createElement('div');
  frame.className = 'raw-svg-stepper-frame raw-svg-stepper-frame-xq';

  const controls = document.createElement('div');
  controls.className = 'stepper-controls';
  // Drawn, not typed. The media glyphs (U+23EE/U+23ED) and the arrows
  // (U+2190/U+2192) resolve from different fallback fonts, so as text they
  // never match in weight or optical size, and on some platforms the media
  // pair renders as a colour emoji.
  const ICON: Record<'first' | 'prev' | 'next' | 'last', string> = {
    first: '<rect x="3.4" y="4" width="1.7" height="8" rx="0.7"/><path d="M12.6 4.3v7.4L6.5 8z"/>',
    prev: '<path d="M11 4.3v7.4L4.9 8z"/>',
    next: '<path d="M5 4.3v7.4L11.1 8z"/>',
    last: '<rect x="10.9" y="4" width="1.7" height="8" rx="0.7"/><path d="M3.4 4.3v7.4L9.5 8z"/>',
  };
  const mkButton = (icon: keyof typeof ICON, aria: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'stepper-button';
    b.setAttribute('aria-label', aria);
    b.innerHTML =
      `<svg class="stepper-icon" viewBox="0 0 16 16" width="16" height="16" ` +
      `aria-hidden="true" focusable="false" fill="currentColor">${ICON[icon]}</svg>`;
    return b;
  };
  const first = mkButton('first', copy.firstMove);
  const prev = mkButton('prev', copy.previousMove);
  prev.classList.add('stepper-button-prev');
  const counter = document.createElement('span');
  counter.className = 'stepper-counter';
  const next = mkButton('next', copy.nextMove);
  next.classList.add('stepper-button-next');
  const last = mkButton('last', copy.lastMove);
  controls.append(first, prev, counter, next, last);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'xq-replay-slider';
  slider.min = '0';
  slider.max = String(total);
  slider.step = '1';
  slider.setAttribute('aria-label', copy.sliderLabel);

  const narrative = document.createElement('div');
  narrative.className = 'stepper-narrative';

  // The annotated surface is additive: without annotations this renders exactly
  // as it always has, and none of the following nodes are attached.
  const annotated = spec.annotations;
  const moveList = document.createElement('ol');
  moveList.className = 'xq-replay-moves';
  const lineBox = document.createElement('div');
  lineBox.className = 'xq-replay-line';

  const resultFoot = document.createElement('div');
  resultFoot.className = 'xq-replay-result';

  if (annotated) {
    // Study layout, built as ONE card rather than a board next to a bordered
    // box: seat bars top and bottom of the board the way a game page shows
    // them, the move tree flush against it behind a divider, and a single
    // control bar across the bottom. The plain stepper keeps its untouched
    // single-column stack.
    host.classList.add('xq-replay-annotated');

    // The names live in the seat bars now, so the line above the card carries
    // only the event; repeating the players there read as a caption on a card
    // that already names them.
    header.textContent = spec.title ? `${spec.title} · ${spec.event}` : spec.event;

    const seat = (name: string, side: 'red' | 'black') => {
      const el = document.createElement('div');
      el.className = `xq-replay-seat xq-replay-seat--${side}`;
      const dot = document.createElement('span');
      dot.className = 'xq-replay-seat-dot';
      const label = document.createElement('span');
      label.className = 'xq-replay-seat-name';
      label.textContent = name;
      // No RED/BLACK text: the dot already says it, and so does the board two
      // pixels below. The word was a third statement of the same fact.
      el.append(dot, label);
      return el;
    };
    // Bottom seat is whoever the board is oriented for; the other sits on top.
    const bottomSide = perspective === 'black' ? 'black' : 'red';
    const topSide = bottomSide === 'red' ? 'black' : 'red';
    const nameOf = (side: 'red' | 'black') => (side === 'red' ? spec.red : spec.black);

    const boardCol = document.createElement('div');
    boardCol.className = 'xq-replay-board-col';
    // No scrubber and no ply counter here: the move list is the position
    // indicator and it is clickable, so both were a second, worse copy of it.
    counter.remove();
    boardCol.append(
      seat(nameOf(topSide), topSide),
      frame,
      seat(nameOf(bottomSide), bottomSide),
      controls,
    );
    const moveCol = document.createElement('div');
    moveCol.className = 'xq-replay-move-col';
    // The move panel is taken out of flow (see the CSS) so a 180-ply list
    // cannot set the card's height; the board column does. This wrapper is what
    // gets positioned, so the list, the engine line, and the result still stack
    // normally inside it.
    const moveInner = document.createElement('div');
    moveInner.className = 'xq-replay-move-inner';
    moveInner.append(moveList, lineBox, resultFoot);
    moveCol.append(moveInner);
    const grid = document.createElement('div');
    grid.className = 'xq-replay-grid';
    grid.append(boardCol, moveCol);
    host.append(header, grid);
  } else {
    host.append(header, frame, controls, slider, narrative);
  }

  let index = 0;
  /**
   * When set, the board is showing the engine's line instead of the game: the
   * mainline up to `atPly - 1`, then `moves` up to `cursor`. Mainline `index`
   * is left untouched so leaving a variation lands exactly where it started.
   */
  let variation: { atPly: number; moves: XiangqiMove[]; cursor: number } | null = null;

  function annotationAt(ply: number): XiangqiReplayAnnotation | undefined {
    return annotated?.byPly[ply];
  }

  // WXF is the notation English xiangqi material actually uses, and it is short
  // enough for a move column. formatXiangqiMoves always starts from the initial
  // position, so a variation is formatted as prefix+line with the prefix sliced
  // back off — no mid-game state to thread, and an illegal line cannot be
  // notated into something that looks real.
  // Move labels follow the reader's notation setting, the same preference the
  // review pages use. Recomputed (not cached across changes) because the
  // variation labels are derived from the mainline prefix and would otherwise
  // keep the old style after a switch.
  let mainlineLabels: string[] = [];
  let variationLabels = new Map<number, string[]>();

  function relabel(): void {
    mainlineLabels = annotated ? formatXiangqiMoves(moves, currentXiangqiNotationStyle()) : [];
    variationLabels = new Map<number, string[]>();
  }

  function parseLine(ply: number): XiangqiMove[] {
    const raw = annotationAt(ply)?.line;
    if (!raw) return [];
    const parsed = raw
      .trim()
      .split(/\s+/)
      .filter((t) => /^[a-i]\d[a-i]\d$/.test(t))
      .map(iccsToMove);
    // Truncate at the first move the rules reject rather than carrying it.
    let state = states[ply - 1]!;
    const legal: XiangqiMove[] = [];
    for (const mv of parsed) {
      const next = applyXiangqiMove(state, mv);
      if (next === state) break;
      legal.push(mv);
      state = next;
    }
    return legal;
  }

  function labelsForLine(ply: number, line: XiangqiMove[]): string[] {
    const cached = variationLabels.get(ply);
    if (cached) return cached;
    const prefix = moves.slice(0, ply - 1);
    const all = formatXiangqiMoves([...prefix, ...line], currentXiangqiNotationStyle()).slice(
      prefix.length,
    );
    variationLabels.set(ply, all);
    return all;
  }

  function evalText(a: XiangqiReplayAnnotation | undefined): string {
    if (!a) return '';
    if (a.mate != null) return `#${a.mate}`;
    if (a.cp == null) return '';
    const pawns = a.cp / 100;
    return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
  }

  function leaveVariation(): void {
    if (!variation) return;
    variation = null;
    render();
  }

  // Board state for the current view. A variation replays from the position the
  // judged move was played in, so an illegal token (a stale line against a
  // corrected record) truncates rather than throwing.
  function viewState(): { board: XiangqiBoard; lastMove: XiangqiMove | undefined; key: number } {
    if (!variation) {
      return {
        board: states[index]!.board,
        lastMove: index > 0 ? moves[index - 1] : undefined,
        key: index,
      };
    }
    let state = states[variation.atPly - 1]!;
    let last: XiangqiMove | undefined;
    for (let i = 0; i < variation.cursor; i += 1) {
      const mv = variation.moves[i]!;
      const next = applyXiangqiMove(state, mv);
      if (next === state) break;
      state = next;
      last = mv;
    }
    return { board: state.board, lastMove: last, key: 1000 + variation.cursor };
  }
  function moveButton(
    label: string,
    opts: { current: boolean; glyph?: string; onClick: () => void; title?: string },
  ): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'xq-replay-move-button';
    if (opts.current) b.classList.add('is-current');
    if (opts.title) b.title = opts.title;
    const text = document.createElement('span');
    text.className = 'xq-replay-move-t';
    text.textContent = label;
    b.appendChild(text);
    if (opts.glyph) {
      const g = document.createElement('span');
      const kind = opts.glyph === '??' ? 'blunder' : opts.glyph === '?' ? 'mistake' : 'inaccuracy';
      g.className = `xq-replay-glyph xq-replay-glyph-${kind}`;
      g.textContent = opts.glyph;
      b.appendChild(g);
    }
    b.addEventListener('click', opts.onClick);
    return b;
  }

  // The move tree: mainline in numbered pairs, and a judged move's engine line
  // rendered INLINE directly beneath the row it belongs to, the way a study
  // shows a variation.
  function renderMoveList(): void {
    if (!annotated) return;
    moveList.replaceChildren();
    for (let ply = 1; ply <= total; ply += 1) {
      const isRed = ply % 2 === 1;
      let row: HTMLElement;
      if (isRed) {
        row = document.createElement('div');
        row.className = 'xq-replay-row';
        const n = document.createElement('span');
        n.className = 'xq-replay-move-n';
        n.textContent = `${Math.ceil(ply / 2)}.`;
        row.appendChild(n);
        moveList.appendChild(row);
      } else {
        row = moveList.lastElementChild as HTMLElement;
        // A line inserted after Red's move means Black's move needs a new row.
        if (!row?.classList.contains('xq-replay-row') || row.children.length > 2) {
          row = document.createElement('div');
          row.className = 'xq-replay-row';
          const n = document.createElement('span');
          n.className = 'xq-replay-move-n';
          n.textContent = `${Math.ceil(ply / 2)}\u2026`;
          row.appendChild(n);
          moveList.appendChild(row);
        }
      }
      const a = annotationAt(ply);
      row.appendChild(
        moveButton(mainlineLabels[ply - 1] ?? '', {
          current: !variation && ply === index,
          glyph: a?.glyph,
          onClick: () => {
            variation = null;
            goto(ply);
          },
        }),
      );

      const line = a?.line ? parseLine(ply) : [];
      if (line.length === 0) continue;
      const labels = labelsForLine(ply, line);
      const branch = document.createElement('div');
      branch.className = 'xq-replay-branch';
      const tag = document.createElement('span');
      tag.className = 'xq-replay-branch-tag';
      tag.textContent = 'engine';
      branch.appendChild(tag);
      line.forEach((_mv, i) => {
        // Number the line from the move it replaces so it reads like a score.
        const movesIn = isRed ? i : i + 1;
        if (movesIn % 2 === 0) {
          const n = document.createElement('span');
          n.className = 'xq-replay-move-n';
          const num = Math.ceil(ply / 2) + Math.floor(movesIn / 2);
          n.textContent = `${num}.`;
          branch.appendChild(n);
        }
        branch.appendChild(
          moveButton(labels[i] ?? '', {
            current: variation?.atPly === ply && variation.cursor === i + 1,
            onClick: () => {
              variation = { atPly: ply, moves: line, cursor: i + 1 };
              render();
            },
          }),
        );
      });
      moveList.appendChild(branch);
    }
  }

  /**
   * Our own analysis writes judged-move notes to a fixed template. Rendering it
   * verbatim under a head that already said "Mistake" repeated the word, and
   * the trailing sentence pointed at a line that is now drawn inline three
   * pixels away. Matching the template lets the box say it once; anything that
   * does not match is human prose and is shown as written.
   */
  const MACHINE_NOTE =
    /^(blunder|mistake|inaccuracy):\s*([\d.]+)\s*win% given up, eval\s*(\S+?)\s*after\.\s*The engine wanted the line in the sibling branch\.?$/i;

  function renderLineBox(): void {
    if (!annotated) return;
    lineBox.replaceChildren();
    const a = variation ? annotationAt(variation.atPly) : annotationAt(index);
    if (!a) return;
    const label =
      a.glyph === '??'
        ? 'Blunder'
        : a.glyph === '?'
          ? 'Mistake'
          : a.glyph === '?!'
            ? 'Inaccuracy'
            : a.glyph === '!!'
              ? 'Brilliant'
              : a.glyph === '!'
                ? 'Great'
                : '';

    const machine = a.note?.match(MACHINE_NOTE);
    const head = document.createElement('div');
    head.className = 'xq-replay-line-head';
    // These specs carry no `cp`, so the only eval available is the one inside
    // the generated note; prefer a structured value when a spec does have one.
    const evaluation = evalText(a) || (machine?.[3] ?? '');
    head.textContent = [
      label,
      machine ? `${machine[2]}% win chance given up` : '',
      evaluation ? `eval ${evaluation}` : '',
    ]
      .filter(Boolean)
      .join(' \u00b7 ');
    lineBox.appendChild(head);

    // Only prose we did not generate gets its own paragraph.
    if (a.note && !machine) {
      const note = document.createElement('p');
      note.className = 'xq-replay-line-note';
      note.textContent = a.note.replace(/^(great|brilliant):\s*/i, '');
      lineBox.appendChild(note);
    }

    if (variation) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'xq-replay-line-exit';
      back.textContent = 'Back to the game';
      back.addEventListener('click', leaveVariation);
      lineBox.appendChild(back);
    }
  }

  function render(): void {
    const view = viewState();
    frame.innerHTML = boardSvg(view.board, view.lastMove, perspective, view.key);
    if (counter.isConnected) counter.textContent = index === 0 ? copy.start : `${index} / ${total}`;
    first.disabled = index === 0;
    prev.disabled = index === 0;
    next.disabled = index === total;
    last.disabled = index === total;
    if (slider.isConnected) slider.value = String(index);
    if (variation) {
      narrative.textContent = `Engine line, ${variation.cursor} of ${variation.moves.length}`;
    } else if (index === 0) {
      narrative.textContent = copy.intro;
    } else if (index === total) {
      narrative.textContent = spec.resultText;
    } else {
      const mv = moves[index - 1]!;
      const mover = index % 2 === 1 ? copy.first : copy.second;
      narrative.textContent = `${copy.movePrefix(Math.ceil(index / 2))} · ${mover}: ${mv.from}–${mv.to}`;
    }
    // The card always shows the result, the way a game page does; the running
    // narrative line is the plain stepper's job.
    resultFoot.textContent = spec.resultText;
    renderLineBox();
    renderMoveList();
    scrollCurrentIntoView();
  }

  /**
   * Keep the played move visible in the move column. Long games scroll the list
   * well past the viewport, and a highlight you have to hunt for is the same as
   * no highlight. `block: 'nearest'` so an already-visible move does not jerk
   * the list, and the scroll is confined to the list element rather than the
   * page: scrollIntoView on a nested scroller will happily drag the whole
   * article to it otherwise.
   */
  function scrollCurrentIntoView(): void {
    const current = moveList.querySelector<HTMLElement>('.xq-replay-move-button.is-current');
    if (!current) return;
    const listBox = moveList.getBoundingClientRect();
    const box = current.getBoundingClientRect();
    if (box.top >= listBox.top && box.bottom <= listBox.bottom) return;
    const delta =
      box.top < listBox.top ? box.top - listBox.top - 8 : box.bottom - listBox.bottom + 8;
    moveList.scrollTop += delta;
  }

  // Fires once per mounted board. Stepping a move is the signal that a reader
  // actually engaged with an embed rather than scrolling past it; firing per
  // step would be high volume and answer the same question no better.
  let engagementReported = false;
  function reportEngagement(): void {
    if (engagementReported) return;
    engagementReported = true;
    track('article_replay_engaged', {
      slug: document.querySelector('[data-article-slug]')?.getAttribute('data-article-slug') ?? '',
      event: spec.event,
      annotated: Boolean(annotated),
    });
  }

  function goto(target: number): void {
    reportEngagement();
    // Stepping while a line is open walks the LINE, not the game; the mainline
    // cursor is preserved so leaving the line lands where it was entered.
    if (variation) {
      const step = target > index ? 1 : -1;
      const next = variation.cursor + step;
      if (next < 1) {
        leaveVariation();
        return;
      }
      variation.cursor = Math.min(variation.moves.length, next);
      render();
      return;
    }
    const clamped = Math.max(0, Math.min(total, target));
    if (clamped !== index) {
      index = clamped;
      render();
    }
  }
  const onFirst = () => goto(0);
  const onPrev = () => goto(index - 1);
  const onNext = () => goto(index + 1);
  const onLast = () => goto(total);
  const onSlider = () => goto(Number(slider.value));
  first.addEventListener('click', onFirst);
  prev.addEventListener('click', onPrev);
  next.addEventListener('click', onNext);
  last.addEventListener('click', onLast);
  slider.addEventListener('input', onSlider);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      onPrev();
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      onNext();
      e.preventDefault();
    }
  };
  host.addEventListener('keydown', onKey);
  // Piece set is inline glyphs, so re-render the current ply when the picker
  // changes (board + fog react through CSS, like the static diagrams).
  const onAppearance = () => render();
  window.addEventListener(xiangqiAppearanceChangedEvent, onAppearance);
  // Notation is a display preference like the piece set: relabel and repaint.
  const onNotation = () => {
    relabel();
    render();
  };
  window.addEventListener(xiangqiNotationChangedEvent, onNotation);

  relabel();
  render();

  return {
    destroy(): void {
      first.removeEventListener('click', onFirst);
      prev.removeEventListener('click', onPrev);
      next.removeEventListener('click', onNext);
      last.removeEventListener('click', onLast);
      slider.removeEventListener('input', onSlider);
      host.removeEventListener('keydown', onKey);
      window.removeEventListener(xiangqiAppearanceChangedEvent, onAppearance);
      window.removeEventListener(xiangqiNotationChangedEvent, onNotation);
      host.replaceChildren();
      host.classList.remove('xq-replay', 'stepper');
    },
  };
}
