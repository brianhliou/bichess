import {
  boardToPieces,
  DARK_CHESS_START_STATE,
  KRIEGSPIEL_CHECK_BOARD,
  KRIEGSPIEL_CHECK_FILE,
  KRIEGSPIEL_CHECK_FOG,
  KRIEGSPIEL_CHECK_KNIGHT,
  KRIEGSPIEL_CHECK_LONG_DIAG,
  KRIEGSPIEL_CHECK_RANK,
  KRIEGSPIEL_CHECK_SHORT_DIAG,
  KRIEGSPIEL_HERO_BOARD,
  KRIEGSPIEL_HERO_FOG_W,
  playClosing,
} from '../diagrams.js';
import type { Article, ArticleBlock } from '../types.js';

export const kriegspielArticle: Article = {
    slug: 'kriegspiel',
    kind: 'rules',
    playableOnMistboard: true,
    title: 'Kriegspiel Rules',
    summary:
      'The complete rules of Kriegspiel, the 1899 ancestor of dark chess: you see only your own pieces, an umpire rejects illegal tries and announces captures and checks, and checkmate wins.',
    showSummaryOnPage: false,
    status: 'published',
    publishedAt: '2026-06-19',
    audience:
      'Chess and dark chess players who want the full rules of Kriegspiel, the original umpired hidden-information chess.',
    thumbnail: {
      pieces: boardToPieces(DARK_CHESS_START_STATE.board).filter((p) => p.color === 'white'),
      orientation: 'white',
    },
    intro: [
      {
        kind: 'paragraph',
        text:
          'Kriegspiel is chess played blind: you see only your own pieces. A neutral umpire (here, the server) keeps the true position, rejects your illegal tries, and announces captures, checks, and pawn tries to both players. Underneath the fog it is standard chess, and checkmate ends the game.',
      },
      {
        kind: 'paragraph',
        text:
          'Michael Henry Temple invented Kriegspiel in 1899, borrowing the umpire from the Prussian war games that gave it its name. It is the direct ancestor of [dark chess](/rules/fog-chess). If standard chess is new to you, start with [Chess Rules](/rules/chess); everything below assumes them.',
      },
    ],
    sections: [
      {
        heading: 'How a turn works',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'On your turn you attempt a move. If it is legal in the true position, it stands, and the umpire tells your opponent only that you have moved. If it is illegal (the path is blocked, the piece is pinned, your king would be left in check), the umpire rejects it and you try again, as many times as it takes. You may attempt any move that would be legal on a board holding only your own pieces, plus pawn captures.',
          },
          {
            kind: 'paragraph',
            text:
              'Every chess rule is enforced even though you cannot verify it yourself. You can never move into check, and the king is never captured: an attempt that would lose your king is rejected.',
          },
          {
            kind: 'paragraph',
            text:
              'Your clock keeps running until a legal move is accepted, so rejected tries cost time. Your opponent is never told an attempt was rejected, only that you eventually moved.',
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'pair',
              boards: [
                { board: KRIEGSPIEL_HERO_BOARD, fogSquares: KRIEGSPIEL_HERO_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                { board: KRIEGSPIEL_HERO_BOARD, orientation: 'white', label: "UMPIRE'S BOARD" },
              ],
            },
          } as ArticleBlock,
        ],
      },
      {
        heading: 'What the umpire announces',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "**Captures.** When a piece is captured, both players hear the square and whether the captured unit was a pawn or a piece, never which piece.",
          },
          {
            kind: 'paragraph',
            text:
              "**Checks.** A check is announced to both players as a direction from the checked king: along the rank, along the file, along the long diagonal, along the short diagonal, or by a knight. The long and short diagonals are the longer and shorter of the two diagonals through the king's square. A double check names both directions. The announcement gives the line, never the square, so the checker could stand anywhere along it.",
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'grid',
              boards: [
                { board: KRIEGSPIEL_CHECK_BOARD, fogSquares: KRIEGSPIEL_CHECK_FOG, orientation: 'white', label: 'RANK', highlightSquares: KRIEGSPIEL_CHECK_RANK },
                { board: KRIEGSPIEL_CHECK_BOARD, fogSquares: KRIEGSPIEL_CHECK_FOG, orientation: 'white', label: 'FILE', highlightSquares: KRIEGSPIEL_CHECK_FILE },
                { board: KRIEGSPIEL_CHECK_BOARD, fogSquares: KRIEGSPIEL_CHECK_FOG, orientation: 'white', label: 'LONG DIAGONAL', highlightSquares: KRIEGSPIEL_CHECK_LONG_DIAG },
                { board: KRIEGSPIEL_CHECK_BOARD, fogSquares: KRIEGSPIEL_CHECK_FOG, orientation: 'white', label: 'SHORT DIAGONAL', highlightSquares: KRIEGSPIEL_CHECK_SHORT_DIAG },
                { board: KRIEGSPIEL_CHECK_BOARD, fogSquares: KRIEGSPIEL_CHECK_FOG, orientation: 'white', label: 'KNIGHT', highlightSquares: KRIEGSPIEL_CHECK_KNIGHT },
              ],
            },
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Pawn tries',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'At the start of each turn, the umpire announces how many pawn captures the player to move has, en passant included. A pawn capture is the only move that needs an enemy piece already on the target square.',
          },
        ],
      },
      {
        heading: 'Castling, promotion, en passant',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Castling is never announced; a legal castle is just another completed move. Promotion is silent: your opponent is not told a pawn has promoted. En passant is announced as an ordinary pawn capture, without revealing that it was en passant.',
          },
        ],
      },
      {
        heading: 'Winning and draws',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Checkmate ends the game, announced by the umpire. Stalemate and the standard chess draws (repetition, fifty moves, insufficient material) are announced the same way.',
          },
        ],
      },
      {
        heading: 'Conventions vary',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Kriegspiel has no single rulebook. This page follows the Internet Chess Club ruleset, later used by the computer Kriegspiel olympiads: a pawn-try count each turn, captures announced as pawn or piece with the square, and illegal tries seen only by the player making them. Older English club rules differ: a player asks 'any?' about pawn captures, and a yes obliges one capture try.",
          },
        ],
      },
      {
        heading: 'From Kriegspiel to dark chess',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Temple's invention spread through London's chess clubs and stayed a fixture of club culture for a century. It became the lunchtime game of the RAND Corporation's game theorists in the 1950s: Lloyd Shapley was nearly unbeatable, and John Nash and John von Neumann both played. Computer Kriegspiel has its own research lineage, from solved endgames (a king and rook can force mate against a lone king even in the fog) to Monte Carlo engines at the Computer Olympiad.",
          },
          {
            kind: 'paragraph',
            text:
              'Dark chess, born in 1989, hides the same information a different way: each side simply sees the squares its own pieces can reach, the rest of the board is fog, and the king falls by capture. Kriegspiel keeps every chess rule and pays for it with an umpire; dark chess gives up check and checkmate so the hidden information becomes a fixed function of the position, one a computer can compute and render as fog with nothing to announce. That computability is why dark chess, as Fog of War, is the version that spread across online play. The two are the same idea solved two ways.',
          },
        ],
      },
      playClosing({
        heading: 'Where to next',
        lead:
          "Kriegspiel is playable on Mistboard: challenge a friend to a game. There's no computer opponent yet, since the umpire makes it a harder engine problem than dark chess's computable fog.",
        playLabel: 'Challenge a friend',
        playHref: '/?play=friend&gameSpecId=kriegspiel',
        secondary: [
          { label: 'Read Fog Chess', href: '/rules/fog-chess', emphasis: 'secondary' },
          { label: 'Chess Rules', href: '/rules/chess', emphasis: 'secondary' },
          { label: 'All rules', href: '/rules', emphasis: 'secondary' },
        ],
      }),
    ],
};
