// Static board diagrams for the Reveal Chess rules article.
//
// These reuse the production board renderer (renderRevealChessBoardSvg) fed by
// real kernel states, so the diagrams cannot drift from how the game actually
// renders. The renderer paints squares/frame via CSS custom properties (the
// app theme supplies them in-app); for a self-contained article SVG we bake the
// brown board palette onto the root <svg>, plus a capped width so the board
// reads at rules-diagram scale instead of filling the article column.

import {
  applyRevealChessMove,
  createInitialRevealChessState,
  getRevealChessPlayerView,
  type RevealChessDeal,
  type RevealChessMove,
} from '@mistboard/game';
import { renderRevealChessBoardSvg } from '../reveal-chess-render.js';

// Rendered board width in the article. The square board is the main subject, so
// it sits a touch wider than the portrait crossroads board (316px) but well
// under the column width.
const DIAGRAM_WIDTH = 340;

// Brown ("lichess") board palette, mirrored from the default theme in
// app-base.css / theme.css, injected as inline custom properties on the root
// <svg> so var(--…) lookups in the renderer resolve without page CSS. The width
// cap rides in the same inline style (inline beats the .article-figure > svg
// width:100% rule).
const BAKED_BOARD_STYLE = [
  '--board-light:#f0d9b5',
  '--board-dark:#b58863',
  '--crossroads-coord:rgba(60,45,30,0.55)',
  '--board-last-move:rgba(255,205,80,0.45)',
  '--board-fog-light-fill:rgba(6,10,8,0.5)',
  `width:${DIAGRAM_WIDTH}px`,
  'max-width:100%',
  'height:auto',
].join(';');

function bakeBoardTheme(svg: string): string {
  // Replace only the first (outer) <svg ...>; inner cburnett piece <svg>s keep
  // their own attributes.
  return svg.replace('<svg', `<svg style="${BAKED_BOARD_STYLE}"`);
}

// The opening: kings face-up on e1/e8, every other piece a face-down "?" disc.
const startState = createInitialRevealChessState('rc-article-start');
export const REVEAL_CHESS_START_BOARD = bakeBoardTheme(
  renderRevealChessBoardSvg(getRevealChessPlayerView(startState, 'white'), {
    perspective: 'white',
  }),
);

// A deal that puts a surprise behind the starting squares: White's queen hides
// on b1 (a knight square) and Black's bishop hides on g8 (also a knight square).
// Each hops out like a knight on move one and then reveals as what it actually
// is. This is the whole point of the game, so the teaching board shows it rather
// than a standard-deal opening where every piece reveals exactly as expected.
// Order is revealChessHomeSquares: back rank a,b,c,d,f,g,h, then pawns a..h.
const SURPRISE_DEAL: RevealChessDeal = {
  white: [
    'rook',
    'queen', // b1: moves like a knight, reveals the queen
    'bishop',
    'knight',
    'bishop',
    'knight',
    'rook',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
  ],
  black: [
    'rook',
    'knight',
    'bishop',
    'queen',
    'knight',
    'bishop', // g8: moves like a knight, reveals a bishop
    'rook',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
  ],
};

const SURPRISE_MOVES: RevealChessMove[] = [
  { from: 'b1', to: 'c3' }, // white "knight" hop -> reveals the queen on c3
  { from: 'g8', to: 'f6' }, // black "knight" hop -> reveals a bishop on f6
];
const revealState = SURPRISE_MOVES.reduce(
  (state, move) => applyRevealChessMove(state, move),
  createInitialRevealChessState('rc-article-reveal', SURPRISE_DEAL),
);
export const REVEAL_CHESS_REVEAL_BOARD = bakeBoardTheme(
  renderRevealChessBoardSvg(getRevealChessPlayerView(revealState, 'white'), {
    perspective: 'white',
    lastMove: { from: 'g8', to: 'f6' },
  }),
);
