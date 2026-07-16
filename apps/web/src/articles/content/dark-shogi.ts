import {
  createInitialShogiState,
  createShogiPiece,
  getShogiPlayerView,
  type ShogiBoard,
  type ShogiColor,
  type ShogiHandRole,
  type ShogiPlayerView,
  type ShogiSquare,
  shogiSquareOf,
} from '@mistboard/game';
import { renderShogiBoardSvg, shogiHandKomaSvg } from '../../shogi-render.js';
import type { Article, ArticleBlock } from '../types.js';

// ── Fog diagram builders ─────────────────────────────────────────────────────
// Built from the real fog view (getShogiPlayerView) + the real renderer, so the
// diagrams show exactly what the server would send a player. The in-article boards
// are thunks (they follow the live appearance picker via shogiAppearanceChanged);
// the thumbnail bakes the kanji/wood default.

function allShogiSquares(): ShogiSquare[] {
  const squares: ShogiSquare[] = [];
  for (let file = 1; file <= 9; file += 1) {
    for (let rankIndex = 0; rankIndex < 9; rankIndex += 1) {
      squares.push(shogiSquareOf(file, rankIndex));
    }
  }
  return squares;
}

const EVERY_SQUARE = allShogiSquares();

function truthView(board: ShogiBoard, perspective: ShogiColor = 'black'): ShogiPlayerView {
  return {
    id: 'diagram',
    perspective,
    board,
    hand: {},
    visibleSquares: EVERY_SQUARE,
    legalMoves: [],
    status: { type: 'playing', turn: 'black' },
    moveNumber: 1,
  };
}

function placeSvg(svg: string, x: number, y: number, width: number, height = width): string {
  return svg.replace(
    '<svg ',
    `<svg x="${x}" y="${y}" width="${width}" height="${height}" `,
  );
}

function boardRowSvg(boards: readonly { label: string; svg: string }[], boardSize: number): string {
  const pad = 18;
  const gap = boards.length === 3 ? 20 : 34;
  const labelY = 24;
  const boardY = 42;
  const width = pad * 2 + boardSize * boards.length + gap * (boards.length - 1);
  const height = boardY + boardSize + 16;
  return `<svg class="shogi-article-pair" viewBox="0 0 ${width} ${height}" role="img" xmlns="http://www.w3.org/2000/svg">
<rect x="0" y="0" width="${width}" height="${height}" rx="10" class="shogi-article-panel-bg" fill="var(--site-panel, #fff8e8)" stroke="var(--site-border-soft, rgba(29,37,34,0.12))"/>
${boards
  .map((board, index) => {
    const x = pad + index * (boardSize + gap);
    return `<text x="${x + boardSize / 2}" y="${labelY}" text-anchor="middle" class="shogi-article-pair-label" fill="#3a2c14" font-family="system-ui, sans-serif" font-size="18" font-weight="600">${board.label}</text>
${placeSvg(board.svg, x, boardY, boardSize)}`;
  })
  .join('\n')}
</svg>`;
}

function pairedBoardSvg(input: {
  leftLabel: string;
  leftSvg: string;
  rightLabel: string;
  rightSvg: string;
}): string {
  return boardRowSvg(
    [
      { label: input.leftLabel, svg: input.leftSvg },
      { label: input.rightLabel, svg: input.rightSvg },
    ],
    340,
  );
}

function triptychBoardSvg(input: {
  leftLabel: string;
  leftSvg: string;
  middleLabel: string;
  middleSvg: string;
  rightLabel: string;
  rightSvg: string;
}): string {
  return boardRowSvg(
    [
      { label: input.leftLabel, svg: input.leftSvg },
      { label: input.middleLabel, svg: input.middleSvg },
      { label: input.rightLabel, svg: input.rightSvg },
    ],
    226,
  );
}

function pieceInHand(role: ShogiHandRole, color: ShogiColor, x: number, y: number): string {
  return placeSvg(shogiHandKomaSvg(role, color, color === 'black'), x, y, 38);
}

function fogHandBand(x: number, y: number, width: number): string {
  return `<rect x="${x}" y="${y}" width="${width}" height="38" rx="7" class="shogi-hand-fog-band" fill="rgba(46, 43, 37, 0.82)" stroke="#3a523f" stroke-width="1.2"/>`;
}

