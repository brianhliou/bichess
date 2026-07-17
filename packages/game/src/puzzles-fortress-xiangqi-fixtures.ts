// Curated TEST fixture corpus for Fortress Xiangqi puzzles.
//
// Since #183 the SERVED corpus lives in the committed seed assets
// (packages/game/seed/puzzles/fortress-xiangqi.json +
// seed/source-games/fortress-xiangqi.json), synced into the `puzzles` /
// `puzzle_source_games` tables by the server (apps/server/src/puzzle-store.ts).
// The whole Fortress set stays hidden from the discoverable pool while the
// variant is demoted (see routes/puzzles.ts), but remains resolvable by id.
// These few records exist only so kernel/unit/adapter tests have realistic
// puzzles to exercise without the full corpus: verbatim copies of seed records
// (pinned as a subset by puzzles-seed.test.ts) covering mined mate-in-ones and
// tactic winning-advantage lines with source games.
//
// Do not hand-edit records here; if the seed corpus changes (re-mine), refresh
// any stale fixture from the seed JSON.

import type {
  FortressXiangqiPuzzle,
  FortressXiangqiSourceGame,
} from './puzzles-fortress-xiangqi.js';

export const FIXTURE_FORTRESS_XIANGQI_PUZZLES: readonly FortressXiangqiPuzzle[] = [
  {
    id: 'fortress-xiangqi-mined-v2-001',
    variant: 'fortress-xiangqi',
    title: 'Red Cannon drop mate in 1',
    initial: {
      id: 'fortress-xiangqi-mined-v2-001',
      board: {
        a1: {
          color: 'red',
          role: 'treasure',
        },
        b8: {
          color: 'black',
          role: 'horse',
        },
        c1: {
          color: 'red',
          role: 'general',
        },
        d8: {
          color: 'red',
          role: 'cannon',
        },
        f8: {
          color: 'black',
          role: 'general',
        },
        g8: {
          color: 'black',
          role: 'treasure',
        },
        a7: {
          color: 'black',
          role: 'soldier',
        },
        b2: {
          color: 'black',
          role: 'chariot',
        },
        b7: {
          color: 'black',
          role: 'soldier',
        },
        g6: {
          color: 'black',
          role: 'soldier',
        },
        f5: {
          color: 'black',
          role: 'soldier',
        },
        d6: {
          color: 'black',
          role: 'soldier',
        },
        d1: {
          color: 'red',
          role: 'chariot',
        },
        g3: {
          color: 'red',
          role: 'soldier',
        },
        e7: {
          color: 'black',
          role: 'soldier',
        },
        f7: {
          color: 'black',
          role: 'advisor',
        },
        d3: {
          color: 'red',
          role: 'elephant',
        },
      },
      hands: {
        red: {
          cannon: 1,
        },
        black: {
          advisor: 1,
          soldier: 3,
          horse: 1,
          elephant: 1,
        },
      },
      status: {
        type: 'playing',
        turn: 'red',
      },
      moveNumber: 23,
      positionCounts: {
        'red|a1rt,a7bs,b2br,b7bs,b8bh,c1rk,d1rr,d3re,d6bs,d8rn,e7bs,f5bs,f7ba,f8bk,g3rs,g6bs,g8bt|h:r:r0h0n1s0t0a0e0|b:r0h1n0s3t0a1e1': 1,
      },
      moveLog: [],
    },
    solution: [
      {
        drop: 'cannon',
        to: 'c8',
      },
    ],
    goal: {
      type: 'checkmate',
      winner: 'red',
    },
    themes: ['checkmate', 'palace-net', 'drop', 'cannon'],
  },
  {
    id: 'fortress-xiangqi-mined-v2-002',
    variant: 'fortress-xiangqi',
    title: 'Black Soldier drop mate in 1',
    initial: {
      id: 'fortress-xiangqi-mined-v2-002',
      board: {
        a1: {
          color: 'red',
          role: 'treasure',
        },
        b8: {
          color: 'black',
          role: 'horse',
        },
        c1: {
          color: 'red',
          role: 'general',
        },
        d8: {
          color: 'red',
          role: 'cannon',
        },
        f8: {
          color: 'black',
          role: 'general',
        },
        g8: {
          color: 'black',
          role: 'treasure',
        },
        a7: {
          color: 'black',
          role: 'soldier',
        },
        b2: {
          color: 'black',
          role: 'chariot',
        },
        b7: {
          color: 'black',
          role: 'soldier',
        },
        g6: {
          color: 'black',
          role: 'soldier',
        },
        f5: {
          color: 'black',
          role: 'soldier',
        },
        d6: {
          color: 'black',
          role: 'soldier',
        },
        d1: {
          color: 'red',
          role: 'chariot',
        },
        g3: {
          color: 'red',
          role: 'soldier',
        },
        e7: {
          color: 'black',
          role: 'soldier',
        },
        f7: {
          color: 'black',
          role: 'advisor',
        },
        d3: {
          color: 'red',
          role: 'elephant',
        },
        c6: {
          color: 'red',
          role: 'cannon',
        },
      },
      hands: {
        red: {},
        black: {
          advisor: 1,
          soldier: 3,
          horse: 1,
          elephant: 1,
        },
      },
      status: {
        type: 'playing',
        turn: 'black',
      },
      moveNumber: 23,
      positionCounts: {
        'black|a1rt,a7bs,b2br,b7bs,b8bh,c1rk,c6rn,d1rr,d3re,d6bs,d8rn,e7bs,f5bs,f7ba,f8bk,g3rs,g6bs,g8bt|h:r:r0h0n0s0t0a0e0|b:r0h1n0s3t0a1e1': 1,
      },
      moveLog: [],
    },
    solution: [
      {
        drop: 'soldier',
        to: 'c2',
      },
    ],
    goal: {
      type: 'checkmate',
      winner: 'black',
    },
    themes: ['checkmate', 'palace-net', 'drop'],
  },
  {
    id: 'fortress-xiangqi-tactic-001',
    variant: 'fortress-xiangqi',
    title: 'Red Soldier wins material',
    initial: {
      id: 'fortress-xiangqi-tactic-001',
      board: {
        a8: {
          color: 'black',
          role: 'chariot',
        },
        e8: {
          color: 'black',
          role: 'advisor',
        },
        f8: {
          color: 'black',
          role: 'general',
        },
        g8: {
          color: 'black',
          role: 'treasure',
        },
        a7: {
          color: 'black',
          role: 'soldier',
        },
        b7: {
          color: 'black',
          role: 'soldier',
        },
        d7: {
          color: 'black',
          role: 'horse',
        },
        e7: {
          color: 'red',
          role: 'soldier',
        },
        f7: {
          color: 'black',
          role: 'soldier',
        },
        g7: {
          color: 'black',
          role: 'soldier',
        },
        f6: {
          color: 'black',
          role: 'elephant',
        },
        b5: {
          color: 'black',
          role: 'cannon',
        },
        d4: {
          color: 'red',
          role: 'soldier',
        },
        b3: {
          color: 'red',
          role: 'soldier',
        },
        a2: {
          color: 'red',
          role: 'soldier',
        },
        b2: {
          color: 'red',
          role: 'treasure',
        },
        d2: {
          color: 'red',
          role: 'horse',
        },
        f2: {
          color: 'red',
          role: 'soldier',
        },
        g2: {
          color: 'red',
          role: 'soldier',
        },
        b1: {
          color: 'red',
          role: 'general',
        },
        c1: {
          color: 'red',
          role: 'advisor',
        },
        d1: {
          color: 'red',
          role: 'elephant',
        },
        e1: {
          color: 'red',
          role: 'chariot',
        },
      },
      hands: {
        red: {},
        black: {
          cannon: 1,
        },
      },
      status: {
        type: 'playing',
        turn: 'red',
      },
      moveNumber: 11,
      moveLog: [],
      positionCounts: {
        'red|a2rs,a7bs,a8br,b1rk,b2rt,b3rs,b5bn,b7bs,c1ra,d1re,d2rh,d4rs,d7bh,e1rr,e7rs,e8ba,f2rs,f6be,f7bs,f8bk,g2rs,g7bs,g8bt|h:r:r0h0n0s0t0a0e0|b:r0h0n1s0t0a0e0': 1,
      },
    },
    solution: [
      {
        from: 'e7',
        to: 'd7',
      },
      {
        from: 'b5',
        to: 'b2',
      },
      {
        drop: 'horse',
        to: 'e6',
      },
    ],
    goal: {
      type: 'winning-advantage',
      winner: 'red',
      centipawns: 471,
    },
    themes: ['winning', 'cannon', 'drop', 'horse'],
    sourceGame: {
      gameId: 'fxq-selfplay-0001',
      ply: 20,
    },
  },
  {
    id: 'fortress-xiangqi-tactic-002',
    variant: 'fortress-xiangqi',
    title: 'Red Chariot wins material',
    initial: {
      id: 'fortress-xiangqi-tactic-002',
      board: {
        d8: {
          color: 'red',
          role: 'horse',
        },
        e8: {
          color: 'black',
          role: 'advisor',
        },
        f8: {
          color: 'black',
          role: 'general',
        },
        g8: {
          color: 'black',
          role: 'treasure',
        },
        a7: {
          color: 'black',
          role: 'soldier',
        },
        d7: {
          color: 'black',
          role: 'soldier',
        },
        f7: {
          color: 'black',
          role: 'soldier',
        },
        g7: {
          color: 'black',
          role: 'soldier',
        },
        f6: {
          color: 'black',
          role: 'elephant',
        },
        b5: {
          color: 'red',
          role: 'chariot',
        },
        f5: {
          color: 'black',
          role: 'treasure',
        },
        b4: {
          color: 'black',
          role: 'soldier',
        },
        e4: {
          color: 'black',
          role: 'horse',
        },
        b3: {
          color: 'red',
          role: 'elephant',
        },
        d3: {
          color: 'red',
          role: 'soldier',
        },
        a2: {
          color: 'red',
          role: 'soldier',
        },
        b2: {
          color: 'red',
          role: 'soldier',
        },
        c2: {
          color: 'black',
          role: 'soldier',
        },
        g2: {
          color: 'red',
          role: 'soldier',
        },
        a1: {
          color: 'red',
          role: 'general',
        },
        c1: {
          color: 'red',
          role: 'advisor',
        },
        e1: {
          color: 'red',
          role: 'chariot',
        },
      },
      hands: {
        red: {
          cannon: 1,
        },
        black: {
          cannon: 1,
        },
      },
      status: {
        type: 'playing',
        turn: 'red',
      },
      moveNumber: 20,
      moveLog: [],
      positionCounts: {
        'red|a1rk,a2rs,a7bs,b2rs,b3re,b4bs,b5rr,c1ra,c2bs,d3rs,d7bs,d8rh,e1rr,e4bh,e8ba,f5bt,f6be,f7bs,f8bk,g2rs,g7bs,g8bt|h:r:r0h0n1s0t0a0e0|b:r0h0n1s0t0a0e0': 1,
      },
    },
    solution: [
      {
        from: 'b5',
        to: 'f5',
      },
      {
        drop: 'cannon',
        to: 'a4',
      },
      {
        drop: 'cannon',
        to: 'a3',
      },
      {
        from: 'f6',
        to: 'd8',
      },
      {
        drop: 'treasure',
        to: 'e7',
      },
    ],
    goal: {
      type: 'winning-advantage',
      winner: 'red',
      centipawns: 1015,
    },
    themes: ['winning', 'chariot', 'drop', 'cannon', 'treasure'],
    sourceGame: {
      gameId: 'fxq-selfplay-0005',
      ply: 38,
    },
  },
];

