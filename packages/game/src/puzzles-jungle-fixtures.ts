// Curated TEST fixture corpus for Jungle (Dou Shou Qi) puzzles.
//
// Since #183 the SERVED corpus lives in the committed seed assets
// (packages/game/seed/puzzles/jungle.json + seed/source-games/jungle.json),
// synced into the `puzzles` / `puzzle_source_games` tables by the server
// (apps/server/src/puzzle-store.ts). These few records exist only so
// kernel/unit/adapter tests have realistic puzzles to exercise without the
// full corpus: verbatim copies of seed records (pinned as a subset by
// puzzles-seed.test.ts) covering shallow forced wins (finder cross-checks),
// deeper tactic wins with source games, and material tactics.
//
// Do not hand-edit records here; if the seed corpus changes (re-mine), refresh
// any stale fixture from the seed JSON.

import type { JunglePuzzle, JungleSourceGame } from './puzzles-jungle.js';

export const FIXTURE_JUNGLE_PUZZLES: readonly JunglePuzzle[] = [
  {
    id: 'jungle-mined-001',
    variant: 'jungle',
    title: 'Black Tiger win in 2',
    initial: {
      id: 'jungle-mined-001',
      board: {
        f8: {
          color: 'black',
          role: 'dog',
        },
        f9: {
          color: 'black',
          role: 'lion',
        },
        f2: {
          color: 'red',
          role: 'cat',
        },
        e9: {
          color: 'black',
          role: 'wolf',
        },
        f1: {
          color: 'red',
          role: 'tiger',
        },
        a5: {
          color: 'black',
          role: 'elephant',
        },
        b1: {
          color: 'red',
          role: 'lion',
        },
        g8: {
          color: 'black',
          role: 'rat',
        },
        e7: {
          color: 'black',
          role: 'leopard',
        },
        d3: {
          color: 'black',
          role: 'tiger',
        },
        c8: {
          color: 'black',
          role: 'cat',
        },
        g1: {
          color: 'red',
          role: 'elephant',
        },
        e3: {
          color: 'red',
          role: 'wolf',
        },
        b3: {
          color: 'red',
          role: 'rat',
        },
      },
      status: {
        type: 'playing',
        turn: 'black',
      },
      moveNumber: 32,
      progressClock: 1,
      positionCounts: {
        'black|.L...TE.....C..R.tW.........e.................p....c..dr....wl.': 1,
      },
    },
    solution: [
      {
        from: 'd3',
        to: 'd2',
      },
      {
        from: 'f2',
        to: 'g2',
      },
      {
        from: 'd2',
        to: 'd1',
      },
    ],
    goal: {
      type: 'win',
      winner: 'black',
    },
    themes: ['den-race', 'tiger'],
  },
  {
    id: 'jungle-mined-002',
    variant: 'jungle',
    title: 'Black Tiger win in 2',
    initial: {
      id: 'jungle-mined-002',
      board: {
        f8: {
          color: 'black',
          role: 'dog',
        },
        f9: {
          color: 'black',
          role: 'lion',
        },
        f2: {
          color: 'red',
          role: 'cat',
        },
        e9: {
          color: 'black',
          role: 'wolf',
        },
        f1: {
          color: 'red',
          role: 'tiger',
        },
        a5: {
          color: 'black',
          role: 'elephant',
        },
        b1: {
          color: 'red',
          role: 'lion',
        },
        g8: {
          color: 'black',
          role: 'rat',
        },
        e7: {
          color: 'black',
          role: 'leopard',
        },
        c8: {
          color: 'black',
          role: 'cat',
        },
        g1: {
          color: 'red',
          role: 'elephant',
        },
        e2: {
          color: 'black',
          role: 'tiger',
        },
        a4: {
          color: 'red',
          role: 'rat',
        },
      },
      status: {
        type: 'playing',
        turn: 'black',
      },
      moveNumber: 34,
      progressClock: 3,
      positionCounts: {
        'black|.L...TE....tC........R......e.................p....c..dr....wl.': 1,
      },
    },
    solution: [
      {
        from: 'e2',
        to: 'd2',
      },
      {
        from: 'f2',
        to: 'g2',
      },
      {
        from: 'd2',
        to: 'd1',
      },
    ],
    goal: {
      type: 'win',
      winner: 'black',
    },
    themes: ['den-race', 'tiger'],
  },
  {
    id: 'jungle-tactic-001',
    variant: 'jungle',
    title: 'Red Lion win in 3',
    initial: {
      id: 'jungle-tactic-001',
      board: {
        f3: {
          color: 'black',
          role: 'lion',
        },
        e3: {
          color: 'red',
          role: 'wolf',
        },
        e8: {
          color: 'black',
          role: 'leopard',
        },
        d4: {
          color: 'red',
          role: 'leopard',
        },
        e4: {
          color: 'black',
          role: 'rat',
        },
        d2: {
          color: 'red',
          role: 'tiger',
        },
        e7: {
          color: 'black',
          role: 'dog',
        },
        f2: {
          color: 'red',
          role: 'elephant',
        },
        a7: {
          color: 'black',
          role: 'tiger',
        },
        b5: {
          color: 'red',
          role: 'rat',
        },
        d5: {
          color: 'black',
          role: 'wolf',
        },
        c2: {
          color: 'red',
          role: 'dog',
        },
        d6: {
          color: 'black',
          role: 'elephant',
        },
        a4: {
          color: 'black',
          role: 'cat',
        },
        c7: {
          color: 'red',
          role: 'lion',
        },
      },
      status: {
        type: 'playing',
        turn: 'red',
      },
      moveNumber: 31,
      progressClock: 0,
      positionCounts: {
        'red|.........DT.E.....Wl.c..Pr...R.w......e...t.L.d......p.........': 1,
      },
    },
    solution: [
      {
        from: 'c7',
        to: 'c8',
      },
      {
        from: 'f3',
        to: 'g3',
      },
      {
        from: 'c8',
        to: 'c9',
      },
      {
        from: 'e8',
        to: 'f8',
      },
      {
        from: 'c9',
        to: 'd9',
      },
    ],
    goal: {
      type: 'win',
      winner: 'red',
    },
    themes: ['lion', 'den-race'],
    sourceGame: {
      gameId: 'jungle-sp-0002',
      ply: 60,
    },
  },
  {
    id: 'jungle-tactic-003',
    variant: 'jungle',
    title: 'Red Elephant win in 4',
    initial: {
      id: 'jungle-tactic-003',
      board: {
        c3: {
          color: 'red',
          role: 'leopard',
        },
        d3: {
          color: 'black',
          role: 'elephant',
        },
        c1: {
          color: 'red',
          role: 'lion',
        },
        e3: {
          color: 'red',
          role: 'elephant',
        },
        e1: {
          color: 'red',
          role: 'cat',
        },
        d5: {
          color: 'black',
          role: 'dog',
        },
        f6: {
          color: 'black',
          role: 'rat',
        },
        c7: {
          color: 'red',
          role: 'dog',
        },
      },
      status: {
        type: 'playing',
        turn: 'red',
      },
      moveNumber: 47,
      progressClock: 0,
      positionCounts: {
        'red|..L.C...........PeE............d........r...D..................': 1,
      },
    },
    solution: [
      {
        from: 'e3',
        to: 'd3',
      },
      {
        from: 'd5',
        to: 'd6',
      },
      {
        from: 'c7',
        to: 'c8',
      },
      {
        from: 'f6',
        to: 'g6',
      },
      {
        from: 'c8',
        to: 'd8',
      },
      {
        from: 'd6',
        to: 'd7',
      },
      {
        from: 'd8',
        to: 'd9',
      },
    ],
    goal: {
      type: 'win',
      winner: 'red',
    },
    themes: ['elephant', 'rank-up', 'den-race'],
    sourceGame: {
      gameId: 'jungle-sp-0003',
      ply: 92,
    },
  },
  {
    id: 'jungle-material-001',
    variant: 'jungle',
    title: 'Black Cat wins material (+65)',
    initial: {
      id: 'jungle-material-001',
      board: {
        a9: {
          color: 'black',
          role: 'tiger',
        },
        a6: {
          color: 'red',
          role: 'rat',
        },
        a2: {
          color: 'red',
          role: 'lion',
        },
        f2: {
          color: 'red',
          role: 'tiger',
        },
        b1: {
          color: 'red',
          role: 'dog',
        },
        b3: {
          color: 'red',
          role: 'leopard',
        },
        e7: {
          color: 'black',
          role: 'leopard',
        },
        g1: {
          color: 'red',
          role: 'cat',
        },
        g8: {
          color: 'black',
          role: 'dog',
        },
        d2: {
          color: 'red',
          role: 'wolf',
        },
        b8: {
          color: 'black',
          role: 'wolf',
        },
        e6: {
          color: 'black',
          role: 'rat',
        },
        g5: {
          color: 'red',
          role: 'elephant',
        },
        a7: {
          color: 'black',
          role: 'cat',
        },
      },
      status: {
        type: 'playing',
        turn: 'black',
      },
      moveNumber: 28,
      progressClock: 0,
      positionCounts: {
        'black|.D....CL..W.T..P..................ER...r..c...p...w....dt......': 1,
      },
    },
    solution: [
      {
        from: 'a7',
        to: 'a6',
      },
    ],
    goal: {
      type: 'winning-advantage',
      winner: 'black',
      centipawns: 65,
    },
    themes: ['winning', 'rank-up'],
  },
  {
    id: 'jungle-material-002',
    variant: 'jungle',
    title: 'Black Rat wins material (+100)',
    initial: {
      id: 'jungle-material-002',
      board: {
        a6: {
          color: 'black',
          role: 'cat',
        },
        f2: {
          color: 'red',
          role: 'tiger',
        },
        g1: {
          color: 'red',
          role: 'cat',
        },
        g8: {
          color: 'black',
          role: 'dog',
        },
        g5: {
          color: 'red',
          role: 'elephant',
        },
        b8: {
          color: 'black',
          role: 'wolf',
        },
        a1: {
          color: 'red',
          role: 'lion',
        },
        d7: {
          color: 'black',
          role: 'leopard',
        },
        a3: {
          color: 'red',
          role: 'leopard',
        },
        a8: {
          color: 'black',
          role: 'tiger',
        },
        b2: {
          color: 'red',
          role: 'dog',
        },
        g6: {
          color: 'black',
          role: 'rat',
        },
        d2: {
          color: 'red',
          role: 'wolf',
        },
      },
      status: {
        type: 'playing',
        turn: 'black',
      },
      moveNumber: 35,
      progressClock: 11,
      positionCounts: {
        'black|L.....C.D.W.T.P...................Ec.....r...p...tw....d.......': 1,
      },
    },
    solution: [
      {
        from: 'g6',
        to: 'g5',
      },
    ],
    goal: {
      type: 'winning-advantage',
      winner: 'black',
      centipawns: 100,
    },
    themes: ['winning', 'rat', 'rank-up'],
  },
];

