import { BANQI_SAMPLE_GAME } from '../../banqi-sample-game.js';
import {
  BANQI_CANNON_CAPTURE,
  BANQI_RANK_LADDER,
  BANQI_RULES_THUMBNAIL,
  BANQI_SETUP_BOARD,
  playClosing,
} from '../diagrams.js';
import type { Article } from '../types.js';

export const banqiArticle: Article = {
    slug: 'banqi',
    gameSpecId: 'banqi',
    boardFamily: 'xiangqi',
    kind: 'rules',
    playableOnMistboard: true,
    title: 'Banqi Rules (Chinese Dark Chess)',
    summary:
      'Banqi, also called Chinese dark chess or blind chess: the 4 by 8 half-board game with face-down pieces, rank captures, and screen-jumping cannons. Play it free in your browser.',
    showSummaryOnPage: false,
    status: 'published',
    publishedAt: '2026-06-15',
    updatedAt: '2026-07-23',
    audience:
      'Experienced Banqi players and newcomers who want the rank ladder, screen-jumping cannon, and Mistboard rules explained on one page.',
    thumbnail: { kind: 'svg', svg: BANQI_RULES_THUMBNAIL },
    intro: [
      {
        kind: 'paragraph',
        text:
          'Banqi, also called Chinese dark chess or blind chess, is a fast hidden-piece game played on half a xiangqi board. All thirty-two pieces begin shuffled and face-down. The first flip assigns colors. After that, each turn is a choice: flip a tile or move a revealed piece. Captures follow rank, except for the cannon.',
      },
      {
        kind: 'paragraph',
        text:
          'Although it uses [Xiangqi](/rules/xiangqi) pieces, it is a separate game: pieces move one square, the general is not royal, and face-down tiles cannot be captured. This page describes the exact rules used on Mistboard.',
      },
    ],
    sections: [
      {
        heading: 'Board and setup',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The board is half a xiangqi board: thirty-two squares in a 4x8 grid, shown here with the long side horizontal. Unlike xiangqi, pieces sit inside the squares rather than on intersections, and the thirty-two shuffled pieces exactly fill the board, every one face-down.',
          },
          {
            kind: 'paragraph',
            text:
              'Colors are not assigned in advance. The first player opens the game by flipping any piece: whatever color comes up is theirs, and the opponent plays the other.',
          },
          {
            kind: 'raw-svg',
            svg: BANQI_SETUP_BOARD,
          },
        ],
      },
      {
        heading: 'Turns',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'On your turn, do exactly one of two things: **flip** any face-down tile, or **move** one of your revealed pieces one square up, down, left, or right. A move may land on an empty square or capture an enemy when the rank rules allow it. A flip reveals the piece to both players, even if it belongs to your opponent. There is no passing.',
          },
        ],
      },
      {
        heading: 'Capture by rank',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Most pieces capture by stepping one square onto an adjacent revealed enemy. They may capture the same rank or any lower rank. On Mistboard, the order is General > Advisor > Elephant > Chariot > Horse > Soldier. Two exceptions connect the ends of the ladder: a soldier can capture the general, and the general cannot capture soldiers.',
          },
          {
            kind: 'paragraph',
            text:
              'Face-down tiles cannot be captured. The cannon uses a different attack, so it sits outside the ladder when capturing. The dashed slot shows only how other pieces treat a cannon as a target: it ranks between the horse and soldier.',
          },
          {
            kind: 'raw-svg',
            svg: BANQI_RANK_LADDER,
          },
        ],
      },
      {
        heading: 'The cannon',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The cannon ignores rank when it captures. Instead of taking an adjacent piece, it travels along a row or column, jumps exactly one intervening piece called the screen, and captures the first piece beyond it if that piece is a revealed enemy. The screen may be friendly, enemy, or face-down. Without a capture, the cannon moves one square like every other piece. Because it needs a screen, it cannot capture an adjacent piece.',
          },
          {
            kind: 'raw-svg',
            svg: BANQI_CANNON_CAPTURE,
          },
        ],
      },
      {
        heading: 'Winning and draws',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'You win when your opponent has no legal move, usually because every enemy piece is captured, sometimes because they are boxed in. The general is not royal: capturing it is progress, not the win, and play continues until one side is wiped out or stuck.',
          },
          {
            kind: 'paragraph',
            text:
              'Mistboard draws a game two ways: 40 plies (single moves) with no flip or capture, or threefold repetition, the same position three times. A flip or capture resets both counters because it changes the position irreversibly.',
          },
        ],
      },
      {
        heading: 'A sample game',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Step through a real game between Mistboard’s strongest bot and a human. Red falls behind early, but its elephant becomes the highest-ranked piece left and turns the game around. Each tile reveals its dealt piece when it is first flipped.',
          },
          {
            kind: 'banqi-replay',
            spec: {
              red: BANQI_SAMPLE_GAME.red,
              black: BANQI_SAMPLE_GAME.black,
              event: BANQI_SAMPLE_GAME.event,
              outcome: 'MistyBanqi (Red) wins by resignation · 49 moves',
              resultText: BANQI_SAMPLE_GAME.result,
              deal: BANQI_SAMPLE_GAME.deal,
              moves: BANQI_SAMPLE_GAME.moves,
            },
          },
        ],
      },
      {
        heading: 'How Mistboard analyzes banqi',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Half the moves in banqi are flips, so a chess-style review would blame you for the tiles. [Game review](/blog/skill-vs-luck) scores every flip twice: once for the decision you made, once for the tile you got. Only the first is yours.',
          },
          {
            kind: 'paragraph',
            text:
              'The [engine](/blog/mistybanqi) runs on the server and also inside your browser, so a position you never played here still gets analyzed on the [analysis board](/analysis/banqi). The engine, the review, and the site are open source.',
          },
        ],
      },
      playClosing({
        heading: 'Play on Mistboard',
        lead: 'Banqi is playable on Mistboard. Play against an engine or challenge a friend. No account required.',
        playLabel: 'Play vs computer',
        playHref: '/?play=computer&gameSpecId=banqi',
        secondary: [
          { label: 'Challenge a friend', href: '/?play=friend&gameSpecId=banqi', emphasis: 'secondary' },
        ],
      }),
    ],
};
