import { playClosing } from '../diagrams.js';
import {
  REVEAL_CHESS_REVEAL_BOARD,
  REVEAL_CHESS_START_BOARD,
} from '../reveal-chess-diagrams.js';
import type { Article } from '../types.js';

export const revealChessArticle: Article = {
  slug: 'reveal-chess',
  boardFamily: 'chess',
  kind: 'rules',
  playableOnMistboard: true,
  title: 'Reveal Chess Rules',
  summary:
    'Reveal Chess rules: standard chess with a hidden starting arrangement. Every piece but the king starts face-down, moves by the square it sits on, and reveals its true identity the moment it moves.',
  showSummaryOnPage: false,
  status: 'published',
  publishedAt: '2026-06-17',
  audience:
    'Chess players and hidden-information fans who want a clean rules reference for Reveal Chess.',
  thumbnail: { kind: 'svg', svg: REVEAL_CHESS_START_BOARD },
  intro: [
    {
      kind: 'paragraph',
      text: "Reveal Chess is standard chess with one twist: the starting arrangement is hidden. Think of it as Fischer Random where neither side knows the shuffle. Every piece except the king starts face-down. A face-down piece moves by the square it occupies, and the instant it moves it flips face-up and plays by its true identity from then on.",
    },
    {
      kind: 'paragraph',
      text: 'Use [Chess Rules](/rules/chess) for the base game. This page covers what changes.',
    },
  ],
  sections: [
    {
      heading: 'Setup',
      blocks: [
        {
          kind: 'paragraph',
          text: "Each king starts face-up on e1 and e8, as in normal chess. Shuffle each side's other fifteen pieces and deal them face-down onto the rest of that side's home squares: the whole back rank except the king, plus the entire pawn rank. Neither player knows any hidden identity, including their own.",
        },
        {
          kind: 'paragraph',
          text: 'So the armies are the standard chess sets (one queen, two rooks, two bishops, two knights, eight pawns per side), but you do not know which face-down piece is which until it moves.',
        },
        {
          kind: 'raw-svg',
          svg: REVEAL_CHESS_START_BOARD,
        },
      ],
    },
    {
      heading: 'First moves use the starting square',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Before it reveals, a face-down piece moves by the role of the square it sits on, not by its hidden identity. A piece on a1 or h1 moves like a rook. Pieces on the b and g squares move like knights, the c and f squares like bishops, and the d square like the queen. Pieces on the pawn rank move like pawns.',
        },
        {
          kind: 'paragraph',
          text: 'That first move is a normal move of the borrowed role, with all the usual blocking and capture rules. A face-down piece on a knight square can hop over pieces like a knight even if it later turns out to be a bishop.',
        },
      ],
    },
    {
      heading: 'Reveal on move',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The moment a face-down piece moves, it flips face-up for both players and plays by its true identity for the rest of the game. The borrowed starting-square role is gone; from now on it moves as whatever it actually is.',
        },
        {
          kind: 'paragraph',
          text: 'This is where the surprises live. In the board below, the white piece on b1 hopped out like a knight and revealed the queen on c3, while the black piece on g8 did the same and revealed a bishop on f6. You are always reading two things at once: how a piece may move right now, and what it might turn out to be.',
        },
        {
          kind: 'raw-svg',
          svg: REVEAL_CHESS_REVEAL_BOARD,
        },
      ],
    },
    {
      heading: 'Pawns and promotion',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A piece on the pawn rank moves like a pawn: forward one square, capturing one square diagonally. A face-down piece still on its home pawn rank may also advance two squares on its first move, both squares empty, just like a normal opening pawn. There is no en passant.',
        },
        {
          kind: 'paragraph',
          text: 'A pawn promotes the instant it reaches the far rank, and you choose the piece (queen by default). This can happen two ways: a known pawn marching to the last rank, or a face-down piece that reaches the last rank and reveals as a pawn there. Either way it promotes on arrival.',
        },
      ],
    },
    {
      heading: 'Castling',
      blocks: [
        {
          kind: 'paragraph',
          text: 'You can castle while the corner piece is still face-down, since a corner piece moves like a rook. The king must be unmoved on its home square and the corner it castles toward must hold an unmoved face-down piece. Move the king to that corner to castle.',
        },
        {
          kind: 'paragraph',
          text: "The castle is that corner piece's first move, so it reveals as it lands next to the king. It might flip up as something other than a rook; the castle still stands. The normal restrictions apply: you cannot castle out of, through, or into check, and the squares between king and corner must be empty.",
        },
      ],
    },
    {
      heading: 'Check, checkmate, and draws',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Both kings are face-up, so this is real chess check and checkmate. A face-down piece gives check using its starting-square role: you can be forced to answer a check from a piece that turns out to be a humble pawn. Once it moves it reveals, and any check from its new square uses its true identity.',
        },
        {
          kind: 'paragraph',
          text: 'Win by checkmate. Stalemate is a draw, as in chess. The game is also drawn by the fifty-move rule, counted from the last capture, pawn move, or reveal, and by threefold repetition of the public position (face-down pieces count as anonymous backs, so a position repeats based on what both players can actually see).',
        },
      ],
    },
    {
      heading: 'Captured hidden pieces',
      blocks: [
        {
          kind: 'paragraph',
          text: 'If a face-down piece is captured before it ever reveals, only the capturer learns what it was. The owner just sees one of their face-down pieces leave the board. The capturer can use that private knowledge to rule the identity out elsewhere.',
        },
      ],
    },
    {
      heading: 'What it is',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Reveal Chess is an invented variant. It borrows the hidden-then-revealed mechanic from [Reveal Xiangqi](/rules/reveal-xiangqi), the Chinese game where xiangqi pieces start face-down and reveal as they move, and applies it to standard chess. The pitch is short: Fischer Random, but the arrangement is hidden and revealed piece by piece.',
        },
        {
          kind: 'paragraph',
          text: 'It is not Fog of War. In [Fog Chess](/rules/fog-chess), positions are hidden but identities are known; here it is the reverse, the positions are fully public and the identities are hidden. Two different things are being concealed.',
        },
      ],
    },
    playClosing({
      heading: 'Where to next',
      lead: 'Reveal Chess plays best with a friend. Send an invite and learn the shuffle together. For the base game, read chess; for the variant that inspired it, read jieqi.',
      playLabel: 'Challenge a friend',
      playHref: '/?play=friend&gameSpecId=reveal-chess',
      secondary: [
        { label: 'Chess Rules', href: '/rules/chess', emphasis: 'secondary' },
        { label: 'Reveal Xiangqi', href: '/rules/reveal-xiangqi', emphasis: 'secondary' },
        { label: 'Fog Chess', href: '/rules/fog-chess', emphasis: 'secondary' },
        { label: 'All rules', href: '/rules', emphasis: 'secondary' },
      ],
    }),
  ],
};
