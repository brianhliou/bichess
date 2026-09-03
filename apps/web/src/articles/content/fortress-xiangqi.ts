import {
  FORTRESS_XIANGQI_ADVISOR_DIAGRAM,
  FORTRESS_XIANGQI_CANNON_DIAGRAM,
  FORTRESS_XIANGQI_DROP_REGIONS_DIAGRAM,
  FORTRESS_XIANGQI_CHARIOT_DIAGRAM,
  FORTRESS_XIANGQI_ELEPHANT_DIAGRAM,
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
    'A compact Xiangqi variant with captured pieces in reserve, piece drops, and one new piece: the Treasure.',
  showSummaryOnPage: false,
  status: 'published',
  publishedAt: '2026-07-01',
  updatedAt: '2026-09-03',
  audience: 'Xiangqi and crazyhouse players who want a compact, decisive drop variant.',
  thumbnail: { kind: 'svg', svg: FORTRESS_XIANGQI_START_BOARD },
  intro: [
    {
      kind: 'paragraph',
      text: 'Fortress Xiangqi is a compact [Xiangqi](/rules/xiangqi) variant designed by Brian H. Liou in 2026 as a Mistboard original. It keeps the familiar pieces, adds one new piece called the Treasure, and gives each player an open reserve. Capture an enemy piece and you can later drop it back as your own.',
    },
    {
      kind: 'paragraph',
      text: 'Captured material stays in the game, so every exchange changes both the board and the reserves. A defensive trade now may supply the attacker you need later.',
    },
    {
      kind: 'paragraph',
      text: 'Shigenobu Kusumoto, working in Osaka, invented [Mini Xiangqi](/rules/mini-xiangqi) in 1973. A Japanese designer took a Chinese game and built it a smaller board, the same move he made for his own country’s game with minishogi. Fortress Xiangqi runs that trade in the other direction. Shogi has had drops for centuries and xiangqi never has, so this is what xiangqi looks like when it borrows them.',
    },
  ],
  sections: [
    {
      heading: 'Board and setup',
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
          text: 'The Chariot, Cannon, Horse, Elephant, Advisor, and General move as they do in [xiangqi](/rules/xiangqi). The Soldier is the one standard piece with a changed move, and the Treasure is new. In the diagrams below, a green dot marks a quiet destination, a green ring marks a capture, and a red cross marks a point the piece cannot reach.',
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
          text: '**Soldier:** moves one point forward, never backward. Once it crosses the river it may also step one point sideways, exactly as in xiangqi. The Treasure is the other piece the river holds back: it never crosses at all.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_SOLDIER_DIAGRAM,
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**Treasure:** the one new piece. It steps one point in any of the eight directions and never promotes. It roams its own half freely, but it never crosses the river, moving or dropping. It is the piece you are storming for, and it stays in the fortress.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_TREASURE_DIAGRAM,
          caption:
            'Left, the Treasure has all eight steps, including the capture on e4. Right, standing on the last rank of its own half, the three squares across the river are closed to it.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'There are no promotions. The river matters three ways: the Soldier gains its sideways step by crossing it, and neither the Elephant nor the Treasure may cross it at all.',
        },
      ],
    },
    {
      heading: 'Capture, hold, drop',
      blocks: [
        {
          kind: 'paragraph',
          text: 'When you capture any piece other than the General, it changes to your color and enters your reserve. Both reserves are open information, have no size limit, and keep pieces for as long as needed. On your turn, either move a piece on the board or drop one piece from your reserve onto an empty point. Generals are never captured or held in reserve.',
        },
        {
          kind: 'paragraph',
          text: 'Chariots, Horses, Cannons, and Soldiers may drop on any empty point. Advisors, Elephants, and Treasures keep their normal territory restrictions.',
        },
        {
          kind: 'raw-svg',
          svg: FORTRESS_XIANGQI_DROP_REGIONS_DIAGRAM,
          caption:
            'Where a captured piece may land. The Chariot, Horse, Cannon and Soldier drop on any empty point; the Elephant and the Treasure are held to your own half, and the Advisor to your own palace.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'A dropped piece is live immediately. A drop may give check or deliver checkmate, and a Soldier dropped past the river arrives with its sideways step already earned. The one limit is the usual one: no move, drop included, may leave your own general in check.',
        },
      ],
    },
    {
      heading: 'How games end',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Checkmate wins. A player with no legal move also loses, even when not in check. There is no fifty-move or no-progress draw.',
        },
        {
          kind: 'paragraph',
          text: 'On the third occurrence of the same position, a player who gave check on every one of their moves in the repeating cycle loses. If neither player was the sole perpetual checker, the repetition is drawn.',
        },
        {
          kind: 'paragraph',
          text: 'Games can also end by timeout, resignation, or abandonment.',
        },
      ],
    },
    {
      heading: 'A sample game',
      blocks: [
        {
          kind: 'paragraph',
          text: 'This engine game shows both uses of the reserve: an Elephant drops back into its own half to defend, while most of Red’s attack is built from parachuted pieces. Note the Treasure on a1, which never leaves home.',
        },
        {
          kind: 'fortress-xiangqi-replay',
          spec: {
            red: 'Fairy-Stockfish',
            black: 'Fairy-Stockfish',
            event: 'Engine self-play · 2.5 s per move',
            moves:
              'e1e4 b7b6 e4f4 d8f6 f2f3 b8c6 f1e3 c8d8 e3c4 a8c8 g1e1 c8c7 e1e6 c6b4 c4b6 c7c6 e6c6 b4c6 R@c5 R@d6 P@f5 c6b8 f5f6 d6b6 f6e6 N@f6 e6f6 b6f6 c5c8 d8d2 N@c5 P@d8 c8b8 d2d5 N@e6 P@e7 e6c7 d5d4 c7d5 f6f4 d5f4 f7f6 R@d5 d4c4 b8d8 C@b5 E@b3 b5d5 f4d5 R@d6 d8d7 d6d7 c5d7 R@d8 C@f4 g8f7 d5f6 f8g8 f4g4 g8f8 R@f5 f7e6 P@g8 f8f7 P@g6 e6f5 f6d5 f5g6 g4f4 P@e5 d7e5 f7f6 P@f5 f6e6 f4e4',
            resultText:
              'Red mates with the cannon to e4. The cannon fires up the e-file over its own horse on e5, and the soldier on f5 covers f6, the only square the general could still reach inside its palace.',
          },
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'This game was chosen from twenty engine games played the same way. All twenty are in the [companion study](/study/NUVBVjFf), one chapter each, with a note on where the engine’s evaluation says the game turned.',
        },
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
