import { JUNGLE_FLIP_SAMPLE_GAME } from '../../jungle-flip-sample-game.js';
import {
  JUNGLE_FLIP_CAPTURE,
  JUNGLE_FLIP_MOVE,
  JUNGLE_FLIP_MUTUAL,
  JUNGLE_FLIP_REVEAL,
  JUNGLE_FLIP_SETUP,
  JUNGLE_RANK_LADDER,
  playClosing,
} from '../diagrams.js';
import type { Article } from '../types.js';

export const jungleFlipArticle: Article = {
  slug: 'jungle-flip',
  kind: 'rules',
  title: 'Flip Jungle Rules',
  summary:
    'The 4×4 flip version of Jungle Chess. Every animal starts face-down, you flip to reveal, and equal ranks trade off the board.',
  showSummaryOnPage: false,
  status: 'published',
  publishedAt: '2026-06-30',
  updatedAt: '2026-07-12',
  playableOnMistboard: true,
  audience:
    'Jungle players who want the flip variant, and anyone who grew up playing 翻翻棋 on a chalk grid.',
  intro: [
    {
      kind: 'paragraph',
      text: 'Flip Jungle is a small, fast relative of [Jungle Chess](/rules/jungle), built around the same eight ranked animals. Chinese names include 翻翻棋, roughly “flip-flip chess,” and 兽棋, “animal chess.” English speakers may also encounter Flip Animal Chess. All sixteen animals begin face-down on a four-by-four grid. There are no rivers, dens, or traps.',
    },
    {
      kind: 'paragraph',
      text: 'Its turn structure is especially close to [Flip Xiangqi](/rules/flip-xiangqi): reveal one unknown tile or move one of your revealed pieces. The board and pieces are different, but both games turn each flip into a choice between gaining information and improving position.',
    },
  ],
  sections: [
    {
      heading: 'Setup',
      blocks: [
        {
          kind: 'paragraph',
          text: 'All sixteen pieces, one of each animal in two colors, are shuffled and placed face-down on the sixteen squares. Nobody knows which animal or which color sits under a tile until it is flipped. The first tile you flip sets your color for the rest of the game.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_FLIP_SETUP,
        },
      ],
    },
    {
      heading: 'Animal ranks',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Both colors use the same ladder. Strongest to weakest: elephant, lion, tiger, leopard, wolf, dog, cat, rat. The rat still has one exception: it can capture the elephant, while the elephant cannot capture the rat.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_RANK_LADDER,
          caption: 'Strongest at the left, weakest at the right.',
        },
      ],
    },
    {
      heading: 'A turn',
      blocks: [
        {
          kind: 'paragraph',
          text: 'On your turn you either flip one face-down tile to reveal it, or move one of your own revealed animals one square up, down, left, or right. Early on, before pieces come up, flipping is all you can do.',
        },
        { kind: 'sub-heading', text: 'Flip a tile' },
        {
          kind: 'raw-svg',
          svg: JUNGLE_FLIP_REVEAL,
        },
        { kind: 'sub-heading', text: 'Move an animal' },
        {
          kind: 'raw-svg',
          svg: JUNGLE_FLIP_MOVE,
        },
      ],
    },
    {
      heading: 'Capturing',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Move onto an adjacent enemy to capture it when your animal outranks it. The rat-beats-elephant exception from Jungle Chess still applies.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_FLIP_CAPTURE,
          caption: 'A lion captures a lower-ranked wolf.',
        },
        {
          kind: 'paragraph',
          text: 'Equal ranks work differently. When an animal captures an enemy of its own rank, both pieces leave the board (同归于尽, “they perish together”), and neither side keeps the square.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_FLIP_MUTUAL,
          caption: 'Equal animals remove each other.',
        },
      ],
    },
    {
      heading: 'Winning',
      blocks: [
        {
          kind: 'paragraph',
          text: 'You win when your opponent has nothing left to do: no piece to move and no tile to flip. In practice that means capturing or trading away everything they have.',
        },
      ],
    },
    {
      heading: 'Draws',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Games draw on threefold repetition, or when 40 half-moves (20 by each player) pass with no flip, capture, or trade.',
        },
        {
          kind: 'paragraph',
          text: 'A game is also drawn the moment the pieces left on the board can no longer force a win — two survivors of equal rank, or a lone piece that can never corner the opponent’s last piece on the small board. These dead positions are settled as a draw right away rather than played out to the repetition count.',
        },
      ],
    },
    {
      heading: 'A full game',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Step through a game our bot played against itself. The two lions meet and both leave the board, an elephant runs through three pieces until it hits the other elephant and they cancel too, and the side left standing wins. Tiles flip to their dealt animal the first time they are turned over.',
        },
        {
          kind: 'jungle-flip-replay',
          spec: {
            red: JUNGLE_FLIP_SAMPLE_GAME.red,
            black: JUNGLE_FLIP_SAMPLE_GAME.black,
            event: JUNGLE_FLIP_SAMPLE_GAME.event,
            outcome: JUNGLE_FLIP_SAMPLE_GAME.outcome,
            resultText: JUNGLE_FLIP_SAMPLE_GAME.result,
            deal: JUNGLE_FLIP_SAMPLE_GAME.deal,
            moves: JUNGLE_FLIP_SAMPLE_GAME.moves,
          },
        },
      ],
    },
    playClosing({
      heading: 'Play on Mistboard',
      lead: 'Flip Jungle is playable on Mistboard. Play against an engine or challenge a friend. No account required.',
      playLabel: 'Play vs computer',
      playHref: '/?play=computer&gameSpecId=jungle-flip',
      secondary: [
        { label: 'Challenge a friend', href: '/?play=friend&gameSpecId=jungle-flip', emphasis: 'secondary' },
      ],
    }),
  ],
};
