import {
  MINI_XIANGQI_SOLDIER_DIAGRAM,
  MINI_XIANGQI_START_BOARD,
  relatedClosing,
} from '../diagrams.js';
import type { Article, ArticleBlock } from '../types.js';

export const miniXiangqiArticle: Article = {
    slug: 'mini-xiangqi',
    boardFamily: 'xiangqi',
    kind: 'rules',
    title: 'Mini Xiangqi',
    summary:
      'Mini Xiangqi rules, the 7×7 primer behind Dark Mini Xiangqi: no advisors or elephants, no river, sideways soldiers, and checkmate to win.',
    showSummaryOnPage: false,
    status: 'published',
    publishedAt: '2026-05-31',
    audience:
      'Mistboard readers who want the open-information Mini Xiangqi baseline before adding fog.',
    thumbnail: { kind: 'svg', svg: MINI_XIANGQI_START_BOARD },
    intro: [
      {
        kind: 'paragraph',
        text:
          'Mini Xiangqi was invented in 1973 by Shigenobu Kusumoto of Osaka, Japan. Xiangqi itself is many centuries older: see [Xiangqi rules](/rules/xiangqi). Mini Xiangqi is a simplified, reduced version of it, with a smaller board, fewer pieces, and no river.',
      },
      {
        kind: 'paragraph',
        text:
          'This page describes the open-information base game. Mini Xiangqi is not playable on Mistboard; this is reference only.',
      },
    ],
    sections: [
      {
        heading: 'Board and setup',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Mini Xiangqi is xiangqi compressed onto a 7 by 7 board with a smaller army. The advisors and elephants are dropped and there is no river, but each general still keeps a 3 by 3 palace.',
          },
          {
            kind: 'raw-svg',
            svg: MINI_XIANGQI_START_BOARD,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Piece movement',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Every piece except the soldier moves exactly as it does in [xiangqi](/rules/xiangqi).',
          },
          {
            kind: 'paragraph',
            text:
              '**Soldier:** a soldier moves and captures one point forward or sideways, never backward. With no river to cross, it has that sideways freedom from its very first move, unlike a soldier on the full xiangqi board.',
          },
          {
            kind: 'raw-svg',
            svg: MINI_XIANGQI_SOLDIER_DIAGRAM,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              'Facing generals are illegal here too. The two generals may never sit on the same open file with nothing between them, so a move that would expose that line is not allowed.',
          },
        ],
      },
      {
        heading: 'Winning and draws',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Checkmate wins. As in xiangqi, a player who has no legal move loses rather than drawing by stalemate, and perpetual check or perpetual chase is not a free draw: a player who repeats an endless attack loses instead.',
          },
          {
            kind: 'paragraph',
            text:
              'A game is drawn when neither side has enough material to checkmate, when a long run of moves passes with no capture (xiangqi caps this much like chess’s fifty-move rule), or by a repetition that breaks none of the perpetual rules. These outcomes follow from the position, not from one player choosing to stop.',
          },
        ],
      },
      {
        heading: 'A complete game',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Mini Xiangqi has no canon of famous human games, so to watch the full army work together, step through a game in which Fairy-Stockfish, a strong open-source engine, plays both sides with full information. Notice how fast the chariots and cannons open lines: on a tight 7 by 7 board with no river, the generals come under fire far sooner than in full xiangqi.',
          },
          {
            kind: 'mxq-replay',
            spec: {
              moves:
                'b1b4 b7b5 a2b2 e6f6 g2f2 e7f5 b4b3 c6c5 g1g4 g6g5 b3a3 a6b6 a3d3 c5d5 a1a7 g5g4 d3a3 b6a6 f1g1 g4f4 e1g2 f4g4 f2f3 f6e6 e2e3 g7g6 c2c3 d5d4 c3d3 g4g3 f3g3 f7g7 d3d4 b5a5 a7b7 g6f6 g3f3 g7g1 c1b3 f5d4 b3d4 a5d5 d1c1 d5c5 a3d3 g1f1 b7b4 d7e7 b4b7 d6c6 d4c6 e7d7 d2e2 f6f7 b7b5 f7f5 e3e4 a6b6 b5b6 f5f3 g2e3 f3f6 b6b5 c7a6 e4d4 e6d6 b5b6 c5g5 b6a6 g5g1 c1c2 f1f2 e2f2 d7e7 f2g2 g1d1 d3d2 f6f2 g2f2 d1d4 c6d4 d6d5 d4f5',
              red: 'Fairy-Stockfish',
              black: 'Fairy-Stockfish',
              event: 'Engine self-play · depth 10',
              resultText:
                'Red’s horse leaps to f5 and checkmates the black general on e7. Red wins.',
            },
          } as ArticleBlock,
        ],
      },
      relatedClosing({
        heading: 'Where to next',
        lead: 'Mini Xiangqi is not one of the games you can play here. Xiangqi is: the full 9 by 10 game this one reduces, against an engine or a friend.',
        links: [
          {
            label: 'Play xiangqi',
            href: '/?play=computer&gameSpecId=xiangqi',
            emphasis: 'primary',
          },
        ],
      }),
    ],
};