function handPrivacySvg(): string {
  const width = 760;
  const height = 214;
  const panelWidth = 224;
  const gap = 26;
  const leftX = 18;
  const middleX = leftX + panelWidth + gap;
  const rightX = middleX + panelWidth + gap;
  const topY = 60;
  const bottomY = 136;
  return `<svg class="shogi-hand-privacy-svg" viewBox="0 0 ${width} ${height}" role="img" xmlns="http://www.w3.org/2000/svg">
<rect x="0" y="0" width="${width}" height="${height}" rx="10" class="shogi-article-panel-bg" fill="var(--site-panel, #fff8e8)" stroke="var(--site-border-soft, rgba(29,37,34,0.12))"/>
<text x="${leftX + panelWidth / 2}" y="24" text-anchor="middle" class="shogi-article-pair-label" fill="#3a2c14" font-family="system-ui, sans-serif" font-size="18" font-weight="600">Black sees</text>
<text x="${middleX + panelWidth / 2}" y="24" text-anchor="middle" class="shogi-article-pair-label" fill="#3a2c14" font-family="system-ui, sans-serif" font-size="18" font-weight="600">True hands</text>
<text x="${rightX + panelWidth / 2}" y="24" text-anchor="middle" class="shogi-article-pair-label" fill="#3a2c14" font-family="system-ui, sans-serif" font-size="18" font-weight="600">White sees</text>
<g transform="translate(${leftX} 0)">
<text x="0" y="${topY - 10}" class="shogi-hand-row-label" fill="#736650" font-family="system-ui, sans-serif" font-size="13" font-weight="600">White hand hidden</text>
<rect x="0" y="${topY}" width="${panelWidth}" height="48" rx="7" class="shogi-hand-row" fill="#fbf6ea" stroke="#d2c4ac" stroke-width="1.5"/>
${fogHandBand(8, topY + 5, panelWidth - 16)}
<text x="0" y="${bottomY - 10}" class="shogi-hand-row-label" fill="#736650" font-family="system-ui, sans-serif" font-size="13" font-weight="600">Black hand visible</text>
<rect x="0" y="${bottomY}" width="${panelWidth}" height="48" rx="7" class="shogi-hand-row" fill="#fbf6ea" stroke="#d2c4ac" stroke-width="1.5"/>
${pieceInHand('S', 'black', 8, bottomY + 5)}
${pieceInHand('P', 'black', 50, bottomY + 5)}
${pieceInHand('P', 'black', 92, bottomY + 5)}
</g>
<g transform="translate(${middleX} 0)">
<text x="0" y="${topY - 10}" class="shogi-hand-row-label" fill="#736650" font-family="system-ui, sans-serif" font-size="13" font-weight="600">White hand</text>
<rect x="0" y="${topY}" width="${panelWidth}" height="48" rx="7" class="shogi-hand-row" fill="#fbf6ea" stroke="#d2c4ac" stroke-width="1.5"/>
${pieceInHand('R', 'white', 8, topY + 5)}
<text x="0" y="${bottomY - 10}" class="shogi-hand-row-label" fill="#736650" font-family="system-ui, sans-serif" font-size="13" font-weight="600">Black hand</text>
<rect x="0" y="${bottomY}" width="${panelWidth}" height="48" rx="7" class="shogi-hand-row" fill="#fbf6ea" stroke="#d2c4ac" stroke-width="1.5"/>
${pieceInHand('S', 'black', 8, bottomY + 5)}
${pieceInHand('P', 'black', 50, bottomY + 5)}
${pieceInHand('P', 'black', 92, bottomY + 5)}
</g>
<g transform="translate(${rightX} 0)">
<text x="0" y="${topY - 10}" class="shogi-hand-row-label" fill="#736650" font-family="system-ui, sans-serif" font-size="13" font-weight="600">White hand visible</text>
<rect x="0" y="${topY}" width="${panelWidth}" height="48" rx="7" class="shogi-hand-row" fill="#fbf6ea" stroke="#d2c4ac" stroke-width="1.5"/>
${pieceInHand('R', 'white', 8, topY + 5)}
<text x="0" y="${bottomY - 10}" class="shogi-hand-row-label" fill="#736650" font-family="system-ui, sans-serif" font-size="13" font-weight="600">Black hand hidden</text>
<rect x="0" y="${bottomY}" width="${panelWidth}" height="48" rx="7" class="shogi-hand-row" fill="#fbf6ea" stroke="#d2c4ac" stroke-width="1.5"/>
${fogHandBand(8, bottomY + 5, panelWidth - 16)}
</g>
</svg>`;
}

