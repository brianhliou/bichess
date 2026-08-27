import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHistoricalXiangqiPgn, historicalPgnDate } from './historical-xiangqi-export.js';
import type {
  HistoricalXiangqiGame,
  HistoricalXiangqiSource,
} from './persistence-historical-xiangqi.js';

function archiveGame(overrides: Partial<HistoricalXiangqiGame> = {}): HistoricalXiangqiGame {
  return {
    id: 'hx_1',
    sourceId: 'src_classic',
    importBatchId: null,
    sourceGameId: 'g-42',
    sourceUrl: 'https://archive.example/games/42',
    eventName: 'National Championship',
    site: 'Guangzhou',
    round: '3',
    board: null,
    playedOn: '1982-04-03',
    redNameRaw: 'Hu Ronghua',
    blackNameRaw: 'Liu Dahua',
    result: '1-0',
    termination: null,
    moveFormat: 'uci-0indexed',
    moves: [
      { from: 'h3', to: 'e3' },
      { from: 'h10', to: 'g8' },
    ],
    tags: { redPlayerId: 'secret-join-key' },
    qualityFlags: [],
    visibility: 'public',
    contentSha256: 'abc',
    redPlayerId: null,
    blackPlayerId: null,
    plyCount: 2,
    indexedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const source: HistoricalXiangqiSource = {
  id: 'src_classic',
  slug: 'classic',
  name: 'Classic Games Archive',
  sourceType: 'archive',
  sourceUrl: 'https://archive.example',
  license: 'CC BY-SA 4.0',
  licenseStatus: 'cleared',
  notes: null,
  createdAt: new Date(0),
};

test('archive PGN attributes the source and carries no Mistboard license grant', () => {
  const pgn = buildHistoricalXiangqiPgn(archiveGame(), source);
  assert.ok(pgn.startsWith('[Event "National Championship"]\n[Site "Guangzhou"]\n'), pgn);
  assert.ok(pgn.includes('[Date "1982.04.03"]'));
  assert.ok(pgn.includes('[Round "3"]'));
  assert.ok(pgn.includes('[Red "Hu Ronghua"]'));
  assert.ok(pgn.includes('[Black "Liu Dahua"]'));
  assert.ok(pgn.includes('[Result "1-0"]'));
  assert.ok(pgn.includes('[Variant "Xiangqi"]'));
  assert.ok(pgn.includes('[Source "Classic Games Archive"]'));
  assert.ok(pgn.includes('[SourceURL "https://archive.example"]'));
  assert.ok(pgn.includes('[SourceLicense "CC BY-SA 4.0"]'));
  assert.ok(pgn.includes('[SourceGameId "g-42"]'));
  assert.ok(pgn.includes('[SourceGameURL "https://archive.example/games/42"]'));
  assert.ok(pgn.includes('[MistboardReview "https://mistboard.com/historical-xiangqi/game/hx_1"]'));
  assert.equal(pgn.includes('CC BY 4.0'), false, 'third-party games are not relicensed');
  assert.equal(pgn.includes('[License '), false);
  assert.equal(pgn.includes('[MistboardSchema '), false);
  // The raw source row (pseudonymous player keys) never reaches the file.
  assert.equal(pgn.includes('secret-join-key'), false);
  assert.ok(pgn.endsWith('\n\n1. C2.5 H8+7 1-0\n'), pgn);
});

test('archive PGN fills unknown tags with PGN placeholders', () => {
  const pgn = buildHistoricalXiangqiPgn(
    archiveGame({
      eventName: null,
      site: '  ',
      round: null,
      playedOn: null,
      redNameRaw: null,
      blackNameRaw: null,
      sourceGameId: null,
      sourceUrl: null,
      result: '*',
    }),
    { ...source, sourceUrl: null, license: null },
  );
  assert.ok(pgn.startsWith('[Event "?"]\n[Site "?"]\n[Date "????.??.??"]\n[Round "-"]\n'), pgn);
  assert.ok(pgn.includes('[Red "?"]\n[Black "?"]\n[Result "*"]'));
  assert.equal(pgn.includes('[SourceURL '), false);
  assert.equal(pgn.includes('[SourceLicense '), false);
  assert.equal(pgn.includes('[SourceGameId '), false);
  assert.ok(pgn.trim().endsWith('1. C2.5 H8+7 *'));
});

test('historicalPgnDate reads the ISO prefix and refuses to invent a date', () => {
  assert.equal(historicalPgnDate('1982-04-03'), '1982.04.03');
  assert.equal(historicalPgnDate('1982-04-03T00:00:00.000Z'), '1982.04.03');
  assert.equal(historicalPgnDate('1982'), '????.??.??');
  assert.equal(historicalPgnDate(null), '????.??.??');
});
