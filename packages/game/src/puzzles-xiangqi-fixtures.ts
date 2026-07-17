// Curated TEST fixture corpus for standard-xiangqi puzzles.
//
// Since #183 the SERVED corpus lives in the committed seed assets
// (packages/game/seed/puzzles/xiangqi.json), synced into the `puzzles` table by
// the server (apps/server/src/puzzle-store.ts). These few records exist only so
// kernel/unit/adapter tests have realistic mined puzzles to exercise without
// the full corpus: they are verbatim copies of seed records (pinned as a
// subset by puzzles-seed.test.ts) covering every mined line length (1/3/5/7
// plies), both goal types, and a fully-attributed sourceGame.
//
// Do not hand-edit records here; if the seed corpus changes (re-mine), refresh
// any stale fixture from the seed JSON.

import type { XiangqiPuzzle } from './puzzles-xiangqi.js';

export const FIXTURE_XIANGQI_PUZZLES: readonly XiangqiPuzzle[] = [
  {
    id: 'xq-mined-hxq_14d5d0d7fe8d4c382417c4aa-59',
    variant: 'xiangqi',
    title: 'Black mate in 2',
    initial: {
      id: 'xq-mined-hxq_14d5d0d7fe8d4c382417c4aa-59',
      board: {
        a1: {
          color: 'black',
          role: 'cannon',
        },
        c1: {
          color: 'red',
          role: 'elephant',
        },
        d1: {
          color: 'red',
          role: 'advisor',
        },
        e1: {
          color: 'red',
          role: 'general',
        },
        e2: {
          color: 'black',
          role: 'horse',
        },
        f2: {
          color: 'black',
          role: 'chariot',
        },
        a3: {
          color: 'red',
          role: 'chariot',
        },
        i3: {
          color: 'red',
          role: 'horse',
        },
        a4: {
          color: 'red',
          role: 'soldier',
        },
        i4: {
          color: 'red',
          role: 'soldier',
        },
        c6: {
          color: 'black',
          role: 'soldier',
        },
        e8: {
          color: 'black',
          role: 'elephant',
        },
        e9: {
          color: 'black',
          role: 'advisor',
        },
        c10: {
          color: 'black',
          role: 'elephant',
        },
        d10: {
          color: 'black',
          role: 'advisor',
        },
        e10: {
          color: 'black',
          role: 'general',
        },
      },
      status: {
        type: 'playing',
        turn: 'black',
      },
      moveNumber: 30,
      progressClock: 0,
      positionCounts: {
        'black|a1bc,a3rc,a4rs,c1re,c10be,c6bs,d1ra,d10ba,e1rg,e10bg,e2bh,e8be,e9ba,f2bc,i3rh,i4rs': 1,
      },
      lastMove: {
        to: 'a3',
        from: 'h3',
      },
    },
    solution: [
      {
        from: 'e2',
        to: 'c1',
      },
      {
        from: 'a4',
        to: 'a5',
      },
      {
        from: 'c1',
        to: 'd3',
      },
    ],
    goal: {
      type: 'checkmate',
      winner: 'black',
    },
    themes: ['checkmate', 'matein2', 'winning-material', 'crushing', 'middlegame'],
    sourceGame: {
      gameId: 'hxq_14d5d0d7fe8d4c382417c4aa',
      ply: 59,
      event: '2026年广东十虎VS山东十好汉对抗赛',
      playedOn: '2026-04-23',
      result: '0-1',
      redName: '山东十好汉 李越川',
      blackName: '广东十虎 梁雅让',
    },
  },
  {
    id: 'xq-mined-hxq_2253229719a466bb699d2a4f-50',
    variant: 'xiangqi',
    title: 'Red mate in 2',
    initial: {
      id: 'xq-mined-hxq_2253229719a466bb699d2a4f-50',
      board: {
        c1: {
          color: 'red',
          role: 'elephant',
        },
        d1: {
          color: 'red',
          role: 'advisor',
        },
        e1: {
          color: 'red',
          role: 'general',
        },
        g1: {
          color: 'red',
          role: 'elephant',
        },
        e2: {
          color: 'red',
          role: 'advisor',
        },
        c3: {
          color: 'black',
          role: 'cannon',
        },
        g3: {
          color: 'red',
          role: 'horse',
        },
        a4: {
          color: 'red',
          role: 'soldier',
        },
        f4: {
          color: 'red',
          role: 'cannon',
        },
        g4: {
          color: 'red',
          role: 'soldier',
        },
        i4: {
          color: 'red',
          role: 'soldier',
        },
        c5: {
          color: 'black',
          role: 'soldier',
        },
        a7: {
          color: 'black',
          role: 'soldier',
        },
        f7: {
          color: 'red',
          role: 'chariot',
        },
        i7: {
          color: 'black',
          role: 'soldier',
        },
        c8: {
          color: 'black',
          role: 'horse',
        },
        d8: {
          color: 'black',
          role: 'advisor',
        },
        e8: {
          color: 'black',
          role: 'elephant',
        },
        e9: {
          color: 'black',
          role: 'general',
        },
        f9: {
          color: 'black',
          role: 'cannon',
        },
        g9: {
          color: 'red',
          role: 'horse',
        },
        b10: {
          color: 'black',
          role: 'chariot',
        },
        c10: {
          color: 'black',
          role: 'elephant',
        },
        f10: {
          color: 'black',
          role: 'advisor',
        },
      },
      status: {
        type: 'playing',
        turn: 'red',
      },
      moveNumber: 26,
      progressClock: 0,
      positionCounts: {
        'red|a4rs,a7bs,b10bc,c1re,c10be,c3bc,c5bs,c8bh,d1ra,d8ba,e1rg,e2ra,e8be,e9bg,f10ba,f4rc,f7rc,f9bc,g1re,g3rh,g4rs,g9rh,i4rs,i7bs': 1,
      },
      lastMove: {
        to: 'e9',
        from: 'e10',
      },
    },
    solution: [
      {
        from: 'f7',
        to: 'f9',
      },
      {
        from: 'e9',
        to: 'f9',
      },
      {
        from: 'g9',
        to: 'f7',
      },
    ],
    goal: {
      type: 'checkmate',
      winner: 'red',
    },
    themes: ['checkmate', 'matein2', 'winning-material', 'crushing', 'middlegame'],
    sourceGame: {
      gameId: 'hxq_2253229719a466bb699d2a4f',
      ply: 50,
      event: '2026年全国象棋团体赛',
      playedOn: '2026-03-28',
      result: '1-0',
      redName: '广东省二沙体育训练中心 张婷',
      blackName: '河南省全民健身中心 郑柯睿',
    },
  },
  {
    id: 'xq-mined-hxq_008c6b6eaef4238e418abc19-60',
    variant: 'xiangqi',
    title: 'Red winning advantage',
    initial: {
      id: 'xq-mined-hxq_008c6b6eaef4238e418abc19-60',
      board: {
        d1: {
          color: 'red',
          role: 'chariot',
        },
        e1: {
          color: 'red',
          role: 'general',
        },
        f1: {
          color: 'red',
          role: 'advisor',
        },
        g1: {
          color: 'red',
          role: 'elephant',
        },
        e2: {
          color: 'red',
          role: 'advisor',
        },
        e3: {
          color: 'red',
          role: 'elephant',
        },
        e4: {
          color: 'red',
          role: 'cannon',
        },
        a5: {
          color: 'red',
          role: 'soldier',
        },
        b5: {
          color: 'black',
          role: 'chariot',
        },
        c5: {
          color: 'red',
          role: 'cannon',
        },
        f5: {
          color: 'red',
          role: 'horse',
        },
        e6: {
          color: 'red',
          role: 'chariot',
        },
        i6: {
          color: 'black',
          role: 'cannon',
        },
        a7: {
          color: 'black',
          role: 'soldier',
        },
        c7: {
          color: 'black',
          role: 'soldier',
        },
        h7: {
          color: 'black',
          role: 'chariot',
        },
        i7: {
          color: 'black',
          role: 'soldier',
        },
        d8: {
          color: 'black',
          role: 'cannon',
        },
        e8: {
          color: 'black',
          role: 'horse',
        },
        e9: {
          color: 'black',
          role: 'advisor',
        },
        c10: {
          color: 'black',
          role: 'elephant',
        },
        e10: {
          color: 'black',
          role: 'general',
        },
        f10: {
          color: 'black',
          role: 'advisor',
        },
        g10: {
          color: 'black',
          role: 'elephant',
        },
      },
      status: {
        type: 'playing',
        turn: 'red',
      },
      moveNumber: 31,
      progressClock: 0,
      positionCounts: {
        'red|a5rs,a7bs,b5bc,c10be,c5rc,c7bs,d1rc,d8bc,e1rg,e10bg,e2ra,e3re,e4rc,e6rc,e8bh,e9ba,f1ra,f10ba,f5rh,g1re,g10be,h7bc,i6bc,i7bs': 1,
      },
      lastMove: {
        to: 'i6',
        from: 'i4',
      },
    },
    solution: [
      {
        from: 'd1',
        to: 'd8',
      },
      {
        from: 'e9',
        to: 'd8',
      },
      {
        from: 'e6',
        to: 'e8',
      },
    ],
    goal: {
      type: 'winning-advantage',
      winner: 'red',
      centipawns: 459,
    },
    themes: ['winning', 'winning-material', 'middlegame'],
    sourceGame: {
      gameId: 'hxq_008c6b6eaef4238e418abc19',
      ply: 60,
      event: '2026年全国象棋团体赛',
      playedOn: '2026-04-02',
      result: '1/2-1/2',
      redName: '山东省棋牌运动管理中心 黄蕾蕾',
      blackName: '广东省二沙体育训练中心 时凤兰',
    },
  },
  {
    id: 'xq-mined-hxq_0638200b88f1ed849ab5a958-69',
    variant: 'xiangqi',
    title: 'Black winning advantage',
    initial: {
      id: 'xq-mined-hxq_0638200b88f1ed849ab5a958-69',
      board: {
        e1: {
          color: 'red',
          role: 'general',
        },
        f1: {
          color: 'red',
          role: 'advisor',
        },
        e2: {
          color: 'red',
          role: 'advisor',
        },
        f2: {
          color: 'red',
          role: 'horse',
        },
        h2: {
          color: 'black',
          role: 'chariot',
        },
        i3: {
          color: 'red',
          role: 'elephant',
        },
        a4: {
          color: 'red',
          role: 'soldier',
        },
        e4: {
          color: 'red',
          role: 'soldier',
        },
        i4: {
          color: 'red',
          role: 'soldier',
        },
        e6: {
          color: 'red',
          role: 'cannon',
        },
        a7: {
          color: 'black',
          role: 'soldier',
        },
        f7: {
          color: 'red',
          role: 'chariot',
        },
        i7: {
          color: 'black',
          role: 'soldier',
        },
        e8: {
          color: 'black',
          role: 'elephant',
        },
        g8: {
          color: 'black',
          role: 'horse',
        },
        e9: {
          color: 'black',
          role: 'advisor',
        },
        c10: {
          color: 'black',
          role: 'elephant',
        },
        d10: {
          color: 'black',
          role: 'advisor',
        },
        e10: {
          color: 'black',
          role: 'general',
        },
        g10: {
          color: 'black',
          role: 'cannon',
        },
      },
      status: {
        type: 'playing',
        turn: 'black',
      },
      moveNumber: 35,
      progressClock: 0,
      positionCounts: {
        'black|a4rs,a7bs,c10be,d10ba,e1rg,e10bg,e2ra,e4rs,e6rc,e8be,e9ba,f1ra,f2rh,f7rc,g10bc,g8bh,h2bc,i3re,i4rs,i7bs': 1,
      },
      lastMove: {
        to: 'i3',
        from: 'g5',
      },
    },
    solution: [
      {
        from: 'g8',
        to: 'h6',
      },
      {
        from: 'f7',
        to: 'g7',
      },
      {
        from: 'e10',
        to: 'f10',
      },
    ],
    goal: {
      type: 'winning-advantage',
      winner: 'black',
      centipawns: 313,
    },
    themes: ['winning', 'middlegame'],
    sourceGame: {
      gameId: 'hxq_0638200b88f1ed849ab5a958',
      ply: 69,
      event: '2026年全国象棋团体赛',
      playedOn: '2026-03-29',
      result: '0-1',
      redName: '杭州市智力运动队 蒋明成',
      blackName: '广东省二沙体育训练中心 莫梓健',
    },
  },
  {
    id: 'xq-mined-hxq_00eed6ff437dad0cfb4c74fb-94',
    variant: 'xiangqi',
    title: 'Red mate in 3',
    initial: {
      id: 'xq-mined-hxq_00eed6ff437dad0cfb4c74fb-94',
      board: {
        d1: {
          color: 'red',
          role: 'general',
        },
        f1: {
          color: 'red',
          role: 'advisor',
        },
        g1: {
          color: 'red',
          role: 'elephant',
        },
        e2: {
          color: 'red',
          role: 'advisor',
        },
        e3: {
          color: 'red',
          role: 'elephant',
        },
        f3: {
          color: 'red',
          role: 'cannon',
        },
        a4: {
          color: 'red',
          role: 'soldier',
        },
        b4: {
          color: 'black',
          role: 'horse',
        },
        e6: {
          color: 'red',
          role: 'soldier',
        },
        a7: {
          color: 'black',
          role: 'soldier',
        },
        d7: {
          color: 'red',
          role: 'chariot',
        },
        g7: {
          color: 'black',
          role: 'cannon',
        },
        h7: {
          color: 'black',
          role: 'chariot',
        },
        e9: {
          color: 'black',
          role: 'general',
        },
        d10: {
          color: 'black',
          role: 'advisor',
        },
        f10: {
          color: 'black',
          role: 'advisor',
        },
      },
      status: {
        type: 'playing',
        turn: 'red',
      },
      moveNumber: 48,
      progressClock: 0,
      positionCounts: {
        'red|a4rs,a7bs,b4bh,d1rg,d10ba,d7rc,e2ra,e3re,e6rs,e9bg,f1ra,f10ba,f3rc,g1re,g7bc,h7bc': 1,
      },
      lastMove: {
        to: 'g7',
        from: 'e7',
      },
    },
    solution: [
      {
        from: 'd7',
        to: 'e7',
      },
      {
        from: 'e9',
        to: 'f9',
      },
      {
        from: 'e6',
        to: 'f6',
      },
      {
        from: 'g7',
        to: 'f7',
      },
      {
        from: 'f6',
        to: 'f7',
      },
    ],
    goal: {
      type: 'checkmate',
      winner: 'red',
    },
    themes: ['checkmate', 'matein3', 'crushing', 'middlegame'],
    sourceGame: {
      gameId: 'hxq_00eed6ff437dad0cfb4c74fb',
      ply: 94,
      event: '2026年全国象棋团体赛',
      playedOn: '2026-03-31',
      result: '1-0',
      redName: '陕西省社会体育运动发展中心 李小龙',
      blackName: '新疆维吾尔自治区体育局 杨浩',
    },
  },
  {
    id: 'xq-mined-hxq_06a1d50388c3ae892103e9ee-39',
    variant: 'xiangqi',
    title: 'Black winning advantage',
    initial: {
      id: 'xq-mined-hxq_06a1d50388c3ae892103e9ee-39',
      board: {
        d1: {
          color: 'red',
          role: 'advisor',
        },
        e1: {
          color: 'red',
          role: 'general',
        },
        i1: {
          color: 'black',
          role: 'cannon',
        },
        e2: {
          color: 'red',
          role: 'advisor',
        },
        a3: {
          color: 'red',
          role: 'cannon',
        },
        b3: {
          color: 'black',
          role: 'cannon',
        },
        d3: {
          color: 'red',
          role: 'cannon',
        },
        e3: {
          color: 'red',
          role: 'elephant',
        },
        g3: {
          color: 'black',
          role: 'soldier',
        },
        a4: {
          color: 'red',
          role: 'soldier',
        },
        e4: {
          color: 'red',
          role: 'soldier',
        },
        i4: {
          color: 'red',
          role: 'soldier',
        },
        c6: {
          color: 'red',
          role: 'chariot',
        },
        d6: {
          color: 'black',
          role: 'horse',
        },
        a7: {
          color: 'black',
          role: 'soldier',
        },
        e7: {
          color: 'black',
          role: 'soldier',
        },
        i7: {
          color: 'black',
          role: 'soldier',
        },
        g8: {
          color: 'black',
          role: 'chariot',
        },
        c9: {
          color: 'red',
          role: 'horse',
        },
        e9: {
          color: 'black',
          role: 'advisor',
        },
        b10: {
          color: 'black',
          role: 'chariot',
        },
        c10: {
          color: 'black',
          role: 'elephant',
        },
        d10: {
          color: 'black',
          role: 'advisor',
        },
        f10: {
          color: 'black',
          role: 'general',
        },
        g10: {
          color: 'black',
          role: 'elephant',
        },
        h10: {
          color: 'red',
          role: 'chariot',
        },
      },
      status: {
        type: 'playing',
        turn: 'black',
      },
      moveNumber: 20,
      progressClock: 0,
      positionCounts: {
        'black|a3rc,a4rs,a7bs,b10bc,b3bc,c10be,c6rc,c9rh,d1ra,d10ba,d3rc,d6bh,e1rg,e2ra,e3re,e4rs,e7bs,e9ba,f10bg,g10be,g3bs,g8bc,h10rc,i1bc,i4rs,i7bs': 1,
      },
      lastMove: {
        to: 'c6',
        from: 'c5',
      },
    },
    solution: [
      {
        from: 'g3',
        to: 'g2',
      },
      {
        from: 'e3',
        to: 'c1',
      },
      {
        from: 'g2',
        to: 'f2',
      },
      {
        from: 'h10',
        to: 'g10',
      },
      {
        from: 'g8',
        to: 'g10',
      },
    ],
    goal: {
      type: 'winning-advantage',
      winner: 'black',
      centipawns: 917,
    },
    themes: ['winning', 'middlegame'],
    sourceGame: {
      gameId: 'hxq_06a1d50388c3ae892103e9ee',
      ply: 39,
      event: '2026年广东十虎VS山东十好汉对抗赛',
      playedOn: '2026-04-23',
      result: '0-1',
      redName: '广东十虎 梁雅让',
      blackName: '山东十好汉 李翰林',
    },
  },
  {
    id: 'xq-mined-hxq_09d8befd60e689880133928d-105',
    variant: 'xiangqi',
    title: 'Black mate in 4',
    initial: {
      id: 'xq-mined-hxq_09d8befd60e689880133928d-105',
      board: {
        d1: {
          color: 'red',
          role: 'advisor',
        },
        e1: {
          color: 'red',
          role: 'general',
        },
        f1: {
          color: 'red',
          role: 'advisor',
        },
        d2: {
          color: 'red',
          role: 'chariot',
        },
        e3: {
          color: 'red',
          role: 'cannon',
        },
        e4: {
          color: 'black',
          role: 'chariot',
        },
        f4: {
          color: 'black',
          role: 'horse',
        },
        c6: {
          color: 'black',
          role: 'elephant',
        },
        d8: {
          color: 'black',
          role: 'advisor',
        },
        e10: {
          color: 'black',
          role: 'general',
        },
      },
      status: {
        type: 'playing',
        turn: 'black',
      },
      moveNumber: 53,
      progressClock: 0,
      positionCounts: {
        'black|c6be,d1ra,d2rc,d8ba,e1rg,e10bg,e3rc,e4bc,f1ra,f4bh': 1,
      },
      lastMove: {
        to: 'e3',
        from: 'e7',
      },
    },
    solution: [
      {
        from: 'e4',
        to: 'e3',
      },
      {
        from: 'f1',
        to: 'e2',
      },
      {
        from: 'e3',
        to: 'i3',
      },
      {
        from: 'e1',
        to: 'f1',
      },
      {
        from: 'f4',
        to: 'h3',
      },
      {
        from: 'e2',
        to: 'd3',
      },
      {
        from: 'i3',
        to: 'i1',
      },
    ],
    goal: {
      type: 'checkmate',
      winner: 'black',
    },
    themes: ['checkmate', 'winning-material', 'crushing', 'endgame'],
    sourceGame: {
      gameId: 'hxq_09d8befd60e689880133928d',
      ply: 105,
      event: '1996年华能杯全国象棋个人赛',
      playedOn: '1996-10-28',
      result: '0-1',
      redName: '四川 黎德玲',
      blackName: '南京 高懿屏',
    },
  },
  {
    id: 'xq-mined-hxq_4a41e15e9d8a17414cf249ee-41',
    variant: 'xiangqi',
    title: 'Black winning advantage',
    initial: {
      id: 'xq-mined-hxq_4a41e15e9d8a17414cf249ee-41',
      board: {
        c1: {
          color: 'red',
          role: 'elephant',
        },
        e1: {
          color: 'red',
          role: 'general',
        },
        f1: {
          color: 'red',
          role: 'advisor',
        },
        g1: {
          color: 'red',
          role: 'elephant',
        },
        e2: {
          color: 'red',
          role: 'advisor',
        },
        c3: {
          color: 'red',
          role: 'cannon',
        },
        g3: {
          color: 'red',
          role: 'horse',
        },
        a4: {
          color: 'red',
          role: 'soldier',
        },
        e4: {
          color: 'red',
          role: 'soldier',
        },
        g4: {
          color: 'red',
          role: 'soldier',
        },
        i4: {
          color: 'red',
          role: 'soldier',
        },
        b5: {
          color: 'black',
          role: 'chariot',
        },
        a7: {
          color: 'black',
          role: 'soldier',
        },
        c7: {
          color: 'black',
          role: 'soldier',
        },
        g7: {
          color: 'black',
          role: 'soldier',
        },
        i7: {
          color: 'black',
          role: 'soldier',
        },
        a8: {
          color: 'black',
          role: 'horse',
        },
        c8: {
          color: 'red',
          role: 'cannon',
        },
        e8: {
          color: 'black',
          role: 'cannon',
        },
        c9: {
          color: 'red',
          role: 'chariot',
        },
        e9: {
          color: 'black',
          role: 'advisor',
        },
        f9: {
          color: 'black',
          role: 'horse',
        },
        c10: {
          color: 'black',
          role: 'elephant',
        },
        d10: {
          color: 'black',
          role: 'advisor',
        },
        f10: {
          color: 'black',
          role: 'general',
        },
      },
      status: {
        type: 'playing',
        turn: 'black',
      },
      moveNumber: 21,
      progressClock: 0,
      positionCounts: {
        'black|a4rs,a7bs,a8bh,b5bc,c1re,c10be,c3rc,c7bs,c8rc,c9rc,d10ba,e1rg,e2ra,e4rs,e8bc,e9ba,f1ra,f10bg,f9bh,g1re,g3rh,g4rs,g7bs,i4rs,i7bs': 1,
      },
      lastMove: {
        to: 'c9',
        from: 'd9',
      },
    },
    solution: [
      {
        from: 'a8',
        to: 'c9',
      },
    ],
    goal: {
      type: 'winning-advantage',
      winner: 'black',
      centipawns: 445,
    },
    themes: ['winning', 'winning-material', 'crushing', 'middlegame'],
    sourceGame: {
      gameId: 'hxq_4a41e15e9d8a17414cf249ee',
      ply: 41,
      event: '2026年第十届北美杯象棋锦标赛',
      playedOn: '2026-04-05',
      result: '1/2-1/2',
      redName: '金州 Son X Nguyen',
      blackName: '温哥华 刘凯',
    },
  },
];
