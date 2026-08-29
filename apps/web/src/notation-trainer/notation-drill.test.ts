import { coordOf, wxfFileNumber } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  consumeSquareInput,
  type DrillPrompt,
  FILE_COUNT,
  fileIndexOf,
  fileNumberOf,
  fileNumeral,
  fileNumeralChoices,
  fileSquares,
  isCorrectClick,
  isCorrectFileNumber,
  isCorrectSquareName,
  isSquareName,
  nextPrompt,
  promptSquares,
  RANK_COUNT,
} from './notation-drill.js';

const SIDES = ['red', 'black'] as const;
const FILES = [0, 1, 2, 3, 4, 5, 6, 7, 8];

describe('file numbering', () => {
  // The load-bearing test. fileIndexOf is a hand-written inverse of a function
  // that lives in packages/game and has no inverse of its own, so the only
  // thing keeping the two from drifting is this round trip.
  it('fileIndexOf inverts wxfFileNumber for every file and side', () => {
    for (const side of SIDES) {
      for (const fileIndex of FILES) {
        const number = wxfFileNumber(fileIndex, side);
        expect(number).toBeGreaterThanOrEqual(1);
        expect(number).toBeLessThanOrEqual(9);
        expect(fileIndexOf(number, side)).toBe(fileIndex);
        expect(fileNumberOf(fileIndex, side)).toBe(number);
      }
    }
  });

  it('gives one file two numbers that sum to 10', () => {
    for (const fileIndex of FILES) {
      expect(wxfFileNumber(fileIndex, 'red') + wxfFileNumber(fileIndex, 'black')).toBe(10);
    }
  });

  // Anchored to the worked example in the packages/game header comment
  // (h3e3 = C2.5), so a silent flip of the convention fails here too.
  it('puts red file 2 on h and black file 2 on b', () => {
    expect(fileIndexOf(2, 'red')).toBe(7);
    expect(fileIndexOf(2, 'black')).toBe(1);
  });

  it('writes red in Chinese and black in Arabic', () => {
    expect(fileNumeral(1, 'red')).toBe('一');
    expect(fileNumeral(5, 'red')).toBe('五');
    expect(fileNumeral(9, 'red')).toBe('九');
    expect(fileNumeral(1, 'black')).toBe('1');
    expect(fileNumeral(9, 'black')).toBe('9');
  });

  it('offers nine answer choices in counting order', () => {
    expect(fileNumeralChoices('red').map((c) => c.label)).toEqual([
      '一',
      '二',
      '三',
      '四',
      '五',
      '六',
      '七',
      '八',
      '九',
    ]);
    expect(fileNumeralChoices('black').map((c) => c.label)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ]);
  });
});

describe('grading', () => {
  const point: DrillPrompt = { kind: 'point', square: 'h3' };
  const file: DrillPrompt = { kind: 'file', fileIndex: 7, side: 'red' };

  it('wants the exact point, not just its file', () => {
    expect(isCorrectClick(point, 'h3')).toBe(true);
    expect(isCorrectClick(point, 'h4')).toBe(false);
    expect(isCorrectClick(point, 'g3')).toBe(false);
  });

  it('accepts any rank on the named file', () => {
    expect(isCorrectClick(file, 'h1')).toBe(true);
    expect(isCorrectClick(file, 'h10')).toBe(true);
    expect(isCorrectClick(file, 'g5')).toBe(false);
  });

  it('grades a file against the asked side, not the other one', () => {
    expect(isCorrectFileNumber(file, 2)).toBe(true);
    // 8 is what BLACK calls this file: the whole point of the drill.
    expect(isCorrectFileNumber(file, 8)).toBe(false);
    expect(isCorrectFileNumber({ kind: 'file', fileIndex: 7, side: 'black' }, 8)).toBe(true);
  });

  // The two answer channels must never grade the other target's prompt.
  it('refuses an answer aimed at the wrong target', () => {
    expect(isCorrectSquareName(file, 'h3')).toBe(false);
    expect(isCorrectFileNumber(point, 2)).toBe(false);
    expect(isCorrectSquareName(point, 'h3')).toBe(true);
  });

  it('highlights one point but a whole file', () => {
    expect(promptSquares(point)).toEqual(['h3']);
    const squares = fileSquares(7);
    expect(promptSquares(file)).toEqual(squares);
    expect(squares).toHaveLength(RANK_COUNT);
    expect(squares[0]).toBe('h1');
    expect(squares[9]).toBe('h10');
  });
});