// Source games referenced by the tactic fixtures above (sourceGame.gameId).
export const FIXTURE_FORTRESS_XIANGQI_SOURCE_GAMES: readonly FortressXiangqiSourceGame[] = [
  {
    id: 'fxq-selfplay-0001',
    variant: 'fortress-xiangqi',
    moves: [
      {
        from: 'e1',
        to: 'e4',
      },
      {
        from: 'c8',
        to: 'c4',
      },
      {
        from: 'e4',
        to: 'f4',
      },
      {
        from: 'd8',
        to: 'f6',
      },
      {
        from: 'd2',
        to: 'd3',
      },
      {
        from: 'd7',
        to: 'd6',
      },
      {
        from: 'b2',
        to: 'b3',
      },
      {
        from: 'c4',
        to: 'e4',
      },
      {
        from: 'f1',
        to: 'd2',
      },
      {
        from: 'e4',
        to: 'c4',
      },
      {
        from: 'f4',
        to: 'd4',
      },
      {
        from: 'd6',
        to: 'd5',
      },
      {
        from: 'a1',
        to: 'b2',
      },
      {
        from: 'd5',
        to: 'd4',
      },
      {
        from: 'd3',
        to: 'd4',
      },
      {
        from: 'c4',
        to: 'c5',
      },
      {
        from: 'g1',
        to: 'e1',
      },
      {
        from: 'b8',
        to: 'd7',
      },
      {
        drop: 'soldier',
        to: 'e7',
      },
      {
        from: 'c5',
        to: 'b5',
      },
      {
        from: 'e7',
        to: 'd7',
      },
      {
        from: 'b5',
        to: 'b2',
      },
      {
        drop: 'horse',
        to: 'e6',
      },
      {
        drop: 'cannon',
        to: 'e7',
      },
      {
        from: 'd7',
        to: 'e7',
      },
      {
        drop: 'treasure',
        to: 'c2',
      },
      {
        from: 'b1',
        to: 'a1',
      },
      {
        from: 'b2',
        to: 'd2',
      },
      {
        from: 'e6',
        to: 'c7',
      },
      {
        drop: 'horse',
        to: 'd6',
      },
      {
        drop: 'cannon',
        to: 'b4',
      },
      {
        from: 'c2',
        to: 'c1',
      },
      {
        from: 'g2',
        to: 'g3',
      },
      {
        from: 'a8',
        to: 'c8',
      },
      {
        from: 'd4',
        to: 'd5',
      },
      {
        from: 'c8',
        to: 'c7',
      },
      {
        from: 'e7',
        to: 'e8',
      },
      {
        from: 'd6',
        to: 'e8',
      },
      {
        drop: 'advisor',
        to: 'c2',
      },
      {
        from: 'c7',
        to: 'c2',
      },
      {
        from: 'e1',
        to: 'e8',
      },
      {
        from: 'f8',
        to: 'e8',
      },
      {
        drop: 'horse',
        to: 'd3',
      },
      {
        drop: 'soldier',
        to: 'b2',
      },
      {
        from: 'd5',
        to: 'c5',
      },
      {
        drop: 'chariot',
        to: 'b1',
      },
    ],
  },
  {
    id: 'fxq-selfplay-0005',
    variant: 'fortress-xiangqi',
    moves: [
      {
        from: 'f2',
        to: 'f3',
      },
      {
        from: 'c8',
        to: 'c5',
      },
      {
        from: 'e1',
        to: 'e4',
      },
      {
        from: 'd8',
        to: 'f6',
      },
      {
        from: 'e4',
        to: 'f4',
      },
      {
        from: 'b7',
        to: 'b6',
      },
      {
        from: 'd1',
        to: 'b3',
      },
      {
        from: 'b8',
        to: 'c6',
      },
      {
        from: 'f1',
        to: 'e3',
      },
      {
        from: 'c6',
        to: 'e5',
      },
      {
        from: 'f4',
        to: 'a4',
      },
      {
        from: 'c5',
        to: 'a5',
      },
      {
        from: 'f3',
        to: 'f4',
      },
      {
        from: 'b6',
        to: 'b5',
      },
      {
        from: 'g1',
        to: 'f1',
      },
      {
        from: 'e5',
        to: 'c6',
      },
      {
        from: 'a4',
        to: 'e4',
      },
      {
        from: 'a5',
        to: 'a1',
      },
      {
        from: 'f1',
        to: 'e1',
      },
      {
        drop: 'treasure',
        to: 'e5',
      },
      {
        from: 'e4',
        to: 'c4',
      },
      {
        from: 'b5',
        to: 'b4',
      },
      {
        from: 'c4',
        to: 'c2',
      },
      {
        from: 'c6',
        to: 'd4',
      },
      {
        from: 'f4',
        to: 'f5',
      },
      {
        from: 'e5',
        to: 'e6',
      },
      {
        from: 'b1',
        to: 'a1',
      },
      {
        from: 'a8',
        to: 'd8',
      },
      {
        from: 'd2',
        to: 'd3',
      },
      {
        from: 'd4',
        to: 'f5',
      },
      {
        from: 'e3',
        to: 'f5',
      },
      {
        from: 'e6',
        to: 'f5',
      },
      {
        drop: 'horse',
        to: 'c6',
      },
      {
        drop: 'horse',
        to: 'e4',
      },
      {
        from: 'c6',
        to: 'd8',
      },
      {
        drop: 'soldier',
        to: 'c3',
      },
      {
        drop: 'chariot',
        to: 'b5',
      },
      {
        from: 'c3',
        to: 'c2',
      },
      {
        from: 'b5',
        to: 'f5',
      },
      {
        drop: 'cannon',
        to: 'a4',
      },
      {
        drop: 'cannon',
        to: 'a3',
      },
      {
        from: 'b4',
        to: 'b3',
      },
      {
        drop: 'treasure',
        to: 'e7',
      },
    ],
  },
];
