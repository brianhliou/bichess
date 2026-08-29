import { JIEQI_PLATFORM_GAME } from '../../jieqi-platform-game.js';
import type { Article, ArticleBlock } from '../types.js';

// Platform showcase for jieqi: what Mistboard offers, stated plainly, built
// around one real production game rather than mocked material. The persuasion is
// meant to come from the replay and the screenshots; the copy states capability
// and stops.
//
// Facts checked against the code and against prod rather than assumed: three
// casual time controls (registry `timePresetIds`), the lobby lists the bot as
// Pikafish while the analysis panel names the engine PikaJieQi, /analysis has no
// auth gate, jieqi is in STUDY_ELIGIBLE_SPEC_IDS, and /study is a live route
// (/studies is not). Jieqi's spec carries `rated: true` but
// `publicSurface: 'casual'`, so the rating pool exists while games are not
// actually rated: the copy says casual and promises no ladder.
//
// The opening replay and every figure come from jq_96f40ebb, one 146-ply game the
// engine lost. Keeping them from a single game is deliberate: a reader steps
// through the game up top, then meets the same game in the graph and the reveal
// table instead of re-orienting each time. The replay used to be a cropped
// screenshot of a board, which cut badly at every width; a widget has no crop.
// Figures are captured from CACHED analysis, so a change to
// JIEQI_ANALYSIS_DEPTH invalidates them (the cache key carries depth) and they
// have to be re-shot. That has already bitten once.