describe('nextPrompt', () => {
  it('produces points across the whole 9x10 board', () => {
    const seen = new Set<string>();
    let prompt: DrillPrompt | null = null;
    for (let i = 0; i < 4000; i += 1) {
      prompt = nextPrompt(prompt, 'point', 'both');
      if (prompt.kind === 'point') seen.add(prompt.square);
    }
    expect(seen.size).toBe(FILE_COUNT * RANK_COUNT);
  });

  it('never repeats a point on both axes at once', () => {
    let prompt = nextPrompt(null, 'point', 'both');
    for (let i = 0; i < 500; i += 1) {
      const next = nextPrompt(prompt, 'point', 'both');
      if (prompt.kind === 'point' && next.kind === 'point') {
        const a = coordOf(prompt.square);
        const b = coordOf(next.square);
        expect(a.file === b.file && a.rank === b.rank).toBe(false);
      }
      prompt = next;
    }
  });

  it('never repeats the previous file', () => {
    const previous: DrillPrompt = { kind: 'file', fileIndex: 4, side: 'red' };
    for (let i = 0; i < 200; i += 1) {
      const next = nextPrompt(previous, 'file', 'red');
      expect(next.kind === 'file' && next.fileIndex).not.toBe(4);
    }
  });

  it('holds the side when one is fixed and alternates on both', () => {
    let prompt = nextPrompt(null, 'file', 'black');
    for (let i = 0; i < 20; i += 1) {
      expect(prompt.kind === 'file' && prompt.side).toBe('black');
      prompt = nextPrompt(prompt, 'file', 'black');
    }
    prompt = nextPrompt(null, 'file', 'both');
    for (let i = 0; i < 6; i += 1) {
      const next = nextPrompt(prompt, 'file', 'both');
      if (prompt.kind === 'file' && next.kind === 'file') {
        expect(next.side).not.toBe(prompt.side);
      }
      prompt = next;
    }
  });

  it('stays in range for a generator that returns the endpoints', () => {
    for (const value of [0, 0.999999, 1]) {
      const point = nextPrompt(null, 'point', 'both', () => value);
      expect(point.kind).toBe('point');
      if (point.kind === 'point') expect(isSquareName(point.square)).toBe(true);
      const file = nextPrompt(null, 'file', 'red', () => value);
      expect(file.kind === 'file' && file.fileIndex).toBeLessThan(FILE_COUNT);
    }
  });
});

// Xiangqi has a rank 10, so a square name is not always two characters and the
// chess trick of grading on the second keystroke does not work.
describe('typed square input', () => {
  function type(keys: string[]): { buffer: string; submitted: string[] } {
    let buffer = '';
    const submitted: string[] = [];
    for (const key of keys) {
      const next = consumeSquareInput(buffer, key);
      buffer = next.buffer;
      if (next.submit !== null) submitted.push(next.submit);
    }
    return { buffer, submitted };
  }

  it('submits an unambiguous square on its last keystroke', () => {
    expect(type(['e', '4']).submitted).toEqual(['e4']);
    expect(type(['a', '9']).submitted).toEqual(['a9']);
  });

  it('waits at rank 1, because it may still become rank 10', () => {
    const pending = type(['e', '1']);
    expect(pending.submitted).toEqual([]);
    expect(pending.buffer).toBe('e1');
    expect(type(['e', '1', '0']).submitted).toEqual(['e10']);
  });

  it('submits a pending rank 1 when the next answer starts', () => {
    // The cost of the ambiguity lands on nobody: typing straight through, 'e1'
    // is submitted by the first keystroke of the next square.
    const run = type(['e', '1', 'h', '3']);
    expect(run.submitted).toEqual(['e1', 'h3']);
  });

  it('submits a pending rank 1 on Enter', () => {
    expect(type(['e', '1', 'Enter']).submitted).toEqual(['e1']);
  });

  it('ignores keys that cannot build a square', () => {
    expect(type(['4']).submitted).toEqual([]);
    expect(type(['z', '4']).submitted).toEqual([]);
    // There is no rank 0.
    const zero = type(['e', '0']);
    expect(zero.submitted).toEqual([]);
    expect(zero.buffer).toBe('e');
  });

  it('backspaces and restarts on a new letter', () => {
    expect(consumeSquareInput('e1', 'Backspace')).toEqual({ buffer: 'e', submit: null });
    expect(consumeSquareInput('e', 'h')).toEqual({ buffer: 'h', submit: null });
  });

  it('accepts an uppercase letter', () => {
    expect(type(['E', '4']).submitted).toEqual(['e4']);
  });

  it('never submits a string that is not a square', () => {
    const keys = ['e', '1', '0', 'a', '4', 'z', '0', 'Enter', 'i', '1', '0'];
    for (const submitted of type(keys).submitted) {
      expect(isSquareName(submitted)).toBe(true);
    }
  });
});
