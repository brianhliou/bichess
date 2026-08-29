// Xiangqi coordinate + notation trainer -- the drill core. Pure: no DOM, no
// storage, and no randomness of its own beyond an injected generator, so every
// rule here is directly testable.
//
// TWO TARGETS, because xiangqi has two answers to "where is that":
//
//   'point' -- an absolute square in our coordinate system (a-i x 1-10). This
//     is the lichess coordinate trainer's job: board geography, and the
//     language our own analysis board, URLs, engine lines and board labels
//     speak. 90 answers.
//
//   'file' -- the file NUMBER in WXF / Chinese notation, which runs 1-9 from
//     each player's OWN RIGHT. One physical file therefore carries two
//     numbers, red's and black's, and they always sum to 10. Only 9 answers,
//     but it is the only rung that transfers to reading a real game record,
//     and every English introduction to xiangqi names it as the barrier.
//
// The split is forced by the notation, not a preference. WXF and Chinese never
// address a rank (the reasoning is in xiangqi-coord-labels.ts), so there is no
// such thing as a point name in the notation a learner is here to read, and no
// honest way to fold the two targets into one prompt.

import {
  coordOf,
  squareOf,
  wxfFileNumber,
  type XiangqiColor,
  type XiangqiSquare,
} from '@mistboard/game';
import { xiangqiCoordLabels } from '../xiangqi-coord-labels.js';

/** What the prompt is about. */
export type DrillTarget = 'point' | 'file';
/** 'find' = we name it, you click it. 'name' = we show it, you name it. */
export type DrillDirection = 'find' | 'name';
export type DrillSideSetting = XiangqiColor | 'both';
export type DrillTimeControl = 'thirtySeconds' | 'untimed';

export const DRILL_DURATION_MS = 30_000;
export const FILE_COUNT = 9;
export const RANK_COUNT = 10;

export const DRILL_TARGETS: readonly DrillTarget[] = ['point', 'file'];
export const DRILL_DIRECTIONS: readonly DrillDirection[] = ['find', 'name'];
export const DRILL_SIDE_SETTINGS: readonly DrillSideSetting[] = ['red', 'black', 'both'];

export const SQUARE_FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const;
export const SQUARE_RANKS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;

export type DrillPrompt =
  | { kind: 'point'; square: XiangqiSquare }
  | { kind: 'file'; fileIndex: number; side: XiangqiColor };

export function oppositeSide(side: XiangqiColor): XiangqiColor {
  return side === 'red' ? 'black' : 'red';
}

// ── File numbering ──────────────────────────────────────────────────────────

/** The number `side` writes for this physical file. */
export function fileNumberOf(fileIndex: number, side: XiangqiColor): number {
  return wxfFileNumber(fileIndex, side);
}

/** The physical file carrying `fileNumber` for `side`: the inverse of
 *  wxfFileNumber, which packages/game never needed because its resolver filters
 *  candidate squares forward instead of inverting. Red's mapping is its own
 *  inverse (9 - n both ways); black's is not (n - 1, not n + 1), which is the
 *  easy thing to get wrong. Proven against wxfFileNumber in the tests. */
export function fileIndexOf(fileNumber: number, side: XiangqiColor): number {
  return side === 'red' ? FILE_COUNT - fileNumber : fileNumber - 1;
}

// Red writes its file numbers in Chinese numerals and black in Arabic. That is
// not decoration: it is how a reader tells whose move a token belongs to
// without being told, so the drill uses the real convention rather than
// flattening both sides to digits. Sourced from the board's own label table so
// the prompt and the board edge can never disagree. Simplified vs traditional
// is irrelevant for 一..九, which are the same glyphs in both.
const NUMERALS = xiangqiCoordLabels('chinese-simplified', FILE_COUNT, RANK_COUNT);

/** The glyph `side` writes for `fileNumber`: 一..九 for red, 1..9 for black. */
export function fileNumeral(fileNumber: number, side: XiangqiColor): string {
  return NUMERALS[side][fileIndexOf(fileNumber, side)] ?? String(fileNumber);
}

/** Answer choices for the file-naming drill, in counting order 1..9. */
export function fileNumeralChoices(side: XiangqiColor): { value: number; label: string }[] {
  return Array.from({ length: FILE_COUNT }, (_, i) => ({
    value: i + 1,
    label: fileNumeral(i + 1, side),
  }));
}

/** Every intersection on a file, for highlighting the whole column. */
export function fileSquares(fileIndex: number): XiangqiSquare[] {
  return Array.from({ length: RANK_COUNT }, (_, rank) => squareOf(fileIndex, rank + 1));
}

// ── Prompts ─────────────────────────────────────────────────────────────────

function pick<T>(items: readonly T[], random: () => number): T {
  // random() is specified as [0, 1) but a stubbed one in a test may hand back
  // exactly 1; clamp rather than return undefined.
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;
}

