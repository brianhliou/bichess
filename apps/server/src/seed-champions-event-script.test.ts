import assert from 'node:assert/strict';
import test from 'node:test';
import { traditionalEvent } from './seed-xiangqi-champions-study.js';

// The event name converts for a Traditional reader. The players' names must not:
// they are mainland people, and a person's name is written in the script that
// person uses.
//
// These two rules collide inside one sentence. The provenance line was built by
// running replacements over the WHOLE sentence, which is why the event stayed
// simplified there for months: the fix a reader would reach for, adding 国 -> 國
// to that chain, silently rewrites 赵国荣 in the same pass.
test('an event name converts to Taiwan characters', () => {
  assert.equal(traditionalEvent('1956年全国象棋个人赛'), '1956年全國象棋個人賽');
  assert.equal(traditionalEvent('1990年第2届世界象棋锦标赛'), '1990年第2屆世界象棋錦標賽');
  assert.equal(traditionalEvent('全国象棋团体赛'), '全國象棋團體賽');
  // Sponsors and places convert: they are organizations, not people.
  assert.equal(traditionalEvent('1996年华能杯全国象棋个人赛'), '1996年華能杯全國象棋個人賽');
  assert.equal(traditionalEvent('1995年吴县市杯全国象棋个人赛'), '1995年吳縣市杯全國象棋個人賽');
  assert.equal(
    traditionalEvent('2025年民生实业杯全国象棋个人赛'),
    '2025年民生實業杯全國象棋個人賽',
  );
});

test('converting an event would corrupt a name, which is why it is field-scoped', () => {
  // Not an endorsement of calling it on a name: this documents WHY the call
  // site narrows to the event field. 赵国荣 must never be run through this.
  assert.equal(traditionalEvent('赵国荣'), '赵國荣');
  assert.notEqual(traditionalEvent('赵国荣'), '赵国荣');
  // 华 is the sharper case: three champions carry it, and the sponsor 华能 needs
  // it converted. Only the call site keeps them apart.
  assert.equal(traditionalEvent('胡荣华'), '胡荣華');
  assert.notEqual(traditionalEvent('柳大华'), '柳大华');
});
