import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { jungleChapterName, jungleComment } from './lib/jungle-study-i18n.mjs';
import { jieqiChapterName } from './study-name-i18n.mjs';

// The eighteen chapter names are generated, which is the only reason
// translating them mechanically is safe. The test that matters is therefore the
// PARSER: a name that has drifted from the template must return null and be left
// in English, not be half-matched into a sentence that says something else.
describe('jieqi chapter names', () => {
  it('translates a mate', () => {
    assert.deepEqual(jieqiChapterName('Game 7: Red mates on move 46'), {
      'zh-Hans': '第 7 局：红方第 46 回合将死对手',
      'zh-Hant': '第 7 局：紅方第 46 回合將死對手',
    });
  });

  it('translates a stalemate as a WIN, which is what it is in xiangqi', () => {
    // 困毙: the side with no legal move loses. Rendering it as a draw, the way
    // the English word works in chess, would state the opposite of the result
    // the chapter's own moves show.
    const out = jieqiChapterName('Game 3: Red wins by stalemate on move 53');
    assert.equal(out['zh-Hans'], '第 3 局：红方第 53 回合困毙对手');
    assert.ok(!out['zh-Hans'].includes('和'));
  });

  it('keeps the sides apart', () => {
    assert.ok(jieqiChapterName('Game 1: Black mates on move 98')['zh-Hans'].includes('黑方'));
    assert.ok(jieqiChapterName('Game 2: Red mates on move 74')['zh-Hans'].includes('红方'));
  });

  it('returns null for anything off-template', () => {
    for (const name of [
      'Game 7: Red resigns on move 46',
      'Chapter 7: Red mates on move 46',
      'Game 7: Red mates',
      'A bare horse vs A bare advisor',
      '',
    ]) {
      assert.equal(jieqiChapterName(name), null, `should not have parsed: ${name}`);
    }
  });
});

describe('jungle chapter names and comments', () => {
  it('keeps the ordinal prefix out of the translation', () => {
    const out = jungleChapterName('07. Red wins the race from 40 behind');
    assert.ok(out['zh-Hans'].startsWith('07. '), out['zh-Hans']);
    assert.ok(!/[A-Za-z]/.test(out['zh-Hans'].slice(4)), out['zh-Hans']);
  });

  it('translates every comment template it claims to', () => {
    const sample =
      'Red reaches the den on ply 103, having been 80 down on material ten plies earlier. ' +
      'The den settles a game that material did not. About one game in twenty-one finishes this way. ' +
      'Final material: red 227, black 217 (4v4 pieces).';
    const out = jungleComment(sample);
    assert.ok(out['zh-Hans'].includes('第 103 步'));
    assert.ok(out['zh-Hans'].includes('80 分'));
    assert.ok(out['zh-Hant'].includes('獸穴'));
  });

  it('returns null for prose that is not one of the templates', () => {
    // The whole safety argument: an unrecognised comment must stay English
    // rather than be part-matched into a sentence about a different game.
    for (const text of [
      'Red reaches the den on ply 103.',
      'Drawn by the no-capture clock.',
      'Some hand-written note about this game.',
      '',
    ]) {
      assert.equal(jungleComment(text), null, `should not have parsed: ${text}`);
    }
    assert.equal(jungleChapterName('07. Red resigns'), null);
  });
});
