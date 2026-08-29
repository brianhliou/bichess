import { describe, expect, it } from 'vitest';
import {
  type StudyChapterPayload,
  type StudyTreeNode,
  studyChapterToReplaySpec,
  uciToIccs,
} from './study-chapter-spec.js';

const chapter = (
  root: StudyTreeNode | undefined,
  extra: Record<string, unknown> = {},
): StudyChapterPayload => ({
  id: 'c1',
  name: 'Test chapter',
  root: { root },
  ...extra,
});

describe('uciToIccs', () => {
  it('shifts ranks from 1-10 to 0-9', () => {
    expect(uciToIccs('h3e3')).toBe('h2e2');
    expect(uciToIccs('a10a9')).toBe('a9a8');
  });

  it('rejects anything that is not a plain from+to move', () => {
    // A malformed node must truncate the line, not poison the spec.
    for (const bad of ['', 'h3', 'z3e3', 'h0e3', 'h11e3', 'P@e3']) {
      expect(uciToIccs(bad), bad).toBeNull();
    }
  });
});

describe('studyChapterToReplaySpec', () => {
  it('reads the first child as the game and later children as its sideline', () => {
    const spec = studyChapterToReplaySpec(
      chapter({
        children: [
          {
            uci: 'h3e3',
            annotations: { glyphs: [6], comments: [{ text: 'loose' }] },
            children: [{ uci: 'h8e8' }],
          },
          { uci: 'b1c3', children: [{ uci: 'b8c6' }] },
        ],
      }),
    );
    expect(spec?.iccs).toBe('h2e2 h7e7');
    expect(spec?.annotations?.byPly[1]).toEqual({
      glyph: '?!',
      note: 'loose',
      line: 'b0c2 b7c5',
    });
  });

  it('carries the tags a reader sees', () => {
    const spec = studyChapterToReplaySpec(
      chapter(
        { children: [{ uci: 'h3e3' }] },
        {
          orientation: 'black',
          tags: { red: 'Yang Guanlin', black: 'Hu Ronghua', event: '1960', result: '0-1' },
        },
      ),
    );
    expect(spec?.red).toBe('Yang Guanlin');
    expect(spec?.black).toBe('Hu Ronghua');
    expect(spec?.event).toBe('1960');
    expect(spec?.resultText).toBe('0-1');
    expect(spec?.perspective).toBe('black');
  });

  it('returns null for a chapter with no moves rather than an empty board', () => {
    expect(studyChapterToReplaySpec(chapter({ children: [] }))).toBeNull();
    expect(studyChapterToReplaySpec(chapter(undefined))).toBeNull();
  });

  it('truncates at the first unreadable move instead of dropping the chapter', () => {
    const spec = studyChapterToReplaySpec(
      chapter({ children: [{ uci: 'h3e3', children: [{ uci: 'garbage' }] }] }),
    );
    expect(spec?.iccs).toBe('h2e2');
  });
});