export const jieqiPlatformArticle: Article = {
  slug: 'jieqi-platform',
  kind: 'article',
  publisher: 'mistboard',
  boardFamily: 'xiangqi',
  title: 'Jieqi on Mistboard',
  seoTitle: 'Play Jieqi Online, with Engine Analysis',
  summary:
    'A modern jieqi platform: play the engine or a friend, free and without an account, with engine analysis that handles reveals correctly.',
  showSummaryOnPage: false,
  status: 'draft',
  publishedAt: '2026-08-28',
  audience:
    'Jieqi players looking for a place to play and review their games, and anyone curious how a game with random reveals gets analysed honestly.',
  intro: [
    {
      kind: 'paragraph',
      text:
        'Jieqi is [xiangqi](/rules/xiangqi) with every piece face-down. A piece moves as whatever normally starts on its square, then flips and keeps its true identity for the rest of the game. The [rules page](/rules/jieqi) has the details.',
    },
    {
      kind: 'paragraph',
      text:
        'It is a young game. Jieqi (揭棋) grew out of Hong Kong and Guangdong and has spread over the last couple of decades, mostly among Chinese and Vietnamese players, who know it as cờ úp. The board, the pieces and the moves are xiangqi\'s; what is new is that you start without knowing which piece is which, including your own.',
    },
    {
      kind: 'jieqi-replay',
      spec: {
        red: JIEQI_PLATFORM_GAME.red,
        black: JIEQI_PLATFORM_GAME.black,
        event: JIEQI_PLATFORM_GAME.event,
        outcome: JIEQI_PLATFORM_GAME.outcome,
        resultText: JIEQI_PLATFORM_GAME.result,
        deal: JIEQI_PLATFORM_GAME.deal,
        moves: JIEQI_PLATFORM_GAME.moves,
        perspective: 'black',
      },
      caption:
        'A real game on Mistboard: a guest beats the engine in 73 moves. Step through it. Face-down pieces are plain discs and turn over the first time they move, keeping whatever they turned out to be.',
    } as ArticleBlock,
    {
      kind: 'paragraph',
      text:
        'Mistboard supports jieqi in full. Play the engine at 1+1, 3+2 or 5+5 or send a friend a link, then review the game with an engine that handles the reveals honestly. Free, no sign-up, nothing to install.',
    },
  ],
  sections: [
    {
      heading: 'Analysis',
      blocks: [
        { kind: 'sub-heading', text: 'Every finished game gets a full pass' },
        {
          kind: 'paragraph',
          text:
            'Ask for computer analysis on a finished game and the engine evaluates every position in it. You get the advantage graph across the whole game, an accuracy figure per player, and each inaccuracy, mistake and blunder marked in the move list with the move that was better.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-accuracy-summary.png',
          alt: 'A game summary: the advantage graph swinging back and forth across the game, beside accuracy cards reading Pikafish 86 percent with thirteen inaccuracies, two mistakes and one blunder, and Guest 91 percent with six inaccuracies, two mistakes and one blunder.',
          caption:
            'The same game, graded. The engine lost this one, and the graph shows why: it led for most of the middlegame and gave it back at the end.',
        } as ArticleBlock,
        { kind: 'sub-heading', text: 'Reveals are priced separately from decisions' },
        {
          kind: 'paragraph',
          text:
            'About half the moves in a jieqi game are reveals, and a reveal is a decision plus a random draw. Grading them together would score you on your luck, so Mistboard scores them apart: every reveal is evaluated across each piece the tile could have been, weighted by how many of that piece you have left.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-reveal-candidates.png',
          alt: 'A jieqi review move list. Move 19 is a reveal carrying a dice badge reading minus 21 percent, above four ranked candidate moves at 52, 39, 34 and 29 percent with the played move marked second. Move 21 carries plus 43 percent, move 21 for black plus 6 percent, and move 22 minus 10 percent, each with its own ranked candidates. The ordinary plies between them carry a single evaluation and no candidates, one of them flagged as a blunder with the better move named.',
          caption:
            'Reveal plies get ranked candidates and a price for the draw, good or bad. Ordinary plies get a normal evaluation.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text:
            'Each percentage is that move\'s win percentage for the player to move, averaged over every piece the tile could turn out to be. It is not a probability that the move is best and not an engine rank. The list is the engine\'s top three plus your move when your move is not already there, which is why some reveals show three rows and others four.',
        },
        {
          kind: 'paragraph',
          text:
            'Accuracy is then graded on the decision half only, so a lucky tile cannot inflate it and an unlucky one cannot dent it.',
        },
        { kind: 'sub-heading', text: 'The same engine runs in your browser' },
        {
          kind: 'paragraph',
          text:
            'The analysis board runs the engine locally, compiled to WebAssembly, with several candidate moves drawn on the board as you move through a line. Nothing is queued and nothing is sent anywhere. It needs no account.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-local-engine.png',
          alt: 'The analysis board with the local engine switched on: PikaJieQi at depth 18 and 335,000 nodes per second, three candidate lines each with an evaluation, and arrows for each drawn on the jieqi board.',
          caption: 'Depth 18 at 335,000 nodes per second, running in a browser tab.',
        } as ArticleBlock,
        {
          kind: 'cta',
          buttons: [
            { label: 'Open the analysis board', href: '/analysis/jieqi', emphasis: 'primary' },
          ],
        },
      ],
    },
    {
      heading: 'Studies',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Build a study from a game or a position you set up, keep several chapters in it, annotate the moves and share the link. A jieqi game starts from a deal rather than a fixed position, so each chapter carries its own deal and reopens on the board you saved rather than a fresh shuffle.',
        },
        {
          kind: 'paragraph',
          text:
            'There is little jieqi to study in English, so we made some. [Jieqi engine reference games](/study/wd6c7qvG) is PikaJieQi against itself, every game played out to a real finish. Engine games, not master games: step through them, branch off, and run the browser engine over your line.',
        },
        {
          kind: 'cta',
          buttons: [
            { label: 'Open the study', href: '/study/wd6c7qvG', emphasis: 'primary' },
            { label: 'Browse all studies', href: '/study', emphasis: 'secondary' },
          ],
        },
      ],
    },
    {
      heading: 'The engine',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'PikaJieQi is a fork of [Pikafish](https://github.com/official-pikafish/Pikafish), the open-source xiangqi engine, on its jieqi branch: classical search, hand-written evaluation, no neural network. [Our fork and the WebAssembly build](https://github.com/brianhliou/pikafish-jieqi-wasm) are public, and one source produces both the engine that plays you and the one that analyses in your browser. The server build is pinned to a single upstream commit, so it does not change under you between games.',
        },
        {
          kind: 'paragraph',
          text:
            'It only ever sees the redacted board, with every face-down piece written as a faceless x. It does not know the deal, and a test fails the build if the wire format ever leaks a true identity.',
        },
        { kind: 'sub-heading', text: 'Where it is weak' },
        {
          kind: 'paragraph',
          text:
            'It values its own face-down pieces optimistically and over-commits them. We measured that bias holding steady from depth 8 to depth 48, which puts it in the evaluation rather than the search, so more thinking time will not remove it. The game at the top of this page is one the engine lost that way.',
        },
        {
          kind: 'paragraph',
          text:
            'The fix is a net. Almost all of modern Pikafish\'s strength lives in its NNUE, and there is no trained jieqi one; the branch we ship predates it and evaluates by hand. The hook is wired, so pointing the engine at a net file would load it. Producing that net needs jieqi training data at a scale we do not have, and it is the single change that would most improve both the bot and the analysis on this page. If you train nets, or you know jieqi well enough to say where the evaluation goes wrong, that is the contribution we would most like to have.',
        },
      ],
    },
    {
      heading: 'Start playing',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Jieqi is free here, with no account required.',
        },
        {
          kind: 'cta',
          buttons: [
            {
              label: 'Play the engine',
              href: '/?play=computer&gameSpecId=jieqi',
              emphasis: 'primary',
            },
            { label: 'Play a friend', href: '/?play=friend&gameSpecId=jieqi', emphasis: 'secondary' },
            { label: 'Read the rules', href: '/rules/jieqi', emphasis: 'secondary' },
          ],
        },
      ],
    },
  ],
};
