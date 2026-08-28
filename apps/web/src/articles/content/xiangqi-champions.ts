import { ARTICLE_OG_POSITIONS } from '../diagrams.js';
import type { Article } from '../types.js';

// Games are verified records, not transcriptions. Each one was pulled from
// dpxq, replayed through our own rules kernel, and cross-checked against
// independent uploads of the same game before it was embedded. Provenance and
// the per-game notes live in docs-private/games/.

// 1960 national championship, round 3, Beijing. Three independent dpxq uploads
// carry byte-identical mainlines.
const YANG_HU_1960 =
  'h2e2 h9g7 h0g2 g6g5 i0h0 i9h9 c3c4 h7h3 b0c2 c9e7 b2b9 a9b9 a0b0 b7b3 c2d4 f9e8 c4c5 b9b4 d4b3 h3e3 d0e1 h9h0 g2h0 g7f5 b0b1 e3c3 c5c6 e6e5 e2g2 f5g3 h0i2 g3e4 c0e2 c3c5 g2h2 c5b5 h2h4 e4c3 h4h9 e8f9 b1b2 b5b3 i2g3 g5g4 e2g4 c3e4 g3e2 b4c4 b2b0 b3e3 c6d6 e4c3 h9h6 f9e8 h6e6 c3a2 b0d0 e5e4 e6e3 e4e3 e2g3 c4g4 d0d2 a2c1 d2d1 c1a2 d1d2 a2c1 d2d1 c1b3 g3f1 e3e2 d1d3 b3c1 d3d1 c1a2 g0i2 g4g2 i3i4 g2i2 f1g3 i2g2 g3e4 g2g4 d1a1 g4e4 a1a2 e7g5 d6c6 e8f7 e0d0 a6a5 a2c2 e2e1 f0e1 e4i4 c2e2 f7e8 e2e5 i4c4 e1d2 c4c6 e5g5 c6a6 g5g4 g9e7 g4e4 i6i5 e4e5 i5i4 e5e4 i4i3 e4e3 a6i6 e3e5 i6d6 d0d1 d6d3 e5a5 e8f7 a5e5 d9e8 e5e7 i3h3 a3a4 h3g3 a4a5 g3f3 e7e2 d3d5 a5a6 d5d6 a6a7 d6d7 a7a8 d7d8 a8a9 d8d9 e2i2 d9a9 i2i9 e8f9 i9i4 a9a1 d1d0 f3f2 i4f4 f2f1 f4f7 f9e8 f7b7 e9d9 b7b4 a1a7 b4f4 a7d7';

// 1966 national championship. Hu as defending champion against the era's
// sharpest attacking player.
const HU_WANG_1966 =
  'g0e2 h9i7 h0g2 c6c5 b2c2 c9e7 b0a2 b9c7 a0b0 a9b9 b0b4 b7a7 b4b9 c7b9 i0i1 h7g7 i1b1 b9c7 h2h1 i9h9 h1c1 c7d5 b1b4 g7g3 b4g4 h9h3 i3i4 a7a3 g4d4 h3h5 c1b1 d9e8 c2d2 c5c4 c3c4 d5c7 b1i1 a6a5 f0e1 i6i5 e3e4 a3a4 d4d3 g3g5 i4i5 g5i5 a2c3 a4e4 d3d4 e4e5 c3e4 h5h3 d4d6 i7h5 c4c5 h5f6 e4f2 i5c5 i1f1 h3c3 e0f0 f6g8 g2f4 e5f5 f2e4 c3f3 e4f2 f3i3 f0e0 c5e5 d6c6 f5f7 f1f0 i3i0 f0g0 g8f6 f4h3 e5c5 g0f0 g6g5 e2g0 i0i3 f0f6 g5g4 c0e2 g4h4 f6f3 i3i5 h3g1 i5g5 g1i2 h4g4 f3b3 g4f4 f2h3 g5f5 d2c2 f4e4 c2c3 a5a4 i2g3 f5f4 h3g5 a4b4 b3a3 e7g5 c6c5 g9e7 c5c6 b4b3 c3c4 b3a3 c4f4 e4f4 c6c4 f4f3 g3i4 a3b3 i4h6 f7h7 c4i4 f3e3 i4i7 h7f7 h6g8 e9d9 i7i3 c7d5 i3i4 f7f4 i4i6 d5c7 i6f6 f4e4 f6f4 e4e5 f4e4 e3f3 e4d4 e5d5 d4d3 d5d7 d3b3 c7d5 b3b9 d9d8 b9b5 d5c7 b5b6 d8d9 e2c0 d7d8 g8f6 f3e3 g0e2 e3d3 b6c6 c7a8 c6e6 a8c9 e6e5 c9d7 e5g5 e8f7 g5b5';

