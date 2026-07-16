import {
  applyCrazyhouseMove,
  type Board,
  type Color,
  createInitialCrazyhouseState,
  type CrazyhouseGameState,
  getCrazyhousePlayerView,
  type Square,
} from '@mistboard/game';
import { boardToPieces } from '../diagrams.js';
import type { Article, ArticleBlock } from '../types.js';

// ── Fog diagrams ─────────────────────────────────────────────────────────────
// Rendered through the shared live-boards (chessground) figure, the same board
// the Dark Chess article uses, so the style, border, and size match exactly.
// Each board carries the TRUE position plus the fogSquares to shroud; fogSquares
// is computed from the real fog view (getCrazyhousePlayerView), so every diagram
// shows exactly what the server would send that player.

const ALL_SQUARES: Square[] = (() => {
  const out: Square[] = [];
  for (const file of 'abcdefgh') {
    for (let rank = 1; rank <= 8; rank += 1) out.push(`${file}${rank}` as Square);
  }
  return out;
})();

function fog(state: CrazyhouseGameState, viewer: Color): Square[] {
  const visible = new Set<Square>(getCrazyhousePlayerView(state, viewer).visibleSquares);
  return ALL_SQUARES.filter((square) => !visible.has(square));
}

function position(
  board: Board,
  turn: Color,
  hands: CrazyhouseGameState['hands'],
): CrazyhouseGameState {
  return {
    id: 'diagram',
    variant: 'dark-crazyhouse',
    board,
    status: { type: 'playing', turn },
    moveNumber: 10,
    castlingRights: [],
    halfmoveClock: 0,
    dropPolicy: 'any-legal-square',
    hands,
    promoted: [],
  };
}

const START = createInitialCrazyhouseState('diagram');

// Capture into hand: White's rook on the open a-file sees the Black knight on a5
// (field of fire) and takes it. The knight becomes a white piece in White's hand.
const CAPTURE_BEFORE = position(
  {
    e1: { color: 'white', role: 'king' },
    a1: { color: 'white', role: 'rook' },
    a5: { color: 'black', role: 'knight' },
    e8: { color: 'black', role: 'king' },
  },
  'white',
  { white: {}, black: {} },
);
const CAPTURE_AFTER = applyCrazyhouseMove(CAPTURE_BEFORE, { from: 'a1', to: 'a5' });

// A plain drop onto a square White already sees: White's rook lights the open
// d-file, and White drops a knight from hand onto the empty d3.
const DROP_BASIC_BEFORE = position(
  {
    e1: { color: 'white', role: 'king' },
    d1: { color: 'white', role: 'rook' },
    e8: { color: 'black', role: 'king' },
  },
  'white',
  { white: { knight: 1 }, black: {} },
);
const DROP_BASIC_AFTER = applyCrazyhouseMove(DROP_BASIC_BEFORE, { drop: 'knight', to: 'd3' });

// The parachute story: White holds a knight and is to move; e6 is deep in Black's
// half, outside White's vision, but truly empty, so the drop resolves.
const PARACHUTE_BEFORE = position(
  {
    e1: { color: 'white', role: 'king' },
    a1: { color: 'white', role: 'rook' },
    d4: { color: 'white', role: 'pawn' },
    e8: { color: 'black', role: 'king' },
    f5: { color: 'black', role: 'pawn' },
    c6: { color: 'black', role: 'knight' },
  },
  'white',
  { white: { knight: 1 }, black: {} },
);
const PARACHUTE_AFTER = applyCrazyhouseMove(PARACHUTE_BEFORE, { drop: 'knight', to: 'e6' });
const PARACHUTE_REVEAL = applyCrazyhouseMove(PARACHUTE_AFTER, { from: 'e8', to: 'd7' });

