import { ARTICLE_OG_POSITIONS } from '../diagrams.js';
import type { XiangqiReplaySpec } from '../../xiangqi-replay.js';
import type { Article } from '../types.js';

// Split out of the champions article in 2026-08. That piece is about one
// country's title; this one is about a different competition with a different
// list of holders, and wedging the two together forced every reader to hold two
// title systems at once to follow either.

// 2025 · Shanghai, and the title leaves China
const C_BV0kkYY4: XiangqiReplaySpec = {
  iccs: "h2d2 g6g5 h0g2 h9g7 i0h0 i9h9 h0h4 h7i7 h4f4 b9c7 c3c4 b7a7 b0c2 a9b9 a0b0 b9b3 b2a2 b3b0 c2b0 a7a3 a2c2 c9e7 c2c3 h9h8 d2d7 h8h2 b0c2 a3a4 c4c5 h2g2 c3c6 e7c5 d7i7 c5e7 c2e1 g2d2 f4a4 g9i7 c0e2 d2d6 c6c0 c7b5 e1c2 g7f5 f0e1 f5g3 a4b4 d6d5 c2a3 b5d4 a3c4 e7c5 b4b6 g3f1 b6e6 d9e8 c0c1 f1h2 e3e4 g5g4 c1d1 d4e2 c4d2 e2d4 e6h6 h2f3 d2f3 d4b3 h6b6 d5d1 b6b3 g4f4 f3d2 f4e4 b3b9 e8d9 b9b4 e4e3 b4e4 d9e8 e4e3 i7g9 e3e6 i6i5 e6e5 c5e7 e5i5 d1c1 i5i6 c1c5 i3i4 c5g5 g0e2 g5e5 d2c4 e5e2 i6a6 e7c5 i4i5 e2e4 c4b2 e4e7 b2a4 e7c7 a6d6 c5a7 a4b6 g9e7 i5i6 e7c9 i6h6 c9e7 h6g6 e7c9 d6e6 c7b7 e6d6 b7c7 g6g7 c7b7 g7g8 b7c7 d6g6 c7b7 b6c4 b7c7 c4d6 c7d7 g8f8 e9d9 g6f6 d9e9 e0f0 e9d9 e1d2 c9e7 d0e1 e7c9 f8f9 e8f9 f6f9 d9d8 d6f5 d8e8 f5h6 c9e7 f9f8 e8e9 f8f7 a7c5 h6f5 d7d3 f5g7 e9d9 f7f9 d9d8 f9f6 d8d9 f0e0 d3d4 g7f5 d4d7 f6b6 d9e9 f5d6 e9d9 d6e4 d7d4 e4f6 d9d8 f6h7 d4d5 h7f8 d8e8 f8e6 e8e9 e6g7 e9d9 b6b9 d9d8 b9e9 d5d3 g7f9 d3f3 e1f0 f3e3 d2e1 e3f3 e9b9 d8e8 b9d9 f3f4 e0d0 f4f3 d9d5 f3f6 f9g7 f6f7 g7f5 f7f6 f5g3 e8e9 g3e4 f6f4 d5e5 e9f9 e5e6 f4f7 e4d6 f9f8 d0e0 f8f9 e1f2 f9f8 e0e1 f8f9 e6e5",
  red: "Lại Lý Huynh",
  black: "Fung Ka-chun",
  event: "2025 19th World Xiangqi Championship",
  resultText: "1-0",
  annotations: {
    byPly: {
      "31": {
        glyph: "?!",
        note: "inaccuracy: 5.4 win% given up, eval -0.11 after. The engine wanted the line in the sibling branch.",
        line: "c0e2 e7c5 d7i7 g9i7 f4a4 g2f2 a4d4 f2f7 d4d6 c7e8 d6c6 f7f5 c2a3 i7g9 c6c8 f5d5 c3b3 c5a7 b3b9 a7c9 a3c4 g9e7 b9b1 g7f5 c4b6",
        lineEval: "=",
      },
      "58": {
        glyph: "?!",
        note: "inaccuracy: 7.4 win% given up, eval +1.48 after. The engine wanted the line in the sibling branch.",
        line: "d5f5 e6d6 d4e2 c1f1 f5f1 c4d2 i7g9 d6a6 f1f3 g0e2 f3e3 a6i6 e3e2 i3i4 g5g4 i6g6 g4h4 i4i5 g9e7 g6b6 e7c9 d2c4 e2e4 c4a5 e4a4",
        lineEval: "+=",
      },
      "62": {
        glyph: "?!",
        note: "inaccuracy: 6.8 win% given up, eval +2.33 after. The engine wanted the line in the sibling branch.",
        line: "d4c2 c4d2 d5f5 e6a6 c2b0 e4e5 f5e5 a6a9 e8d9 a9d9 e9e8 d1b1 i7g5 d2b3 g4g3 b3a5 e5e7 d9d5 h2f3 e1f2 e7c7 b1e1 c5e7 e2c0 e7g9 g0e2 g9e7 e2c4 e7c9",
        lineEval: "+=",
      },
      "125": {
        glyph: "?!",
        note: "inaccuracy: 6.3 win% given up, eval +1.81 after. The engine wanted the line in the sibling branch.",
        line: "g6e6 e9d9 g8f8 b7c7 b6d5 c7d7 e6e5 a7c5 e1d2 d9d8 f8e8 f9e8 e5e8 d8d9 e8e9 d9d8 e9e5 c9a7 d0e1 d7b7 e1f2 b7b0 e0e1 b0b7 e5e8 d8d9 e8e6 d9d8 e6c6 b7i7 c6a6 i7d7",
        lineEval: "+-",
      },
      "126": {
        glyph: "?!",
        note: "inaccuracy: 5.7 win% given up, eval +2.53 after. The engine wanted the line in the sibling branch.",
        line: "a7c5 c4e5 b7i7 e5g4 e8d9 e0f0 i7f7 e1f2 c9e7 g6e6 f9e8 f0f1 f7f5 g4h6 f5f9 e6a6 f9f4 a6d6 e9f9 d0e1 f9e9 d6g6 e9f9 g8h8 f4f5 h6g8",
        lineEval: "+/-",
      },
      "139": {
        glyph: "?",
        note: "mistake: 10.8 win% given up, eval +0.79 after. The engine wanted the line in the sibling branch.",
        line: "f0e0 a7c5 f6g6 d9e9 f8g8 c5a7 d6f5 d7f7 f5h6 f7f4 e1f0 f4f3 g6d6 c9e7 e0d0 e8d9 g8h8 f3f8 h6g8",
        lineEval: "+-",
      },
      "140": {
        glyph: "??",
        note: "blunder: 20.8 win% given up, eval +3.44 after. The engine wanted the line in the sibling branch.",
        line: "c9e7 d6c4 a7c5 c4a5 e8f9 f6f9 d9d8 f9e9 d7c7 f0e0 c5a7 e1d0 a7c5 e9h9 d8e8 h9h5 e8d8 h5d5 d8e8 d5d6 e8e9 a5b3 c5a7 b3d4 c7c4 d4f5 c4e4 d0e1 a7c5",
        lineEval: "+=",
      },
      "145": {
        glyph: "??",
        note: "blunder: 29.5 win% given up, eval +0.81 after. The engine wanted the line in the sibling branch.",
        line: "f0e0 d7c7 f5d6 e8d8 f9e9 c7c0 e1d0 c0c7 e9e8 d8d9 d6c8 a7c5 e8e5 c7d7 e5c5 c9e7 c5i5 d9d8 i5i8 d8d9 i8e8 e7g9 e8e9 d9d8 e9g9 d7d2 g9g8 d8d9 g8g5 d9d8 c8a7 d2e2",
        lineEval: "+-",
      },
      "182": {
        glyph: "??",
        note: "blunder: 36.4 win% given up, eval +6.35 after. The engine wanted the line in the sibling branch.",
        line: "d5e5 e9b9 e5d5 b9b7 d8d9 g7e6 d9e9 b7b8 e7g5 b8b9 e9e8 e6g7 e8d8 b9b8 d8d9 b8b5 d9e9 b5b7 c5e7 b7b9",
        lineEval: "+=",
      },
      "183": {
        glyph: "??",
        note: "blunder: 36.1 win% given up, eval +0.56 after. The engine wanted the line in the sibling branch.",
        line: "g7e6 d3d7 e1d0 d7b7 e9c9 b7d7 c9c5 d8d9 c5f5 d7d6 f5e5 d6d7 e6g7 d7d2",
        lineEval: "+-",
      },
      "208": {
        glyph: "?!",
        note: "inaccuracy: 5.9 win% given up, eval +1.38 after.",
      },
      "212": {
        glyph: "??",
        note: "blunder: 15.7 win% given up, eval +4.00 after.",
      },
      "215": {
        glyph: "??",
        note: "blunder: 15.5 win% given up, eval +1.96 after.",
      },
      "216": {
        glyph: "??",
        note: "blunder: 31 win% given up, eval mate in 20 after.",
      },
    },
  },
};