// 1995 national championship. Guangdong's next champion against the man who
// broke Hu's run fifteen years earlier.
const XU_LIU_1995 =
  'h2e2 h9g7 h0g2 b9c7 c3c4 g6g5 b0c2 i9h9 i0i1 c9e7 b2b4 g7f5 i1h1 a9a8 e2d2 h9h8 c0e2 h7g7 h1f1 f5g3 f1f7 g3h5 a0a1 h8f8 a1f1 f8f7 f1f7 d9e8 f7f4 a6a5 f4h4 b7b5 b4b1 g7h7 h4f4 a5a4 a3a4 a8a4 c4c5 a4f4 g2f4 g5g4 c5b5 h5f4 b5b6 c6c5 b6c6 c7b9 b1b8 b9d8 c2d4 f4d3 b8c8 c5c4 c8c4 h7h4 c6d6 e6e5 c4c8 h4d4 d2d4 e8d7 e2g4 e5e4 e3e4 d3f2 e0e1 f2e4 d6d7 d8f7 c8c6 f9e8 d7d8 e7c5 c6e6 e8f9 d8c8 e4f2 g0e2 f2h1 i3i4 h1g3 e6e3 e9e8 d4e4 e8f8 e4f4 f8e8 e1d1 f7d6 c8b8 d6f5 e3e5 f5h6 e5h5 c5e7 d0e1 e7g5 e1f2 g9i7 f0e1 e8e7 e2g0 f9e8 b8c8 e8d7 c8d8 d7e8 g0i2 e8d9 f4b4 e7f7 h5h0 h6i4 h0f0 f7e7 b4b0 g3f1 b0e0 e7f7 e1d0 i4g3 d1e1 i6i5 f0g0';

