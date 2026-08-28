import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createInitialXiangqiState, type XiangqiMove } from './variants-xiangqi.js';
import { applyStandardXiangqiMove } from './variants-xiangqi-standard.js';
import {
  xiangqiEnPrisePieces,
  xiangqiMoveMaterial,
  xiangqiSettleAlongLine,
  xiangqiStaticExchange,
} from './xiangqi-exchange.js';
import {
  classifyXiangqiMove,
  type XiangqiMoveClassificationInput,
} from './xiangqi-move-classification.js';
import { parseStandardXiangqiFen } from './xiangqi-position.js';
import { pikafishUciToXiangqiSquares } from './xiangqi-uci.js';

// Positive glyphs (`!!` / `!`) for standard xiangqi. The sacrifice half is a
// static exchange evaluation plus the engine's line; the great half is the
// only-move rule. Each classifier reason is exercised once here, and the
// three hand-verified traps in known-cases.json (which defeated three earlier
// detectors) must come out unmarked with the sacrifice path wide open.
//
// FEN letters are chess-style (N horse, B elephant). A soldier that has not
// crossed the river must sit on its starting file, or the kernel rejects the
// diagram as unreachable.

const fen = (placement: string) => {
  const parsed = parseStandardXiangqiFen(placement);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.state;
};
const mv = (from: string, to: string): XiangqiMove => ({ from, to }) as XiangqiMove;

// Evals that would let anything through: equal game, engine's own move, a
// clear second-best gap and an opponent error to punish.
const GENEROUS = {
  winBefore: 60,
  winAfter: 62,
  playedBest: true,
  secondBestWin: 40,
  winTwoPliesAgo: 50,
};

test('static exchange: an undefended horse is taken for its full value', () => {
  const state = fen('n2k5/9/9/9/9/9/9/9/9/R3K4 w');
  assert.deepEqual(xiangqiStaticExchange(state.board, 'a10', 'red'), { gain: 4, capturer: 'a1' });
  assert.deepEqual(
    xiangqiEnPrisePieces(state.board, 'black').map((p) => [p.square, p.gain]),
    [['a10', 4]],
  );
  assert.deepEqual(xiangqiEnPrisePieces(state.board, 'red'), []);
});

test('static exchange: a horse defended by a chariot is not worth a chariot', () => {
  const state = fen('nr1k5/9/9/9/9/9/9/9/9/R3K4 w');
  assert.equal(xiangqiStaticExchange(state.board, 'a10', 'red').gain, 0);
  assert.deepEqual(xiangqiEnPrisePieces(state.board, 'black'), []);
});

test('static exchange: a cannon attacks only through a screen', () => {
  const screened = fen('3k5/9/4n4/9/9/4P4/9/4C4/9/5K3 w');
  assert.deepEqual(
    xiangqiEnPrisePieces(screened.board, 'black').map((p) => [p.square, p.gain, p.capturer]),
    [['e8', 4, 'e3']],
  );
  const open = fen('3k5/9/4n4/9/9/9/9/4C4/9/5K3 w');
  assert.deepEqual(xiangqiEnPrisePieces(open.board, 'black'), []);
});

test('the opening position offers nothing to either side', () => {
  const state = createInitialXiangqiState('start');
  assert.deepEqual(xiangqiEnPrisePieces(state.board, 'red'), []);
  assert.deepEqual(xiangqiEnPrisePieces(state.board, 'black'), []);
});

test('a capture that is recaptured for the same value offers nothing', () => {
  // Rc1xc6 takes a chariot that the c7 soldier takes straight back.
  const state = fen('3k5/9/9/2p6/2r6/9/9/9/9/2R1K4 w');
  const material = xiangqiMoveMaterial(state, mv('c1', 'c6'));
  assert.equal(material.captured, 9);
  assert.equal(material.offered, 0);
});

