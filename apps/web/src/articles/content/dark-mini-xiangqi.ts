import {
  MINI_XIANGQI_CANNON_PAIR,
  MINI_XIANGQI_DARK_THUMBNAIL,
  MINI_XIANGQI_DARK_TRIPTYCH,
  MINI_XIANGQI_HORSE_PAIR,
} from '../diagrams.js';
import type { Article, ArticleBlock } from '../types.js';

export const darkMiniXiangqiArticle: Article = {
    slug: 'dark-mini-xiangqi',
    boardFamily: 'xiangqi',
    kind: 'rules',
    playableOnMistboard: true,
    title: 'Dark Mini Xiangqi',
    summary:
      'Mini Xiangqi under Fog of War: each side sees only the points its pieces reach on the 7×7 board, and the general falls by capture.',
    showSummaryOnPage: false,
    status: 'published',
    publishedAt: '2026-05-30',
    audience:
      'Fog Xiangqi readers who want the smaller experimental ruleset Mistboard is testing first.',
    thumbnail: { kind: 'svg', svg: MINI_XIANGQI_DARK_THUMBNAIL },
    intro: [
      {
        kind: 'paragraph',
        text:
          '[Mini Xiangqi](/rules/mini-xiangqi) played with Fog of War: each player sees only their own pieces and the enemy pieces their army can reach. The board is 7 by 7, and the game ends by capturing the opposing general. If you know Mini Xiangqi, the sections below explain only what fog changes.',
      },
    ],
    sections: [
      {
        heading: 'Board and fog',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The board and army are the same as Mini Xiangqi. Fog of War then hides the board: you see your own pieces and every point they can reach, and everything else is fog.',
          },
          {
            kind: 'raw-svg',
            svg: MINI_XIANGQI_DARK_TRIPTYCH,
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              'The opening position from three angles. Red and Black each see only their own side clearly, while the server holds the true board in the middle. Vision is recomputed after every move, so opening a line or losing a piece immediately changes what each player knows.',
          },
          {
            kind: 'paragraph',
            text:
              'You never see enemy pieces outside your vision, whether a fogged point is empty, or the identity of a shrouded blocker.',
          },
        ],
      },
      {
        heading: 'Winning and draws',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Capture the general to win. There is no checkmate and no check warning, so you can move into danger, leave your general exposed, or let the generals face each other across an open file.',
          },
          {
            kind: 'paragraph',
            text:
              'There is no stalemate draw: if the side to move has no legal move, it loses. With no check to freeze you, this almost never happens. Draws are judged from the true position, not either player\'s view: the game draws on threefold repetition, and also after 60 plies (30 moves by each side) without a capture.',
          },
        ],
      },
      {
        heading: 'Edge cases',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Two pieces interact with fog in ways worth seeing up close.',
          },
          { kind: 'sub-heading', text: 'Cannons' },
          {
            kind: 'paragraph',
            text:
              'A cannon captures by jumping exactly one screen and landing on the first enemy piece beyond it. Under fog the rule is **screen shrouded, target revealed**: the screen shows as occupied but unidentified, the empty gap behind it stays fogged, and the capturable target is revealed as the enemy piece.',
          },
          {
            kind: 'raw-svg',
            svg: MINI_XIANGQI_CANNON_PAIR,
          } as ArticleBlock,
          { kind: 'sub-heading', text: 'Horses' },
          {
            kind: 'paragraph',
            text:
              'A horse moves one point orthogonally and then one diagonally outward, and cannot move if the leg point in between is occupied. If a hidden piece blocks the leg, the leg point shows as occupied but unidentified, and the destinations behind it drop out of your view.',
          },
          {
            kind: 'raw-svg',
            svg: MINI_XIANGQI_HORSE_PAIR,
          } as ArticleBlock,
        ],
      },
      {
        heading: 'A complete game under fog',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'To see the whole army work under Fog of War, step through a game where Mistboard’s engine, Misty DMX, plays both sides. Each ply is shown three ways: what Red can see, the server’s true board, and what Black can see.',
          },
          {
            kind: 'mxq-replay',
            spec: {
              views: 'triptych',
              moves:
                'b1b4 f7f5 a2b2 f5d5 b4d4 c6b6 e2e3 c7b5 e1f3 b5d4 e3e4 d4b5 e4d4 d5c5 b2b3 b6c6 b3b4 b7b4 a1b1 b4a4 b1b5 a4a3 b5b1 a6b6 g2f2 a3a1 b1a1 a7a1 f2e2 a1a3 c2b2 c5b5 g1g4 e6f6 f1f6 e7d5 d4d5 d6d5 b2b3 a3a7 b3b4 b5c5 f6e6 g6g5 g4g2 g5g4 e6e3 g4g3 g2g3 g7g3 e3g3 d7d6 g3g7 a7g7 f3e1 g7g4 b4a4 g4c4 e2e3 c5c1 d1c1 c4c1',
              red: 'Misty DMX',
              black: 'Misty DMX',
              event: 'Misty DMX · Fog of War self-play',
              resultText:
                'Black’s cannon takes the horse on c1; the Red general must recapture, and the waiting chariot runs the open c-file to capture it. Black wins.',
              caption:
                'Misty DMX plays both sides of Dark Mini Xiangqi. Step through all 62 plies and compare the same position under Red’s fog, the server’s truth, and Black’s fog.',
            },
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Play status',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Dark Mini Xiangqi is open for alpha play. You can play Misty DMX, create an invite, or find an opponent from the homepage play panel by choosing Dark Mini Xiangqi in the Variant row.',
          },
          {
            kind: 'cta',
            buttons: [
              {
                label: 'Play Misty DMX',
                href: '/?play=computer&gameSpecId=dark-mini-xiangqi',
                emphasis: 'primary',
              },
              {
                label: 'Create invite',
                href: '/?play=friend&gameSpecId=dark-mini-xiangqi',
                emphasis: 'secondary',
              },
              { label: 'Back to all rules', href: '/rules', emphasis: 'secondary' },
            ],
          } as ArticleBlock,
        ],
      },
    ],
};
