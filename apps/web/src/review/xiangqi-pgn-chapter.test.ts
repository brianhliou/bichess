import { parseXiangqiPgn } from '@mistboard/game';
import { describe, expect, test } from 'vitest';
import {
  buildStudyPgn,
  exportXiangqiPgnChapter,
  importXiangqiPgnChapters,
  STUDY_EXPORT_LICENSE,
} from './xiangqi-pgn-chapter.js';

describe('importXiangqiPgnChapters', () => {
  test('turns each game in a file into its own chapter, named from its tags', () => {
    const { chapters, skipped } = importXiangqiPgnChapters(`[Event "City Open"]
[Red "Hu Ronghua"]
[Black "Yang Guanlin"]
[Result "1-0"]

1. h3e3 h8e8 1-0

[Event "City Open"]
[White "Li Laiqun"]
[Black "Liu Dahua"]

1. b1c3 b10c8 *
`);
    expect(skipped).toEqual([]);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]?.name).toBe('Hu Ronghua vs Yang Guanlin (City Open)');
    // [White] is what chess-shaped tools emit for the first player.
    expect(chapters[1]?.name).toBe('Li Laiqun vs Liu Dahua (City Open)');
    expect(chapters[0]?.plyCount).toBe(2);
  });

  test('stores the tree as UCIs with comments and NAGs on the right nodes', () => {
    const { chapters } = importXiangqiPgnChapters('1. h3e3 {Central Cannon} h8e8?! *');
    const root = chapters[0]?.root;
    expect(root?.version).toBe(1);
    const first = root?.root.children[0];
    expect(first?.uci).toBe('h3e3');
    expect(first?.annotations?.comments?.[0]?.text).toBe('Central Cannon');
    expect(first?.children[0]?.uci).toBe('h8e8');
    expect(first?.children[0]?.annotations?.glyphs).toEqual([6]);
  });

  test('a variation lands as a sibling, so the chapter opens as a real branch', () => {
    const { chapters } = importXiangqiPgnChapters('1. h3e3 h8e8 (1... b10c8) *');
    const replies = chapters[0]?.root.root.children[0]?.children ?? [];
    expect(replies.map((node) => node.uci)).toEqual(['h8e8', 'b10c8']);
  });

  test('an unreadable game is reported, not silently dropped from the count', () => {
    const { chapters, skipped } = importXiangqiPgnChapters(`[Event "Good"]

1. h3e3 *

[Event "Bad"]

1. zz99 qq11 *
`);
    expect(chapters).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.name).toBe('Bad');
    expect(skipped[0]?.reason).toBeTruthy();
  });

  test('a position-only game imports as a chapter rather than counting as a failure', () => {
    const { chapters, skipped } = importXiangqiPgnChapters(
      '[Event "Endgame"]\n[FEN "3k5/9/9/9/9/9/9/9/4R4/4K4 w - - 0 1"]\n\n*',
    );
    expect(skipped).toEqual([]);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.root.rootFen).toBeTruthy();
    expect(chapters[0]?.plyCount).toBe(0);
  });
});

describe('exportXiangqiPgnChapter', () => {
  test('a chapter survives PGN -> tree -> PGN -> tree with its branches intact', () => {
    const source = '1. h3e3 {opening} h8e8 (1... b10c8 2. h1g3) 2. h1g3 $14 *';
    const first = importXiangqiPgnChapters(source).chapters[0];
    expect(first).toBeTruthy();

    const pgn = exportXiangqiPgnChapter(first!.root, { event: 'Round trip' });
    const again = importXiangqiPgnChapters(pgn).chapters[0];
    expect(again).toBeTruthy();
    expect(again!.plyCount).toBe(first!.plyCount);

    const replies = again!.root.root.children[0]?.children ?? [];
    expect(replies.map((node) => node.uci)).toEqual(['h8e8', 'b10c8']);
    expect(again!.root.root.children[0]?.annotations?.comments?.[0]?.text).toBe('opening');
    expect(replies[0]?.children[0]?.annotations?.glyphs).toEqual([14]);
  });

  test('a custom start position survives the round trip', () => {
    const fen = '3k5/9/9/9/9/9/9/9/4R4/4K4 w - - 0 1';
    const chapter = importXiangqiPgnChapters(`[FEN "${fen}"]\n\n1. e2e8 *`).chapters[0];
    const pgn = exportXiangqiPgnChapter(chapter!.root);
    expect(pgn).toContain('[SetUp "1"]');
    const again = importXiangqiPgnChapters(pgn).chapters[0];
    expect(again?.root.rootFen).toBe(chapter?.root.rootFen);
    expect(again?.plyCount).toBe(1);
  });
});