// Rc1-c6 puts a chariot where the c7 soldier takes it for nothing.
const CHARIOT_OFFER = '3k5/9/9/2p6/9/9/9/9/9/2R1K4 w';
const OFFER = mv('c1', 'c6');
const TAKES: XiangqiMove[] = [mv('c7', 'c6'), mv('e1', 'e2'), mv('d10', 'd9')];
const DECLINES: XiangqiMove[] = [mv('d10', 'd9'), mv('e1', 'e2'), mv('d9', 'd10')];

test('settling along a line reads the material where it goes quiet', () => {
  const after = applyStandardXiangqiMove(fen(CHARIOT_OFFER), OFFER);
  const taken = xiangqiSettleAlongLine(after, TAKES, 'red');
  assert.equal(taken.firstTakes, true);
  assert.equal(taken.settledBalance, -1);
  const declined = xiangqiSettleAlongLine(after, DECLINES, 'red');
  assert.equal(declined.firstTakes, false);
  assert.equal(declined.settledBalance, 8);
});

test('brilliant: a chariot given up along the engine line that stays down', () => {
  const state = fen(CHARIOT_OFFER);
  const result = classifyXiangqiMove({ before: state, move: OFFER, ...GENEROUS, pvAfter: TAKES });
  assert.equal(result.glyph, 'brilliant');
  assert.equal(result.reason, 'sacrifice:chariot@c6');
  assert.equal(result.sacrifice, 9);
  assert.equal(result.sacrificeEvidence, 'pv-takes');
});

test('brilliant: a declined offer is settled by the capture line, or not at all', () => {
  const state = fen(CHARIOT_OFFER);
  const unverified = classifyXiangqiMove({
    before: state,
    move: OFFER,
    ...GENEROUS,
    pvAfter: DECLINES,
  });
  assert.equal(unverified.glyph, null);
  assert.equal(unverified.reason, 'sacrifice-unverified');
  const verified = classifyXiangqiMove({
    before: state,
    move: OFFER,
    ...GENEROUS,
    pvAfter: DECLINES,
    pvAfterCapture: [mv('e1', 'e2'), mv('d10', 'd9')],
  });
  assert.equal(verified.glyph, 'brilliant');
  assert.equal(verified.sacrificeEvidence, 'capture-line');
  // Without any line there is nothing to verify against.
  const noLine = classifyXiangqiMove({ before: state, move: OFFER, ...GENEROUS });
  assert.equal(noLine.reason, 'sacrifice-unverified');
});

test('brilliant: not from a won position, and not into a worse one', () => {
  const state = fen(CHARIOT_OFFER);
  const input = { before: state, move: OFFER, ...GENEROUS, pvAfter: TAKES };
  const reason = (patch: Partial<XiangqiMoveClassificationInput>) =>
    classifyXiangqiMove({ ...input, ...patch }).reason;
  // Without a second-best line the position itself stands in for "winning
  // anyway"; with one, only the alternative counts (a sacrifice that is the
  // ONLY winning move is the brilliant kind).
  assert.equal(reason({ winBefore: 95, secondBestWin: null }), 'sacrifice-already-winning');
  assert.equal(reason({ winBefore: 95 }), 'sacrifice:chariot@c6');
  assert.equal(reason({ secondBestWin: 95 }), 'sacrifice-already-winning');
  assert.equal(reason({ winAfter: 45 }), 'sacrifice-worse-after');
  assert.equal(reason({ playedBest: false, winBefore: 70, winAfter: 60 }), 'not-best');
});

test('an advisor left to take is not a piece sacrifice', () => {
  // Ad1-e2 walks the advisor onto the a2 chariot's rank; the general on f1 does not defend it.
  const state = fen('3k5/9/9/9/9/9/9/9/r8/3A1K3 w');
  const result = classifyXiangqiMove({
    before: state,
    move: mv('d1', 'e2'),
    ...GENEROUS,
    secondBestWin: null,
  });
  assert.equal(result.material.offeredPiece?.role, 'advisor');
  assert.equal(result.glyph, null);
  assert.equal(result.reason, 'no-second-best');
});

