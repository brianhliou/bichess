import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importXiangqiGame } from './xiangqi-import.js';
import { importXiangqiPaste } from './xiangqi-pgn.js';

// The same four-ply game in the shapes a person actually pastes.
const MOVETEXT = 'C2.5 H8+7 H2+3 R9.8';
const NUMBERED = '1. C2.5 H8+7 2. H2+3 R9.8';
const TAGGED_PGN = `[Event "Wuyang Cup"]
[Site "Guangzhou"]
[Date "1982.01.04"]
[Round "1"]
[Red "Hu Ronghua"]
[Black "Liu Dahua"]
[Result "1-0"]

1. C2.5 H8+7 2. H2+3 R9.8 1-0
`;

// Two dpxq moves (h3-e3, h8-e8) as col/row pairs measured from the top.
const DHTMLXQ = '77477242';

const uci = (moves: readonly { from: string; to: string }[]): string =>
  moves.map((m) => `${m.from}-${m.to}`).join(' ');

test('reads a full PGN with a tag block, which the bare sniffer cannot', () => {
  // The regression this exists for: the box says "Paste a game to import" and
  // a tagged PGN is the likeliest thing to paste into it.
  assert.equal(importXiangqiGame(TAGGED_PGN).moves.length, 0);

  const pasted = importXiangqiPaste(TAGGED_PGN);
  assert.equal(pasted.error, undefined);
  assert.equal(pasted.source, 'pgn');
  assert.equal(pasted.moves.length, 4);
  assert.equal(pasted.tags.Red, 'Hu Ronghua');
  assert.equal(pasted.result, '1-0');
});

test('reads the same game identically however it is wrapped', () => {
  const bare = importXiangqiPaste(MOVETEXT);
  assert.equal(uci(importXiangqiPaste(NUMBERED).moves), uci(bare.moves));
  assert.equal(uci(importXiangqiPaste(TAGGED_PGN).moves), uci(bare.moves));
  assert.equal(bare.source, 'movetext');
});

test('still routes bare movetext through the sniffer untouched', () => {
  const pasted = importXiangqiPaste(MOVETEXT);
  assert.equal(pasted.source, 'movetext');
  assert.equal(pasted.format, 'wxf');
  assert.deepEqual(pasted.tags, {});
  assert.equal(uci(pasted.moves), uci(importXiangqiGame(MOVETEXT).moves));
});

test('does not let the PGN reader eat a DhtmlXQ record', () => {
  // A dpxq record is a run of digits, and PGN's move-number pattern matches one
  // whole. Trying PGN first would return an empty game here.
  const dhtmlxq = importXiangqiGame(DHTMLXQ);
  assert.equal(dhtmlxq.format, 'dhtmlxq');
  assert.equal(dhtmlxq.moves.length, 2);

  const pasted = importXiangqiPaste(DHTMLXQ);
  assert.equal(pasted.source, 'movetext');
  assert.equal(uci(pasted.moves), uci(dhtmlxq.moves));
});

test('surfaces the [FEN] start so the moves are not replayed from the wrong position', () => {
  // Generals on different files: the flying-general rule makes a shared file
  // with nothing between them an illegal position, not a legal empty board.
  const fen = '3k5/9/9/9/9/9/9/9/9/4K1R2 w - - 0 1';
  const pasted = importXiangqiPaste(`[Red "?"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n1. g1-f1 *`);
  assert.equal(pasted.error, undefined);
  assert.equal(pasted.startFen, fen);
  assert.equal(pasted.moves.length, 1);
});

test('reports a broken PGN as a PGN problem and junk as unreadable movetext', () => {
  const brokenPgn = importXiangqiPaste('[Event "X"]\n\n1. Zz9.9 *');
  assert.equal(brokenPgn.source, 'pgn');
  assert.equal(brokenPgn.moves.length, 0);
  assert.ok(brokenPgn.error);

  const junk = importXiangqiPaste('the quick brown fox');
  assert.equal(junk.source, 'movetext');
  assert.ok(junk.error);
});