const START_STATE = createInitialShogiState('diagram');
const START_TRUE_VIEW = truthView(START_STATE.board);
const START_FOG_VIEW = getShogiPlayerView(START_STATE, 'black');
const START_WHITE_VIEW = getShogiPlayerView(START_STATE, 'white');
const START_FOG_SVG = renderShogiBoardSvg(START_FOG_VIEW, {
  showFog: true,
  pieceSet: 'kanji',
  boardTheme: 'wood',
  showCoords: false,
});

// Black rook on an open file: it sees up to the first enemy piece (the pawn on
// 5c) and no further, so the king hiding behind it on 5a stays in the fog.
const FIELD_OF_FIRE_ROOK = createShogiPiece('black', 'R');
const FIELD_OF_FIRE_BOARD: ShogiBoard = {
  '5i': createShogiPiece('black', 'K'),
  '5e': FIELD_OF_FIRE_ROOK,
  '5c': createShogiPiece('white', 'P'),
  '5a': createShogiPiece('white', 'K'),
};
const FIELD_OF_FIRE_TARGETS: ShogiSquare[] = ['5d', '5c'];
const FIELD_OF_FIRE_TRUE_VIEW = truthView(FIELD_OF_FIRE_BOARD);
const FIELD_OF_FIRE_VIEW = getShogiPlayerView(
  {
    id: 'diagram',
    board: FIELD_OF_FIRE_BOARD,
    hands: { black: {}, white: {} },
    status: { type: 'playing', turn: 'black' },
    moveNumber: 1,
  },
  'black',
);

function openingDiagram(): ArticleBlock {
  return {
    kind: 'raw-svg',
    svg: () =>
      triptychBoardSvg({
        leftLabel: 'Black sees',
        leftSvg: renderShogiBoardSvg(START_FOG_VIEW, {
          showFog: true,
          showCoords: false,
          perspective: 'black',
        }),
        middleLabel: 'Server truth',
        middleSvg: renderShogiBoardSvg(START_TRUE_VIEW, {
          showFog: false,
          showCoords: false,
          perspective: 'black',
        }),
        rightLabel: 'White sees',
        rightSvg: renderShogiBoardSvg(START_WHITE_VIEW, {
          showFog: true,
          showCoords: false,
          perspective: 'black',
        }),
      }),
    className: 'shogi-figure-triptych',
  } as ArticleBlock;
}

function fieldOfFireDiagram(): ArticleBlock {
  return {
    kind: 'raw-svg',
    svg: () =>
      pairedBoardSvg({
        leftLabel: 'Server truth',
        leftSvg: renderShogiBoardSvg(FIELD_OF_FIRE_TRUE_VIEW, {
          showFog: false,
          showCoords: false,
          targets: FIELD_OF_FIRE_TARGETS,
        }),
        rightLabel: 'Black sees',
        rightSvg: renderShogiBoardSvg(FIELD_OF_FIRE_VIEW, {
          showFog: true,
          showCoords: false,
          targets: FIELD_OF_FIRE_TARGETS,
        }),
      }),
    className: 'shogi-figure-pair',
  } as ArticleBlock;
}

function privateHandsDiagram(): ArticleBlock {
  return {
    kind: 'raw-svg',
    svg: () => handPrivacySvg(),
    className: 'shogi-figure-hand',
  } as ArticleBlock;
}

