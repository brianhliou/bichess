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
        'Mistboard supports jieqi in full: play, analyse, review and study. It is free, it works without an account, and it is open source. The board comes in intersection or square-grid layouts with a few piece sets, coordinates are optional, and it stays full size on a phone.',
    },
  ],
  sections: [
    {
      heading: 'Playing',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Play the engine at 1+1, 3+2 or 5+5, or send a link to a friend. Neither needs an account.',
        },
        {
          kind: 'paragraph',
          text:
            'Every game is saved. You can replay it move by move, share the link, and run analysis over it whenever you like, including games you played as a guest. Jieqi here is casual: there is no jieqi ladder yet.',
        },
      ],
    },
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
            'About half the moves in a jieqi game are reveals, and a reveal is a decision plus a random draw. Grading those together would score you on your luck. Mistboard scores them apart.',
        },
        {
          kind: 'paragraph',
          text:
            'Each reveal is evaluated across every piece the tile could have been, with each outcome scored as its own position and weighted by how many of that piece you have left. The review then shows a ranked set of candidate moves with your move marked, and a dice badge giving what the draw itself was worth.',
        },
        {
          kind: 'paragraph',
          text:
            'The percentage beside each candidate is that move\'s win percentage for the player to move, averaged the same way over every piece the tile could turn out to be. It is not a probability that the move is best, and it is not an engine rank. So a candidate at 52% is a move that wins a little over half the time across all the pieces that tile might have been.',
        },
        {
          kind: 'paragraph',
          text:
            'The list is the engine\'s top three, plus the move you actually played when that is not already among them. That is why some reveals show three candidates and others show four.',
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
            'Accuracy is graded on the decision half only. A lucky tile cannot inflate it and an unlucky one cannot dent it, so the number says how you played rather than what you drew.',
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
            'Studies work for jieqi the way they do for xiangqi. Build one from a game or from a position you set up, keep several chapters in it, write notes against the moves, and share the link. Because a jieqi game starts from a deal rather than a fixed position, each chapter carries its own deal, so a study opens on exactly the board you saved rather than a fresh shuffle.',
        },
        {
          kind: 'paragraph',
          text:
            'There is not much jieqi to study in English, so we made some. [Jieqi engine reference games](/study/wd6c7qvG) is eighteen chapters of PikaJieQi against itself, every game played out to a real finish. They are engine games, not master games, and the engine has the bias described below, so read them as a starting point rather than as authority. You can step through any of them, branch off to try your own line, and run the browser engine over the result.',
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
        { kind: 'sub-heading', text: 'What it is' },
        {
          kind: 'paragraph',
          text:
            'PikaJieQi is a fork of [Pikafish](https://github.com/official-pikafish/Pikafish), the open-source xiangqi engine, on its jieqi branch. Classical search with a hand-written evaluation and no neural network. It is listed as Pikafish in the lobby.',
        },
        {
          kind: 'paragraph',
          text:
            'Our [fork and the WebAssembly build](https://github.com/brianhliou/pikafish-jieqi-wasm) are public. The same source produces both the engine that plays you on the server and the one that analyses in your browser tab, so the two never disagree about the rules.',
        },
        {
          kind: 'paragraph',
          text:
            'The server build is pinned to one upstream commit rather than tracking a branch, so the engine behind your analysis does not quietly change under you between one game and the next.',
        },
        { kind: 'sub-heading', text: 'What it is allowed to see' },
        {
          kind: 'paragraph',
          text:
            'It receives the redacted board only, with every face-down piece written as a faceless x. It does not know the deal. That boundary is the whole reason the engine can be trusted to play and to analyse the same game, so it is enforced by a test that fails the build if the wire format ever leaks a true identity.',
        },
        { kind: 'sub-heading', text: 'What it is bad at, and why' },
        {
          kind: 'paragraph',
          text:
            'It values its own face-down pieces optimistically, so it over-commits them. We measured that bias holding steady from depth 8 all the way to depth 48, which places it in the evaluation rather than the search. More thinking time cannot remove it. The game at the top of this page is one the engine lost that way.',
        },
        { kind: 'sub-heading', text: 'The missing piece is a net' },
        {
          kind: 'paragraph',
          text:
            'Almost all of modern Pikafish\'s strength lives in its NNUE, a small neural network that does the evaluating. There is no trained jieqi net. The branch we ship predates it and evaluates by hand, which is why a careful human can beat it and why the bias above survives any depth we throw at the position.',
        },
        {
          kind: 'paragraph',
          text:
            'The hook is already in place: point the engine at a net file and it will load one. Producing that net is the part we have not solved. It needs jieqi training data at a scale we do not have and a build of the newer branch, and it is the single change that would most improve both the bot and the analysis on this page.',
        },
        { kind: 'sub-heading', text: 'Open source, and help wanted' },
        {
          kind: 'paragraph',
          text:
            'Mistboard is [open source](https://github.com/brianhliou/mistboard): the jieqi rules engine, the redaction boundary, the decision-versus-luck maths described above, and the tests that hold them in place. If you think a number on this page is wrong, the code that produced it is readable.',
        },
        {
          kind: 'paragraph',
          text:
            'If you train nets, or you know jieqi well enough to say where the evaluation goes wrong, that is the contribution we would most like to have. The engine work is in the [fork](https://github.com/brianhliou/pikafish-jieqi-wasm) and the platform work is in the [main repo](https://github.com/brianhliou/mistboard).',
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
