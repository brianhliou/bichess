import { CROSSROADS_CHESS_SPEC_ID, JUNGLE_SPEC_ID, XIANGQI_SPEC_ID } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  type FeaturedGame,
  type GameParticipant,
  matchupLabel,
  matchupSeats,
} from './game-display.js';

// Regression suite for the "white vs pikajieqi" bug: surfaces that hardcoded a
// 'white' seat lookup dropped the red player's name on every red/black variant
// and rendered the literal seat word instead. Every "X vs Y" surface now goes
// through matchupSeats/matchupLabel.
describe('matchupSeats', () => {
  it('resolves xiangqi to red vs black from the spec family', () => {
    expect(matchupSeats(game(XIANGQI_SPEC_ID))).toEqual(['red', 'black']);
  });

  it('resolves the jungle family to red vs black', () => {
    expect(matchupSeats(game(JUNGLE_SPEC_ID))).toEqual(['red', 'black']);
  });

  it('resolves crossroads (and its legacy dual-chess alias) to white vs red', () => {
    expect(matchupSeats(game(CROSSROADS_CHESS_SPEC_ID))).toEqual(['white', 'red']);
    expect(matchupSeats(game('dual-chess'))).toEqual(['white', 'red']);
  });

  it('defaults chess-family variants to white vs black', () => {
    expect(matchupSeats(game('fog'))).toEqual(['white', 'black']);
  });

  it('lets persisted participants decide when the variant string is unknown', () => {
    expect(
      matchupSeats(game('some-legacy-alias', [participant('red', 'a'), participant('black', 'b')])),
    ).toEqual(['red', 'black']);
    expect(
      matchupSeats(game('some-legacy-alias', [participant('white', 'a'), participant('red', 'b')])),
    ).toEqual(['white', 'red']);
  });
});

describe('matchupLabel', () => {
  it('names both xiangqi players from their red/black participants', () => {
    expect(
      matchupLabel(
        game(XIANGQI_SPEC_ID, [
          participant('red', 'brianhliou-dev'),
          participant('black', 'PikaJieqi - Strong'),
        ]),
      ),
    ).toBe('brianhliou-dev vs PikaJieqi - Strong');
  });

  it('falls back to red/black seat words for xiangqi rows with no name data', () => {
    expect(matchupLabel(game(XIANGQI_SPEC_ID))).toBe('Red vs Black');
  });

  it('reads legacy white/black name columns for chess rows without participants', () => {
    expect(matchupLabel({ ...game('fog'), whiteName: 'alice', blackName: 'bob' })).toBe(
      'alice vs bob',
    );
  });
});

function game(variant: string, participants?: GameParticipant[]): FeaturedGame {
  return {
    roomId: 'game_test',
    variant,
    mode: 'pvp',
    rated: false,
    result: 'draw',
    termination: 'agreement',
    plyCount: 12,
    whiteName: null,
    blackName: null,
    corpusId: null,
    participants,
  };
}

function participant(color: GameParticipant['color'], displayName: string): GameParticipant {
  return {
    color,
    displayName,
    subjectType: 'user',
    subjectId: null,
    visibility: 'public',
  };
}