// Engine annotations, produced by scripts/annotate-game.mjs against the same
// Pikafish path the review page uses (1M nodes a position) and converted to
// ICCS. Judged plies only: a glyph, the eval after the move, and the line the
// engine wanted instead. Nothing here is hand-written.
const YANG_HU_1960_NOTES = {
    byPly: {
      17: {"glyph":"?!","cp":-74,"line":"d4e6 g7e6 e2e6 b3b4 e6a6 b4b5 c4c5 b5b4 a6a9 b4e4 e3e4 b9a9 g2i1 h3h4 b0b3 c6c5 h0h3 a9a6 g0e2 a6h6 b3e3 c5c4 i1g2"},
      28: {"glyph":"?!","cp":39,"line":"f5d4 h0g2 d4b3 g2e3 c3g3 b1b2 b4f4 e2e6 b3d4 e6a6 d4f3 e3f1 g3a3 b2a2 a3b3 a2f2 b3b5 a6a9 e7c9 a9a3 b5e5 a3e3 g5g4 f1h2 g4g3 g0e2 c9e7 c6d6 f4f7 e2g0 f7f6 d6e6"},
      29: {"glyph":"?!","cp":-19,"line":"e2h2 e5e4 h2h1 e4e3 h1f1 b4c4 b1c1 f5g3 h0g2 e3d3 f1g1 g3e4 c1c2 c4c6 c2e2 e4g3 e2e5 c3a3 c0e2 d3c3 g1g3 c3b3 g2e3 a3e3 e5e3 b3b2 e1d0 a6a5 i3i4"},
      37: {"glyph":"?!","cp":-73,"line":"h2h9 g9i7 i2g1 e4c5 g1f3 e5e4 f3d2 e4e3 d2c4 e3d3 h9h5 b5b7 h5h3 d3c3 b1d1 b7b3 h3b3 c3b3 d1d5 a6a5 c6d6 b4b5 c4d2"},
      45: {"glyph":"?","cp":-159,"line":"g3f1 b4b5 e2g4 b3i3 b2b5 c3b5 a3a4 b5d4 c6b6 d9e8 h9h1 i6i5 h1i1 i3d3 f1h2 e5e4 g4i2 d3e3 e1f2 e4f4 i1i5 d4b3 i5i4 b3d2 e0e1 e3e5 e1d1 d2b1 b6c6"},
      66: {"glyph":"?","cp":-81,"line":"c1b3 g3f1 e3e2 d1d3 b3c1 d3d1 c1a2 g0i2 g4g2 f1e3 g2i2 e3d5 i2i3 d1a1 e2e1 f0e1 i3i0 e1f0 i0i2 a1d1 i2i3 d1f1 i3a3 f1a1 i6i5 f0e1 a3a5 e0f0"},
      67: {"glyph":"?","cp":-243,"line":"d1a1 a2c3 a1c1 c3b5 c1c5 b5a3 c5c3 a3c4 g0e2 e3e2 g3e2 c4d6 c3c6 d6e4 c6a6 g4g2 a6a2 e4g5 e2c1 g2g3 a2i2 g3a3 i3i4 e8f7 i4i5"},
      93: {"glyph":"?!","cp":-209,"line":"c6c7 e2e1 f0e1 e4e1 a2d2 d9e8 d2b2 e9f9 b2b9 f9f8 b9g9 e1e3 g9i9 g5i7 c7c8 e3a3 i9i7 a3a0 d0d1"},
      96: {"glyph":"?","cp":-95,"line":"e4e1 c2c5 e1e3 c5d5 d9e8 d5a5 e8f9 a5d5 e3e4 d5d9 e9e8 d9d6 e4i4 a3a4 i6i5 a4a5 i4c4 a5b5 i5i4 d6d8 e8e9 d8d9 e9e8 b5b6 i4h4 d9d8 e8e9 d8d9 e9e8 d9d3 g9e7"},
      103: {"glyph":"?!","cp":-138,"line":"e5a5 g9e7 a3a4 c6c4 a5a6 i6i5 a4a5 i5i4 a5b5 i4h4 a6e6 h4g4 b5b6 g4f4 d0e0 c4c0 e0e1 c0d0 e6d6 f4e4 b6c6 d0c0 e1f1 c0c3 d6e6"},
      105: {"glyph":"?!","cp":-220,"line":"g5g9 e8f9 g9g2 a6d6 g2i2 d9e8 d0d1 e8f7 i2f2 d6d3 f2f7 d3a3 f7f6 a3a1 d1d0 a1i1 f6a6 i1i5 d0d1 f9e8 a6a9 e8d9 a9a6 i5i1 d1d0 i1i0 d0d1 i0i5 a6e6 d9e8 d1e1 i5i2"},
      130: {"glyph":"?!","cp":-260,"line":"f3e3 e2f2 d3d5 a5a6 e3d3 d2e1 e8f9 e1f0 f7e8 f0e1 d3e3 e1d2 d5d6 a6a7 d6d7 a7a8 d7d8 a8a9 d8d9 d1e1"},
      131: {"glyph":"?!","cp":-351,"line":"a5a6 d5d6 a6a7 d6d7 a7a8 d7d8 a8a9 d8d9 e2h2 f3e3 a9b9 d9b9 h2h9 e8f9 h9h3 b9b3 h3h4 e3d3 h4e4 f9e8 e4h4"},
      151: {"glyph":"??","cp":null,"mate":-7,"line":"f7f3 a1a7 d0d1 a7b7 f3e3 b7f7 e3c3 f7d7 c3e3 d7d6 e3a3 e9d9 a3a9 d9d8 a9a2"},
    },
  engine: 'Pikafish, 1,000,000 nodes per position',
} as const;