export const xiangqiWorldChampionshipArticle: Article = {
  slug: 'xiangqi-world-championship',
  kind: 'article',
  publisher: 'mistboard',
  title: 'The Xiangqi World Championship',
  seoTitle: 'Xiangqi World Championship: Every Winner, and Why It Is Not the Senior Title',
  summary:
    'Every winner of the Xiangqi World Championship since 1990, why the Chinese national title is the harder one, and how a Vietnamese player took it out of China for the first time in 2025.',
  status: 'draft',
  publishedAt: '2026-08-28',
  audience:
    'Readers who have met the national champions and want to know what the international title is worth.',
  thumbnail: ARTICLE_OG_POSITIONS.xiangqi,
  intro: [
    {
      kind: 'paragraph',
      text:
        'The World Xiangqi Championship has been held roughly every two years since 1990, organised by the World Xiangqi Federation. English readers tend to assume it is the senior title, the way the world chess championship is. It is not.',
    },
    {
      kind: 'paragraph',
      text:
        'The Chinese national championship is the harder one to win, because almost everyone capable of winning either is Chinese and only a handful of them qualify for the world event. For its first thirty-five years the world title was, in practice, a smaller Chinese championship with guests.',
    },
  ],
  sections: [
    {
      heading: 'Every world champion, 1990 to 2025',
      blocks: [
        {
          kind: 'table',
          headers: ['Year', 'Host', 'Champion'],
          rows: [
            ['1990', 'Singapore', 'Lü Qin 吕钦'],
            ['1991', 'Kunming', 'Zhao Guorong 赵国荣'],
            ['1993', 'Beijing', 'Xu Tianhong 徐天红'],
            ['1995', 'Singapore', 'Lü Qin 吕钦'],
            ['1997', 'Hong Kong', 'Lü Qin 吕钦'],
            ['1999', 'Shanghai', 'Xu Yinchuan 许银川'],
            ['2001', 'Macau', 'Lü Qin 吕钦'],
            ['2003', 'Hong Kong', 'Xu Yinchuan 许银川'],
            ['2005', 'Paris', 'Lü Qin 吕钦'],
            ['2007', 'Macau', 'Xu Yinchuan 许银川'],
            ['2009', 'Xintai', 'Zhao Xinxin 赵鑫鑫 (banned for life, 2025)'],
            ['2011', 'Jakarta', 'Jiang Chuan 蒋川 (five-year ban, 2026)'],
            ['2013', 'Huizhou', 'Wang Tianyi 王天一 (convicted, banned)'],
            ['2015', 'Munich', 'Zheng Weitong 郑惟桐 (banned for life, 2025)'],
            ['2017', 'Manila', 'Wang Tianyi 王天一 (convicted, banned)'],
            ['2019', 'Vancouver', 'Xu Chao 许超 (banned for life, 2026)'],
            ['2022', 'Kuching', 'Wang Tianyi 王天一 (convicted, banned)'],
            ['2023', 'Houston', 'Meng Chen 孟辰 (six-month ban, 2025)'],
            ['2025', 'Shanghai', 'Lại Lý Huynh (Vietnam)'],
          ],
          caption:
            'Men\u2019s individual world champions. L\u00fc Qin has the most with five, across fifteen years. The bracketed notes are the Chinese Xiangqi Association\u2019s own published rulings.',
          highlightRows: [18],
        },
        {
          kind: 'paragraph',
          text:
            'Read down the champion column and the same pattern shows up that runs through the national list: every men\u2019s world champion from 2009 to 2023 is serving a ban. Three of them are banned for life, one was convicted in court, and the 2023 winner drew six months. The names stay because a list that dropped them would be a worse record of what happened.',
        },
        {
          kind: 'cta',
          buttons: [
            {
              label: 'The national title, and every champion since 1956',
              href: '/blog/xiangqi-champions',
              emphasis: 'secondary',
            },
          ],
        },
      ],
    },
    {
      heading: 'Shanghai, September 2025',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The 2025 championship was played in Shanghai over nine Swiss rounds with fifty-one players. It was won by L\u1ea1i L\u00fd Huynh of Vietnam, the first man from outside China to take the standard title in the thirty-five years the event has existed.',
        },
        {
          kind: 'xq-replay',
          spec: { ...C_BV0kkYY4 },
          caption:
            'L\u1ea1i L\u00fd Huynh vs Fung Ka-chun, 23 September 2025, from the championship he won. At 217 plies it is the longest game in either of these two articles.',
        },
        {
          kind: 'paragraph',
          text:
            'It is tempting to read the two facts together, as though the bans opened a door. That reading is too neat. L\u1ea1i L\u00fd Huynh has been on the world stage since 2015 and had already beaten most of the field before any of this happened, and Vietnam has been the second strongest xiangqi nation for a generation without much English notice.',
        },
        {
          kind: 'paragraph',
          text:
            'What 2025 did change is the answer to a question that had the same shape for thirty-five years. The world title had never left China. Now it has, in the same decade the sport spent voiding its own results, and those two things are worth keeping separate.',
        },
      ],
    },
  ],
};
