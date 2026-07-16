import { JUNGLE_SAMPLE_GAME } from '../../jungle-sample-game.js';
import {
  JUNGLE_LION_JUMP,
  JUNGLE_RANK_LADDER,
  JUNGLE_RAT_BLOCKS,
  JUNGLE_RAT_SWIMS,
  JUNGLE_START_BOARD,
  JUNGLE_TIGER_JUMP,
  JUNGLE_TRAP,
  playClosing,
} from '../diagrams.js';
import type { Article } from '../types.js';

export const jungleArticle: Article = {
  slug: 'jungle',
  kind: 'rules',
  title: 'Jungle Chess Rules',
  summary:
    "The classic Chinese animal-chess game, traditionally Dou Shou Qi (斗兽棋), on a 7×9 board. Eight ranked animals, rivers only the rat can cross, and a race to the opponent's den.",
  showSummaryOnPage: false,
  status: 'published',
  publishedAt: '2026-06-30',
  updatedAt: '2026-07-12',
  playableOnMistboard: true,
  audience:
    'Anyone who knows Jungle Chess, Dou Shou Qi, or Animal Chess and wants the rules clearly, plus chess and xiangqi players meeting it for the first time.',
  intro: [
    {
      kind: 'paragraph',
      text: 'Jungle Chess is Mistboard\'s public name for Dou Shou Qi (斗兽棋), also called Animal Chess. It is a two-player game played across much of East Asia. Each side commands eight animals of different rank. You win by marching a piece into your opponent’s den, or by capturing all of their pieces.',
    },
    {
      kind: 'paragraph',
      text: 'Three rules give the game its character: the rat captures the elephant, only the rat can swim, and the lion and tiger leap the rivers.',
    },
  ],
  sections: [
    {
      heading: 'Board and setup',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The board is seven files wide and nine ranks deep. Your den sits at the center of your back rank, ringed by three trap squares. Two rivers, each a 2×3 block of water, split the middle of the board. Red moves first from the fixed starting position below.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_START_BOARD,
        },
      ],
    },
    {
      heading: 'Ranks and captures',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Each side has the same eight animals. Strongest to weakest: elephant, lion, tiger, leopard, wolf, dog, cat, rat. A piece captures an adjacent enemy of equal or lower rank. The exception runs the other way: a rat on land can capture an elephant, and an elephant cannot capture a rat.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_RANK_LADDER,
          caption: 'Strongest at the left, weakest at the right.',
        },
      ],
    },
    {
      heading: 'How the animals move',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Every animal moves one square up, down, left, or right. Animals never move diagonally. Most animals stay on land, so they cannot enter a river. The rat, lion, and tiger are the three movement exceptions.',
        },
        { kind: 'sub-heading', text: 'Rat' },
        {
          kind: 'paragraph',
          text: 'The rat moves one square at a time like every other animal, but it is the only animal that can enter the water. A rat in a river can move and capture another rat there. It cannot capture an elephant directly from the water, so it must return to land first.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_RAT_SWIMS,
        },
        { kind: 'sub-heading', text: 'Lion' },
        {
          kind: 'paragraph',
          text: 'The lion can move one land square normally, or leap straight across a river horizontally or vertically. It lands on the first square beyond the water and may capture an animal there if rank allows.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_LION_JUMP,
        },
        { kind: 'sub-heading', text: 'Tiger' },
        {
          kind: 'paragraph',
          text: 'The tiger has the same river leap as the lion: horizontal or vertical, from one bank to the other. A rat of either color on any water square in the path blocks a lion or tiger from jumping.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_TIGER_JUMP,
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_RAT_BLOCKS,
          caption: 'A rat in the river blocks the leap.',
        },
      ],
    },
    {
      heading: 'Traps',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Step a piece onto one of your opponent’s three trap squares and it loses all rank while it stands there, so any defending piece can take it, down to a rat capturing a trapped elephant. Only an enemy’s traps do this: a piece can sit on one of its own traps and keeps its full rank.',
        },
        {
          kind: 'raw-svg',
          svg: JUNGLE_TRAP,
        },
      ],
    },
    {
      heading: 'Winning',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Move any piece into your opponent’s den and you win immediately. You also win by capturing every enemy piece. You can never move a piece onto your own den, so the only den you can enter is the enemy’s.',
        },
      ],
    },
    {
      heading: 'Draws',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Games draw on threefold repetition, or when 100 half-moves (50 by each player) pass with no capture.',
        },
      ],
    },
    {
      heading: 'A full game',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Step through a real game between two strengths of our bot. Watch the lion leap the river, the rat swim up the far lane and take the elephant in the open, and Red march the rest of the way into Black’s den.',
        },
        {
          kind: 'jungle-replay',
          spec: {
            red: JUNGLE_SAMPLE_GAME.red,
            black: JUNGLE_SAMPLE_GAME.black,
            event: JUNGLE_SAMPLE_GAME.event,
            outcome: JUNGLE_SAMPLE_GAME.outcome,
            resultText: JUNGLE_SAMPLE_GAME.result,
            moves: JUNGLE_SAMPLE_GAME.moves,
          },
        },
      ],
    },
    playClosing({
      heading: 'Play on Mistboard',
      lead: 'Jungle Chess is playable on Mistboard. Play against an engine or challenge a friend. No account required.',
      playLabel: 'Play vs computer',
      playHref: '/?play=computer&gameSpecId=jungle',
      secondary: [
        { label: 'Challenge a friend', href: '/?play=friend&gameSpecId=jungle', emphasis: 'secondary' },
      ],
    }),
  ],
};