test('great: the only move that punishes an error', () => {
  const state = fen('n2k5/9/9/9/9/9/9/9/9/R3K4 w');
  const quiet = mv('a1', 'a2');
  assert.equal(classifyXiangqiMove({ before: state, move: quiet, ...GENEROUS }).glyph, 'great');
  const reason = (patch: Partial<XiangqiMoveClassificationInput>) =>
    classifyXiangqiMove({ before: state, move: quiet, ...GENEROUS, ...patch }).reason;
  assert.equal(reason({ secondBestWin: null }), 'no-second-best');
  assert.equal(reason({ playedBest: false, winAfter: 60 }), 'not-top-choice');
  assert.equal(reason({ secondBestWin: 55 }), 'alternatives-exist');
  assert.equal(reason({ winTwoPliesAgo: null }), 'no-prior-eval');
  assert.equal(reason({ winTwoPliesAgo: 58 }), 'nothing-to-punish');
  assert.equal(
    reason({ winBefore: 95, secondBestWin: 80, winTwoPliesAgo: 85 }),
    'only-move-already-winning',
  );
  assert.equal(
    reason({ winBefore: 40, winAfter: 42, secondBestWin: 20, winTwoPliesAgo: 30 }),
    'only-move-still-worse',
  );
  // Taking the horse that was left hanging is not finding a move.
  assert.equal(
    classifyXiangqiMove({ before: state, move: mv('a1', 'a10'), ...GENEROUS }).reason,
    'free-capture',
  );
});

test('great: a recapture on the square just captured on is the obvious kind', () => {
  const black = fen('r2k5/9/9/9/9/9/9/9/9/NR2K4 b');
  const after = applyStandardXiangqiMove(black, mv('a10', 'a1'));
  assert.notEqual(after, black);
  const result = classifyXiangqiMove({ before: after, move: mv('b1', 'a1'), ...GENEROUS });
  assert.equal(result.reason, 'recapture');
});

test('a move made in check is forced, whatever it gives up', () => {
  const state = fen('3k5/9/9/9/9/4r4/9/9/9/1R2K4 w');
  const result = classifyXiangqiMove({ before: state, move: mv('e1', 'f1'), ...GENEROUS });
  assert.equal(result.inCheck, true);
  assert.equal(result.reason, 'in-check');
});

// The three traps every earlier detector fell into. Replayed from the
// fixture's move lists so a corrected record cannot leave a stale assertion.
type KnownCase = { key: string; ply: number; wxf: string; verdict: string; iccs: string };
const known = JSON.parse(
  readFileSync(
    new URL('../fixtures/xiangqi-move-classification/known-cases.json', import.meta.url),
    'utf8',
  ),
) as { cases: KnownCase[] };

test('the known cases are never read as a sacrifice, whatever the evals say', () => {
  for (const c of known.cases) {
    const moves = c.iccs.split(/\s+/).map((token) => pikafishUciToXiangqiSquares(token)!);
    let state = createInitialXiangqiState(`known-${c.key}`);
    for (let i = 0; i < c.ply - 1; i += 1) state = applyStandardXiangqiMove(state, moves[i]!);
    // The fixture is about the sacrifice detector: the only-move path is left
    // closed (no second-best line) and the sacrifice path wide open.
    const result = classifyXiangqiMove({
      before: state,
      move: moves[c.ply - 1]!,
      winBefore: 60,
      winAfter: 62,
      playedBest: true,
    });
    assert.equal(
      result.glyph,
      null,
      `${c.key} ${c.wxf} (${c.verdict}) was marked ${result.reason}`,
    );
    if (c.verdict === 'capture' || c.verdict === 'quiet') {
      assert.equal(result.material.offered, 0, `${c.key}: a ${c.verdict} offers nothing`);
      assert.equal(result.reason, 'no-second-best');
    }
    if (c.verdict === 'losing-trade') {
      // The horse was pulled off the chariot's defence to take a CHECKING cannon.
      assert.equal(result.inCheck, true);
      assert.equal(result.reason, 'in-check');
    }
  }
});