// Source games referenced by the tactic fixtures above (sourceGame.gameId).
export const FIXTURE_JUNGLE_SOURCE_GAMES: readonly JungleSourceGame[] = [
  {
    id: 'jungle-sp-0002',
    variant: 'jungle',
    moves: [
      {
        from: 'e3',
        to: 'e2',
      },
      {
        from: 'b8',
        to: 'a8',
      },
      {
        from: 'a1',
        to: 'b1',
      },
      {
        from: 'a8',
        to: 'b8',
      },
      {
        from: 'f2',
        to: 'f3',
      },
      {
        from: 'b8',
        to: 'a8',
      },
      {
        from: 'b1',
        to: 'a1',
      },
      {
        from: 'f8',
        to: 'f7',
      },
      {
        from: 'e2',
        to: 'e3',
      },
      {
        from: 'e7',
        to: 'e8',
      },
      {
        from: 'a1',
        to: 'b1',
      },
      {
        from: 'c7',
        to: 'd7',
      },
      {
        from: 'b1',
        to: 'c1',
      },
      {
        from: 'd7',
        to: 'd6',
      },
      {
        from: 'c1',
        to: 'c2',
      },
      {
        from: 'a7',
        to: 'b7',
      },
      {
        from: 'g1',
        to: 'f1',
      },
      {
        from: 'b7',
        to: 'c7',
      },
      {
        from: 'f1',
        to: 'e1',
      },
      {
        from: 'd6',
        to: 'd5',
      },
      {
        from: 'e1',
        to: 'e2',
      },
      {
        from: 'c7',
        to: 'd7',
      },
      {
        from: 'b2',
        to: 'b3',
      },
      {
        from: 'g7',
        to: 'g6',
      },
      {
        from: 'c3',
        to: 'd3',
      },
      {
        from: 'g6',
        to: 'g5',
      },
      {
        from: 'd3',
        to: 'd4',
      },
      {
        from: 'd5',
        to: 'd6',
      },
      {
        from: 'c2',
        to: 'd2',
      },
      {
        from: 'g5',
        to: 'g4',
      },
      {
        from: 'g3',
        to: 'g2',
      },
      {
        from: 'g4',
        to: 'f4',
      },
      {
        from: 'd2',
        to: 'd3',
      },
      {
        from: 'f4',
        to: 'e4',
      },
      {
        from: 'e2',
        to: 'd2',
      },
      {
        from: 'f7',
        to: 'e7',
      },
      {
        from: 'g2',
        to: 'f2',
      },
      {
        from: 'a8',
        to: 'a7',
      },
      {
        from: 'a3',
        to: 'a4',
      },
      {
        from: 'a7',
        to: 'a6',
      },
      {
        from: 'f2',
        to: 'e2',
      },
      {
        from: 'g9',
        to: 'g8',
      },
      {
        from: 'b3',
        to: 'c3',
      },
      {
        from: 'g8',
        to: 'g7',
      },
      {
        from: 'a4',
        to: 'b4',
      },
      {
        from: 'g7',
        to: 'f7',
      },
      {
        from: 'e2',
        to: 'f2',
      },
      {
        from: 'a6',
        to: 'a5',
      },
      {
        from: 'b4',
        to: 'c4',
      },
      {
        from: 'a9',
        to: 'a8',
      },
      {
        from: 'c4',
        to: 'c5',
      },
      {
        from: 'a8',
        to: 'a7',
      },
      {
        from: 'c5',
        to: 'b5',
      },
      {
        from: 'd6',
        to: 'd5',
      },
      {
        from: 'c3',
        to: 'c2',
      },
      {
        from: 'd7',
        to: 'd6',
      },
      {
        from: 'd3',
        to: 'c3',
      },
      {
        from: 'a5',
        to: 'a4',
      },
      {
        from: 'c3',
        to: 'c7',
      },
      {
        from: 'f7',
        to: 'f3',
      },
      {
        from: 'c7',
        to: 'c8',
      },
      {
        from: 'f3',
        to: 'e3',
      },
      {
        from: 'c8',
        to: 'c9',
      },
      {
        from: 'e3',
        to: 'e2',
      },
      {
        from: 'c9',
        to: 'd9',
      },
    ],
  },
  {
    id: 'jungle-sp-0003',
    variant: 'jungle',
    moves: [
      {
        from: 'f2',
        to: 'g2',
      },
      {
        from: 'g9',
        to: 'f9',
      },
      {
        from: 'c3',
        to: 'b3',
      },
      {
        from: 'g7',
        to: 'g6',
      },
      {
        from: 'a3',
        to: 'a2',
      },
      {
        from: 'g6',
        to: 'g7',
      },
      {
        from: 'b3',
        to: 'c3',
      },
      {
        from: 'a7',
        to: 'a8',
      },
      {
        from: 'a1',
        to: 'b1',
      },
      {
        from: 'g7',
        to: 'g8',
      },
      {
        from: 'b1',
        to: 'c1',
      },
      {
        from: 'c7',
        to: 'd7',
      },
      {
        from: 'c1',
        to: 'c2',
      },
      {
        from: 'd7',
        to: 'd6',
      },
      {
        from: 'g1',
        to: 'f1',
      },
      {
        from: 'e7',
        to: 'd7',
      },
      {
        from: 'f1',
        to: 'e1',
      },
      {
        from: 'd6',
        to: 'd5',
      },
      {
        from: 'e1',
        to: 'e2',
      },
      {
        from: 'd7',
        to: 'd6',
      },
      {
        from: 'e2',
        to: 'd2',
      },
      {
        from: 'd6',
        to: 'd7',
      },
      {
        from: 'd2',
        to: 'd3',
      },
      {
        from: 'd5',
        to: 'd6',
      },
      {
        from: 'd3',
        to: 'd4',
      },
      {
        from: 'd7',
        to: 'c7',
      },
      {
        from: 'd4',
        to: 'd5',
      },
      {
        from: 'd6',
        to: 'd7',
      },
      {
        from: 'd5',
        to: 'd6',
      },
      {
        from: 'a8',
        to: 'a7',
      },
      {
        from: 'd6',
        to: 'd7',
      },
      {
        from: 'b8',
        to: 'c8',
      },
      {
        from: 'd7',
        to: 'c7',
      },
      {
        from: 'f8',
        to: 'e8',
      },
      {
        from: 'c7',
        to: 'c8',
      },
      {
        from: 'a9',
        to: 'b9',
      },
      {
        from: 'c8',
        to: 'c7',
      },
      {
        from: 'a7',
        to: 'b7',
      },
      {
        from: 'c7',
        to: 'd7',
      },
      {
        from: 'b7',
        to: 'c7',
      },
      {
        from: 'd7',
        to: 'e7',
      },
      {
        from: 'f9',
        to: 'f8',
      },
      {
        from: 'e3',
        to: 'd3',
      },
      {
        from: 'b9',
        to: 'b8',
      },
      {
        from: 'b2',
        to: 'b3',
      },
      {
        from: 'c7',
        to: 'd7',
      },
      {
        from: 'e7',
        to: 'e3',
      },
      {
        from: 'b8',
        to: 'b7',
      },
      {
        from: 'b3',
        to: 'b2',
      },
      {
        from: 'b7',
        to: 'b3',
      },
      {
        from: 'g2',
        to: 'f2',
      },
      {
        from: 'b3',
        to: 'a3',
      },
      {
        from: 'a2',
        to: 'a1',
      },
      {
        from: 'a3',
        to: 'a2',
      },
      {
        from: 'a1',
        to: 'b1',
      },
      {
        from: 'a2',
        to: 'a1',
      },
      {
        from: 'b1',
        to: 'c1',
      },
      {
        from: 'a1',
        to: 'b1',
      },
      {
        from: 'b2',
        to: 'b3',
      },
      {
        from: 'e8',
        to: 'e7',
      },
      {
        from: 'f2',
        to: 'e2',
      },
      {
        from: 'f8',
        to: 'f7',
      },
      {
        from: 'e2',
        to: 'd2',
      },
      {
        from: 'd7',
        to: 'd6',
      },
      {
        from: 'e3',
        to: 'e2',
      },
      {
        from: 'd6',
        to: 'd5',
      },
      {
        from: 'g3',
        to: 'f3',
      },
      {
        from: 'd5',
        to: 'd4',
      },
      {
        from: 'f3',
        to: 'e3',
      },
      {
        from: 'f7',
        to: 'f3',
      },
      {
        from: 'e2',
        to: 'e1',
      },
      {
        from: 'f3',
        to: 'f2',
      },
      {
        from: 'b3',
        to: 'a3',
      },
      {
        from: 'f2',
        to: 'f1',
      },
      {
        from: 'd2',
        to: 'e2',
      },
      {
        from: 'e7',
        to: 'd7',
      },
      {
        from: 'a3',
        to: 'a4',
      },
      {
        from: 'd7',
        to: 'd6',
      },
      {
        from: 'a4',
        to: 'a5',
      },
      {
        from: 'd6',
        to: 'd5',
      },
      {
        from: 'a5',
        to: 'a6',
      },
      {
        from: 'g8',
        to: 'g7',
      },
      {
        from: 'a6',
        to: 'a7',
      },
      {
        from: 'g7',
        to: 'g6',
      },
      {
        from: 'a7',
        to: 'b7',
      },
      {
        from: 'b1',
        to: 'c1',
      },
      {
        from: 'c2',
        to: 'c1',
      },
      {
        from: 'f1',
        to: 'e1',
      },
      {
        from: 'e2',
        to: 'e1',
      },
      {
        from: 'g6',
        to: 'f6',
      },
      {
        from: 'b7',
        to: 'c7',
      },
      {
        from: 'd4',
        to: 'd3',
      },
      {
        from: 'e3',
        to: 'd3',
      },
      {
        from: 'f6',
        to: 'e6',
      },
      {
        from: 'c7',
        to: 'd7',
      },
      {
        from: 'e6',
        to: 'e5',
      },
      {
        from: 'd7',
        to: 'd8',
      },
      {
        from: 'd5',
        to: 'd4',
      },
      {
        from: 'd8',
        to: 'd9',
      },
    ],
  },
];
