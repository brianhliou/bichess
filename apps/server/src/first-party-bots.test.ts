import assert from 'node:assert/strict';
import test from 'node:test';
import { firstPartyBotForEngine, firstPartyBotForId } from './first-party-bots.js';
import { XIANGQI_PLAYABLE_ENGINES } from './xiangqi-engine-catalog.js';

test('first-party Jieqi and Crossroads bot profiles expose three levels', () => {
  assert.equal(firstPartyBotForEngine('pikafish-jieqi-amateur')?.id, 'pika-jieqi-amateur');
  assert.equal(firstPartyBotForEngine('pikafish-jieqi-strong')?.id, 'pika-jieqi');
  assert.equal(firstPartyBotForEngine('pikafish-jieqi-strongest')?.id, 'pika-jieqi-strongest');

  assert.equal(
    firstPartyBotForEngine('fairy-stockfish-crossroads-amateur')?.id,
    'fairy-stockfish-crossroads-amateur',
  );
  assert.equal(
    firstPartyBotForEngine('fairy-stockfish-crossroads-strong')?.id,
    'fairy-stockfish-crossroads',
  );
  assert.equal(
    firstPartyBotForEngine('fairy-stockfish-crossroads-very-strong')?.id,
    'fairy-stockfish-crossroads-strongest',
  );

  assert.equal(firstPartyBotForId('pika-jieqi')?.displayName, 'PikaJieQi - Strong');
  // Fairy-Stockfish bots drop the redundant variant segment from the display name
  // (the variant is always shown in context); level distinguishes them per variant.
  assert.equal(
    firstPartyBotForId('fairy-stockfish-crossroads')?.displayName,
    'Fairy Stockfish - Strong',
  );
});

test('every xiangqi ladder level has a first-party bot profile', () => {
  for (const tier of XIANGQI_PLAYABLE_ENGINES) {
    const bot = firstPartyBotForEngine(tier.id);
    assert.ok(bot, `${tier.id}: no first-party bot profile claims this engine id`);
    assert.equal(bot.defaultGameSpecId, 'xiangqi');
    assert.equal(bot.displayName, tier.name, `${tier.id}: bot display name must match the tier`);
  }
});

test('retired xiangqi engine ids attribute to the absorbing level profiles', () => {
  // The pre-ladder tiers were absorbed into the matching levels. Their bot ids
  // continue as the Level 2/5/8 profiles (existing /bots URLs and historical
  // game attribution stay stable) and their retired engine ids resolve through
  // attributionEngineIds, like Misty's retired engine versions.
  assert.equal(firstPartyBotForEngine('pikafish-xiangqi-amateur')?.id, 'pikafish-xiangqi-amateur');
  assert.equal(firstPartyBotForEngine('pikafish-xiangqi-strong')?.id, 'pikafish-xiangqi');
  assert.equal(
    firstPartyBotForEngine('pikafish-xiangqi-strongest')?.id,
    'pikafish-xiangqi-strongest',
  );

  assert.equal(firstPartyBotForId('pikafish-xiangqi-amateur')?.displayName, 'Pikafish - Level 2');
  assert.equal(firstPartyBotForId('pikafish-xiangqi')?.displayName, 'Pikafish - Level 5');
  assert.equal(firstPartyBotForId('pikafish-xiangqi-strongest')?.displayName, 'Pikafish');
});
