import assert from 'node:assert/strict';
import test from 'node:test';
import {
  crossroadsChessEnabled,
  darkCrossroadsChessEnabled,
  darkMiniXiangqiEnabled,
  darkXiangqiEnabled,
  dropMiniXiangqiEnabled,
  kriegspielEnabled,
  ratedEnabled,
  revealChessEnabled,
} from './feature-flags.js';

const ratedKey = 'MISTBOARD_RATED_ENABLED';
const darkXiangqiKey = 'MISTBOARD_DARK_XIANGQI_ENABLED';
const darkMiniXiangqiKey = 'MISTBOARD_DARK_MINI_XIANGQI_ENABLED';
const dropMiniXiangqiKey = 'MISTBOARD_DROP_MINI_XIANGQI_ENABLED';
const crossroadsChessKey = 'MISTBOARD_CROSSROADS_CHESS_ENABLED';
const darkCrossroadsChessKey = 'MISTBOARD_DARK_CROSSROADS_CHESS_ENABLED';
const revealChessKey = 'MISTBOARD_REVEAL_CHESS_ENABLED';
const kriegspielKey = 'MISTBOARD_KRIEGSPIEL_ENABLED';

test('feature flags default off', () => {
  const beforeRated = process.env[ratedKey];
  const beforeDarkXiangqi = process.env[darkXiangqiKey];
  const beforeDarkMiniXiangqi = process.env[darkMiniXiangqiKey];
  const beforeDropMiniXiangqi = process.env[dropMiniXiangqiKey];
  const beforeCrossroadsChess = process.env[crossroadsChessKey];
  const beforeDarkCrossroadsChess = process.env[darkCrossroadsChessKey];
  const beforeRevealChess = process.env[revealChessKey];
  const beforeKriegspiel = process.env[kriegspielKey];
  delete process.env[ratedKey];
  delete process.env[darkXiangqiKey];
  delete process.env[darkMiniXiangqiKey];
  delete process.env[dropMiniXiangqiKey];
  delete process.env[crossroadsChessKey];
  delete process.env[darkCrossroadsChessKey];
  delete process.env[revealChessKey];
  delete process.env[kriegspielKey];
  try {
    assert.equal(ratedEnabled(), false);
    assert.equal(darkXiangqiEnabled(), false);
    assert.equal(darkMiniXiangqiEnabled(), false);
    assert.equal(dropMiniXiangqiEnabled(), false);
    assert.equal(crossroadsChessEnabled(), false);
    assert.equal(darkCrossroadsChessEnabled(), false);
    assert.equal(revealChessEnabled(), false);
    assert.equal(kriegspielEnabled(), false);
  } finally {
    restoreEnv(ratedKey, beforeRated);
    restoreEnv(darkXiangqiKey, beforeDarkXiangqi);
    restoreEnv(darkMiniXiangqiKey, beforeDarkMiniXiangqi);
    restoreEnv(dropMiniXiangqiKey, beforeDropMiniXiangqi);
    restoreEnv(crossroadsChessKey, beforeCrossroadsChess);
    restoreEnv(darkCrossroadsChessKey, beforeDarkCrossroadsChess);
    restoreEnv(revealChessKey, beforeRevealChess);
    restoreEnv(kriegspielKey, beforeKriegspiel);
  }
});

test('feature flags require the exact true string', () => {
  const beforeRated = process.env[ratedKey];
  const beforeDarkXiangqi = process.env[darkXiangqiKey];
  const beforeDarkMiniXiangqi = process.env[darkMiniXiangqiKey];
  const beforeDropMiniXiangqi = process.env[dropMiniXiangqiKey];
  const beforeCrossroadsChess = process.env[crossroadsChessKey];
  const beforeDarkCrossroadsChess = process.env[darkCrossroadsChessKey];
  const beforeRevealChess = process.env[revealChessKey];
  const beforeKriegspiel = process.env[kriegspielKey];
  try {
    process.env[ratedKey] = 'true';
    process.env[darkXiangqiKey] = 'true';
    process.env[darkMiniXiangqiKey] = 'true';
    process.env[dropMiniXiangqiKey] = 'true';
    process.env[crossroadsChessKey] = 'true';
    process.env[darkCrossroadsChessKey] = 'true';
    process.env[revealChessKey] = 'true';
    process.env[kriegspielKey] = 'true';
    assert.equal(ratedEnabled(), true);
    assert.equal(darkXiangqiEnabled(), true);
    assert.equal(darkMiniXiangqiEnabled(), true);
    assert.equal(dropMiniXiangqiEnabled(), true);
    assert.equal(crossroadsChessEnabled(), true);
    assert.equal(darkCrossroadsChessEnabled(), true);
    assert.equal(revealChessEnabled(), true);
    assert.equal(kriegspielEnabled(), true);

    process.env[ratedKey] = '1';
    process.env[darkXiangqiKey] = 'yes';
    process.env[darkMiniXiangqiKey] = 'on';
    process.env[dropMiniXiangqiKey] = 'yes';
    process.env[crossroadsChessKey] = 'off';
    process.env[darkCrossroadsChessKey] = 'enabled';
    process.env[revealChessKey] = 'yes';
    process.env[kriegspielKey] = 'on';
    assert.equal(ratedEnabled(), false);
    assert.equal(darkXiangqiEnabled(), false);
    assert.equal(darkMiniXiangqiEnabled(), false);
    assert.equal(dropMiniXiangqiEnabled(), false);
    assert.equal(crossroadsChessEnabled(), false);
    assert.equal(darkCrossroadsChessEnabled(), false);
    assert.equal(revealChessEnabled(), false);
    assert.equal(kriegspielEnabled(), false);
  } finally {
    restoreEnv(ratedKey, beforeRated);
    restoreEnv(darkXiangqiKey, beforeDarkXiangqi);
    restoreEnv(darkMiniXiangqiKey, beforeDarkMiniXiangqi);
    restoreEnv(dropMiniXiangqiKey, beforeDropMiniXiangqi);
    restoreEnv(crossroadsChessKey, beforeCrossroadsChess);
    restoreEnv(darkCrossroadsChessKey, beforeDarkCrossroadsChess);
    restoreEnv(revealChessKey, beforeRevealChess);
    restoreEnv(kriegspielKey, beforeKriegspiel);
  }
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
