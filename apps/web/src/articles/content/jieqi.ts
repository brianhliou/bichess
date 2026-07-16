import {
  JIEQI_CAPTURE_PRIVACY,
  JIEQI_REVEAL_PAIR,
  JIEQI_REVEALED_FREEDOMS,
  JIEQI_RULES_THUMBNAIL,
  JIEQI_START_BOARD,
  playClosing,
} from '../diagrams.js';
import { JIEQI_SAMPLE_GAME } from '../../jieqi-sample-game.js';
import type { Article } from '../types.js';

export const jieqiArticle: Article = {
    slug: 'reveal-xiangqi',
    gameSpecId: 'jieqi',
    boardFamily: 'xiangqi',
    kind: 'rules',
    playableOnMistboard: true,
    title: 'Reveal Xiangqi Rules',
    summary:
      'Reveal Xiangqi rules: jieqi (揭棋), xiangqi with hidden non-general pieces that first move by starting point, then reveal and play by identity.',
    showSummaryOnPage: false,
    status: 'published',
    publishedAt: '2026-06-15',
    updatedAt: '2026-07-12',
    audience:
      'Xiangqi players and hidden-information fans who want a clean English rules reference for jieqi.',
    thumbnail: { kind: 'svg', svg: JIEQI_RULES_THUMBNAIL },
    intro: [
      {
        kind: 'paragraph',
        text:
          "Reveal Xiangqi is jieqi (揭棋, 'reveal chess'). It keeps xiangqi's board and checkmate goal, but hides every non-general piece. A dark piece first moves, attacks, and captures by the starting point it occupies. After that move, it reveals and plays by identity.",
      },
      {
        kind: 'paragraph',
        text:
          'Use [Xiangqi Rules](/rules/xiangqi) for the base game. This page covers what changes.',
      },
    ],
    sections: [
      {
        heading: 'Setup',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Set each general face-up on its normal palace point. Shuffle each side's other fifteen pieces and deal them face-down onto the remaining starting points. Neither player knows any hidden identities, including their own.",
          },
          {
            kind: 'raw-svg',
            svg: JIEQI_START_BOARD,
          },
        ],
      },
      {
        heading: 'First moves use starting points',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Before reveal, a dark piece uses the role of the starting point it occupies, not its hidden identity. A dark piece on a corner point plays like a chariot; dark pieces on horse, advisor, elephant, cannon, and soldier points use those matching moves.',
          },
          {
            kind: 'paragraph',
            text:
              'The normal restrictions still apply to that first move: horse legs, elephant eyes, cannon screens, palace limits for advisor points, and the river limit for elephant points. Once the move resolves, the piece flips face-up for both players.',
          },
          {
            kind: 'raw-svg',
            svg: JIEQI_REVEAL_PAIR,
          },
        ],
      },
      {
        heading: 'Revealed pieces use identity',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "After reveal, use the piece's identity from its current point. Advisors may leave the palace, and elephants may cross the river. Their movement shapes do not change: advisors step one point diagonally; elephants move two points diagonally and are still eye-blocked.",
          },
          {
            kind: 'paragraph',
            text:
              'Horses, chariots, and cannons move normally. Soldiers use the normal river rule from wherever they reveal: forward only before crossing, forward or sideways after crossing, never backward.',
          },
          {
            kind: 'raw-svg',
            svg: JIEQI_REVEALED_FREEDOMS,
          },
        ],
      },
      {
        heading: 'Captured dark pieces',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'If a dark piece is captured before revealing, only the capturer learns what it was. The owner sees one dark piece leave the board, but not its identity. Later, the capturer can rule out that hidden identity elsewhere.',
          },
          {
            kind: 'raw-svg',
            svg: JIEQI_CAPTURE_PRIVACY,
          },
          {
            kind: 'paragraph',
            text:
              'This reference uses the common Jieqi convention: the capturer sees it. Some cờ úp groups handle captured dark pieces differently, so agree on the convention before over-the-board play.',
          },
        ],
      },
      {
        heading: 'Checks, wins, and draws',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Every occupied point is visible, so players can see when the general is attacked. An unmoved dark piece attacks from its starting point using that point's role. Once it moves, it reveals immediately; any check from the destination uses the revealed identity.",
          },
          {
            kind: 'paragraph',
            text:
              'Win by checkmating the general or leaving the opponent with no legal move. The facing-generals rule still applies, and dark pieces block the file like any other piece.',
          },
          {
            kind: 'paragraph',
            text:
              'Repetition follows xiangqi long-beat rules, not a generic threefold or fourfold result. Perpetual check and direct perpetual chase are forbidden, so the forcing side must change course or lose; mutual forcing and ordinary repeated positions are judged by the xiangqi cycle, not by board equality alone. The automatic draw convention in this reference is the Guangdong/Tencent no-capture clock: 60 full moves, meaning 120 plies, without a capture.',
          },
        ],
      },
      {
        heading: 'A sample game',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Step through a full self-play game below. Dark pieces show as colored backs and flip to their dealt identity the first time they move, so a corner that plays like a chariot can reveal a soldier. Red wins by checkmate.',
          },
          {
            kind: 'jieqi-replay',
            spec: {
              red: JIEQI_SAMPLE_GAME.red,
              black: JIEQI_SAMPLE_GAME.black,
              event: JIEQI_SAMPLE_GAME.event,
              outcome: 'Red wins by checkmate · 36 moves',
              resultText: JIEQI_SAMPLE_GAME.result,
              deal: JIEQI_SAMPLE_GAME.deal,
              moves: JIEQI_SAMPLE_GAME.moves,
            },
          },
        ],
      },
      {
        heading: 'Name',
        blocks: [
          {
            kind: 'paragraph',
            text:
              '揭棋 is Mandarin jiēqí, meaning reveal chess. Luo Jinsheng of Guangzhou invented it in the 1980s, and Vietnamese play commonly calls this family cờ úp. On Mistboard, Reveal Xiangqi means jieqi; [Fog Xiangqi](/rules/fog-xiangqi) is the Fog of War variant, and [Flip Xiangqi](/rules/flip-xiangqi) is the half-board flip game.',
          },
        ],
      },
      playClosing({
        heading: 'Play on Mistboard',
        lead: 'Reveal Xiangqi is playable on Mistboard. Play against an engine or challenge a friend. No account required.',
        playLabel: 'Play vs computer',
        playHref: '/?play=computer&gameSpecId=jieqi',
        secondary: [
          { label: 'Challenge a friend', href: '/?play=friend&gameSpecId=jieqi', emphasis: 'secondary' },
        ],
      }),
    ],
};