const HU_WANG_1966_NOTES = {
    byPly: {
      36: {"glyph":"?!","cp":66,"line":"d5b4 b1i1 a6a5 i1i6 g6g5 c4c5 b4a2 c0a2 e7c5 d4d5 g9e7 d5d6 g5g4 e2g4 i7h9 g4e2 h9g7 i6i9 e7g9 a2c0 a3a4 f0e1 g3g6 d6d4 c5e7"},
      37: {"glyph":"?!","cp":10,"line":"e3e4 g3b3 f0e1 b3b9 d4d3 a3a4 a2c3 a4a1 d3d6 b9c9 c3a4 a6a5 a4b2 h5d5 d6b6 a1a0"},
      45: {"glyph":"?!","cp":-45,"line":"c4c5 e7c5 d3d6 i5i4 i1i7 g9i7 d6c6 c7d9 d2b2 h5h7 c6c5 h7b7 b2c2 b7b3 c2c3 i7g9 c3e3"},
      52: {"glyph":"?!","cp":-49,"line":"g6g5 d2c2 c7b5 c4c5 e7c5 d4d6 g5g4 d6e6 c5e7 e6b6 b5d4 c2d2 d4e2 c0e2 e5e2 e0f0 h5e5 e4c3 g4g3 c3e2 e5e2 i1i7 i5c5 g2i3 g9i7 i3h5 c5c0 f0f1 c0c1 f1f0 e2g2"},
      58: {"glyph":"?!","cp":-71,"line":"h3g3 c5c6 g3g2 c6c7 i5i3 d6d3 i3i2 e0f0 i2f2 d2f2 f6e4 d3f3 g2h2 i1g1 g6g5 f3f4 e4f2 f4f2 h2f2 e1f2 g9i7 g1e1 e5e1 d0e1 e7g9"},
      65: {"glyph":"?!","cp":-173,"line":"f4d3 f5f1 d3c5 c3c5 f0f1 g6g5 d6b6 g8h6 d2d4 h6f5 d4c4 c5e5 b6c6 c7d9 c6b6 f5e3 c4e4 d9c7 b6b3 c7d5 f1f0 e3g2 f0e0 g2f4 e2g0 e8d9 b3a3"},
      71: {"glyph":"?!","cp":-223,"line":"f1f0 f5f2 d2f2 g8h6 d6d4 h6g4 d4e4 g4f2 e1f2 e5f5 f4g2 i3i0 f2e1 g6g5 g2e3 f5c5 e3c4 a5a4 c4e3 a4a3 e4b4 e6e5"},
      72: {"glyph":"??","cp":-27,"line":"g8f6 f1f0 f5f2 d2f2 f6g4 f2f1 i3i1 f4g6 e5e3 c6c7 i1f1 c7c4 f1g1 c4f4 a5a4 g6h4 e6e5 h4i2 e5e4 f4f9 e8f9 i2g1 e4f4 g1i2 f9e8"},
      75: {"glyph":"??","cp":-407,"line":"d2c2 e5f5 e2g0 i0i4 f4d3 f5f0 e1f0 c7d9 c6e6 g6g5 e6g6 g8i7 g6a6 f7f3 a6a5 i4c4 c2d2 f3e3 a5e5 c4c2 e5e3 c2d2 f2e4 d9b8 g0e2 d2c2 d0e1 b8d7 d3b4 c2b2 b4d3"},
      76: {"glyph":"?!","cp":-292,"line":"f7f2 d2f2 i0g0 f2f0 g8f6 f4d5 g0g5 d5c3 e5e3 c3d1 e3e4 d1c3 g5c5 c6c5 e7c5 f0f5 e4e5 e0f0 f6g8 c3e4 e9d9"},
      78: {"glyph":"??","cp":103,"line":"f6g4 f2e4 i0h0 h3f2 g4h2 c6c3 h2f1 g0f0 c7b5 c3b3 f7i7 b3i3 h0h4 f2g4 b5d4 g4e5 e6e5 e4f2 e5e4 e2g4"},
      79: {"glyph":"?!","cp":0,"line":"d2d6 c5e5 d6f6 f7g7 g0f0 g7f7 f6f4 e5e3 f2h1 e6e5 f4b4 a5a4 b4b6 i0h0 h3f2 g6g5 b6b5 a4b4 c6c3 c7b5 c3e3 b5d4"},
      134: {"glyph":"?!","cp":107,"line":"f4d4 f6f4 d4d8 g8f6 c7a8 f4e4 a8c9 e4e3 c9d7 e3e6 d8c8 e6c6 c8c9 e1f2 g5i7 f6e4 i7g9 d0e1 c9a9 c6a6 a9c9 e4d6 c9c3 d6b5 c3g3"},
      137: {"glyph":"?!","cp":57,"line":"f4b4 e5b5 b4b3 e8d7 b3e3 f9e8 e3e6 b5b8 g8i9 d9e9 e0f0 e8f7 i9h7 d7e8 e6b6 c7d9 b6h6 d9c7 h7i9"},
      138: {"glyph":"?!","cp":121,"line":"b3c3 e4a4 e5f5 a4a9 d9d8 g8h6 f5c5 e1f0 e3d3 h6f5 e6e5 f5g7 c5d5 a9a4 d8d9 a4a7 c7b5 a7a9 d9d8"},
      141: {"glyph":"?!","cp":43,"line":"d4b4 d5d8 g8i9 d8d7 b4b3 g5i7 b3a3 i7g9 a3a5 f3e3 i9g8 d9d8 g8f6 e8f7 a5a9 f7e8 f6h5 e3f3 h5f4 e6e5 f4d3 e5e4 d3b4 e4e3 e2c0 c7b5 a9c9"},
      142: {"glyph":"?!","cp":111,"line":"d5d8 g8h6 c7a8 d3f3 a8c9 f3b3 d8d5 b3b9 d5e5 b9a9 e5c5 e2c0 c5c4 g0e2 c4f4 a9b9 f4f7 h6f5 f7i7 f5d4 i7f7 d4e6 g5i7 e6f4 i7g9 f4d5 f7h7 d5b6 h7i7"},
      152: {"glyph":"?","cp":300,"line":"f3e3 g0e2 e3d3 g8f6 c7d5 b6b9 d9d8 f6g8 d5c7 b9a9 d3e3 g8h6 e3d3 c0a2 c7d5 a9a8 d8d9 a8a5 d5c7 a5a9 d9d8 a2c0 e6e5 a9c9 c7b5 c9c8"},
      164: {"glyph":"?!","cp":528,"line":"d3e3 g5b5 d8c8 b5b7 e7c9 f6d7 e8d7 b7d7 c8d8 e1d2 f9e8 d7e7 e3f3 e7e8 d8d7 e8i8 d9e9"},
    },
  engine: 'Pikafish, 1,000,000 nodes per position',
} as const;