/** The next prompt.
 *
 *  A point never repeats the previous point's file or rank, and which of the
 *  two is forced to change is itself random (lichess does the same): holding
 *  one axis makes the next answer a nudge from the last one rather than a fresh
 *  lookup. A file prompt never repeats the previous file, for the same reason.
 *
 *  On 'both' the side alternates rather than being redrawn at random. That is
 *  what a real game record does, and it guarantees even exposure to both
 *  directions, which a fair coin does not over a 30-second run. Sides do not
 *  apply to points, which are absolute. */
export function nextPrompt(
  previous: DrillPrompt | null,
  target: DrillTarget,
  setting: DrillSideSetting,
  random: () => number = Math.random,
): DrillPrompt {
  if (target === 'point') {
    const last = previous?.kind === 'point' ? coordOf(previous.square) : null;
    const holdRank = random() < 0.5;
    let files = SQUARE_FILES.map((_, i) => i);
    let ranks = SQUARE_RANKS.map((_, i) => i + 1);
    if (last) {
      if (holdRank) files = files.filter((f) => f !== last.file);
      else ranks = ranks.filter((r) => r !== last.rank);
    }
    return { kind: 'point', square: squareOf(pick(files, random), pick(ranks, random)) };
  }

  let side: XiangqiColor;
  if (setting !== 'both') side = setting;
  else if (previous?.kind === 'file') side = oppositeSide(previous.side);
  else side = random() < 0.5 ? 'red' : 'black';

  const previousFile = previous?.kind === 'file' ? previous.fileIndex : null;
  const files = SQUARE_FILES.map((_, i) => i).filter((f) => f !== previousFile);
  return { kind: 'file', fileIndex: pick(files, random), side };
}

/** Squares to highlight when showing the prompt on the board ('name'). */
export function promptSquares(prompt: DrillPrompt): XiangqiSquare[] {
  return prompt.kind === 'point' ? [prompt.square] : fileSquares(prompt.fileIndex);
}

// ── Grading ─────────────────────────────────────────────────────────────────

/** A click on the board. For a file prompt any rank on the column counts: the
 *  drill is the file, so making the reader also pick a rank would grade a skill
 *  it is not teaching. */
export function isCorrectClick(prompt: DrillPrompt, square: XiangqiSquare): boolean {
  return prompt.kind === 'point'
    ? square === prompt.square
    : coordOf(square).file === prompt.fileIndex;
}

/** A typed or tapped square name, for the point-naming drill. */
export function isCorrectSquareName(prompt: DrillPrompt, answer: string): boolean {
  return prompt.kind === 'point' && answer === prompt.square;
}

/** A tapped file number, for the file-naming drill. */
export function isCorrectFileNumber(prompt: DrillPrompt, answer: number): boolean {
  return prompt.kind === 'file' && answer === fileNumberOf(prompt.fileIndex, prompt.side);
}

// ── Typed square input ──────────────────────────────────────────────────────

const COMPLETE_SQUARE = /^[a-i](10|[2-9])$/;
/** A valid square that could still grow: only rank 1, which extends to 10. */
const EXTENDABLE_SQUARE = /^[a-i]1$/;

export function isSquareName(value: string): boolean {
  return COMPLETE_SQUARE.test(value) || EXTENDABLE_SQUARE.test(value);
}

/** Feed one keystroke into the typed-square buffer.
 *
 *  Xiangqi has a rank 10, so unlike chess a square name is not always two
 *  characters and 'e1' cannot be graded on sight: it may be the start of 'e10'.
 *  Rather than make every rank-1 answer cost an extra Enter, a pending 'e1' is
 *  submitted by whatever comes next -- '0' turns it into 'e10', and any other
 *  key submits 'e1' and then starts fresh. In continuous typing that costs
 *  nothing, and Enter still submits explicitly. */
export function consumeSquareInput(
  buffer: string,
  key: string,
): { buffer: string; submit: string | null } {
  if (key === 'Backspace') return { buffer: buffer.slice(0, -1), submit: null };
  if (key === 'Enter') {
    return { buffer: '', submit: isSquareName(buffer) ? buffer : null };
  }

  const char = key.toLowerCase();
  const pending = EXTENDABLE_SQUARE.test(buffer);

  if (/^[a-i]$/.test(char)) {
    // A new file letter always starts a new answer, submitting a pending one.
    return { buffer: char, submit: pending ? buffer : null };
  }

  if (/^[0-9]$/.test(char)) {
    if (pending) {
      return char === '0'
        ? { buffer: '', submit: `${buffer}0` }
        : // A digit cannot start a square, so the stray key is dropped.
          { buffer: '', submit: buffer };
    }
    if (/^[a-i]$/.test(buffer)) {
      // Rank 0 does not exist; ignore it rather than building 'e0'.
      if (char === '0') return { buffer, submit: null };
      const next = `${buffer}${char}`;
      return EXTENDABLE_SQUARE.test(next)
        ? { buffer: next, submit: null }
        : { buffer: '', submit: next };
    }
  }

  return { buffer, submit: null };
}
