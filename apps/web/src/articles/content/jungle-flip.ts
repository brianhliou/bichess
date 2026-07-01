import { JUNGLE_FLIP_SAMPLE_GAME } from '../../jungle-flip-sample-game.js';
import {
  JUNGLE_FLIP_MUTUAL,
  JUNGLE_FLIP_SETUP,
  JUNGLE_FLIP_TURN,
  JUNGLE_RANK_LADDER,
  playClosing,
} from '../diagrams.js';
import type { Article } from '../types.js';

export const jungleFlipArticle: Article = {
  slug: 'jungle-flip',
  kind: 'rules',
  title: 'Flip Jungle (兽棋)',
  summary:
    'The 4×4 flip version of Jungle. Every animal starts face-down, you flip to reveal, and equal ranks trade off the board.',
  showSummaryOnPage: false,
  status: 'published',
  publishedAt: '2026-06-30',
  playableOnMistboard: true,
  audience:
    'Jungle players who want the flip variant, and anyone who grew up playing 翻翻棋 on a chalk grid.',
  intro: [
    {
      kind: 'paragraph',
      text: 'Flip Jungle (兽棋, also 翻翻棋) is the small, fast cousin of [Jungle](/rules/jungle). The same eight animals per side, shuffled face-down on a four-by-four grid, identities hidden until you turn them over. It is a casual favorite played on chalk grids and phone screens across China. No rivers, no dens, no traps, just the animals, the rank ladder, and a gamble on what sits under each tile.',
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
        {
          kind: 'raw-svg',
          svg: JUNGLE_FLIP_TURN,
        },
      ],
    },
    {
      heading: 'Capturing',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Capture an adjacent enemy you outrank, with the same rat-beats-elephant exception as the full game. Equal ranks work differently here. When an animal meets an enemy of its own rank, both leave the board (同归于尽, “they perish together”), and neither side keeps the square. Because identities stay hidden until contact, every attack is a bet, and the mutual-destruction rule raises the price of guessing wrong.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_FLIP_MUTUAL,
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
      heading: 'Where to next',
      lead: 'Flip Jungle is playable on Mistboard: take on MistyJungleFlip, or challenge a friend. Jungle is the full 7×9 game these animals come from.',
      playLabel: 'Play MistyJungleFlip',
      playHref: '/?play=computer&gameSpecId=jungle-flip',
      secondary: [
        { label: 'Challenge a friend', href: '/?play=friend&gameSpecId=jungle-flip', emphasis: 'secondary' },
        { label: 'Jungle', href: '/rules/jungle', emphasis: 'secondary' },
        { label: 'All rules', href: '/rules', emphasis: 'secondary' },
      ],
    }),
  ],
};