export const darkShogiArticle: Article = {
  slug: 'dark-shogi',
  kind: 'rules',
  playableOnMistboard: true,
  title: 'Fog Shogi Rules',
  summary:
    'Fog Shogi rules: Shogi under Fog of War, with private hands, drop bounces, and king capture.',
  showSummaryOnPage: false,
  status: 'published',
  publishedAt: '2026-06-20',
  boardFamily: 'shogi',
  audience:
    'Shogi players, Fog Chess players, and anyone who wants a clean first explanation of shogi under fog.',
  thumbnail: { kind: 'svg', svg: START_FOG_SVG },
  intro: [
    {
      kind: 'paragraph',
      text: 'Fog Shogi is Mistboard\'s public name for dark shogi: [Shogi](/rules/shogi) played under Fog of War. The board, pieces, setup, promotion, captures, and drop mechanic come from Shogi; this page covers only the hidden-information changes.',
    },
    {
      kind: 'paragraph',
      text: 'If Shogi is new to you, start with [Shogi Rules](/rules/shogi). If you already play, the short version is: hidden enemy pieces stay hidden, each hand is private, check disappears, and the king is actually captured.',
    },
  ],
  sections: [
    {
      heading: 'Board and fog',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The game starts from the standard Shogi setup. Black, or sente, moves first in Shogi, so these examples use Black\'s board orientation unless a label says otherwise. At the start, you see your own 20 pieces and every square they reach. Everything else is fog. The server still holds the full position, and your opponent receives a different view of the same truth.',
        },
        openingDiagram(),
        {
          kind: 'paragraph',
          text: 'Vision is recomputed after every legal move and accepted drop, so advancing, capturing, promoting, or opening a slider line changes what you know immediately.',
        },
      ],
    },
    {
      heading: 'What you see',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A square is visible when one of your pieces reaches it under Shogi movement. A rook, bishop, or lance sees up to the first occupied square and stops there, so you see the piece you can hit but not anything behind it. The other pieces use the same movement shown in the Shogi rules.',
        },
        {
          kind: 'paragraph',
          text: 'Fog does not tell you whether an unseen square is empty or occupied. Below, Black\'s rook sees the White pawn it can capture, but the White king one square behind that pawn stays hidden until the line opens.',
        },
        fieldOfFireDiagram(),
      ],
    },
    {
      heading: 'Private hands and drops',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Captured pieces still switch sides and enter your hand as in Shogi, but only your own reserve is visible. The opponent hand is not sent to you, including its count; it has to be inferred from captures and missing pieces.',
        },
        privateHandsDiagram(),
        {
          kind: 'paragraph',
          text: 'Drops keep Shogi\'s placement restrictions: no second unpromoted pawn on a file, no pawn or lance on the last rank, and no knight on the last two ranks. Because Fog Shogi has no checkmate, the standard Shogi ban on drop-pawn mate does not apply.',
        },
        {
          kind: 'paragraph',
          text: '**Into the fog.** You may offer a drop onto any square your view shows empty, including a fogged square. If the square is truly empty, the piece lands and may stay invisible to your opponent until one of their pieces reaches it.',
        },
        {
          kind: 'paragraph',
          text: '**A bounced drop.** If the hidden square is occupied in truth, the drop bounces: nothing moves, your hand is intact, and it is still your turn. That can become a retry loop: choose another candidate square, or choose a different legal move. The rejection tells only you that the square is occupied, not which piece is there.',
        },
      ],
    },
    {
      heading: 'Win condition: king capture',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Capture the king to win. There is no check, no checkmate, and no warning when your king is attacked. The server allows moves that walk into danger or leave a threat unanswered, so you read threats from what your own pieces can see.',
        },
        {
          kind: 'paragraph',
          text: 'Timed rooms can also end by timeout, resignation, or abandonment. There is no visible checkmate claim to call the game early, so the main rules ending is a king actually coming off the board.',
        },
      ],
    },
    {
      heading: 'Play status',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Fog Shogi is open for alpha invite games. Rooms are casual PvP only, and postgame review works after a finished live game. For the open-information base game, read Shogi Rules. For chess under the same fog model, read Fog Chess.',
        },
        {
          kind: 'cta',
          buttons: [
            { label: 'Shogi Rules', href: '/rules/shogi', emphasis: 'secondary' },
            { label: 'Fog Chess', href: '/rules/fog-chess', emphasis: 'secondary' },
            { label: 'All rules', href: '/rules', emphasis: 'secondary' },
          ],
        } as ArticleBlock,
      ],
    },
  ],
};
