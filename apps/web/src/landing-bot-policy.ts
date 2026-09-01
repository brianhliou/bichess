import {
  BANQI_SPEC_ID,
  DARK_CHESS_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  engineTimeControlPin,
  FORTRESS_XIANGQI_SPEC_ID,
  JIEQI_SPEC_ID,
  JUNGLE_FLIP_SPEC_ID,
  JUNGLE_SPEC_ID,
  type TimeControlId,
  XIANGQI_SPEC_ID,
} from '@mistboard/game';
import { defaultTimePresetForSpec } from './variant-tenant/registry.js';

// One small merchandising policy shared by the Lobby rows and Quick Pairing's
// Computer chips. Room creation remains server-authoritative.

export type LandingBotGameSpecId =
  | typeof XIANGQI_SPEC_ID
  | typeof BANQI_SPEC_ID
  | typeof JIEQI_SPEC_ID
  | typeof FORTRESS_XIANGQI_SPEC_ID
  | typeof DARK_XIANGQI_SPEC_ID
  | typeof DARK_CHESS_SPEC_ID
  | typeof JUNGLE_SPEC_ID
  | typeof JUNGLE_FLIP_SPEC_ID;

export type LandingBotOffer = {
  botId: string;
  botName: string;
  gameSpecId: LandingBotGameSpecId;
  timeControlId: TimeControlId;
};

const ROTATION_BUCKET_MS = 6 * 60 * 60 * 1_000;

export const LANDING_BOT_GAME_SPEC_IDS: readonly LandingBotGameSpecId[] = [
  XIANGQI_SPEC_ID,
  BANQI_SPEC_ID,
  JIEQI_SPEC_ID,
  FORTRESS_XIANGQI_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  DARK_CHESS_SPEC_ID,
  JUNGLE_SPEC_ID,
  JUNGLE_FLIP_SPEC_ID,
];

const ROTATING_LINEUPS: readonly (readonly LandingBotGameSpecId[])[] = [
  [BANQI_SPEC_ID, JIEQI_SPEC_ID, FORTRESS_XIANGQI_SPEC_ID, DARK_XIANGQI_SPEC_ID],
  [FORTRESS_XIANGQI_SPEC_ID, DARK_XIANGQI_SPEC_ID, JUNGLE_SPEC_ID, JUNGLE_FLIP_SPEC_ID],
  [BANQI_SPEC_ID, JIEQI_SPEC_ID, JUNGLE_SPEC_ID, JUNGLE_FLIP_SPEC_ID],
];

// Xiangqi's Lobby block is a fixed difficulty ladder, not a rotation: the rungs
// never change, so a returning player can climb them ("beat Level 5, try Level
// 8") and the Rating column reads as one ascending gradient instead of three
// unrelated numbers. Keep this ascending; the rows render in this order.
// Pikafish is deliberately not a rung: it is the separate elite challenge in
// the setup dialog's engine list, not a step on the human ladder.
const XIANGQI_LADDER_LEVELS = [2, 5, 8] as const;

// One stable primary per Fairy-Stockfish variant. The same control must never
// silently hand out a different opponent strength, and Quick Pairing's Computer
// chip shows no name at all, so a rotating identity there is invisible. Xiangqi
// takes the ladder's middle rung; Fortress shows a single mid-ladder opponent.
const XIANGQI_PRIMARY_LEVEL = 5;
const FORTRESS_XIANGQI_LEVEL = 4;

export function landingBotRotationBucket(now: Date = new Date()): number {
  return Math.floor(now.getTime() / ROTATION_BUCKET_MS);
}

// Xiangqi and Fog Chess anchor every lineup. Four other slots rotate in paired
// families; any two consecutive buckets cover all eight live variants.
export function landingBotLineup(bucket: number): readonly LandingBotGameSpecId[] {
  const rotating = ROTATING_LINEUPS[positiveModulo(bucket, ROTATING_LINEUPS.length)]!;
  return [XIANGQI_SPEC_ID, DARK_CHESS_SPEC_ID, ...rotating];
}

// Which variants appear still rotates by bucket; WHICH OPPONENT a variant
// offers does not.
export function landingBotOffer(gameSpecId: string): LandingBotOffer | null {
  if (!isLandingBotGameSpecId(gameSpecId)) return null;
  if (gameSpecId === XIANGQI_SPEC_ID) return fsfOffer(gameSpecId, XIANGQI_PRIMARY_LEVEL);
  if (gameSpecId === FORTRESS_XIANGQI_SPEC_ID) return fsfOffer(gameSpecId, FORTRESS_XIANGQI_LEVEL);
  if (gameSpecId === JIEQI_SPEC_ID) {
    return {
      botId: 'pikafish',
      botName: 'Pikafish',
      gameSpecId,
      timeControlId: offerPace(gameSpecId),
    };
  }
  return { botId: 'misty', botName: 'Misty', gameSpecId, timeControlId: offerPace(gameSpecId) };
}

// The Lobby row and the Quick Pairing chip must advertise the clock the click
// will actually start, so this mirrors the picker's preselection exactly.
// Precedence, strongest first:
//   1. the engine pin — a HARD constraint: the fog engines lose on time at 3+2
//      (#283) and the create route rejects anything else;
//   2. the variant's own default — a preference, slower on the deliberate
//      variants because guests cannot finish a full-board game at 3+2;
//   3. the house pace, 3+2.
function offerPace(gameSpecId: LandingBotGameSpecId): TimeControlId {
  return engineTimeControlPin(gameSpecId)?.id ?? defaultTimePresetForSpec(gameSpecId);
}

// The Lobby carries the whole Xiangqi ladder at once, weakest rung first. The
// middle rung is also the canonical offer Quick Pairing starts, so the two
// surfaces never disagree about who "the computer" is.
export function landingXiangqiBotOffers(): readonly LandingBotOffer[] {
  return XIANGQI_LADDER_LEVELS.map((level) => fsfOffer(XIANGQI_SPEC_ID, level));
}

function fsfOffer(gameSpecId: LandingBotGameSpecId, level: number): LandingBotOffer {
  return {
    botId: `fairy-stockfish-level-${level}`,
    botName: `Fairy-Stockfish Level ${level}`,
    gameSpecId,
    timeControlId: offerPace(gameSpecId),
  };
}

function isLandingBotGameSpecId(gameSpecId: string): gameSpecId is LandingBotGameSpecId {
  return (LANDING_BOT_GAME_SPEC_IDS as readonly string[]).includes(gameSpecId);
}

function positiveModulo(value: number, divisor: number): number {
  return ((Math.trunc(value) % divisor) + divisor) % divisor;
}
