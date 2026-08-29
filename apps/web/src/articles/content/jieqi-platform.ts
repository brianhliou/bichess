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
      // A reader who arrived from a "play jieqi" search wants a board, not an
      // argument. The authority material below still does its job for whoever
      // scrolls; it should not be the toll they pay to reach a button.
      kind: 'cta',
      buttons: [
        { label: 'Play the engine', href: '/?play=computer&gameSpecId=jieqi', emphasis: 'primary' },
        { label: 'Play a friend', href: '/?play=friend&gameSpecId=jieqi', emphasis: 'secondary' },
      ],
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
        { kind: 'sub-heading', text: 'It tells you how lucky each flip was' },
        {
          kind: 'paragraph',
          text:
            'About half your moves in jieqi turn a piece over, and you do not know what you are turning over. So the engine works out what every piece that tile could have been would have been worth, and compares that to what you actually got. The difference is your luck on that flip, in win percentage, good or bad.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-reveal-candidates.png',
          alt: 'A jieqi review move list. Move 19 is a reveal carrying a dice badge reading minus 21 percent, above four ranked candidate moves at 52, 39, 34 and 29 percent with the played move marked second. Move 21 carries plus 43 percent, move 21 for black plus 6 percent, and move 22 minus 10 percent, each with its own ranked candidates. The ordinary plies between them carry a single evaluation and no candidates, one of them flagged as a blunder with the better move named.',
          caption:
            'Every flip carries what the luck was worth, plus the moves you could have played instead. Ordinary moves just get an evaluation.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text:
            'The percentages are how often each move wins, averaged over every piece that tile might have been. They are not a chance of being the best move and not a ranking. You get the engine\'s three favourites plus your own move when it is not already among them, which is why some flips list three and some list four.',
        },
        {
          kind: 'paragraph',
          text:
            'Your accuracy score is then built from the choices alone. Drawing a good piece cannot flatter it and drawing a bad one cannot spoil it.',
        },
        { kind: 'sub-heading', text: 'The same engine runs in your browser' },
        {
          kind: 'paragraph',
          text:
            'The analysis board runs the engine on your own machine, compiled to WebAssembly, drawing several candidate moves on the board as you walk a line. Nothing is queued and nothing is sent anywhere. It needs no account.',
        },
        {
          kind: 'paragraph',
          text:
            'It is the same engine, from the same source, as the one that plays you on the server. [Both are open](https://github.com/brianhliou/pikafish-jieqi-wasm), so the two can never quietly disagree about the rules, and if an evaluation on this page looks wrong you can read the code that produced it.',
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
      heading: 'The engine',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'PikaJieQi is a fork of [Pikafish](https://github.com/official-pikafish/Pikafish), the open-source xiangqi engine, on its jieqi branch: classical search, hand-written evaluation, no neural network. The server build is pinned to a single upstream commit, so the engine behind your games and your analysis does not change under you.',
        },
        {
          kind: 'paragraph',
          text:
            'It only ever sees the redacted board, with every face-down piece written as a faceless x. It does not know the deal, and a test fails the build if the wire format ever leaks a true identity.',
        },
        { kind: 'sub-heading', text: 'What would make it stronger' },
        {
          kind: 'paragraph',
          text:
            'A net. Almost all of modern Pikafish\'s strength lives in its NNUE, the small neural network that does its evaluating, and no jieqi net has been trained: the branch we ship predates NNUE and evaluates by hand. That is measurable rather than theoretical. The engine values its own face-down pieces too optimistically and over-commits them, and we measured that bias holding steady from depth 8 to depth 48, so it sits in the evaluation and no amount of extra thinking time touches it.',
        },
        {
          kind: 'paragraph',
          text:
            'The hook is already wired: point the engine at a net file and it loads one. What is missing is jieqi training data at a scale we do not have. It is the single change that would most improve both the bot and the analysis on this page, so if you train nets, or you know jieqi well enough to say where the evaluation goes wrong, that is the contribution we would most like to have.',
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