export const darkCrazyhouseArticle: Article = {
  slug: 'dark-crazyhouse',
  kind: 'rules',
  playableOnMistboard: true,
  title: 'Dark Crazyhouse Rules',
  summary:
    'Crazyhouse under Fog of War: captured pieces flip color into your hand and drop back into play, hands are private, you can parachute a drop into the fog, and the king falls by capture.',
  showSummaryOnPage: false,
  status: 'published',
  publishedAt: '2026-06-18',
  audience:
    'Crazyhouse players, dark chess players, and anyone who wants a clean first explanation of crazyhouse under fog.',
  thumbnail: {
    pieces: boardToPieces(START.board).filter((piece) => piece.color === 'white'),
    orientation: 'white',
  },
  intro: [
    {
      kind: 'paragraph',
      text: 'Dark Crazyhouse is [crazyhouse](https://en.wikipedia.org/wiki/Crazyhouse) under Fog of War. You keep every piece you capture and drop it back as your own, but unseen enemy pieces stay hidden, your reserve is private, and nothing is announced. Capture the king to win.',
    },
    {
      kind: 'paragraph',
      text: 'It runs on the same fog as [Fog Chess](/rules/fog-chess); read that first if the fog rule is new. Below is only what crazyhouse adds: hands, drops, and the drop fog makes strange.',
    },
  ],
  sections: [
    {
      heading: 'The starting position',
      blocks: [
        {
          kind: 'paragraph',
          text: 'You start from the standard setup and see the squares your pieces could move to, plus the squares they stand on. Everything else is fog. White\'s view, the true board, and Black\'s view:',
        },
        {
          kind: 'live-boards',
          spec: {
            layout: 'triptych',
            boards: [
              {
                board: START.board,
                fogSquares: fog(START, 'white'),
                orientation: 'white',
                label: "WHITE'S VIEW",
              },
              { board: START.board, orientation: 'white', label: 'SERVER TRUTH' },
              {
                board: START.board,
                fogSquares: fog(START, 'black'),
                orientation: 'white',
                label: "BLACK'S VIEW",
              },
            ],
          },
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'Vision is field of fire, recomputed after every move: open a line, advance a pawn, or drop a piece and what you see changes at once. It works exactly as in dark chess.',
        },
      ],
    },
    {
      heading: 'Captures flip into your hand',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Capture a piece and it does not leave the game: it switches to your color and enters your hand, a private reserve you spend by dropping. A captured rook is a rook in hand; a promoted pawn reverts, so a captured promoted queen gives you a pawn, not a queen. The king is never taken into a hand.',
        },
        {
          kind: 'live-boards',
          spec: {
            layout: 'pair',
            boards: [
              {
                board: CAPTURE_BEFORE.board,
                fogSquares: fog(CAPTURE_BEFORE, 'white'),
                orientation: 'white',
                label: 'BEFORE',
                arrows: [{ orig: 'a1', dest: 'a5' }],
                pocket: { color: 'white', counts: CAPTURE_BEFORE.hands.white },
              },
              {
                board: CAPTURE_AFTER.board,
                fogSquares: fog(CAPTURE_AFTER, 'white'),
                orientation: 'white',
                label: 'AFTER',
                pocket: { color: 'white', counts: CAPTURE_AFTER.hands.white },
              },
            ],
          },
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'This is where fog bites. Open crazyhouse lays both reserves face-up; here you see only your own. You can still read the enemy reserve indirectly, since every piece of yours that vanishes has been captured into it, but you never see it laid out, and nothing tells you when a held piece comes back. The dangerous case is a drop into your fog: it lands fully real and sits there unseen until one of your pieces looks at the square.',
        },
      ],
    },
    {
      heading: 'Dropping a piece',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Instead of moving a piece on the board, you may drop one from your hand onto an empty square. Standard crazyhouse rules hold: no pawn on the first or eighth rank, and the dropped piece is live at once, free to capture or take the king next move. With no checkmate under fog, the ban on dropping a pawn for mate does not apply.',
        },
        {
          kind: 'paragraph',
          text: '**Into vision.** Dropping onto a square you can see is an ordinary placement.',
        },
        {
          kind: 'live-boards',
          spec: {
            layout: 'pair',
            boards: [
              {
                board: DROP_BASIC_BEFORE.board,
                fogSquares: fog(DROP_BASIC_BEFORE, 'white'),
                orientation: 'white',
                label: 'BEFORE',
                pocket: { color: 'white', counts: DROP_BASIC_BEFORE.hands.white },
              },
              {
                board: DROP_BASIC_AFTER.board,
                fogSquares: fog(DROP_BASIC_AFTER, 'white'),
                orientation: 'white',
                label: 'AFTER',
                pocket: { color: 'white', counts: DROP_BASIC_AFTER.hands.white },
              },
            ],
          },
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**Into the fog.** You may also drop onto a square you cannot see, as long as it is truly empty. The piece lands, fully real, and stays invisible to your opponent until one of their pieces reaches it. A knight can appear deep in enemy territory with no warning.',
        },
        {
          kind: 'live-boards',
          spec: {
            layout: 'pair',
            boards: [
              {
                board: PARACHUTE_BEFORE.board,
                fogSquares: fog(PARACHUTE_BEFORE, 'white'),
                orientation: 'white',
                label: 'WHITE, BEFORE',
                pocket: { color: 'white', counts: PARACHUTE_BEFORE.hands.white },
              },
              {
                board: PARACHUTE_AFTER.board,
                fogSquares: fog(PARACHUTE_AFTER, 'white'),
                orientation: 'white',
                label: 'WHITE, AFTER',
                pocket: { color: 'white', counts: PARACHUTE_AFTER.hands.white },
              },
            ],
          },
        } as ArticleBlock,
        {
          kind: 'live-boards',
          spec: {
            layout: 'pair',
            boards: [
              {
                board: PARACHUTE_AFTER.board,
                fogSquares: fog(PARACHUTE_AFTER, 'black'),
                orientation: 'white',
                label: 'BLACK, AFTER DROP',
              },
              {
                board: PARACHUTE_REVEAL.board,
                fogSquares: fog(PARACHUTE_REVEAL, 'black'),
                orientation: 'white',
                label: 'BLACK, AFTER Kd7',
              },
            ],
          },
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**A bounced drop.** If the hidden square already holds a piece, the drop is illegal and bounces: nothing moves, your hand is intact, and it is still your turn. The rejection is information, you now know a piece sits there, though not what it is. Your client always offers fogged squares as drop targets, so the offer never reveals which are occupied; you learn that only by trying.',
        },
      ],
    },
    {
      heading: 'Win condition: king capture',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Capture the king to win. There is no check and no checkmate: the server never warns you, and will let you move into danger or leave a threat standing. You read threats from what your own pieces see, and a piece dropped into the fog is the one you will not see coming.',
        },
      ],
    },
    {
      heading: 'Draws',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The game draws on threefold repetition of the true position and on the 50-move rule, both judged from the true board, not either player\'s view. A drop adds material and resets the 50-move count, like a pawn move or a capture. There is no stalemate draw and no insufficient-material draw.',
        },
      ],
    },
    {
      heading: 'Play status',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Dark Crazyhouse is available for invite games on Mistboard. Public matchmaking is still gated while playtesting continues, but you can create a casual room and send the link to an opponent.',
        },
        {
          kind: 'cta',
          buttons: [
            {
              label: 'Create invite',
              href: '/?play=friend&gameSpecId=dark-crazyhouse',
              emphasis: 'primary',
            },
            { label: 'Fog Chess Rules', href: '/rules/fog-chess', emphasis: 'secondary' },
            { label: 'Back to all rules', href: '/rules', emphasis: 'secondary' },
          ],
        } as ArticleBlock,
      ],
    },
  ],
};
