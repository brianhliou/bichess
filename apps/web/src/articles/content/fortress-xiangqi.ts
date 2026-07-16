import {
  FORTRESS_XIANGQI_ADVISOR_DIAGRAM,
  FORTRESS_XIANGQI_ADVISOR_DROP_DIAGRAM,
  FORTRESS_XIANGQI_CANNON_DIAGRAM,
  FORTRESS_XIANGQI_CHARIOT_DIAGRAM,
  FORTRESS_XIANGQI_ELEPHANT_DIAGRAM,
  FORTRESS_XIANGQI_ELEPHANT_DROP_DIAGRAM,
  FORTRESS_XIANGQI_GENERAL_DIAGRAM,
  FORTRESS_XIANGQI_HORSE_DIAGRAM,
  FORTRESS_XIANGQI_SOLDIER_DIAGRAM,
  FORTRESS_XIANGQI_START_BOARD,
  FORTRESS_XIANGQI_TREASURE_DIAGRAM,
} from '../../fortress-xiangqi-rules-diagrams.js';
import { playClosing } from '../diagrams.js';
import type { Article, ArticleBlock } from '../types.js';

export const fortressXiangqiArticle: Article = {
  slug: 'fortress-xiangqi',
  boardFamily: 'xiangqi',
  kind: 'rules',
  playableOnMistboard: true,
  title: 'Fortress Xiangqi Rules',
  summary:
    'Xiangqi with a pocket: every familiar piece moves as in xiangqi, plus crazyhouse-style drops and one new piece, the Treasure.',
  showSummaryOnPage: false,
  status: 'published',
  publishedAt: '2026-07-01',
  updatedAt: '2026-07-12',
  audience: 'Xiangqi and crazyhouse players who want a compact, decisive drop variant.',
  thumbnail: { kind: 'svg', svg: FORTRESS_XIANGQI_START_BOARD },
  intro: [
    {
      kind: 'paragraph',
      text: 'Fortress Xiangqi is an [Xiangqi](/rules/xiangqi) variant with a reserve, designed by Brian H. Liou in 2026 as a Mistboard original. Every familiar piece moves exactly as it does in xiangqi, and one new piece, the Treasure, joins the back rank. The new rule is the [crazyhouse](https://en.wikipedia.org/wiki/Crazyhouse) loop: capture a piece, hold it in hand, and drop it back into the fight.',
    },
    {
      kind: 'paragraph',
      text: 'Captured material never leaves the game, so every capture becomes future pressure. A quiet trade can turn into a later attack, and a fortress can be built, then cracked open by the very material it gave away. The result is fair, decisive, comeback-rich, and short.',
    },
  ],
  sections: [
    {
      heading: 'Board and palaces',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The board is 7 files (a to g) by 8 ranks, with a river between ranks 4 and 5. Each side has a 3 by 3 palace, but the two palaces sit in opposite corners: Red holds the bottom left (a1 to c3) and Black holds the top right (e6 to g8). The whole setup has 180 degree rotational symmetry.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_START_BOARD,
          caption:
            'The starting position. Red holds the bottom-left palace, Black the top-right, and the Treasure starts on each palace corner.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'Red moves first. This is open information: both players see the whole board and both reserves.',
        },
      ],
    },
    {
      heading: 'The pieces',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Every standard piece moves exactly as it does in [xiangqi](/rules/xiangqi). In the diagrams below, a green dot marks a quiet destination, a green ring marks a capture, and a red cross marks a point the piece cannot reach.',
        },
        {
          kind: 'paragraph',
          text: '**Chariot:** slides any distance orthogonally, the strongest piece on the board. Here it can take the soldier on d7.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_CHARIOT_DIAGRAM,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**Cannon:** moves like the Chariot on open lines, but captures only by jumping exactly one screen piece, friend or enemy. On the right, the cannon on d2 takes the chariot on d7 over its own soldier screen.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_CANNON_DIAGRAM,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**Horse:** steps one point orthogonally, then one point diagonally outward. If the orthogonal step is occupied, that whole direction is blocked. On the right, the soldier on d5 takes away both forward destinations.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_HORSE_DIAGRAM,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**Elephant:** moves exactly two points diagonally, is blocked by an occupied midpoint (the elephant eye), and can never cross the river.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_ELEPHANT_DIAGRAM,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**Advisor:** moves one point diagonally and stays inside the palace.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_ADVISOR_DIAGRAM,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**General:** moves one point orthogonally and stays inside the palace. One xiangqi rule retires itself here: because the palaces sit in opposite corners, the two generals never share a file, so the facing-generals rule never comes into play.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_GENERAL_DIAGRAM,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**Soldier:** moves one point forward or sideways, never backward. It has the sideways step from the opening move, where a xiangqi soldier earns it only by crossing the river. Every Fortress soldier is a veteran: the war is already on.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_SOLDIER_DIAGRAM,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**Treasure:** the one new piece. It steps one point in any of the eight directions, all game. It never promotes and is never confined. Think of it as a queen that only steps one square: a strong palace defender early, and a flexible attacker once it advances or is dropped.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_TREASURE_DIAGRAM,
          caption:
            'The Treasure steps one point in any of the eight directions. Here it has eight moves, including the capture on e5.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'There are no promotions and no past-river changes. Soldiers move the same on both sides of the river; the river only stops the Elephant, which never crosses it.',
        },
      ],
    },
    {
      heading: 'Capture, hold, drop',
      blocks: [
        {
          kind: 'paragraph',
          text: 'When you capture an enemy piece, it flips to your color and enters your hand. The hand is open information: it can hold any number of pieces, and they can wait there for any number of turns. On your turn you either move a piece on the board, or spend the move to drop one piece from hand onto an empty point.',
        },
        {
          kind: 'paragraph',
          text: 'Attackers drop anywhere, including deep in the enemy half: the Chariot, Horse, Cannon, Soldier, and Treasure. Defenders drop only where they could legally stand.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_ADVISOR_DROP_DIAGRAM,
          caption: 'A captured Advisor drops only onto an empty point of your own palace.',
        } as ArticleBlock,
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_ELEPHANT_DROP_DIAGRAM,
          caption: 'A captured Elephant drops onto any empty point in your own half.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'A dropped piece is live immediately. A drop may give check or deliver checkmate, and a dropped Soldier can step sideways wherever it lands. The one limit is the usual one: no move, drop included, may leave your own general in check.',
        },
      ],
    },
    {
      heading: 'How games end',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Checkmate wins. A player left with no legal move loses by stalemate, the xiangqi convention. There is no fifty-move or no-progress draw and no shogi-style impasse rule: the game continues until one side breaks.',
        },
        {
          kind: 'paragraph',
          text: 'Repetition is governed by the chasing rule. When the same position occurs for the third time, the game is adjudicated: if one side gave check with every move of the repeating cycle, that side loses. You cannot perpetual-check your way out of a lost game. A repetition that neither side is forcing with checks is an honest standoff and is drawn, the only drawn result in the game.',
        },
        {
          kind: 'paragraph',
          text: 'Games can also end by timeout, resignation, or abandonment.',
        },
      ],
    },
    {
      heading: 'What makes it Fortress Xiangqi',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Most chess variants trade fairness for decisiveness. Drops break that tradeoff: they keep the game fair while cutting draws and shortening play, and your captured material comes back at your own king, so every exchange is a real decision. Cheap pieces parachuted behind enemy lines deliver many of the finishes, which is the good kind of explosive.',
        },
        {
          kind: 'paragraph',
          text: 'The rules were locked by engine testing rather than taste. Both-side attacker drops won out over a same-side variant that built beautiful fortresses but ran to 246-ply grinds. In engine sampling of the final rules, about 11 percent of games were drawn, one win in five came from behind, and the average game ran 83 plies.',
        },
      ],
    },
    {
      heading: 'A sample game',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Step through this engine game played under the production rules. Both sides spend their reserves early and often: watch Red build the attack from hand with the cannon drop at move 13 and the treasure drop at move 16, the advisor drop back into its own palace to defend at move 19, and the finish, where the mating pieces arrive by parachute.',
        },
        {
          kind: 'fortress-xiangqi-replay',
          spec: {
            red: 'Fairy-Stockfish',
            black: 'Fairy-Stockfish',
            event: 'Engine self-play · 450 ms per move',
            moves:
              'e1e4 b7b6 e4f4 d8f6 f2f3 c8d8 f1e3 b8c6 e3c4 c6e7 c4b6 a8b8 b6d7 b8b7 d7c5 b7c7 P@d7 c7c5 d7d8 N@c3 P@c2 c3e2 g1e1 c5e5 C@a8 e7c6 d8e8 f8e8 a8g8 e8f8 T@d6 e5e4 d6c6 f8g8 f4f7 f6d8 A@b3 P@a3 c6d5 e4e7 a2a3 C@a6 f7f4 a6a1 P@f8 g8f8 P@f7 f8g8 f7e7 e2f4 R@e8 P@f8 N@f6 C@f7 e8f8 g8f8 e7e8 f8g8 P@f8',
            resultText:
              'Red checkmates with the soldier drop P@f8. The dropped soldier attacks the general from the side, the soldier on e8 guards the drop point, and Black\'s own cannon and soldier block the escape squares.',
          },
        } as ArticleBlock,
      ],
    },
    playClosing({
      heading: 'Play on Mistboard',
      lead: 'Fortress Xiangqi is playable on Mistboard. Play against an engine or challenge a friend. No account required.',
      playLabel: 'Play vs computer',
      playHref: '/?play=computer&gameSpecId=fortress-xiangqi',
      secondary: [
        {
          label: 'Challenge a friend',
          href: '/?play=friend&gameSpecId=fortress-xiangqi',
          emphasis: 'secondary',
        },
      ],
    }),
  ],
};
