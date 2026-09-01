import { describe, expect, it } from 'vitest';
import {
  LANDING_BOT_GAME_SPEC_IDS,
  landingBotLineup,
  landingBotOffer,
  landingBotRotationBucket,
  landingXiangqiBotOffers,
} from './landing-bot-policy.js';

describe('landing bot policy', () => {
  it('uses shared six-hour UTC buckets', () => {
    const before = landingBotRotationBucket(new Date('2026-07-23T05:59:59.999Z'));
    const after = landingBotRotationBucket(new Date('2026-07-23T06:00:00.000Z'));

    expect(landingBotRotationBucket(new Date('2026-07-23T00:00:00.000Z'))).toBe(before);
    expect(after).toBe(before + 1);
  });

  it('shows six distinct variants and covers the full shelf in any two buckets', () => {
    for (let bucket = 0; bucket < 3; bucket++) {
      const current = landingBotLineup(bucket);
      const next = landingBotLineup(bucket + 1);

      expect(current).toHaveLength(6);
      expect(new Set(current).size).toBe(6);
      expect(new Set([...current, ...next])).toEqual(new Set(LANDING_BOT_GAME_SPEC_IDS));
    }
  });

  it('pins one stable FSF opponent per variant, at the variant default pace', () => {
    // Xiangqi is a deliberate variant: it defaults to 10+5, not the 3+2 house
    // pace, because guests flagged 36% of their games at 3+2. The offer has to
    // advertise that, since the click starts the picker on the same default.
    expect(landingBotOffer('xiangqi')).toMatchObject({
      botId: 'fairy-stockfish-level-5',
      botName: 'Fairy-Stockfish Level 5',
      timeControlId: '10m5',
    });
    // Fortress xiangqi has no default of its own, so it keeps the house pace.
    expect(landingBotOffer('fortress-xiangqi')).toMatchObject({
      botId: 'fairy-stockfish-level-4',
      timeControlId: '3m2',
    });
  });

  it('offers the xiangqi ladder ascending, with the primary as one of its rungs', () => {
    const offers = landingXiangqiBotOffers();
    expect(offers.map((offer) => offer.botId)).toEqual([
      'fairy-stockfish-level-2',
      'fairy-stockfish-level-5',
      'fairy-stockfish-level-8',
    ]);

    // Ascending strength is the point of the block: the Rating column is read
    // top-to-bottom as one gradient, so a rung out of order is the bug.
    const levels = offers.map((offer) =>
      Number(offer.botId.slice('fairy-stockfish-level-'.length)),
    );
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    // Quick Pairing starts the canonical offer, so it has to be a rung the
    // Lobby shows or the two surfaces disagree about who "the computer" is.
    expect(offers.map((offer) => offer.botId)).toContain(landingBotOffer('xiangqi')?.botId);
    // Pikafish is the separate elite challenge, never a rung on this ladder.
    expect(offers.every((offer) => offer.botId.startsWith('fairy-stockfish-level-'))).toBe(true);
  });

  it('uses the established house bot for every other supported variant', () => {
    expect(landingBotOffer('jieqi')?.botId).toBe('pikafish');
    for (const gameSpecId of ['banqi', 'jungle', 'jungle-flip']) {
      expect(landingBotOffer(gameSpecId)).toMatchObject({
        botId: 'misty',
        timeControlId: '3m2',
      });
    }
    // The fog variants are the exception to the house pace: their engines have
    // a per-move floor a 2s increment cannot cover, so they lose on time in
    // long games (#283) and their offers take the 5+5 pin the picker and the
    // create routes also enforce (engineTimeControlPin).
    for (const gameSpecId of ['dark-chess', 'dark-xiangqi']) {
      expect(landingBotOffer(gameSpecId)).toMatchObject({
        botId: 'misty',
        timeControlId: '5m5',
      });
    }
    expect(landingBotOffer('dark-shogi')).toBeNull();
  });
});