test('a re-imported export names chapters from the event, not from "?" placeholders', () => {
  const chapter = importXiangqiPgnChapters('1. h3e3 h8e8 *').chapters[0];
  const pgn = exportXiangqiPgnChapter(chapter!.root, { event: 'Cannon manual: Central Cannon' });
  const again = importXiangqiPgnChapters(pgn).chapters[0];
  expect(again?.name).toBe('Cannon manual: Central Cannon');
});

describe('attribution', () => {
  const chapters = () => {
    const one = importXiangqiPgnChapters('1. h3e3 h8e8 *').chapters[0]!;
    const two = importXiangqiPgnChapters('1. b1c3 *').chapters[0]!;
    return [
      { name: 'Central Cannon', root: one.root },
      { name: 'Horse Opening', root: two.root },
    ];
  };

  test('every exported game names where it came from and under what terms', () => {
    const pgn = buildStudyPgn(
      { name: 'Cannon manual', id: 'abc123', origin: 'https://mistboard.com' },
      chapters(),
    );
    // Both games, not just the first: a reader who splits the file keeps the
    // attribution on whichever game they took.
    expect(pgn.match(/\[Site "https:\/\/mistboard\.com\/study\/abc123"\]/g)).toHaveLength(2);
    expect(pgn.match(new RegExp(`\\[License "${STUDY_EXPORT_LICENSE}"\\]`, 'g'))).toHaveLength(2);
    expect(pgn.match(/\[Source "Mistboard"\]/g)).toHaveLength(2);
  });

  test('the attribution survives a round trip back through our own reader', () => {
    const pgn = buildStudyPgn(
      { name: 'Cannon manual', id: 'abc123', origin: 'https://mistboard.com' },
      chapters(),
    );
    const games = parseXiangqiPgn(pgn);
    expect(games).toHaveLength(2);
    expect(games[0]?.tags.Site).toBe('https://mistboard.com/study/abc123');
    expect(games[0]?.tags.License).toBe(STUDY_EXPORT_LICENSE);
  });

  test('a study with no id still exports, just without a Site URL', () => {
    // Belt and braces: an id is always present in the app, but a missing one
    // must not produce [Site "/study/undefined"].
    const pgn = buildStudyPgn({ name: 'Scratch' }, chapters());
    expect(pgn).not.toContain('undefined');
    expect(pgn).toContain(`[License "${STUDY_EXPORT_LICENSE}"]`);
  });
});

test('the author is credited as [Annotator] on every exported game', () => {
  const one = importXiangqiPgnChapters('1. h3e3 *').chapters[0]!;
  const pgn = buildStudyPgn(
    { name: 'Cannon manual', id: 'abc123', origin: 'https://mistboard.com', author: 'mistboard' },
    [{ name: 'Central Cannon', root: one.root }],
  );
  expect(pgn).toContain('[Annotator "mistboard"]');
  expect(parseXiangqiPgn(pgn)[0]?.tags.Annotator).toBe('mistboard');
});

test('an unknown author leaves the tag off rather than inventing one', () => {
  const one = importXiangqiPgnChapters('1. h3e3 *').chapters[0]!;
  const pgn = buildStudyPgn({ name: 'Scratch', id: 'x' }, [{ name: 'c', root: one.root }]);
  expect(pgn).not.toContain('[Annotator');
});