export const xiangqiChampionsArticle: Article = {
  slug: 'xiangqi-champions',
  kind: 'article',
  publisher: 'mistboard',
  title: 'Who Is the Greatest Xiangqi Player?',
  seoTitle: 'The Greatest Xiangqi Players: Chinese Chess Champions, 1956 to Now',
  summary:
    'Nine hundred years of Chinese chess, and a championship only sixty-nine years old. Hu Ronghua, the men who came before the title existed, and the decade that was struck from the record.',
  status: 'draft',
  publishedAt: '2026-08-27',
  audience:
    'English-speaking chess players who know the world chess champions by heart and cannot name a single xiangqi player.',
  thumbnail: ARTICLE_OG_POSITIONS.xiangqi,
  intro: [
    {
      kind: 'paragraph',
      text: 'Ask who the greatest chess player was and you get an argument with a shape to it: Fischer or Kasparov or Carlsen, measured against a title that has passed hand to hand since 1886. Ask the same about xiangqi and most English answers stop at the question.',
    },
    {
      kind: 'paragraph',
      text: 'There is an answer, and almost nobody disputes it. Hu Ronghua won fourteen national championships, took the first at fifteen and the last at fifty-five, and held the title for nine straight years while the men chasing him were the strongest players their provinces had ever produced.',
    },
    {
      kind: 'paragraph',
      text: 'What is harder to explain is why that answer is only sixty-nine years old, in a game that was already being played in its modern form when the Song dynasty fell. And why the decade after Hu has largely been struck from the record.',
    },
  ],
  sections: [
    {
      heading: 'The one everyone agrees on',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Hu Ronghua was born in Shanghai in 1945 and entered his first national championship in 1960, aged fifteen. The reigning champion was Yang Guanlin of Guangdong, who had won three of the four titles played so far and whom the sport called 第一国手, the first hand of the nation.',
        },
        {
          kind: 'paragraph',
          text: 'They met in round three. Hu had Black.',
        },
        {
          kind: 'xq-replay',
          spec: {
            iccs: YANG_HU_1960,
            red: 'Yang Guanlin 杨官璘',
            black: 'Hu Ronghua 胡荣华',
            event: '1960 National Championship, round 3, Beijing',
            perspective: 'black',
            resultText: 'Yang resigns, 0-1',
            annotations: YANG_HU_1960_NOTES,
          },
          caption:
            'Yang Guanlin vs Hu Ronghua, 28 October 1960. Hu is a horse and an elephant ahead by move 43. Yang wins almost all of it back through the endgame, and loses anyway.',
        },
        {
          kind: 'paragraph',
          text: 'The received English account of this game says Hu sacrificed a horse in the opening. The moves do not support it. On move 6 it is Yang who drives a cannon in and takes the horse, and Hu answers by taking the cannon: a trade Yang initiated, half a point in Black\'s favour. What actually decides the game is slower and less quotable. Hu builds a winning material edge in the middlegame, Yang claws nearly all of it back over the next thirty moves, and Hu converts anyway. A fifteen-year-old out-lasting the best endgame player in the country is a better story than a trap.',
        },
        {
          kind: 'paragraph',
          text: 'Hu won the title that year and did not give it up until 1980. Twenty years later, at fifty-five, he won it again. No chess player has a comparable span at the top of a national championship, and only Lasker\'s twenty-seven years as world champion is in the same conversation.',
        },
      ],
    },
    {
      heading: 'Nine centuries without a scoreboard',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Xiangqi reached its modern form at the end of the Northern Song: sixteen pieces a side, nine files by ten ranks, the river, the palace, the general and advisors confined to it. By the Southern Song it was played everywhere, by Li Qingzhao and Wen Tianxiang among others.',
        },
        {
          kind: 'paragraph',
          text: 'No game records survive from any of it. Nine hundred years of the game, and not one result.',
        },
        {
          kind: 'paragraph',
          text: 'What does survive, from the Ming onward, is manuals. 橘中秘 (Secrets Inside the Tangerine) was printed in 1632 and became the most reprinted xiangqi text of the Ming and Qing. 梅花谱 (The Plum Blossom Manual) was written under Kangxi by Wang Zaiyue, a poor man who played to pass the time and produced the foundational treatment of the screen-horse defence. Four great Qing endgame collections followed, including 百局象棋谱 of 1801 with its hundred and seven positions named after proverbs.',
        },
        {
          kind: 'paragraph',
          text: 'You can name the authors. You cannot say who was strongest, because nobody was keeping score.',
        },
      ],
    },
    {
      heading: 'The age of chess kings',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The first era with contested titles ran through the 1920s and 1930s, and it had no federation. Regional matches were organised by newspapers and provincial bodies, and the winners were given names rather than trophies.',
        },
        {
          kind: 'paragraph',
          text: 'In September 1930 a match between East China and South China was played in Hong Kong: Zhou Deyu and Lin Yixian of Shanghai against Li Qingquan and Feng Jingru of Guangzhou. Sixteen games, drawn. The next year East played North in Shanghai, and Zhou Deyu scored highest. North China was five provinces and East China two, so he became 七省棋王, Chess King of Seven Provinces.',
        },
        {
          kind: 'paragraph',
          text: 'Later that year Huang Songxuan won the Guangdong provincial championship and, with Lu Hui, Feng Jingru and Li Qingquan, became one of the 华南四大天王, the Four Heavenly Kings of South China. Huang then played Zhou Deyu twenty games and finished one ahead. Guangdong crowned him 九省棋王, Chess King of Nine Provinces. A title race settled by nickname inflation is not a system, but it was the closest the game had to one.',
        },
        {
          kind: 'paragraph',
          text: 'The best story of the era belongs to Peng Shusheng, born 1874, known in the northwest as 西北棋圣. At fifty-eight he travelled east to Beiping, passed a teahouse advertising "北国棋王 Na Jianting receiving challengers", walked in, and won the first two games. Na arranged an eleven-game rematch on quieter ground and finished behind again.',
        },
        {
          kind: 'paragraph',
          text: 'Xie Xiaxun, who organised both regional matches, is the figure worth knowing. He played Western chess well enough to win a five-nation tournament at Shamian in 1936 with eighteen wins, one loss and one draw. In October 1937 he went to Southeast Asia as a national envoy and raised war funds through simultaneous displays, blindfold play and games with human pieces. In September 1939 he drew a game with Zhou Enlai in Chongqing and they named it 共抒国难, bearing the national crisis together. He died in 1987, aged ninety-nine.',
        },
      ],
    },
    {
      heading: '1956: the question finally gets an answer',
      blocks: [
        {
          kind: 'paragraph',
          text: 'In August 1956 the State Sports Commission made xiangqi an official sport and published the first competition rules. That December, in Beijing, the first national championship was played. Xiangqi was the only competitive event; go and Western chess were demonstrations. Yang Guanlin won.',
        },
        {
          kind: 'paragraph',
          text: 'For the first time the game had a standing, annual, adjudicated answer to who was best. It has been played fifty-six times since, missing 1961 and 1963 to the famine, 1967 to 1973 to the Cultural Revolution, 1976 to Mao\'s death, 2021 and 2022 to the pandemic, and 2024 for want of a sponsor.',
        },
        {
          kind: 'table',
          headers: ['Player', 'National titles', 'Years'],
          rows: [
            ['Hu Ronghua 胡荣华', '14', '1960, 1962, 1964-66, 1974-79, 1983, 1985, 1997, 2000'],
            ['Xu Yinchuan 许银川', '6', '1993, 1996, 1998, 2001, 2006, 2009'],
            ['Lü Qin 吕钦', '5', '1986, 1988, 1999, 2003, 2004'],
            ['Li Laiqun 李来群', '4', '1982, 1984, 1987, 1991'],
            ['Yang Guanlin 杨官璘', '4', '1956, 1957, 1959, 1962'],
            ['Zhao Guorong 赵国荣', '4', '1990, 1992, 1995, 2008'],
            ['Liu Dahua 柳大华', '2', '1980, 1981'],
            ['Li Yiting 李义庭', '1', '1958'],
            ['Xu Tianhong 徐天红', '1', '1989'],
            ['Tao Hanming 陶汉明', '1', '1994'],
            ['Yu Youhua 于幼华', '1', '2002'],
            ['Sun Yongzheng 孙勇征', '1', '2011'],
            ['Wang Yubo 王禹博', '1', '2025'],
          ],
          caption:
            'Multiple winners of the national individual championship, 1956 to 2025. Yang shared the 1962 title with Hu. Champions currently serving competition bans are covered separately below.',
        },
        {
          kind: 'paragraph',
          text: 'The line the table hides is a rivalry between two cities. Guangdong produced Yang Guanlin, then Lü Qin, then Xu Yinchuan, and reaches back past 1956 to Huang Songxuan and the Four Heavenly Kings. Shanghai produced Hu Ronghua, alone, and he held the country off by himself for twenty years. The 1960 game above is that collision at its exact moment of handover.',
        },
        {
          kind: 'paragraph',
          text: 'Six years later Hu was the man being chased. Wang Jialiang of Heilongjiang, called the Northeast Tiger and the sharpest attacking player of the era, was the one doing it.',
        },
        {
          kind: 'xq-replay',
          spec: {
            iccs: HU_WANG_1966,
            red: 'Hu Ronghua 胡荣华',
            black: 'Wang Jialiang 王嘉良',
            event: '1966 National Championship',
            perspective: 'red',
            resultText: 'Black resigns, 1-0',
            annotations: HU_WANG_1966_NOTES,
          },
          caption:
            'Hu Ronghua vs Wang Jialiang, 25 April 1966. Eighty-three moves, and messier than the 1960 game: our engine finds three outright blunders in it, against one in the game that made Hu champion.',
        },
        {
          kind: 'paragraph',
          text: 'Guangdong got its answer eventually. Xu Yinchuan won his first national title at eighteen, second only to Hu\'s fifteen, and spent the 1990s and 2000s as the best player in the country not named Hu Ronghua. Here he is beating Liu Dahua, the man who finally ended Hu\'s run in 1980.',
        },
        {
          kind: 'xq-replay',
          spec: {
            iccs: XU_LIU_1995,
            red: 'Xu Yinchuan 许银川',
            black: 'Liu Dahua 柳大华',
            event: '1995 National Championship',
            perspective: 'red',
            resultText: 'Black resigns, 1-0',
          },
          caption: 'Xu Yinchuan vs Liu Dahua, 11 October 1995.',
        },
      ],
    },
    {
      heading: 'The world title, and why it counts for less',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The World Xiangqi Championship has been held roughly every two years since 1990, organised by the World Xiangqi Federation. English readers tend to assume it is the senior title. It is not. The Chinese national championship is harder to win, because almost everyone capable of winning either is Chinese and only a handful of them qualify for the world event.',
        },
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
            ['2023', 'Houston', 'Meng Chen 孟辰'],
            ['2025', 'Shanghai', 'Lại Lý Huynh (Vietnam)'],
          ],
          caption:
            'Men\'s individual world champions. Lü Qin has the most with five. The bracketed notes are the Chinese Xiangqi Association\'s own published rulings.',
          highlightRows: [18],
        },
        {
          kind: 'paragraph',
          text: 'Lü Qin holds the record with five world titles across fifteen years, a career that in any other era would be the headline and instead reads as a long second place behind Hu.',
        },
      ],
    },
    {
      // PENDING BRIAN'S CALL. This section overrides the 2026-07-10 posture
      // decision that parked the match-fixing saga as "research dossier only,
      // never publishes". That call predates the April 2026 ban round and the
      // Vietnam result, and it was made for a YouTube script rather than a
      // reference page. Every claim here is from the CXA's own published
      // rulings or from Caixin. Cut this section and section 7 stands alone.
      heading: 'The decade that was struck',
      blocks: [
        {
          kind: 'paragraph',
          text: 'In March 2023 a public argument between two grandmasters produced a leaked recording, and the recording produced an investigation. What it found has removed most of a generation from the sport.',
        },
        {
          kind: 'paragraph',
          text: 'In September 2024 the Chinese Xiangqi Association confirmed that Wang Tianyi, three times world champion and the highest-rated player in the game, had taken bribes to fix results. In January 2025 it disciplined forty-one more players, handing lifetime bans and stripping the titles of Zheng Weitong, Zhao Xinxin and Wang Yang, all three of whom had won gold at the Hangzhou Asian Games. In September 2025 a court in Hangzhou convicted six grandmasters, with sentences from one to four and a half years. In April 2026 the association banned Hong Zhi, Xie Jing and Xu Chao for life, Shen Peng for eight years and Jiang Chuan for five.',
        },
        {
          kind: 'paragraph',
          text: 'Caixin\'s summary of the scale is that every national champion from 2012 to 2023 has now been penalised. Read the world championship table above and the same pattern holds: every men\'s world champion from 2009 through 2022 is serving a ban.',
        },
        {
          kind: 'paragraph',
          text: 'The names are in the tables because the tables would otherwise be wrong. These are published rulings from the sport\'s own governing body, not allegations, and a reference that quietly omitted them would be out of date rather than neutral.',
        },
      ],
    },
    {
      heading: 'Shanghai, September 2025',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The 2025 World Xiangqi Championship was played in Shanghai over nine Swiss rounds with fifty-one players. It was won by Lại Lý Huynh of Vietnam, the first man from outside China to take the standard title in the thirty-five years the event has existed.',
        },
        {
          kind: 'paragraph',
          text: 'It is tempting to read the two facts together, as though the bans opened a door. That reading is too neat. Lại Lý Huynh has been on the world stage since 2015 and had already beaten most of the field before any of this happened, and Vietnam has been the second strongest xiangqi nation for a generation without much English notice.',
        },
        {
          kind: 'paragraph',
          text: 'Still, the sixty-nine years since 1956 divide cleanly. For fifty of them the question had a clear answer and it was usually Hu Ronghua. For the next ten it had an answer that has since been withdrawn. And in 2025 the answer left China for the first time.',
        },
      ],
    },
  ],
};
